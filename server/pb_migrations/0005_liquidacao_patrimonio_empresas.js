migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. Coleção: empresas
    let empresas
    try {
      empresas = app.findCollectionByNameOrId('empresas')
    } catch (_) {
      empresas = new Collection({
        name: 'empresas',
        type: 'base',
        listRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
        viewRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
        deleteRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
        fields: [
          { name: 'nome', type: 'text', required: true, min: 2 },
          { name: 'cnpj', type: 'text' },
          { name: 'padrao', type: 'bool' },
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
        indexes: ['CREATE INDEX idx_empresas_usuario ON empresas (usuario_id)'],
      })
      app.save(empresas)
    }

    // Instalação limpa: a coleção empresas permanece vazia.
    // As empresas serão cadastradas pelo usuário via interface ou primeiro setup.

    // 2. Coleção: patrimonio (ativos e passivos patrimoniais empresariais)
    let patrimonio
    try {
      patrimonio = app.findCollectionByNameOrId('patrimonio')
    } catch (_) {
      patrimonio = new Collection({
        name: 'patrimonio',
        type: 'base',
        listRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
        viewRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
        deleteRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
        fields: [
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: ['ativo', 'passivo'],
            maxSelect: 1,
          },
          { name: 'categoria', type: 'text', required: true }, // Imóveis, Veículos, Máquinas/Equipamentos, Aplicações/Bancos, Empréstimos, Financiamentos, Fornecedores LP, Tributos Parcelados, Outros
          { name: 'descricao', type: 'text', required: true, min: 2 },
          { name: 'valor', type: 'number', required: true, min: 0.01 },
          { name: 'data_referencia', type: 'date' },
          {
            name: 'empresa_id',
            type: 'relation',
            collectionId: empresas.id,
            cascadeDelete: false,
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
        indexes: [
          'CREATE INDEX idx_patrimonio_usuario ON patrimonio (usuario_id)',
          'CREATE INDEX idx_patrimonio_tipo ON patrimonio (tipo)',
        ],
      })
      app.save(patrimonio)
    }

    // 3. Adicionar campo liquidacao_de e empresa_id em lancamentos
    const lancamentos = app.findCollectionByNameOrId('lancamentos')

    if (!lancamentos.fields.getByName('liquidacao_de')) {
      lancamentos.fields.add(
        new RelationField({
          name: 'liquidacao_de',
          collectionId: lancamentos.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }

    if (!lancamentos.fields.getByName('empresa_id')) {
      lancamentos.fields.add(
        new RelationField({
          name: 'empresa_id',
          collectionId: empresas.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }

    app.save(lancamentos)

    // Adicionar índice para liquidacao_de e empresa_id se possível
    try {
      lancamentos.addIndex('idx_lancamentos_liquidacao', false, 'liquidacao_de', '')
      lancamentos.addIndex('idx_lancamentos_empresa', false, 'empresa_id', '')
      app.save(lancamentos)
    } catch (_) {}

    // 4. Adicionar empresa_id em contas
    const contas = app.findCollectionByNameOrId('contas')
    if (!contas.fields.getByName('empresa_id')) {
      contas.fields.add(
        new RelationField({
          name: 'empresa_id',
          collectionId: empresas.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      app.save(contas)
    }

    // Associar empresa padrão aos lançamentos e contas existentes que estejam sem empresa_id
    try {
      const defaultEmp = app.findRecordsByFilter(
        'empresas',
        "padrao = true || id != ''",
        'created',
        1,
        0,
      )
      if (defaultEmp && defaultEmp.length > 0) {
        const empId = defaultEmp[0].id
        app
          .db()
          .newQuery(
            'UPDATE lancamentos SET empresa_id = {:empId} WHERE empresa_id IS NULL OR empresa_id = ""',
          )
          .bind({ empId })
          .execute()
        app
          .db()
          .newQuery(
            'UPDATE contas SET empresa_id = {:empId} WHERE empresa_id IS NULL OR empresa_id = ""',
          )
          .bind({ empId })
          .execute()
      }
    } catch (e) {
      console.log('Aviso ao associar empresa default existente:', e)
    }
  },
  (app) => {
    try {
      const lancamentos = app.findCollectionByNameOrId('lancamentos')
      lancamentos.fields.removeByName('liquidacao_de')
      lancamentos.fields.removeByName('empresa_id')
      app.save(lancamentos)
    } catch (_) {}

    try {
      const contas = app.findCollectionByNameOrId('contas')
      contas.fields.removeByName('empresa_id')
      app.save(contas)
    } catch (_) {}

    try {
      const patrimonio = app.findCollectionByNameOrId('patrimonio')
      app.delete(patrimonio)
    } catch (_) {}

    try {
      const empresas = app.findCollectionByNameOrId('empresas')
      app.delete(empresas)
    } catch (_) {}
  },
)
