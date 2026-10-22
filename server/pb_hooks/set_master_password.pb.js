// Endpoint para cadastrar ou alterar a Senha Mestra Corporativa
// Regra 2.4:
// - Coleção dedicada "master_security" com regras nulas (inacessível pela API de coleções)
// - Senha mestra protegida com KDF nativo (bcrypt do PocketBase via auth collection record.setPassword)
// - Definir ou alterar a Senha Mestra SÓ POR ADMINISTRADOR
// - Rate limiting / bloqueio por tentativas também neste endpoint, com a tentativa reservada em transação (lote 12)
// - Segredo do token separado do hash
// - Sem hash, salt ou senha em resposta, log ou auditoria
routerAdd(
  'POST',
  '/backend/v1/audit/set-master-password',
  (e) => {
    const reqInfo = e.requestInfo()
    const body = reqInfo ? reqInfo.body || {} : {}
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

    if (!newPassword || newPassword.length < 8) {
      return e.json(400, {
        success: false,
        message: 'A nova senha mestra deve conter no mínimo 8 caracteres.',
      })
    }

    if (!e.auth) {
      return e.json(401, { success: false, message: 'Usuário não autenticado.' })
    }

    // Regra 2.1 & 2.4: Fail-closed - apenas administrador pode definir ou alterar a senha mestra
    let userRole = ''
    try {
      const userRec = $app.findRecordById('users', e.auth.id)
      userRole = userRec.getString('role') || ''
    } catch (_) {
      return e.json(403, {
        success: false,
        message: 'Acesso negado: falha ao consultar privilégios.',
      })
    }

    if (userRole !== 'administrador') {
      return e.json(403, {
        success: false,
        message:
          'Acesso negado: apenas administradores podem configurar ou alterar a Senha Mestra.',
      })
    }

    const now = Date.now()
    const clientIp = reqInfo ? reqInfo.remoteIP || '127.0.0.1' : '127.0.0.1'

    // Lote 12 (achado F1 do Claude Security): a tentativa é RESERVADA de forma atômica, em transação,
    // ANTES do bcrypt, como no verify-master-password. Pedidos simultâneos não escapam do limite de 5.
    let existe = false
    let bloqueadoAgora = false
    let lockedUntilAtual = 0
    let tentativa = 0
    try {
      $app.runInTransaction((txApp) => {
        let rec = null
        try {
          rec = txApp.findFirstRecordByData('master_security', 'name', 'primary_master')
        } catch (_) {
          return
        }
        existe = true
        const lockedUntil = rec.getInt('locked_until') || 0
        if (lockedUntil > now) {
          bloqueadoAgora = true
          lockedUntilAtual = lockedUntil
          return
        }
        if (!currentPassword) return
        let attempts = rec.getInt('attempts_count') || 0
        if (lockedUntil > 0 && lockedUntil <= now) attempts = 0
        attempts += 1
        rec.set('attempts_count', attempts)
        rec.set('locked_until', attempts >= 5 ? now + 15 * 60 * 1000 : 0)
        txApp.save(rec)
        tentativa = attempts
      })
    } catch (_) {
      return e.json(500, {
        success: false,
        message: 'Falha ao verificar o estado da Senha Mestra.',
      })
    }

    if (bloqueadoAgora) {
      const remainingMins = Math.ceil((lockedUntilAtual - now) / 60000)
      return e.json(429, {
        success: false,
        message: `Muitas tentativas. Bloqueio ativo por mais ${remainingMins} minuto(s).`,
      })
    }

    // Se a senha já estiver configurada, exige validação segura da atual
    let masterRecord = null
    if (existe) {
      if (!currentPassword) {
        return e.json(400, {
          success: false,
          message: 'A senha mestra atual é obrigatória para alteração.',
        })
      }

      masterRecord = $app.findFirstRecordByData('master_security', 'name', 'primary_master')
      const isValid = masterRecord.validatePassword(currentPassword)
      if (!isValid) {
        const shouldLock = tentativa >= 5

        // Registrar falha na auditoria SEM registrar senhas ou dados sensíveis
        try {
          const auditCol = $app.findCollectionByNameOrId('auditoria')
          const auditRecord = new Record(auditCol)
          auditRecord.set('usuario_id', e.auth.id)
          auditRecord.set('acao', 'falha_alteracao_senha_mestra')
          auditRecord.set('descricao', 'Tentativa incorreta de alteração da Senha Mestra')
          auditRecord.set('detalhes', {
            ip: clientIp,
            tentativas: tentativa,
            bloqueado: shouldLock,
          })
          $app.save(auditRecord)
        } catch (_) {}

        return e.json(401, {
          success: false,
          message: shouldLock
            ? 'Senha mestra atual incorreta. Limite excedido: bloqueado por 15 minutos.'
            : `Senha mestra atual incorreta. Tentativa ${tentativa} de 5.`,
        })
      }
    }
    // Gerar salt e segredo de token criptográfico forte e separado do hash
    const newSalt = $security.randomString(32)
    const newTokenSecret = $security.randomString(64)

    // Se o registro não existir, cria; senão atualiza
    if (!masterRecord) {
      const masterCol = $app.findCollectionByNameOrId('master_security')
      masterRecord = new Record(masterCol)
      masterRecord.set('name', 'primary_master')
      masterRecord.setEmail('master@financeiro.internal')
    }

    // setPassword utiliza bcrypt nativo seguro do PocketBase
    masterRecord.setPassword(newPassword)
    masterRecord.set('salt', newSalt)
    masterRecord.set('token_secret', newTokenSecret)
    masterRecord.set('attempts_count', 0)
    masterRecord.set('locked_until', 0)
    masterRecord.set('updated_by', e.auth.id)

    // Executa em transação atômica juntamente com auditoria
    try {
      $app.runInTransaction((txApp) => {
        txApp.save(masterRecord)

        const auditCol = txApp.findCollectionByNameOrId('auditoria')
        const auditRecord = new Record(auditCol)
        auditRecord.set('usuario_id', e.auth.id)
        auditRecord.set('acao', 'definicao_senha_mestra')
        auditRecord.set(
          'descricao',
          'Senha Mestra Corporativa configurada ou alterada pelo administrador',
        )
        auditRecord.set('detalhes', { ip: clientIp, admin_id: e.auth.id })
        txApp.save(auditRecord)

        // Limpar qualquer chave legada _master na coleção configuracoes
        try {
          txApp.db().newQuery("DELETE FROM configuracoes WHERE chave LIKE '_master%'").execute()
        } catch (_) {}
      })

      return e.json(200, {
        success: true,
        message: 'Senha mestra corporativa definida com sucesso!',
      })
    } catch (err) {
      return e.json(500, {
        success: false,
        message: 'Falha ao salvar senha mestra: ' + err.message,
      })
    }
  },
  $apis.requireAuth(),
)
