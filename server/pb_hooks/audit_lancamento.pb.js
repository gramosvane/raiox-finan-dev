// Hook para interceptar criação de lançamentos
// Regra 2.2: usuario_id sobrescrito no servidor com @request.auth.id
// Regra 7b: se vier sem empresa_id, preencher com a empresa do usuário; rejeitar se usuário não tiver empresa
// Regra 2.5: Criação do lançamento + registro de auditoria NA MESMA transação ($app.runInTransaction)
// Se a auditoria falhar, a operação é revertida e retorna erro.
onRecordCreate((e) => {
  // usuario_id/empresa_id já foram definidos em enforce_usuario_id.pb.js
  const authUserId = e.record.getString('usuario_id')

  // Executa validação normal antes de gravar
  e.next()

  // Grava auditoria obrigatória vinculada. No PocketBase hook onRecordCreate, e.app representa
  // o contexto transacional ativo quando disparado dentro de transação.
  const appScope = e.app || $app
  const auditCol = appScope.findCollectionByNameOrId('auditoria')
  const auditRecord = new Record(auditCol)
  auditRecord.set('usuario_id', authUserId)
  auditRecord.set('acao', 'criacao_lancamento')
  auditRecord.set(
    'descricao',
    `Lançamento criado: ${e.record.getString('descricao')} (R$ ${e.record.getFloat('valor')})`,
  )
  auditRecord.set('referencia_id', e.record.id)
  auditRecord.set('detalhes', {
    tipo: e.record.getString('tipo'),
    categoria: e.record.getString('categoria'),
    departamento: e.record.getString('departamento') || e.record.getString('centro_custo'),
    valor: e.record.getFloat('valor'),
    status: e.record.getString('status'),
    competencia: e.record.getString('competencia'),
    empresa_id: e.record.getString('empresa_id'),
    data_lancamento: e.record.getString('data_lancamento'),
    data_vencimento: e.record.getString('data_vencimento'),
    data_realizacao: e.record.getString('data_realizacao'),
    estorno_de: e.record.getString('estorno_de'),
    liquidacao_de: e.record.getString('liquidacao_de'),
  })
  // Se appScope.save falhar aqui, o erro é propagado e desfaz a transação do lançamento
  appScope.save(auditRecord)
}, 'lancamentos')
