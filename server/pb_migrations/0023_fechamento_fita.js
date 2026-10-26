// 0023: fechamento de caixa com o TOTAL DA FITA (soma bruta dos recebimentos do dia, impressa pelo caixa).
// Acrescenta dois campos à coleção fechamentos_caixa:
//   total_fita            : valor informado pelo operador (fita do caixa);
//   diferenca_lancamentos : total_fita - total_sistema (receitas realizadas lançadas no dia); calculado no servidor.
// Migração aditiva e retrocompatível: registros antigos ficam com os dois campos vazios (conferência antiga).
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('fechamentos_caixa')
    let mudou = false
    if (!col.fields.getByName('total_fita')) {
      col.fields.add(new NumberField({ name: 'total_fita', required: false, min: 0 }))
      mudou = true
    }
    if (!col.fields.getByName('diferenca_lancamentos')) {
      col.fields.add(new NumberField({ name: 'diferenca_lancamentos', required: false }))
      mudou = true
    }
    if (mudou) app.save(col)
  },
  (app) => {
    // Reversão conservadora: não remove campos nem dados de conferência.
  },
)
