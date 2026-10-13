// Endpoint protegido para restauração de registro histórico de auditoria
// Regra 2.4: Exige token de autorização da Senha Mestra (x-audit-token) preso ao id do usuário
// Regra 2.6: Restauração aplica o created original (timestamp histórico) via SQL/modelo
// Regra 2.7: Restauração dentro de transação com rollback se falhar
routerAdd(
  'POST',
  '/backend/v1/audit/restaurar-registro',
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

      // Token preso ao id do usuário autenticado
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

    const body = reqInfo ? reqInfo.body || {} : {}
    const recordId = typeof body.id === 'string' ? body.id : ''
    const acao = typeof body.acao === 'string' ? body.acao : ''
    const descricao = typeof body.descricao === 'string' ? body.descricao : ''
    const usuario_id = typeof body.usuario_id === 'string' ? body.usuario_id : e.auth.id
    const referencia_id = typeof body.referencia_id === 'string' ? body.referencia_id : ''
    const detalhes = body.detalhes || null
    const createdTimestamp = typeof body.created === 'string' ? body.created : ''

    if (!acao || !descricao) {
      return e.json(400, { success: false, message: 'Ação e descrição são obrigatórias.' })
    }

    // Id já existente: recusar com 409, sem gravar nada (nunca sobrescreve registro de auditoria)
    if (recordId) {
      let jaExiste = false
      try {
        $app.findRecordById('auditoria', recordId)
        jaExiste = true
      } catch (_) {}
      if (jaExiste) {
        return e.json(409, {
          success: false,
          message: 'Já existe um registro de auditoria com este id. Nada foi alterado.',
        })
      }
    }

    // Regra 2.7: Usar transação e rollback
    try {
      let insertedId = ''
      $app.runInTransaction((txApp) => {
        const auditCol = txApp.findCollectionByNameOrId('auditoria')
        const record = new Record(auditCol)
        if (recordId) {
          record.set('id', recordId)
        }
        record.set('usuario_id', usuario_id)
        record.set('acao', acao)
        record.set('descricao', descricao)
        record.set('referencia_id', referencia_id)
        const det =
          detalhes && typeof detalhes === 'object' && !Array.isArray(detalhes)
            ? Object.assign({}, detalhes, { restaurado_por: e.auth.id })
            : { restaurado_por: e.auth.id, original: detalhes }
        record.set('detalhes', det)
        txApp.save(record)
        insertedId = record.id

        // Regra 2.6: Aplica created histórico original se fornecido
        if (createdTimestamp) {
          try {
            txApp
              .db()
              .newQuery('UPDATE auditoria SET created = {:ts} WHERE id = {:id}')
              .bind({ ts: createdTimestamp, id: insertedId })
              .execute()
          } catch (tsErr) {
            console.error('Falha ao restaurar created original de auditoria:', tsErr)
          }
        }
      })

      return e.json(200, { success: true, id: insertedId })
    } catch (err) {
      return e.json(500, { success: false, message: 'Erro ao restaurar registro: ' + err.message })
    }
  },
  $apis.requireAuth(),
)
