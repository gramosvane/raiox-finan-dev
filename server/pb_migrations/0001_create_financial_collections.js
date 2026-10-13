migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. Coleção: contas
    const contas = new Collection({
      name: 'contas',
      type: 'base',
      listRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      viewRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      deleteRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      fields: [
        { name: 'nome', type: 'text', required: true, min: 2 },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          values: ['caixa', 'banco', 'cartao'],
          maxSelect: 1,
        },
        { name: 'saldo_inicial', type: 'number' },
        {
          name: 'usuario_id',
          type: 'relation',
          required: true,
          collectionId: usersCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_contas_usuario ON contas (usuario_id)'],
    })
    app.save(contas)

    // 2. Coleção: categorias
    const categorias = new Collection({
      name: 'categorias',
      type: 'base',
      listRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      viewRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      deleteRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      fields: [
        { name: 'nome', type: 'text', required: true, min: 2 },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          values: ['receita', 'despesa'],
          maxSelect: 1,
        },
        {
          name: 'usuario_id',
          type: 'relation',
          required: true,
          collectionId: usersCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_categorias_usuario ON categorias (usuario_id)'],
    })
    app.save(categorias)

    // 3. Coleção: centros_custo
    const centrosCusto = new Collection({
      name: 'centros_custo',
      type: 'base',
      listRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      viewRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      deleteRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      fields: [
        { name: 'nome', type: 'text', required: true, min: 2 },
        {
          name: 'usuario_id',
          type: 'relation',
          required: true,
          collectionId: usersCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_centros_custo_usuario ON centros_custo (usuario_id)'],
    })
    app.save(centrosCusto)

    // 4. Coleção: configuracoes
    const configuracoes = new Collection({
      name: 'configuracoes',
      type: 'base',
      listRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      viewRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      deleteRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      fields: [
        { name: 'chave', type: 'text', required: true },
        { name: 'valor', type: 'text', required: true },
        {
          name: 'usuario_id',
          type: 'relation',
          required: true,
          collectionId: usersCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_configuracoes_usuario_chave ON configuracoes (usuario_id, chave)',
      ],
    })
    app.save(configuracoes)

    // 5. Coleção: lancamentos
    // Nota: updateRule e deleteRule são null para blindagem (imutabilidade)
    const lancamentos = new Collection({
      name: 'lancamentos',
      type: 'base',
      listRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      viewRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'tipo',
          type: 'select',
          required: true,
          values: ['receita', 'despesa'],
          maxSelect: 1,
        },
        { name: 'descricao', type: 'text', required: true, min: 3 },
        { name: 'categoria', type: 'text', required: true },
        { name: 'centro_custo', type: 'text' },
        { name: 'conta', type: 'text' },
        { name: 'valor', type: 'number', required: true, min: 0.01 },
        { name: 'competencia', type: 'text', required: true, pattern: '^\\d{4}-\\d{2}$' },
        { name: 'data_lancamento', type: 'date', required: true },
        { name: 'data_vencimento', type: 'date' },
        { name: 'data_realizacao', type: 'date' },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['realizado', 'previsto', 'estornado'],
          maxSelect: 1,
        },
        { name: 'observacoes', type: 'text' },
        {
          name: 'usuario_id',
          type: 'relation',
          required: true,
          collectionId: usersCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_lancamentos_tipo ON lancamentos (tipo)',
        'CREATE INDEX idx_lancamentos_categoria ON lancamentos (categoria)',
        'CREATE INDEX idx_lancamentos_competencia ON lancamentos (competencia)',
        'CREATE INDEX idx_lancamentos_status ON lancamentos (status)',
        'CREATE INDEX idx_lancamentos_usuario ON lancamentos (usuario_id)',
      ],
    })
    app.save(lancamentos)

    // Adicionar campo self-reference estorno_de em lancamentos
    const lancamentosSaved = app.findCollectionByNameOrId('lancamentos')
    lancamentosSaved.fields.add(
      new RelationField({
        name: 'estorno_de',
        collectionId: lancamentosSaved.id,
        cascadeDelete: false,
        maxSelect: 1,
      }),
    )
    app.save(lancamentosSaved)

    // 6. Coleção: auditoria
    // updateRule e deleteRule são null (imutabilidade total)
    // listRule e viewRule protegidas
    const auditoria = new Collection({
      name: 'auditoria',
      type: 'base',
      listRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      viewRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'usuario_id',
          type: 'relation',
          required: true,
          collectionId: usersCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'acao', type: 'text', required: true },
        { name: 'descricao', type: 'text', required: true },
        { name: 'detalhes', type: 'json' },
        { name: 'referencia_id', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_auditoria_usuario ON auditoria (usuario_id)',
        'CREATE INDEX idx_auditoria_acao ON auditoria (acao)',
        'CREATE INDEX idx_auditoria_referencia ON auditoria (referencia_id)',
      ],
    })
    app.save(auditoria)
  },
  (app) => {
    const collections = [
      'auditoria',
      'lancamentos',
      'configuracoes',
      'centros_custo',
      'categorias',
      'contas',
    ]
    for (const name of collections) {
      try {
        const col = app.findCollectionByNameOrId(name)
        app.delete(col)
      } catch (_) {}
    }
  },
)
