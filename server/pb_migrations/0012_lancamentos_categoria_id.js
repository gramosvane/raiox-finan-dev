migrate(
  (app) => {
    const lancamentos = app.findCollectionByNameOrId('lancamentos')
    const categorias = app.findCollectionByNameOrId('categorias')

    if (!lancamentos.fields.getByName('categoria_id')) {
      lancamentos.fields.add(
        new RelationField({
          name: 'categoria_id',
          collectionId: categorias.id,
          cascadeDelete: false,
          maxSelect: 1,
          required: false,
        }),
      )
      app.save(lancamentos)
    }

    try {
      lancamentos.addIndex('idx_lancamentos_categoria_id', false, 'categoria_id', '')
      app.save(lancamentos)
    } catch (_) {}

    // Resolução por nome para lançamentos legados:
    // - trim + comparação sem diferenciar maiúsculas/minúsculas + mesmo tipo;
    // - aceitar somente quando houver EXATAMENTE UMA categoria compatível;
    // - se não houver exatamente 1: deixar vazio e registrar aviso no log (NUNCA falhar).
    // - só preencher onde categoria_id estiver vazio/nulo (idempotente).
    let preenchidos = 0
    let vaziosComAviso = 0

    try {
      // Carregar todas as categorias ativas
      const todasCategorias = app.findRecordsByFilter('categorias', '', 'created', 0, 0) || []

      // Buscar lançamentos com categoria_id vazio ou nulo
      const lancsPendentes =
        app.findRecordsByFilter(
          'lancamentos',
          "categoria_id = null || categoria_id = ''",
          'created',
          0,
          0,
        ) || []

      for (const lanc of lancsPendentes) {
        const nomeLanc = (lanc.getString('categoria') || '').trim().toLowerCase()
        const tipoLanc = lanc.getString('tipo') || ''

        if (!nomeLanc) {
          vaziosComAviso++
          console.log(
            `[Migração 0012] Aviso: Lançamento ID ${lanc.id} possui campo textual 'categoria' vazio. categoria_id mantido vazio.`,
          )
          continue
        }

        const compativeis = todasCategorias.filter((cat) => {
          const catNome = (cat.getString('nome') || '').trim().toLowerCase()
          const catTipo = cat.getString('tipo') || ''
          return catNome === nomeLanc && catTipo === tipoLanc
        })

        if (compativeis.length === 1) {
          const catId = compativeis[0].id
          app
            .db()
            .newQuery('UPDATE lancamentos SET categoria_id = {:catId} WHERE id = {:id}')
            .bind({ catId, id: lanc.id })
            .execute()
          preenchidos++
        } else {
          vaziosComAviso++
          console.log(
            `[Migração 0012] Aviso: Lançamento ID ${lanc.id} ("${lanc.getString('descricao')}", cat: "${lanc.getString('categoria')}", tipo: "${tipoLanc}") encontrou ${compativeis.length} categorias compatíveis (exige exatamente 1). categoria_id mantido vazio.`,
          )
        }
      }

      console.log(
        `[Migração 0012] Concluída com sucesso: ${preenchidos} lançamento(s) associado(s) a categoria_id; ${vaziosComAviso} lançamento(s) mantido(s) vazio(s) com aviso no log.`,
      )
    } catch (err) {
      console.log('[Migração 0012] Aviso durante o backfill de categoria_id:', err)
    }
  },
  (app) => {
    try {
      const lancamentos = app.findCollectionByNameOrId('lancamentos')
      try {
        lancamentos.removeIndex('idx_lancamentos_categoria_id')
      } catch (_) {}
      lancamentos.fields.removeByName('categoria_id')
      app.save(lancamentos)
    } catch (err) {
      console.log('[Migração 0012] Erro na reversão:', err)
    }
  },
)
