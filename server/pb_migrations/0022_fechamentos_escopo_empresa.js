// 0022: escopo por empresa na leitura de fechamentos_caixa (lote 12, achado F2 do Claude Security).
// Antes, qualquer usuário autenticado listava os fechamentos de todas as empresas. Agora vale a mesma
// regra de lancamentos, contas e patrimonio: mesma empresa do usuário, ou fechamento do próprio usuário.
// Só altera as regras de leitura (listRule e viewRule). Não altera dados nem campos. Idempotente.
migrate(
  (app) => {
    let col = null
    try {
      col = app.findCollectionByNameOrId('fechamentos_caixa')
    } catch (_) {
      return
    }
    const regra =
      "@request.auth.id != '' && ((empresa_id != '' && empresa_id = @request.auth.empresa_id) || usuario_id = @request.auth.id)"
    if (col.listRule === regra && col.viewRule === regra) return
    col.listRule = regra
    col.viewRule = regra
    app.save(col)
  },
  (app) => {
    // Reversão conservadora: não volta a abrir a leitura para todas as empresas.
  },
)
