migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('categorias')
    try {
      app
        .db()
        .newQuery(
          "UPDATE categorias SET grupo_dre = CASE WHEN tipo = 'receita' THEN 'receita_bruta' ELSE 'despesas_operacionais' END WHERE grupo_dre IS NULL OR grupo_dre = ''",
        )
        .execute()
    } catch (e) {
      console.log('Aviso ao preencher grupo_dre vazio:', e)
    }
    const f = col.fields.getByName('grupo_dre')
    if (f) f.required = true
    col.removeIndex('idx_categorias_unique_nome_tipo')
    col.indexes.push(
      'CREATE UNIQUE INDEX idx_categorias_unique_nome_tipo_ci ON categorias (LOWER(TRIM(nome)), tipo)',
    )
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('categorias')
    const f = col.fields.getByName('grupo_dre')
    if (f) f.required = false
    col.removeIndex('idx_categorias_unique_nome_tipo_ci')
    col.addIndex('idx_categorias_unique_nome_tipo', true, 'nome, tipo', '')
    app.save(col)
  },
)
