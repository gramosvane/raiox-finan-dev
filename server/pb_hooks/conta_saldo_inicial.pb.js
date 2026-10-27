// Saldo inicial das contas: valor, DATA DE CORTE e trilha de auditoria.
// O saldo de cada conta é "saldo inicial + movimentos realizados"; se o saldo inicial pudesse mudar em silêncio, nenhum
// saldo seria confiável. Por isso:
//  - na CRIAÇÃO da conta: a data de corte (padrão: hoje) não pode ser futura; saldo diferente de zero é auditado;
//  - depois de criada: o valor e a data de corte NÃO mudam pela API comum (recusado), só pela rota
//    POST /backend/v1/conta/saldo-inicial (administrador), que exige MOTIVO e grava, na mesma transação,
//    a auditoria com valor anterior, valor novo, data de corte anterior e nova, quem e quando.
// Contas antigas ficam sem data de corte registrada ("não registrada"): o Caixa atual não muda; a data entra
// quando o administrador registrar o saldo inicial pela rota.
// Arquivo separado de propósito: contas_integridade (aprovado) fica intacto.
// (o escopo de cada manipulador é isolado no PocketBase: as funções auxiliares ficam DENTRO de cada um)

onRecordCreateRequest((e) => {
  if (!e.auth || e.auth.collection().name !== 'users') return e.next()
  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
  const saldo = Number(e.record.get('saldo_inicial') || 0)
  if (!isFinite(saldo) || Math.abs(saldo) > 1e12) {
    throw new BadRequestError('O saldo inicial informado não é válido.')
  }
  // a data vem do texto ORIGINAL da requisição: o campo de data do PocketBase já normaliza "31/02" para outro dia
  const corpoReq = (e.requestInfo() && e.requestInfo().body) || {}
  const dataTxt = String(corpoReq.saldo_inicial_data || '').trim().slice(0, 10)
  if (dataTxt) {
    const d = new Date(dataTxt + 'T00:00:00Z')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataTxt) || isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dataTxt) {
      throw new BadRequestError('A data do saldo inicial não existe no calendário.')
    }
    if (dataTxt > hoje) {
      throw new BadRequestError('A data do saldo inicial não pode ser futura.')
    }
  } else {
    // restauração de backup (administrador): o backup antigo não traz a data; fica "não registrada"
    const cabecalhos = (e.requestInfo() && e.requestInfo().headers) || {}
    let restauracao = false
    if (String(cabecalhos['x_restauracao_backup'] || '') === '1') {
      try {
        restauracao = $app.findRecordById('users', e.auth.id).getString('role') === 'administrador'
      } catch (_) {}
    }
    if (!restauracao) e.record.set('saldo_inicial_data', hoje)
  }
  return e.next()
}, 'contas')

onRecordCreate((e) => {
  e.next()
  const saldo = e.record.getFloat('saldo_inicial')
  if (saldo === 0) return
  const app = e.app || $app
  const audit = new Record(app.findCollectionByNameOrId('auditoria'))
  audit.set('usuario_id', e.record.getString('usuario_id'))
  audit.set('acao', 'saldo_inicial_conta')
  audit.set(
    'descricao',
    'Conta "' + e.record.getString('nome') + '" criada com saldo inicial de R$ ' + saldo.toFixed(2) + '.',
  )
  audit.set('referencia_id', e.record.id)
  audit.set('detalhes', {
    conta: e.record.getString('nome'),
    saldo_anterior: 0,
    saldo_novo: saldo,
    data_corte_anterior: '',
    data_corte_nova: String(e.record.getString('saldo_inicial_data') || '').slice(0, 10),
    motivo: 'Criação da conta',
    usuario_id: e.record.getString('usuario_id'),
    data_hora_utc: new Date().toISOString(),
  })
  app.save(audit)
}, 'contas')

onRecordUpdateRequest((e) => {
  const o = e.record.original()
  const mudouSaldo = Math.abs(o.getFloat('saldo_inicial') - e.record.getFloat('saldo_inicial')) > 0.0001
  const mudouData =
    String(o.getString('saldo_inicial_data') || '').slice(0, 10) !==
    String(e.record.getString('saldo_inicial_data') || '').slice(0, 10)
  if (mudouSaldo || mudouData) {
    throw new BadRequestError(
      'Operação negada: o saldo inicial só muda pela função "Alterar saldo inicial" (administrador), que exige motivo e fica registrada.',
    )
  }
  return e.next()
}, 'contas')

