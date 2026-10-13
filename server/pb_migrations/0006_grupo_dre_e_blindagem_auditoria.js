migrate(
  (app) => {
    // 1. Atualizar coleção categorias: adicionar campo select "grupo_dre"
    const categoriasCol = app.findCollectionByNameOrId('categorias')
    if (!categoriasCol.fields.getByName('grupo_dre')) {
      categoriasCol.fields.add(
        new SelectField({
          name: 'grupo_dre',
          required: false,
          values: [
            'receita_bruta',
            'deducoes_tributos',
            'custos_variaveis',
            'despesas_operacionais',
            'investimento_capex',
            'receita_financeira',
            'despesa_financeira',
          ],
          maxSelect: 1,
        }),
      )
      app.save(categoriasCol)
    }

    // 2. Preencher grupo_dre das categorias existentes
    try {
      app
        .db()
        .newQuery(
          "UPDATE categorias SET grupo_dre = 'receita_bruta' WHERE nome IN ('Vendas', 'Serviços', 'Outros (Receita)') AND (grupo_dre IS NULL OR grupo_dre = '')",
        )
        .execute()
      app
        .db()
        .newQuery(
          "UPDATE categorias SET grupo_dre = 'receita_financeira' WHERE nome = 'Rendimentos Financeiros' AND (grupo_dre IS NULL OR grupo_dre = '')",
        )
        .execute()
      app
        .db()
        .newQuery(
          "UPDATE categorias SET grupo_dre = 'custos_variaveis' WHERE nome = 'Fornecedores' AND (grupo_dre IS NULL OR grupo_dre = '')",
        )
        .execute()
      app
        .db()
        .newQuery(
          "UPDATE categorias SET grupo_dre = 'deducoes_tributos' WHERE LOWER(nome) LIKE '%imposto%' AND (grupo_dre IS NULL OR grupo_dre = '')",
        )
        .execute()
      app
        .db()
        .newQuery(
          "UPDATE categorias SET grupo_dre = 'despesas_operacionais' WHERE nome IN ('Salários', 'Aluguel', 'Marketing', 'Outros (Despesa)') AND (grupo_dre IS NULL OR grupo_dre = '')",
        )
        .execute()
      app
        .db()
        .newQuery(
          "UPDATE categorias SET grupo_dre = 'investimento_capex' WHERE nome = 'Investimento' AND (grupo_dre IS NULL OR grupo_dre = '')",
        )
        .execute()
    } catch (e) {
      console.log('Aviso ao atualizar grupo_dre:', e)
    }

    // 3. Blindar coleção auditoria no nível de API:
    // list/view null para superusers apenas; acesso auditado feito via endpoints server-side controlados
    // createRule continua permitindo apenas chamadas autorizadas ou superuser
    const auditoriaCol = app.findCollectionByNameOrId('auditoria')
    auditoriaCol.listRule = null
    auditoriaCol.viewRule = null
    auditoriaCol.updateRule = null
    auditoriaCol.deleteRule = null
    app.save(auditoriaCol)

    // 4. Coleção lancamentos: delete continua null (bloqueado para sempre)
    // update continua bloqueado via REST comum (null) — a edição controlada é feita por rota server-side segura
    const lancamentosCol = app.findCollectionByNameOrId('lancamentos')
    lancamentosCol.deleteRule = null
    lancamentosCol.updateRule = null
    app.save(lancamentosCol)
  },
  (app) => {
    try {
      const categoriasCol = app.findCollectionByNameOrId('categorias')
      const f = categoriasCol.fields.getByName('grupo_dre')
      if (f) {
        categoriasCol.fields.removeByName('grupo_dre')
        app.save(categoriasCol)
      }
    } catch (_) {}
  },
)
