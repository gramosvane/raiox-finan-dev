// Endpoint seguro para listagem dos registros da auditoria imutável
// Regra 2.4: Exige token de autorização da Senha Mestra via cabeçalho 'x-audit-token'
// Token preso ao id do usuário, validado com o segredo exclusivo de master_security
// Regra 2.6: Paginar a leitura (não limitar a 1000 registros, suportando parâmetros page e perPage)
routerAdd(
  'GET',
  '/backend/v1/audit/registros',
  (e) => {
    const reqInfo = e.requestInfo()
    const headers = reqInfo ? reqInfo.headers || {} : {}
    const token = headers['x_audit_token'] || headers['x-audit-token'] || ''

    if (!token) {
      return e.json(403, {
        success: false,
        message: 'Acesso negado: cabeçalho x-audit-token ausente.',
      })
    }

    if (!e.auth) {
      return e.json(401, { success: false, message: 'Usuário não autenticado.' })
    }
    // Fail-closed: apenas administrador (papel consultado no banco)
    let callerRole = ''
    try {
      callerRole = $app.findRecordById('users', e.auth.id).getString('role') || ''
    } catch (_) {}
    if (callerRole !== 'administrador') {
      return e.json(403, { success: false, message: 'Acesso negado: apenas administradores.' })
    }

    // Buscar segredo exclusivo em master_security
    let masterRecord = null
    try {
      masterRecord = $app.findFirstRecordByData('master_security', 'name', 'primary_master')
    } catch (_) {}

    if (!masterRecord) {
      return e.json(403, { success: false, message: 'Senha mestra não configurada.' })
    }

    const tokenSecret =
      masterRecord.getString('token_secret') ||
      $security.sha256(masterRecord.getString('salt') || 'sec')

    try {
      const payload = $security.parseJWT(token, tokenSecret)
      if (!payload || payload.scope !== 'master_audit') {
        return e.json(403, { success: false, message: 'Token de auditoria inválido ou expirado.' })
      }

      // Regra 2.4: Token preso ao id do usuário autenticado (comparação segura via $security.equal)
      const tokenUserId = String(payload.user_id || '')
      const currentUserId = String(e.auth.id || '')
      if (!$security.equal(tokenUserId, currentUserId)) {
        return e.json(403, {
          success: false,
          message: 'Token de auditoria não pertence ao usuário autenticado.',
        })
      }
    } catch (_) {
      return e.json(403, { success: false, message: 'Token de auditoria inválido ou expirado.' })
    }

    // Regra 2.6: Suporte a paginação segura (page, perPage) ou leitura completa para backup (all=true)
    const query = reqInfo ? reqInfo.query || {} : {}
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1)
    const perPage = Math.min(
      1000,
      Math.max(1, parseInt(query.perPage || query.limit || '100', 10) || 100),
    )
    const offset = (page - 1) * perPage
    const fetchAll = query.all === 'true' || query.all === '1'

    try {
      const totalCount = $app.countRecords('auditoria')
      let records = []
      if (fetchAll) {
        // Leitura em batches para evitar estouro de memória, trazendo todos
        let currentOffset = 0
        const batchLimit = 500
        while (currentOffset < totalCount) {
          const batch = $app.findRecordsByFilter(
            'auditoria',
            '',
            '-created',
            batchLimit,
            currentOffset,
          )
          if (!batch || batch.length === 0) break
          records = records.concat(batch)
          currentOffset += batch.length
        }
      } else {
        records = $app.findRecordsByFilter('auditoria', '', '-created', perPage, offset)
      }

      // Cache em memória para usuários e lançamentos por requisição
      const userCache = {}
      const lancamentoCache = {}

      const items = []
      for (let i = 0; i < records.length; i++) {
        const r = records[i]
        let detalhes = null
        try {
          detalhes = JSON.parse(r.getString('detalhes') || 'null')
        } catch (_) {
          detalhes = r.getString('detalhes')
        }

        const uid = r.getString('usuario_id')
        let usuario_nome = 'Sistema'
        if (uid && uid.trim()) {
          if (Object.prototype.hasOwnProperty.call(userCache, uid)) {
            usuario_nome = userCache[uid]
          } else {
            try {
              const userRec = $app.findRecordById('users', uid)
              const n = userRec.getString('name')
              const em = userRec.getString('email')
              usuario_nome =
                n && n.trim() ? n.trim() : em && em.trim() ? em.trim() : 'Usuário removido'
            } catch (_) {
              usuario_nome = 'Usuário removido'
            }
            userCache[uid] = usuario_nome
          }
        } else {
          usuario_nome = 'Sistema'
        }

        const acao = r.getString('acao')
        let natureza = null
        if (acao === 'criacao_lancamento') {
          const refId = r.getString('referencia_id')
          natureza = 'Lançamento'
          if (refId) {
            let lancRec = null
            if (Object.prototype.hasOwnProperty.call(lancamentoCache, refId)) {
              lancRec = lancamentoCache[refId]
            } else {
              try {
                lancRec = $app.findRecordById('lancamentos', refId)
              } catch (_) {
                lancRec = null
              }
              lancamentoCache[refId] = lancRec
            }

            if (lancRec) {
              const estornoDe = lancRec.getString('estorno_de')
              const liquidacaoDe = lancRec.getString('liquidacao_de')
              const tipo = lancRec.getString('tipo')

              if (estornoDe && estornoDe.trim()) {
                natureza = 'Estorno'
              } else if (liquidacaoDe && liquidacaoDe.trim()) {
                natureza = tipo === 'receita' ? 'Recebimento' : 'Pagamento'
              } else {
                natureza = 'Lançamento'
              }
            }
          }
        }

        items.push({
          id: r.id,
          usuario_id: uid,
          usuario_nome: usuario_nome,
          natureza: natureza,
          acao: acao,
          descricao: r.getString('descricao'),
          referencia_id: r.getString('referencia_id'),
          detalhes: detalhes,
          created: r.getString('created'),
          updated: r.getString('updated'),
        })
      }

      return e.json(200, {
        success: true,
        items: items,
        total: totalCount,
        page: page,
        perPage: perPage,
        totalPages: Math.ceil(totalCount / perPage) || 1,
      })
    } catch (err) {
      return e.json(500, { success: false, message: 'Falha ao buscar auditoria: ' + err.message })
    }
  },
  $apis.requireAuth(),
)
