migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('categorias')

    // 1. Adicionar campo 'ativa: boolean' (BoolField, default true, não obrigatório)
    if (!col.fields.getByName('ativa')) {
      col.fields.add(
        new BoolField({
          name: 'ativa',
          required: false,
        }),
      )
      app.save(col)
    }

    // 2. Colocar todas as categorias existentes como ativas (ativa = true / 1)
    try {
      app
        .db()
        .newQuery("UPDATE categorias SET ativa = 1 WHERE ativa IS NULL OR ativa = 0 OR ativa = ''")
        .execute()
    } catch (e) {
      console.log('[Migração 0013] Aviso ao atualizar campo ativa das categorias:', e)
    }

    // 3. Contabilizar e informar quantidade total de categorias migradas e ativas
    try {
      const totalCategorias = app.countRecords('categorias')
      let totalAtivas = 0
      try {
        const ativasRecs = app.findRecordsByFilter('categorias', 'ativa = true', '', 0, 0) || []
        totalAtivas = ativasRecs.length
      } catch (_) {
        totalAtivas = totalCategorias
      }
      console.log(
        `[Migração 0013] Concluída com sucesso: total de categorias migradas: ${totalCategorias}; ativas após migração: ${totalAtivas}.`,
      )
    } catch (err) {
      console.log('[Migração 0013] Log informativo:', err)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('categorias')
      col.fields.removeByName('ativa')
      app.save(col)
      console.log('[Migração 0013] Reversão concluída: campo ativa removido de categorias.')
    } catch (err) {
      console.log('[Migração 0013] Erro na reversão:', err)
    }
  },
)
