migrate(
  (app) => {
    // 1. Criar coleção departamentos se não existir, espelhando centros_custo
    let departamentosCol
    try {
      departamentosCol = app.findCollectionByNameOrId('departamentos')
    } catch (_) {
      departamentosCol = new Collection({
        name: 'departamentos',
        type: 'base',
        listRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
        viewRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
        deleteRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
        fields: [
          { name: 'nome', type: 'text', required: true },
          {
            name: 'usuario_id',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_departamentos_usuario ON departamentos (usuario_id)'],
      })
      app.save(departamentosCol)
    }

    // 2. Copiar dados existentes de centros_custo para departamentos (preservando IDs e datas)
    try {
      app
        .db()
        .newQuery(`
      INSERT OR IGNORE INTO departamentos (id, nome, usuario_id, created, updated)
      SELECT id, nome, usuario_id, created, updated
      FROM centros_custo
    `)
        .execute()
    } catch (e) {
      console.log('Aviso ao copiar dados de centros_custo para departamentos: ' + e)
    }

    // 3. Adicionar campo departamento em lancamentos (se ainda não existir)
    try {
      const lancamentosCol = app.findCollectionByNameOrId('lancamentos')
      if (!lancamentosCol.fields.getByName('departamento')) {
        lancamentosCol.fields.add(
          new TextField({
            name: 'departamento',
            required: false,
          }),
        )
        app.save(lancamentosCol)
      }

      // 4. Migrar dados existentes de centro_custo para departamento em lancamentos
      // Preservando 100% dos dados sem perda
      app
        .db()
        .newQuery(`
      UPDATE lancamentos
      SET departamento = centro_custo
      WHERE (departamento IS NULL OR departamento = '')
        AND (centro_custo IS NOT NULL AND centro_custo != '')
    `)
        .execute()
    } catch (e) {
      console.log('Erro ao atualizar campos de lancamentos: ' + e)
    }

    // 5. Nenhuma alteração ou criação de senha em código de migração.
    // O superusuário/administrador deve ser configurado via prompt do PocketBase ou tela de cadastro.
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('departamentos')
      app.delete(col)
    } catch (_) {}
  },
)
