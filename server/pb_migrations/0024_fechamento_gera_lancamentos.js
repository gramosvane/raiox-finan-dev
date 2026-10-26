// 0024: o fechamento de caixa passa a GERAR os lançamentos do dia (receitas por forma de pagamento e despesas do caixa).
// Aditiva e retrocompatível (nenhum dado existente é alterado):
//  - fechamentos_caixa: caixa (identificação do caixa), numero_fita (numeração corrida da fita), categoria_id
//    (categoria da receita), despesas_itens (lista das despesas do caixa), estornado/estornado_em/estornado_por.
//  - lancamentos: fechamento_id (liga cada lançamento gerado ao fechamento que o originou).
migrate(
  (app) => {
    const fech = app.findCollectionByNameOrId('fechamentos_caixa')
    let mudouF = false
    const addF = (campo) => {
      if (!fech.fields.getByName(campo.name)) {
        fech.fields.add(campo)
        mudouF = true
      }
    }
    addF(new TextField({ name: 'caixa', required: false, max: 40 }))
    addF(new TextField({ name: 'numero_fita', required: false, max: 40 }))
    addF(new TextField({ name: 'categoria_id', required: false, max: 40 }))
    addF(new JSONField({ name: 'despesas_itens', required: false, maxSize: 200000 }))
    addF(new BoolField({ name: 'estornado', required: false }))
    addF(new TextField({ name: 'estornado_em', required: false, max: 40 }))
    addF(new TextField({ name: 'estornado_por', required: false, max: 40 }))
    if (mudouF) app.save(fech)

    const lanc = app.findCollectionByNameOrId('lancamentos')
    if (!lanc.fields.getByName('fechamento_id')) {
      lanc.fields.add(new TextField({ name: 'fechamento_id', required: false, max: 40 }))
      lanc.addIndex('idx_lancamentos_fechamento', false, 'fechamento_id', '')
      app.save(lanc)
    }
  },
  (app) => {
    // Reversão conservadora: não remove campos nem dados.
  },
)
