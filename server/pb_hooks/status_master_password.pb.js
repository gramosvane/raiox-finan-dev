// Endpoint para consultar status da Senha Mestra
// Regra 2.4: Consulta segura em master_security (fora de configuracoes)
routerAdd(
  'GET',
  '/backend/v1/audit/status-master-password',
  (e) => {
    let masterRecord = null
    try {
      masterRecord = $app.findFirstRecordByData('master_security', 'name', 'primary_master')
    } catch (_) {}

    return e.json(200, {
      success: true,
      configurada: Boolean(masterRecord && masterRecord.getString('id')),
    })
  },
  $apis.requireAuth(),
)
