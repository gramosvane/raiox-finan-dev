// 0027: a conta passa a registrar a DATA DE CORTE do saldo inicial (o dia a partir do qual o saldo inicial vale).
// Aditiva e retrocompatível: um campo de data novo em contas, opcional; nada existente é alterado.
// Contas antigas ficam sem data de corte ("não registrada"): o cálculo atual do Caixa não muda.
migrate(
  (app) => {
    const contas = app.findCollectionByNameOrId('contas')
    if (!contas.fields.getByName('saldo_inicial_data')) {
      contas.fields.add(new DateField({ name: 'saldo_inicial_data', required: false }))
      app.save(contas)
    }
  },
  (app) => {
    // Reversão conservadora: não remove campos nem dados.
  },
)
