// Hook para registrar login no sistema na coleção auditoria
onRecordAuthWithPasswordRequest((e) => {
  e.next()

  try {
    const auditCol = $app.findCollectionByNameOrId('auditoria')
    const auditRecord = new Record(auditCol)
    auditRecord.set('usuario_id', e.record.id)
    auditRecord.set('acao', 'login')
    auditRecord.set(
      'descricao',
      `Login efetuado no sistema pelo usuário ${e.record.getString('name') || e.record.getString('email')}`,
    )
    auditRecord.set('referencia_id', e.record.id)
    const reqInfo = e.requestInfo()
    const ip = reqInfo ? reqInfo.remoteIP : '127.0.0.1'
    auditRecord.set('detalhes', {
      ip: ip,
      metodo: 'senha',
      navegador: reqInfo && reqInfo.headers ? reqInfo.headers['user-agent'] || 'Web' : 'Web',
    })
    $app.save(auditRecord)
  } catch (err) {
    console.error('Falha ao auditar login:', err)
  }
}, 'users')
