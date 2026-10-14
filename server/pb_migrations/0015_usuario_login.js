// 0015: login por usuário (nome curto), além do e-mail (decisão do Owner, lote 1).
// - Acrescenta o campo "usuario" (texto, obrigatório, minúsculas/números/ponto/hífen/sublinhado).
// - Preenche, SEM apagar nada, o usuário dos registros existentes a partir da parte local do e-mail
//   (com sufixo numérico se houver repetição).
// - Cria índice único e passa a aceitar "usuario" como identidade de login junto com "email".
// Migração retrocompatível: não remove coleção, campo nem registro.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    if (!users.fields.getByName('usuario')) {
      users.fields.add(
        new TextField({
          name: 'usuario',
          required: false,
          min: 3,
          max: 40,
          pattern: '^[a-z0-9._-]{3,40}$',
        }),
      )
      app.save(users)
    }

    // Preenche o usuário dos registros existentes (apenas os que ainda estão vazios)
    const usados = {}
    const comUsuario = app.findRecordsByFilter('users', "usuario != ''", '+created', 0, 0)
    for (const r of comUsuario) usados[r.getString('usuario')] = true

    const semUsuario = app.findRecordsByFilter('users', "usuario = ''", '+created', 0, 0)
    for (const r of semUsuario) {
      const email = r.getString('email') || ''
      let base = email
        .split('@')[0]
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '')
      if (base.length < 3) base = (base + 'usr').slice(0, 3)
      base = base.slice(0, 34)
      let candidato = base
      let n = 1
      while (usados[candidato]) {
        n += 1
        candidato = base + n
      }
      usados[candidato] = true
      app
        .db()
        .newQuery('UPDATE users SET usuario = {:u} WHERE id = {:id}')
        .bind({ u: candidato, id: r.id })
        .execute()
    }

    const users2 = app.findCollectionByNameOrId('_pb_users_auth_')
    const jaTemIndice = (users2.indexes || []).some((i) => i.indexOf('idx_users_usuario') !== -1)
    if (!jaTemIndice) {
      users2.indexes.push('CREATE UNIQUE INDEX idx_users_usuario ON users (usuario)')
    }
    const campo = users2.fields.getByName('usuario')
    if (campo) campo.required = true
    users2.passwordAuth.identityFields = ['email', 'usuario']
    app.save(users2)
  },
  (app) => {
    // Reversão conservadora: volta a aceitar só o e-mail; mantém o campo e os dados.
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.passwordAuth.identityFields = ['email']
    app.save(users)
  },
)
