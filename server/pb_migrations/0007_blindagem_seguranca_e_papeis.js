migrate(
  (app) => {
    // 1. users: adicionar campo papel (administrador, operador, leitura) com default 'administrador' para primeiro usuario
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!usersCol.fields.getByName('role')) {
      usersCol.fields.add(
        new SelectField({
          name: 'role',
          values: ['administrador', 'operador', 'leitura'],
          maxSelect: 1,
          required: false,
        }),
      )
      app.save(usersCol)
    }

    // 2. auditoria: blindagem RLS completa no servidor
    // Ninguém da API comum pode listar, visualizar, criar, atualizar ou deletar direto via coleção.
    // Somente pb_hooks e rotas protegidas têm acesso!
    const auditCol = app.findCollectionByNameOrId('auditoria')
    auditCol.listRule = null
    auditCol.viewRule = null
    auditCol.createRule = null
    auditCol.updateRule = null
    auditCol.deleteRule = null
    app.save(auditCol)

    // 3. lancamentos: bloquear update e delete diretos via API comum.
    // Toda edição deve passar pelo endpoint controlado /backend/v1/lancamentos/:id/editar
    const lancCol = app.findCollectionByNameOrId('lancamentos')
    lancCol.updateRule = null
    lancCol.deleteRule = null
    app.save(lancCol)

    // 4. Se houver usuário inicial sem role, define como 'administrador'
    app
      .db()
      .newQuery("UPDATE users SET role = 'administrador' WHERE role IS NULL OR role = ''")
      .execute()
  },
  (app) => {
    const auditCol = app.findCollectionByNameOrId('auditoria')
    auditCol.createRule = "@request.auth.id != ''"
    app.save(auditCol)
  },
)