routerAdd('POST', '/backend/v1/conta/saldo-inicial', (e) => {
  if (!e.auth || e.auth.collection().name !== 'users') {
    return e.json(401, { success: false, message: 'Operação negada: usuário não autenticado.' })
  }
  let papel = ''
  try {
    papel = $app.findRecordById('users', e.auth.id).getString('role') || ''
  } catch (_) {
    return e.json(403, { success: false, message: 'Acesso negado: falha ao consultar privilégios.' })
  }
  if (papel !== 'administrador') {
    return e.json(403, { success: false, message: 'Operação negada: só o administrador altera o saldo inicial de uma conta.' })
  }
  const corpo = (e.requestInfo() && e.requestInfo().body) || {}
  const id = String(corpo.id || '').trim()
  const motivo = String(corpo.motivo || '').trim().slice(0, 300)
  const dataCorte = String(corpo.data_corte || '').trim().slice(0, 10)
  const bruto = corpo.valor
  if (!id) return e.json(400, { success: false, message: 'Informe a conta.' })
  if (motivo.length < 5) return e.json(400, { success: false, message: 'Informe o motivo da alteração (mínimo 5 letras).' })
  if (bruto === undefined || bruto === null || String(bruto).trim() === '') {
    return e.json(400, { success: false, message: 'Informe o saldo inicial.' })
  }
  const valorNum = Number(typeof bruto === 'string' ? bruto.replace(',', '.') : bruto)
  if (!isFinite(valorNum) || Math.abs(valorNum) > 1e12) {
    return e.json(400, { success: false, message: 'O saldo inicial informado não é válido.' })
  }
  const valor = Math.round(valorNum * 100) / 100
  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
  const d = new Date(dataCorte + 'T00:00:00Z')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataCorte) || isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dataCorte) {
    return e.json(400, { success: false, message: 'Informe a data de corte do saldo inicial (uma data que exista no calendário).' })
  }
  if (dataCorte > hoje) {
    return e.json(400, { success: false, message: 'A data de corte não pode ser futura.' })
  }

  let resumo = null
  try {
    $app.runInTransaction((txApp) => {
      let conta
      try {
        conta = txApp.findRecordById('contas', id)
      } catch (_) {
        throw new BadRequestError('Conta não encontrada.')
      }
      const empresaUsuario = e.auth.getString('empresa_id')
      const empresaConta = conta.getString('empresa_id')
      if (empresaUsuario && empresaConta && empresaConta !== empresaUsuario) {
        throw new BadRequestError('Conta não encontrada.')
      }
      const saldoAnterior = conta.getFloat('saldo_inicial')
      const dataAnterior = String(conta.getString('saldo_inicial_data') || '').slice(0, 10)
      if (Math.abs(saldoAnterior - valor) <= 0.0001 && dataAnterior === dataCorte) {
        throw new BadRequestError('Nada mudou: o saldo inicial e a data de corte informados já são os atuais.')
      }
      conta.set('saldo_inicial', valor)
      conta.set('saldo_inicial_data', dataCorte)
      txApp.save(conta)

      const audit = new Record(txApp.findCollectionByNameOrId('auditoria'))
      audit.set('usuario_id', e.auth.id)
      audit.set('acao', 'saldo_inicial_conta')
      audit.set(
        'descricao',
        'Saldo inicial da conta "' + conta.getString('nome') + '" alterado de R$ ' + saldoAnterior.toFixed(2) +
          ' para R$ ' + valor.toFixed(2) + ' (data de corte ' + dataCorte + '). Motivo: ' + motivo,
      )
      audit.set('referencia_id', id)
      audit.set('detalhes', {
        conta: conta.getString('nome'),
        empresa_id: empresaConta,
        saldo_anterior: saldoAnterior,
        saldo_novo: valor,
        data_corte_anterior: dataAnterior,
        data_corte_nova: dataCorte,
        motivo: motivo,
        usuario_id: e.auth.id,
        data_hora_utc: new Date().toISOString(),
      })
      txApp.save(audit)
      resumo = { conta: conta.getString('nome'), saldo_anterior: saldoAnterior, saldo_novo: valor, data_corte: dataCorte }
    })
  } catch (err) {
    const msg = err && err.message ? String(err.message) : ''
    const conhecida = /Conta não encontrada|Nada mudou/.test(msg)
    if (!conhecida) console.error('conta_saldo_inicial: falha:', msg)
    return e.json(400, {
      success: false,
      message: conhecida ? msg : 'Não foi possível alterar o saldo inicial. Nada foi alterado.',
    })
  }
  return e.json(200, { success: true, message: 'Saldo inicial alterado e registrado.', ...resumo })
})
