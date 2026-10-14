// Auditoria e usuário do servidor para bens_depreciacao e recorrencias (lote 10).
// - O usuário vem do servidor (não do cliente).
// - Criação e alteração gravam auditoria na MESMA transação; se a auditoria falhar, nada é gravado.
onRecordCreateRequest(
  (e) => {
    if (e.auth) e.record.set('usuario_id', e.auth.id)
    e.next()
  },
  'bens_depreciacao',
  'recorrencias',
)

onRecordCreate(
  (e) => {
    e.next()
    const appScope = e.app || $app
    const nomeCol = e.record.collection().name
    const audit = new Record(appScope.findCollectionByNameOrId('auditoria'))
    audit.set('usuario_id', e.record.getString('usuario_id'))
    audit.set(
      'acao',
      nomeCol === 'bens_depreciacao' ? 'cadastro_bem_depreciacao' : 'cadastro_recorrencia',
    )
    audit.set(
      'descricao',
      `${nomeCol}: ${e.record.getString('descricao')} (R$ ${e.record.getFloat('valor')})`,
    )
    audit.set('referencia_id', e.record.id)
    audit.set('detalhes', { colecao: nomeCol, valor: e.record.getFloat('valor') })
    appScope.save(audit)
  },
  'bens_depreciacao',
  'recorrencias',
)

onRecordUpdate(
  (e) => {
    e.next()
    const appScope = e.app || $app
    const nomeCol = e.record.collection().name
    const audit = new Record(appScope.findCollectionByNameOrId('auditoria'))
    audit.set('usuario_id', e.record.getString('usuario_id'))
    audit.set(
      'acao',
      nomeCol === 'bens_depreciacao' ? 'alteracao_bem_depreciacao' : 'alteracao_recorrencia',
    )
    audit.set(
      'descricao',
      `${nomeCol}: ${e.record.getString('descricao')} atualizado (ativo: ${e.record.getBool('ativo')})`,
    )
    audit.set('referencia_id', e.record.id)
    audit.set('detalhes', { colecao: nomeCol, ativo: e.record.getBool('ativo') })
    appScope.save(audit)
  },
  'bens_depreciacao',
  'recorrencias',
)
