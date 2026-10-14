// 0021: depreciação de bens e recorrências (lote 10).
// - "bens_depreciacao": bens que perdem valor com o tempo (equipamentos, veículos, informática...),
//   com vida útil, valor residual e prazo previsto de troca.
// - "recorrencias": modelos de lançamentos que se repetem (aluguel, mensalidade de software...),
//   usados para gerar lançamentos PREVISTOS.
// Leitura para autenticados; criação e alteração só pelo administrador; sem exclusão pela API
// (para encerrar, desative). Migração retrocompatível: só cria coleções novas.
migrate(
  (app) => {
    const regraAdmin = "@request.auth.id != '' && @request.auth.role = 'administrador'"
    const jaExiste = (nome) => {
      try {
        app.findCollectionByNameOrId(nome)
        return true
      } catch (_) {
        return false
      }
    }

    if (!jaExiste('bens_depreciacao')) {
      app.save(
        new Collection({
          name: 'bens_depreciacao',
          type: 'base',
          listRule: "@request.auth.id != ''",
          viewRule: "@request.auth.id != ''",
          createRule: regraAdmin,
          updateRule: regraAdmin,
          deleteRule: null,
          fields: [
            { name: 'descricao', type: 'text', required: true, min: 2, max: 200 },
            { name: 'tipo_bem', type: 'text', required: false, max: 40 },
            { name: 'valor', type: 'number', required: true, min: 0.01 },
            { name: 'valor_residual', type: 'number', required: false, min: 0 },
            { name: 'data_aquisicao', type: 'date', required: true },
            { name: 'vida_util_meses', type: 'number', required: true, min: 1, max: 600 },
            { name: 'troca_meses', type: 'number', required: false, min: 1, max: 600 },
            { name: 'ativo', type: 'bool', required: false },
            { name: 'observacao', type: 'text', required: false, max: 500 },
            { name: 'usuario_id', type: 'text', required: false },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
        }),
      )
    }

    if (!jaExiste('recorrencias')) {
      app.save(
        new Collection({
          name: 'recorrencias',
          type: 'base',
          listRule: "@request.auth.id != ''",
          viewRule: "@request.auth.id != ''",
          createRule: regraAdmin,
          updateRule: regraAdmin,
          deleteRule: null,
          fields: [
            { name: 'descricao', type: 'text', required: true, min: 2, max: 200 },
            {
              name: 'tipo',
              type: 'select',
              required: true,
              values: ['receita', 'despesa'],
              maxSelect: 1,
            },
            { name: 'categoria_id', type: 'text', required: true },
            { name: 'categoria_nome', type: 'text', required: false },
            { name: 'valor', type: 'number', required: true, min: 0.01 },
            {
              name: 'frequencia',
              type: 'select',
              required: true,
              values: ['mensal', 'trimestral', 'semestral', 'anual'],
              maxSelect: 1,
            },
            { name: 'dia', type: 'number', required: true, min: 1, max: 28 },
            { name: 'inicio', type: 'date', required: true },
            { name: 'ocorrencias', type: 'number', required: false, min: 1, max: 600 },
            { name: 'ativo', type: 'bool', required: false },
            { name: 'usuario_id', type: 'text', required: false },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
        }),
      )
    }
  },
  (app) => {
    // Reversão conservadora: não apaga coleções nem registros.
  },
)
