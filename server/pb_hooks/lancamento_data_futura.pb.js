// Lançamento REALIZADO não pode ter data de realização no futuro (calendário de Brasília, UTC-3).
// A regra já vale para quem grava pela API (enforce_usuario_id) e pela edição controlada (lancamento_editar);
// este gancho de MODELO cobre também as rotas do servidor que gravam por dentro (fechamento, depósito, estorno),
// que não passam pelos ganchos de requisição. Previsto não é afetado (a data de vencimento pode ser futura).
// Arquivo separado de propósito: os hooks aprovados de lançamento ficam intactos.
// (o escopo de cada manipulador é isolado no PocketBase: a verificação fica DENTRO de cada um)

onRecordCreate((e) => {
  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
  if (e.record.getString('status') === 'realizado') {
    const dataReal = String(e.record.getString('data_realizacao') || '').slice(0, 10)
    if (dataReal && dataReal > hoje) {
      throw new BadRequestError(
        'Lançamento realizado não pode ter data futura. Para valores futuros, use o status Previsto.',
      )
    }
  }
  return e.next()
}, 'lancamentos')

onRecordUpdate((e) => {
  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
  if (e.record.getString('status') === 'realizado') {
    const dataReal = String(e.record.getString('data_realizacao') || '').slice(0, 10)
    const dataRealAntes = String(e.record.original().getString('data_realizacao') || '').slice(0, 10)
    // só barra quando a data MUDOU para o futuro (um lançamento antigo já gravado não trava outras atualizações)
    if (dataReal && dataReal > hoje && dataReal !== dataRealAntes) {
      throw new BadRequestError(
        'Lançamento realizado não pode ter data futura. Para valores futuros, use o status Previsto.',
      )
    }
  }
  return e.next()
}, 'lancamentos')
