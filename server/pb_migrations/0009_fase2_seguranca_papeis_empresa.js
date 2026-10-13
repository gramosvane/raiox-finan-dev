migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const empresasCol = app.findCollectionByNameOrId('empresas')

    // 1. users: adicionar empresa_id (relação com empresas) para o modelo de Visão por Empresa
    if (!usersCol.fields.getByName('empresa_id')) {
      usersCol.fields.add(
        new RelationField({
          name: 'empresa_id',
          collectionId: empresasCol.id,
          cascadeDelete: false,
          maxSelect: 1,
          required: false,
        }),
      )
    }

    // Regras de users:
    // O usuário NÃO pode alterar o próprio role nem definir role no cadastro:
    // createRule: @request.body.role:isset = false
    // updateRule: id = @request.auth.id && @request.body.role:isset = false
    // list e view: id = @request.auth.id || (empresa_id != '' && empresa_id = @request.auth.empresa_id)
    // delete: id = @request.auth.id && @request.auth.role = 'administrador'
    usersCol.createRule = '@request.body.role:isset = false'
    usersCol.updateRule = 'id = @request.auth.id && @request.body.role:isset = false'
    usersCol.listRule =
      "@request.auth.id != '' && (id = @request.auth.id || (empresa_id != '' && empresa_id = @request.auth.empresa_id))"
    usersCol.viewRule =
      "@request.auth.id != '' && (id = @request.auth.id || (empresa_id != '' && empresa_id = @request.auth.empresa_id))"
    app.save(usersCol)

    // Associar empresa padrão ao usuário existente (se houver)
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
            'UPDATE users SET empresa_id = {:empId} WHERE empresa_id IS NULL OR empresa_id = ""',
          )
          .bind({ empId })
          .execute()
      }
    } catch (_) {}

    // 2. Criar coleção master_security (tipo auth ou base).
    // Conforme requisito 2.4: guardar a senha mestra com autenticação (bcrypt via PocketBase)
    // com list/view/create/update/delete = null (todas nulas), acessada só por hooks do servidor.
    let masterSecCol
    try {
      masterSecCol = app.findCollectionByNameOrId('master_security')
    } catch (_) {
      masterSecCol = new Collection({
        name: 'master_security',
        type: 'auth',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'name', type: 'text', required: false },
          { name: 'salt', type: 'text', required: false },
          { name: 'token_secret', type: 'text', required: false },
          { name: 'attempts_count', type: 'number', required: false },
          { name: 'locked_until', type: 'number', required: false },
          { name: 'updated_by', type: 'text', required: false },
        ],
      })
      app.save(masterSecCol)
    }

    // 3. Remover chaves _master* da coleção configuracoes
    try {
      app.db().newQuery("DELETE FROM configuracoes WHERE chave LIKE '_master%'").execute()
    } catch (_) {}

    // 4. Atualizar regras das coleções para VISÃO POR EMPRESA e BLOQUEIO DE ESCRITA PARA 'leitura'
    // Coleções financeiras: contas, categorias, lancamentos, patrimonio, departamentos, empresas, centros_custo, configuracoes

    // A. empresas
    // list/view: vinculadas ao usuário criador ou à empresa do usuário
    // create: operador ou administrador (não leitura)
    // update/delete: administrador
    empresasCol.listRule =
      "@request.auth.id != '' && (usuario_id = @request.auth.id || id = @request.auth.empresa_id)"
    empresasCol.viewRule =
      "@request.auth.id != '' && (usuario_id = @request.auth.id || id = @request.auth.empresa_id)"
    empresasCol.createRule =
      "@request.auth.id != '' && @request.auth.role != 'leitura' && @request.auth.role != ''"
    empresasCol.updateRule = "@request.auth.id != '' && @request.auth.role = 'administrador'"
    empresasCol.deleteRule = "@request.auth.id != '' && @request.auth.role = 'administrador'"
    app.save(empresasCol)

    // B. lancamentos
    // list/view: @request.auth.id != '' && (empresa_id = @request.auth.empresa_id || (empresa_id = '' && usuario_id = @request.auth.id))
    // create: @request.auth.id != '' && @request.auth.role != 'leitura' && @request.auth.role != ''
    // update/delete: null (mantém blindagem, edições somente pelo hook controlado)
    const lancCol = app.findCollectionByNameOrId('lancamentos')
    lancCol.listRule =
      "@request.auth.id != '' && ((empresa_id != '' && empresa_id = @request.auth.empresa_id) || usuario_id = @request.auth.id)"
    lancCol.viewRule =
      "@request.auth.id != '' && ((empresa_id != '' && empresa_id = @request.auth.empresa_id) || usuario_id = @request.auth.id)"
    lancCol.createRule =
      "@request.auth.id != '' && @request.auth.role != 'leitura' && @request.auth.role != ''"
    lancCol.updateRule = null
    lancCol.deleteRule = null
    app.save(lancCol)

    // C. contas
    const contasCol = app.findCollectionByNameOrId('contas')
    contasCol.listRule =
      "@request.auth.id != '' && ((empresa_id != '' && empresa_id = @request.auth.empresa_id) || usuario_id = @request.auth.id)"
    contasCol.viewRule =
      "@request.auth.id != '' && ((empresa_id != '' && empresa_id = @request.auth.empresa_id) || usuario_id = @request.auth.id)"
    contasCol.createRule =
      "@request.auth.id != '' && @request.auth.role != 'leitura' && @request.auth.role != ''"
    contasCol.updateRule =
      "@request.auth.id != '' && @request.auth.role != 'leitura' && @request.auth.role != '' && ((empresa_id != '' && empresa_id = @request.auth.empresa_id) || usuario_id = @request.auth.id)"
    contasCol.deleteRule =
      "@request.auth.id != '' && @request.auth.role = 'administrador' && ((empresa_id != '' && empresa_id = @request.auth.empresa_id) || usuario_id = @request.auth.id)"
    app.save(contasCol)

    // D. categorias
    const catCol = app.findCollectionByNameOrId('categorias')
    catCol.listRule = "@request.auth.id != ''"
    catCol.viewRule = "@request.auth.id != ''"
    catCol.createRule =
      "@request.auth.id != '' && @request.auth.role != 'leitura' && @request.auth.role != ''"
    catCol.updateRule =
      "@request.auth.id != '' && @request.auth.role != 'leitura' && @request.auth.role != ''"
    catCol.deleteRule = "@request.auth.id != '' && @request.auth.role = 'administrador'"
    app.save(catCol)

    // E. departamentos
    const depCol = app.findCollectionByNameOrId('departamentos')
    depCol.listRule = "@request.auth.id != ''"
    depCol.viewRule = "@request.auth.id != ''"
    depCol.createRule =
      "@request.auth.id != '' && @request.auth.role != 'leitura' && @request.auth.role != ''"
    depCol.updateRule =
      "@request.auth.id != '' && @request.auth.role != 'leitura' && @request.auth.role != ''"
    depCol.deleteRule = "@request.auth.id != '' && @request.auth.role = 'administrador'"
    app.save(depCol)

    // F. centros_custo
    try {
      const ccCol = app.findCollectionByNameOrId('centros_custo')
      ccCol.listRule = "@request.auth.id != ''"
      ccCol.viewRule = "@request.auth.id != ''"
      ccCol.createRule =
        "@request.auth.id != '' && @request.auth.role != 'leitura' && @request.auth.role != ''"
      ccCol.updateRule =
        "@request.auth.id != '' && @request.auth.role != 'leitura' && @request.auth.role != ''"
      ccCol.deleteRule = "@request.auth.id != '' && @request.auth.role = 'administrador'"
      app.save(ccCol)
    } catch (_) {}

    // G. patrimonio
    const patCol = app.findCollectionByNameOrId('patrimonio')
    patCol.listRule =
      "@request.auth.id != '' && ((empresa_id != '' && empresa_id = @request.auth.empresa_id) || usuario_id = @request.auth.id)"
    patCol.viewRule =
      "@request.auth.id != '' && ((empresa_id != '' && empresa_id = @request.auth.empresa_id) || usuario_id = @request.auth.id)"
    patCol.createRule =
      "@request.auth.id != '' && @request.auth.role != 'leitura' && @request.auth.role != ''"
    patCol.updateRule =
      "@request.auth.id != '' && @request.auth.role != 'leitura' && @request.auth.role != '' && ((empresa_id != '' && empresa_id = @request.auth.empresa_id) || usuario_id = @request.auth.id)"
    patCol.deleteRule =
      "@request.auth.id != '' && @request.auth.role = 'administrador' && ((empresa_id != '' && empresa_id = @request.auth.empresa_id) || usuario_id = @request.auth.id)"
    app.save(patCol)

    // H. configuracoes
    const cfgCol = app.findCollectionByNameOrId('configuracoes')
    cfgCol.listRule = "@request.auth.id != ''"
    cfgCol.viewRule = "@request.auth.id != ''"
    cfgCol.createRule = "@request.auth.id != '' && @request.auth.role = 'administrador'"
    cfgCol.updateRule = "@request.auth.id != '' && @request.auth.role = 'administrador'"
    cfgCol.deleteRule = "@request.auth.id != '' && @request.auth.role = 'administrador'"
    app.save(cfgCol)
  },
  (app) => {
    try {
      const masterSec = app.findCollectionByNameOrId('master_security')
      app.delete(masterSec)
    } catch (_) {}
  },
)
