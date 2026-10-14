// Fechamento (conferência) de caixa diário (lote 3).
// - O usuário e a empresa vêm do servidor; o cliente não define total do sistema, esperado nem diferença.
// - total_sistema = soma das RECEITAS com status 'realizado' e data_realizacao no dia (da empresa do
//   usuário, quando houver).
// - esperado_dinheiro = total_sistema - (maquineta_pix + maquineta_credito + maquineta_debito)
//                       - despesas_dinheiro
// - diferenca = dinheiro_contado - esperado_dinheiro (negativo = falta; positivo = sobra).
// - A auditoria é gravada na mesma transação; se falhar, o fechamento não é gravado.
// Não presume separação por forma de pagamento que a origem não entrega: PIX, crédito e débito
// vêm do relatório da maquineta informado pelo operador.
onRecordCreateRequest((e) => {
  // (o escopo do manipulador é isolado no PocketBase: funções auxiliares ficam dentro dele)
  const arredonda2 = (v) => Math.round((Number(v) || 0) * 100) / 100
  if (!e.auth || e.auth.collection().name !== 'users') {
    throw new BadRequestError('Operação negada: usuário não autenticado.')
  }
  const rec = e.record
  const dataTxt = String(rec.get('data') || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataTxt)) {
    throw new BadRequestError('Informe a data do fechamento.')
  }

  const campos = [
    'maquineta_pix',
    'maquineta_credito',
    'maquineta_debito',
    'despesas_dinheiro',
    'dinheiro_contado',
  ]
  const v = {}
  for (const c of campos) {
    const n = Number(rec.get(c))
    v[c] = isFinite(n) && n > 0 ? arredonda2(n) : 0
    rec.set(c, v[c])
  }

  const empresaId = e.auth.getString('empresa_id')
  let total = 0
  try {
    const r = new DynamicModel({ centavos: 0 })
    let sql =
      "SELECT CAST(ROUND(COALESCE(SUM(valor), 0) * 100) AS INTEGER) AS centavos FROM lancamentos WHERE tipo = 'receita' AND status = 'realizado' AND substr(data_realizacao, 1, 10) = {:d}"
    const params = { d: dataTxt }
    if (empresaId) {
      sql += ' AND empresa_id = {:e}'
      params.e = empresaId
    }
    $app.db().newQuery(sql).bind(params).one(r)
    total = arredonda2(Number(r.centavos) / 100)
  } catch (err) {
    throw new BadRequestError('Não foi possível calcular o total do sistema para a data.')
  }

  const esperado = arredonda2(
    total - (v.maquineta_pix + v.maquineta_credito + v.maquineta_debito) - v.despesas_dinheiro,
  )
  rec.set('total_sistema', total)
  rec.set('esperado_dinheiro', esperado)
  rec.set('diferenca', arredonda2(v.dinheiro_contado - esperado))
  rec.set('usuario_id', e.auth.id)
  rec.set('empresa_id', empresaId || '')
  e.next()
}, 'fechamentos_caixa')

onRecordCreate((e) => {
  e.next()

  const appScope = e.app || $app
  const auditCol = appScope.findCollectionByNameOrId('auditoria')
  const audit = new Record(auditCol)
  audit.set('usuario_id', e.record.getString('usuario_id'))
  audit.set('acao', 'fechamento_caixa')
  audit.set(
    'descricao',
    `Fechamento de caixa de ${String(e.record.get('data')).slice(0, 10)}: diferença R$ ${e.record.getFloat('diferenca')}`,
  )
  audit.set('referencia_id', e.record.id)
  audit.set('detalhes', {
    data: String(e.record.get('data')).slice(0, 10),
    total_sistema: e.record.getFloat('total_sistema'),
    maquineta_pix: e.record.getFloat('maquineta_pix'),
    maquineta_credito: e.record.getFloat('maquineta_credito'),
    maquineta_debito: e.record.getFloat('maquineta_debito'),
    despesas_dinheiro: e.record.getFloat('despesas_dinheiro'),
    dinheiro_contado: e.record.getFloat('dinheiro_contado'),
    esperado_dinheiro: e.record.getFloat('esperado_dinheiro'),
    diferenca: e.record.getFloat('diferenca'),
  })
  appScope.save(audit)
}, 'fechamentos_caixa')
