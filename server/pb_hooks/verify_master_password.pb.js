// Endpoint de verificação e autorização da Senha Mestra
// - Somente administrador (papel consultado no banco)
// - Validação via master_security com bcrypt (record.validatePassword)
// - Bloqueio de 15 min após 5 falhas, com a tentativa RESERVADA de forma atômica antes do bcrypt
// - Token preso ao id do usuário, com expiração de 1 hora
// - Nada de hash, salt ou senha em resposta, log ou auditoria
routerAdd(
  'POST',
  '/backend/v1/audit/verify-master-password',
  (e) => {
    const reqInfo = e.requestInfo()
    const body = reqInfo ? reqInfo.body || {} : {}
    const password = typeof body.password === 'string' ? body.password : ''

    if (!password) {
      return e.json(400, { success: false, authorized: false, message: 'Senha é obrigatória.' })
    }

    if (!e.auth) {
      return e.json(401, { success: false, authorized: false, message: 'Usuário não autenticado.' })
    }

    let callerRole = ''
    try {
      callerRole = $app.findRecordById('users', e.auth.id).getString('role') || ''
    } catch (_) {}
    if (callerRole !== 'administrador') {
      return e.json(403, {
        success: false,
        authorized: false,
        message: 'Acesso negado: apenas administradores.',
      })
    }

    const now = Date.now()
    const clientIp = reqInfo ? reqInfo.remoteIP || '127.0.0.1' : '127.0.0.1'

    // 1. Reserva atômica da tentativa (transação), ANTES de validar a senha
    let configurada = true
    let bloqueadoAgora = false
    let tentativa = 0
    let lockedUntilAtual = 0
    try {
      $app.runInTransaction((txApp) => {
        const rec = txApp.findFirstRecordByData('master_security', 'name', 'primary_master')
        const lockedUntil = rec.getInt('locked_until') || 0
        if (lockedUntil > now) {
          bloqueadoAgora = true
          lockedUntilAtual = lockedUntil
          return
        }
        let attempts = rec.getInt('attempts_count') || 0
        if (lockedUntil > 0 && lockedUntil <= now) attempts = 0
        attempts += 1
        rec.set('attempts_count', attempts)
        rec.set('locked_until', attempts >= 5 ? now + 15 * 60 * 1000 : 0)
        txApp.save(rec)
        tentativa = attempts
      })
    } catch (_) {
      configurada = false
    }

    if (!configurada) {
      return e.json(400, {
        success: false,
        authorized: false,
        message: 'Senha mestra ainda não configurada no servidor.',
      })
    }

    if (bloqueadoAgora) {
      const remainingMins = Math.ceil((lockedUntilAtual - now) / 60000)
      return e.json(429, {
        success: false,
        authorized: false,
        message: `Muitas tentativas incorretas. Bloqueio ativo por mais ${remainingMins} minuto(s).`,
      })
    }

    const masterRecord = $app.findFirstRecordByData('master_security', 'name', 'primary_master')
    const isValid = masterRecord.validatePassword(password)

    if (!isValid) {
      const shouldLock = tentativa >= 5
      try {
        const auditCol = $app.findCollectionByNameOrId('auditoria')
        const auditRecord = new Record(auditCol)
        auditRecord.set('usuario_id', e.auth.id)
        auditRecord.set('acao', 'falha_senha_mestra')
        auditRecord.set('descricao', 'Tentativa incorreta de validação da Senha Mestra')
        auditRecord.set('detalhes', { ip: clientIp, tentativas: tentativa, bloqueado: shouldLock })
        $app.save(auditRecord)
      } catch (_) {}

      return e.json(401, {
        success: false,
        authorized: false,
        message: shouldLock
          ? 'Senha mestra incorreta. Limite excedido: bloqueado por 15 minutos.'
          : `Senha mestra incorreta. Tentativa ${tentativa} de 5.`,
      })
    }

    // 2. Sucesso: zera o contador (registro relido para não sobrescrever com dado velho)
    const fresh = $app.findFirstRecordByData('master_security', 'name', 'primary_master')
    fresh.set('attempts_count', 0)
    fresh.set('locked_until', 0)
    $app.save(fresh)

    const tokenSecret =
      fresh.getString('token_secret') || $security.sha256(fresh.getString('salt') || 'sec')
    const tokenPayload = { scope: 'master_audit', user_id: e.auth.id, created: now }
    const auditToken = $security.createJWT(tokenPayload, tokenSecret, 3600)

    try {
      const auditCol = $app.findCollectionByNameOrId('auditoria')
      const auditRecord = new Record(auditCol)
      auditRecord.set('usuario_id', e.auth.id)
      auditRecord.set('acao', 'autorizacao_senha_mestra')
      auditRecord.set('descricao', 'Autorização de acesso à auditoria concedida com Senha Mestra')
      auditRecord.set('detalhes', { ip: clientIp })
      $app.save(auditRecord)
    } catch (_) {}

    return e.json(200, {
      success: true,
      authorized: true,
      auditToken: auditToken,
      message: 'Senha mestra validada com sucesso.',
    })
  },
  $apis.requireAuth(),
)
