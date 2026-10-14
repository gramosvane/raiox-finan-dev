// 0020: orçamento mensal por categoria (lote 7).
// Cria a coleção "orcamentos": um valor planejado por categoria e competência (AAAA-MM).
// Leitura para autenticados; criação, alteração e exclusão só pelo administrador (decisão de gestão).
// Migração retrocompatível: só cria uma coleção nova.
migrate(
  (app) => {
    let existe = true
    try {
      app.findCollectionByNameOrId('orcamentos')
    } catch (_) {
      existe = false
    }
    if (existe) return

    const col = new Collection({
      name: 'orcamentos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != '' && @request.auth.role = 'administrador'",
      updateRule: "@request.auth.id != '' && @request.auth.role = 'administrador'",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'administrador'",
      fields: [
        { name: 'categoria_id', type: 'text', required: true },
        { name: 'competencia', type: 'text', required: true, pattern: '^\\d{4}-\\d{2}$' },
        { name: 'valor', type: 'number', required: true, min: 0 },
        {
          name: 'usuario_id',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_orcamentos_categoria_competencia ON orcamentos (categoria_id, competencia)',
      ],
    })
    app.save(col)
  },
  (app) => {
    // Reversão conservadora: não apaga a coleção nem os orçamentos.
  },
)
