// 0014: fechamento de seguranca (cadastro, exclusao de conta e senha mestra)
migrate(
  (app) => {
    // 1. users: cadastro so por administrador (ou superusuario); sem empresa_id/role do cliente; sem exclusao pela API
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.createRule =
      "@request.auth.role = 'administrador' && @request.body.role:isset = false && @request.body.empresa_id:isset = false"
    users.updateRule =
      'id = @request.auth.id && @request.body.role:isset = false && @request.body.empresa_id:isset = false'
    users.deleteRule = null
    app.save(users)

    // 2. historico nao pode ser apagado em cascata ao excluir usuario
    for (const nome of [
      'lancamentos',
      'auditoria',
      'contas',
      'patrimonio',
      'empresas',
      'categorias',
    ]) {
      const col = app.findCollectionByNameOrId(nome)
      const campo = col.fields.getByName('usuario_id')
      if (campo) {
        campo.cascadeDelete = false
        app.save(col)
      }
    }

    // 3. master_security: sem login nativo; segredos ocultos na API
    const ms = app.findCollectionByNameOrId('master_security')
    ms.authRule = null
    ms.passwordAuth.enabled = false
    ms.oauth2.enabled = false
    ms.otp.enabled = false
    ms.mfa.enabled = false
    for (const nome of ['token_secret', 'salt']) {
      const campo = ms.fields.getByName(nome)
      if (campo) campo.hidden = true
    }
    app.save(ms)
  },
  (app) => {
    // sem reversao automatica: reabriria falhas de seguranca
  },
)
