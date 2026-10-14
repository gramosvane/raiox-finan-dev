// 0016: o administrador enxerga todos os usuários na tela de Usuários (lote 1).
// Antes, a listagem e a visão de "users" só mostravam o próprio usuário ou os da mesma empresa,
// e usuários sem empresa ficavam invisíveis até para o administrador.
// Acrescenta apenas a condição de administrador; as demais condições continuam iguais.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const regra =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.role = 'administrador' || (empresa_id != '' && empresa_id = @request.auth.empresa_id))"
    users.listRule = regra
    users.viewRule = regra
    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const regraAnterior =
      "@request.auth.id != '' && (id = @request.auth.id || (empresa_id != '' && empresa_id = @request.auth.empresa_id))"
    users.listRule = regraAnterior
    users.viewRule = regraAnterior
    app.save(users)
  },
)
