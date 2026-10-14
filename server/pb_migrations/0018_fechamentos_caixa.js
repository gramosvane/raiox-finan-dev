// 0018: fechamento (conferência) de caixa diário (lote 3).
// Cria a coleção "fechamentos_caixa". O fechamento é uma CONFERÊNCIA: o servidor calcula o total
// recebido do dia a partir dos lançamentos realizados e compara o dinheiro contado com o esperado
// (total do sistema menos maquineta PIX/crédito/débito menos despesas pagas em dinheiro).
// Registro imutável: sem alteração e sem exclusão pela API (nova conferência = novo registro).
// Migração retrocompatível: não altera coleções existentes.
migrate(
  (app) => {
    let existe = true
    try {
      app.findCollectionByNameOrId('fechamentos_caixa')
    } catch (_) {
      existe = false
    }
    if (existe) return

    const col = new Collection({
      name: 'fechamentos_caixa',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule:
        "@request.auth.id != '' && @request.auth.role != 'leitura' && @request.auth.role != ''",
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'data', type: 'date', required: true },
        { name: 'total_sistema', type: 'number', required: false, min: 0 },
        { name: 'maquineta_pix', type: 'number', required: false, min: 0 },
        { name: 'maquineta_credito', type: 'number', required: false, min: 0 },
        { name: 'maquineta_debito', type: 'number', required: false, min: 0 },
        { name: 'despesas_dinheiro', type: 'number', required: false, min: 0 },
        { name: 'dinheiro_contado', type: 'number', required: false, min: 0 },
        { name: 'esperado_dinheiro', type: 'number', required: false },
        { name: 'diferenca', type: 'number', required: false },
        { name: 'observacao', type: 'text', required: false, max: 500 },
        { name: 'empresa_id', type: 'text', required: false },
        {
          name: 'usuario_id',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_fechamentos_caixa_data ON fechamentos_caixa (data)'],
    })
    app.save(col)
  },
  (app) => {
    // Reversão conservadora: não apaga a coleção nem os registros de conferência.
  },
)
