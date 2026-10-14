// 0019: novo grupo de DRE "fora_resultado" (lote 4): retiradas de sócio e transferências entre contas.
// Lançamentos desse grupo movimentam o caixa e as contas, mas NÃO entram na DRE (nem no EBITDA).
// Acrescenta o valor à lista de opções do campo grupo_dre das categorias. Não altera dados existentes.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('categorias')
    const campo = col.fields.getByName('grupo_dre')
    if (campo && campo.values.indexOf('fora_resultado') === -1) {
      campo.values = campo.values.concat(['fora_resultado'])
      app.save(col)
    }
  },
  (app) => {
    // Reversão conservadora: mantém a opção (remover poderia invalidar categorias já criadas).
  },
)
