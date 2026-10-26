// 0025: o fechamento de caixa passa a registrar a CONTA do caixa (onde o dinheiro fica, ex.: Cofre).
// Aditiva e retrocompatível: um campo de texto novo em fechamentos_caixa; nada existente é alterado.
migrate(
  (app) => {
    const fech = app.findCollectionByNameOrId('fechamentos_caixa')
    if (!fech.fields.getByName('conta')) {
      fech.fields.add(new TextField({ name: 'conta', required: false, max: 120 }))
      app.save(fech)
    }
  },
  (app) => {
    // Reversão conservadora: não remove campos nem dados.
  },
)
