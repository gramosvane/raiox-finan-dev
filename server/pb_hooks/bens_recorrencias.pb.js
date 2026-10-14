// Auditoria e usuário do servidor para bens_depreciacao e recorrencias (lote 10; atomicidade: lote 11).
// - O usuário vem do servidor (não do cliente).
// - Criação e alteração gravam a auditoria na MESMA transação do registro: o manipulador de requisição
//   abre a transação e o restante da cadeia (registro + auditoria) usa o mesmo escopo; se a auditoria
//   falhar, nada é gravado.
onRecordCreateRequest(
  (e) => {
    if (e.auth) e.record.set('usuario_id', e.auth.id)
    e.app.runInTransaction((txApp) => {
      const original = e.app
      e.app = txApp
      try {
        e.next()
      } finally {
        e.app = original
      }
    })
  },
  'bens_depreciacao',
  'recorrencias',
)

onRecordUpdateRequest(
  (e) => {
    e.app.runInTransaction((txApp) => {
      const original = e.app
      e.app = txApp
      try {
        e.next()
      } finally {
        e.app = original
      }
    })
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
