// 0026: DEPÓSITOS conferidos (Fase 2 de Bancos e Caixa).
// Um depósito agrupa os títulos (receitas previstas de PIX/cartão) que o banco pagou num dia, o valor líquido que caiu
// (as linhas do extrato somadas) e a taxa total (bruto menos líquido). Registro IMUTÁVEL: só a rota do servidor grava
// (create/update/delete nulos pela API), tudo na mesma transação das baixas e da despesa de taxa.
//  - depositos: o depósito original (nunca é alterado);
//  - depositos_correcoes: cada correção do valor líquido (valor anterior, novo, taxa anterior e nova, motivo, quem).
// Migração aditiva: cria duas coleções novas; nenhuma coleção ou dado existente é alterado.
migrate(
  (app) => {
    const regraLeitura =
      "@request.auth.id != '' && ((empresa_id != '' && empresa_id = @request.auth.empresa_id) || usuario_id = @request.auth.id)"
    const usuarios = app.findCollectionByNameOrId('users')

    let existe = true
    try {
      app.findCollectionByNameOrId('depositos')
    } catch (_) {
      existe = false
    }
    if (!existe) {
      const col = new Collection({
        name: 'depositos',
        type: 'base',
        listRule: regraLeitura,
        viewRule: regraLeitura,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'chave', type: 'text', required: true, max: 80 },
          { name: 'data_deposito', type: 'date', required: true },
          { name: 'conta', type: 'text', required: true, max: 120 },
          { name: 'valor_bruto', type: 'number', required: true, min: 0.01 },
          { name: 'valor_liquido', type: 'number', required: true, min: 0.01 },
          { name: 'taxa', type: 'number', required: false, min: 0 },
          { name: 'percentual', type: 'number', required: false, min: 0 },
          { name: 'qtd_titulos', type: 'number', required: true, min: 1 },
          { name: 'titulos', type: 'json', required: true, maxSize: 2000000 },
          { name: 'linhas_extrato', type: 'json', required: false, maxSize: 200000 },
          { name: 'taxa_lancamento_id', type: 'text', required: false, max: 40 },
          { name: 'categoria_taxa_id', type: 'text', required: false, max: 40 },
          { name: 'observacao', type: 'text', required: false, max: 500 },
          { name: 'empresa_id', type: 'text', required: false },
          { name: 'usuario_id', type: 'relation', required: false, collectionId: usuarios.id, cascadeDelete: false, maxSelect: 1 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_depositos_chave ON depositos (chave)',
          'CREATE INDEX idx_depositos_data ON depositos (data_deposito)',
        ],
      })
      app.save(col)
    }

    let existe2 = true
    try {
      app.findCollectionByNameOrId('depositos_correcoes')
    } catch (_) {
      existe2 = false
    }
    if (!existe2) {
      const col2 = new Collection({
        name: 'depositos_correcoes',
        type: 'base',
        listRule: regraLeitura,
        viewRule: regraLeitura,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'deposito_id', type: 'text', required: true, max: 40 },
          { name: 'liquido_anterior', type: 'number', required: true, min: 0.01 },
          { name: 'liquido_novo', type: 'number', required: true, min: 0.01 },
          { name: 'taxa_anterior', type: 'number', required: false, min: 0 },
          { name: 'taxa_nova', type: 'number', required: false, min: 0 },
          { name: 'motivo', type: 'text', required: true, max: 300 },
          { name: 'estorno_lancamento_id', type: 'text', required: false, max: 40 },
          { name: 'taxa_lancamento_id', type: 'text', required: false, max: 40 },
          { name: 'empresa_id', type: 'text', required: false },
          { name: 'usuario_id', type: 'relation', required: false, collectionId: usuarios.id, cascadeDelete: false, maxSelect: 1 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_depositos_correcoes_dep ON depositos_correcoes (deposito_id)'],
      })
      app.save(col2)
    }
  },
  (app) => {
    // Reversão conservadora: não apaga as coleções nem os registros de depósito.
  },
)
