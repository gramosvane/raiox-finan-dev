migrate(
  (app) => {
    // 1. Limpeza defensiva / Deduplicação: caso existam categorias com mesmo nome e tipo,
    // mantém o registro mais antigo (menor id / menor created) para não quebrar a restrição UNIQUE.
    try {
      app
        .db()
        .newQuery(`
        DELETE FROM categorias WHERE id NOT IN (
          SELECT MIN(id) FROM categorias GROUP BY LOWER(TRIM(nome)), tipo
        )
      `)
        .execute()
    } catch (e) {
      console.log('Aviso ao deduplicar categorias antes do índice:', e)
    }

    // 2. Adicionar índice único composto (nome, tipo) na coleção categorias
    // Conforme especificação: garantir unicidade do nome por tipo (receita / despesa)
    const categoriasCol = app.findCollectionByNameOrId('categorias')
    categoriasCol.addIndex('idx_categorias_unique_nome_tipo', true, 'nome, tipo', '')
    app.save(categoriasCol)
  },
  (app) => {
    try {
      const categoriasCol = app.findCollectionByNameOrId('categorias')
      categoriasCol.removeIndex('idx_categorias_unique_nome_tipo')
      app.save(categoriasCol)
    } catch (_) {}
  },
)
