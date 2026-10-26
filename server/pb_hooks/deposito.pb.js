// DEPÓSITO CONFERIDO (Fase 2 de Bancos e Caixa).
// O banco deposita, por dia, o valor LÍQUIDO (já sem a taxa da maquineta). Esta rota recebe os títulos (receitas previstas
// de PIX/cartão) que o banco pagou, as linhas do extrato (valor que caiu) e, NA MESMA TRANSAÇÃO (tudo ou nada):
//  - baixa cada título pelo valor BRUTO (a regra de valor idêntico da baixa não muda), na conta bancária escolhida;
//  - lança UMA despesa de taxa = bruto - líquido, na categoria de taxa configurada (despesa financeira), na data do depósito;
//  - grava o registro IMUTÁVEL do depósito (títulos, linhas, valores, quem) e a auditoria.
// Princípios: a receita continua BRUTA; nada é estimado; a taxa não é presumida: acima do teto o servidor recusa até haver
// confirmação explícita; chave única contra envio repetido; só o administrador registra e corrige (papel lido do banco);
// a gravação por txApp não passa pelos hooks de requisição, por isso TODAS as checagens da baixa são repetidas aqui.
// Correção do valor líquido: rota própria, atômica e auditada (estorna a despesa de taxa e lança a correta; o depósito
// original nunca muda; cada correção fica em depositos_correcoes). O que NÃO se desfaz é a baixa (regra aprovada).
// (o escopo de cada manipulador é isolado no PocketBase: tudo que é auxiliar fica DENTRO de cada um)

routerAdd('POST', '/backend/v1/deposito/registrar', (e) => {
  const normaliza = (s) => {
    let t = String(s || '').replace(/[​-‍﻿]/g, '')
    try {
      t = t.normalize('NFD').replace(/[̀-ͯ]/g, '')
    } catch (_) {}
    return t.trim().replace(/\s+/g, ' ').toLowerCase()
  }
  const usr = (m) => new Error('USR:' + m)
  const dataBR = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4)
  const dia = (v) => String(v || '').slice(0, 10)

  if (!e.auth || e.auth.collection().name !== 'users') {
    return e.json(401, { success: false, message: 'Operação negada: usuário não autenticado.' })
  }
  let usuario
  try {
    usuario = $app.findRecordById('users', e.auth.id)
  } catch (_) {
    return e.json(401, { success: false, message: 'Operação negada: usuário não autenticado.' })
  }
  if (usuario.getString('role') !== 'administrador') {
    return e.json(403, { success: false, message: 'Operação negada: só o administrador registra depósitos.' })
  }
  const empresaId = usuario.getString('empresa_id') || ''
  const corpo = (e.requestInfo() && e.requestInfo().body) || {}

  const chave = String(corpo.chave || '').trim()
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(chave)) {
    return e.json(400, { success: false, message: 'Chave do depósito inválida.' })
  }
  const dataDep = dia(corpo.data_deposito)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataDep)) {
    return e.json(400, { success: false, message: 'Informe a data em que o dinheiro caiu no banco.' })
  }
  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
  if (dataDep > hoje) {
    return e.json(400, { success: false, message: 'A data do depósito não pode ser futura.' })
  }
  const contaInformada = String(corpo.conta || '').trim()
  if (!contaInformada) return e.json(400, { success: false, message: 'Escolha a conta bancária onde o dinheiro caiu.' })

  const ids = Array.isArray(corpo.titulos) ? corpo.titulos.map((x) => String(x)) : []
  if (ids.length < 1 || ids.length > 100) {
    return e.json(400, { success: false, message: 'Marque de 1 a 100 títulos para o depósito.' })
  }
  if (new Set(ids).size !== ids.length) {
    return e.json(400, { success: false, message: 'Há título repetido na seleção.' })
  }

  // linhas do extrato (ex.: Mastercard débito 120,00): o líquido é a soma delas
  const linhasBrutas = Array.isArray(corpo.linhas) ? corpo.linhas : []
  if (linhasBrutas.length < 1 || linhasBrutas.length > 12) {
    return e.json(400, { success: false, message: 'Informe de 1 a 12 linhas do extrato (o valor que caiu).' })
  }
  const linhas = []
  let liquidoC = 0
  for (const l of linhasBrutas) {
    const vc = Math.round((Number((l && l.valor) || 0) || 0) * 100)
    if (!(vc > 0)) return e.json(400, { success: false, message: 'Cada linha do extrato precisa de um valor maior que zero.' })
    linhas.push({ rotulo: String((l && l.rotulo) || '').trim().slice(0, 60), valor: vc / 100 })
    liquidoC += vc
  }
  const observacao = String(corpo.observacao || '').trim().slice(0, 500)
  const confirmarAlta = corpo.confirmar_taxa_alta === true

  let resultado = null
  try {
    $app.runInTransaction((txApp) => {
      // 1) envio repetido (duplo clique, reenvio)
      let repetido = false
      try {
        txApp.findFirstRecordByFilter('depositos', 'chave = {:c}', { c: chave })
        repetido = true
      } catch (_) {}
      if (repetido) throw usr('Este depósito já foi registrado (envio repetido). Atualize a página.')

      // 2) conta: existe, é banco, é da empresa
      let contas = []
      try {
        contas = txApp.findRecordsByFilter('contas', "empresa_id = {:e} || empresa_id = ''", '', 500, 0, { e: empresaId }) || []
      } catch (_) {
        throw usr('Não foi possível verificar a conta. Tente novamente.')
      }
      let conta = null
      for (const c of contas) {
        if (normaliza(c.getString('nome')) === normaliza(contaInformada)) {
          conta = c
          break
        }
      }
      if (!conta) throw usr('A conta informada não existe. Cadastre-a em Configurações.')
      if (conta.getString('tipo') !== 'banco') throw usr('O depósito da maquineta deve cair em uma conta do tipo banco.')
      const nomeConta = conta.getString('nome')

      // 3) títulos: as mesmas checagens da baixa
      const colLanc = txApp.findCollectionByNameOrId('lancamentos')
      const originais = []
      let brutoC = 0
      for (const id of ids) {
        let o
        try {
          o = txApp.findRecordById('lancamentos', id)
        } catch (_) {
          throw usr('Um dos títulos marcados não foi encontrado.')
        }
        const desc = o.getString('descricao')
        if (o.getString('tipo') !== 'receita') throw usr('O título "' + desc + '" não é uma receita.')
        if (o.getString('status') !== 'previsto') throw usr('O título "' + desc + '" não está previsto (já recebido ou estornado).')
        if (o.getString('liquidacao_de') || o.getString('estorno_de')) throw usr('O título "' + desc + '" não pode ser baixado.')
        if ((o.getString('empresa_id') || '') !== empresaId) throw usr('O título "' + desc + '" pertence a outra empresa.')
        const jaBaixado = txApp.findRecordsByFilter('lancamentos', "liquidacao_de = {:i} && status != 'estornado'", '', 1, 0, { i: id }) || []
        if (jaBaixado.length > 0) throw usr('O título "' + desc + '" já foi baixado.')
        if (dataDep < dia(o.getString('data_lancamento'))) throw usr('O depósito não pode ser anterior à venda do título "' + desc + '".')
        const vc = Math.round(o.getFloat('valor') * 100)
        if (!(vc > 0)) throw usr('O título "' + desc + '" tem valor inválido.')
        brutoC += vc
        originais.push(o)
      }

      // 4) taxa = bruto - líquido; nunca presumida: líquido > bruto é erro; taxa alta exige confirmação
      if (liquidoC > brutoC) throw usr('O valor que caiu (' + liquidoC / 100 + ') é maior que o bruto dos títulos (' + brutoC / 100 + '). Confira os títulos marcados.')
      const taxaC = brutoC - liquidoC
      const percentual = Math.round((taxaC / brutoC) * 10000) / 100
      let teto = 5
      try {
        const t = parseFloat(String(txApp.findFirstRecordByData('permissoes', 'chave', 'deposito_taxa_teto').getString('valor')).replace(',', '.'))
        if (isFinite(t) && t > 0 && t <= 100) teto = t
      } catch (_) {}
      if (percentual > teto && !confirmarAlta) {
        throw usr('A taxa de ' + percentual + '% está acima do limite de ' + teto + '%. Não presumimos que toda diferença é taxa: confira os títulos marcados (pode faltar ou sobrar título) e o valor do extrato. Se estiver correto, confirme a taxa alta.')
      }

      // 5) categoria da taxa (despesa financeira escolhida pelo administrador, por id)
      let catTaxa = null
      if (taxaC > 0) {
        let idCat = ''
        try {
          idCat = txApp.findFirstRecordByData('permissoes', 'chave', 'categoria_taxa_id').getString('valor')
        } catch (_) {}
        if (!idCat) throw usr('Escolha a categoria da taxa de maquineta (configuração de depósitos) antes de registrar.')
        try {
          catTaxa = txApp.findRecordById('categorias', idCat)
        } catch (_) {
          throw usr('A categoria da taxa configurada não existe mais. Escolha outra.')
        }
        if (catTaxa.getString('tipo') !== 'despesa' || !catTaxa.getBool('ativa')) {
          throw usr('A categoria da taxa deve ser uma categoria de despesa ativa.')
        }
      }

      // 6) baixas pelo bruto (mesmo corpo da baixa feita pela tela)
      const temDepto = !!colLanc.fields.getByName('departamento')
      const guardados = []
      for (const o of originais) {
        const b = new Record(colLanc)
        b.set('tipo', 'receita')
        b.set('descricao', '[LIQUIDADO] ' + o.getString('descricao').replace(/^\[PREVISTO\]\s*/i, ''))
        b.set('categoria', o.getString('categoria'))
        b.set('categoria_id', o.getString('categoria_id'))
        if (o.getString('centro_custo')) b.set('centro_custo', o.getString('centro_custo'))
        if (temDepto && o.getString('departamento')) b.set('departamento', o.getString('departamento'))
        b.set('conta', nomeConta)
        b.set('valor', o.getFloat('valor'))
        b.set('competencia', o.getString('competencia'))
        b.set('data_lancamento', dia(o.getString('data_lancamento')))
        if (dia(o.getString('data_vencimento'))) b.set('data_vencimento', dia(o.getString('data_vencimento')))
        b.set('data_realizacao', dataDep)
        b.set('status', 'realizado')
        b.set('observacoes', 'Realização quitada pelo depósito de ' + dataBR(dataDep) + ' (' + nomeConta + '). Ref original: ' + o.id)
        b.set('usuario_id', usuario.id)
        b.set('liquidacao_de', o.id)
        b.set('empresa_id', empresaId)
        txApp.save(b)
        guardados.push({
          id: o.id,
          descricao: o.getString('descricao'),
          valor: o.getFloat('valor'),
          data_lancamento: dia(o.getString('data_lancamento')),
          data_vencimento: dia(o.getString('data_vencimento')),
          competencia: o.getString('competencia'),
          categoria_id: o.getString('categoria_id'),
        })
      }

      // 7) UMA despesa de taxa (nada se a taxa for zero)
      let taxaLancId = ''
      if (taxaC > 0) {
        const t = new Record(colLanc)
        t.set('tipo', 'despesa')
        t.set('descricao', 'Taxa de maquineta e cartão - depósito de ' + dataBR(dataDep) + ' (' + nomeConta + ')')
        t.set('categoria', catTaxa.getString('nome'))
        t.set('categoria_id', catTaxa.id)
        t.set('conta', nomeConta)
        t.set('valor', taxaC / 100)
        t.set('competencia', dataDep.slice(0, 7))
        t.set('data_lancamento', dataDep)
        t.set('data_realizacao', dataDep)
        t.set('status', 'realizado')
        t.set('observacoes', 'Taxa calculada pelo depósito conferido (bruto ' + brutoC / 100 + ' menos o que caiu ' + liquidoC / 100 + ').')
        t.set('usuario_id', usuario.id)
        t.set('empresa_id', empresaId)
        txApp.save(t)
        taxaLancId = t.id
      }

      // 8) registro imutável do depósito + auditoria
      const dep = new Record(txApp.findCollectionByNameOrId('depositos'))
      dep.set('chave', chave)
      dep.set('data_deposito', dataDep)
      dep.set('conta', nomeConta)
      dep.set('valor_bruto', brutoC / 100)
      dep.set('valor_liquido', liquidoC / 100)
      dep.set('taxa', taxaC / 100)
      dep.set('percentual', percentual)
      dep.set('qtd_titulos', guardados.length)
      dep.set('titulos', guardados)
      dep.set('linhas_extrato', linhas)
      dep.set('taxa_lancamento_id', taxaLancId)
      dep.set('categoria_taxa_id', catTaxa ? catTaxa.id : '')
      dep.set('observacao', observacao)
      dep.set('empresa_id', empresaId)
      dep.set('usuario_id', usuario.id)
      txApp.save(dep)

      const audit = new Record(txApp.findCollectionByNameOrId('auditoria'))
      audit.set('usuario_id', usuario.id)
      audit.set('acao', 'deposito_conferido')
      audit.set('descricao', 'Depósito de ' + dataBR(dataDep) + ' em ' + nomeConta + ': ' + guardados.length + ' título(s), bruto ' + brutoC / 100 + ', líquido ' + liquidoC / 100 + ', taxa ' + taxaC / 100 + ' (' + percentual + '%)')
      audit.set('referencia_id', dep.id)
      audit.set('detalhes', { chave: chave, conta: nomeConta, bruto: brutoC / 100, liquido: liquidoC / 100, taxa: taxaC / 100, percentual: percentual, titulos: ids, taxa_alta_confirmada: percentual > teto })
      txApp.save(audit)

      resultado = { id: dep.id, bruto: brutoC / 100, liquido: liquidoC / 100, taxa: taxaC / 100, percentual: percentual, titulos: guardados.length }
    })
  } catch (err) {
    const msg = err && err.message ? String(err.message) : ''
    if (msg.indexOf('USR:') === 0) return e.json(400, { success: false, message: msg.slice(4) })
    console.error('deposito/registrar: falha:', msg)
    return e.json(400, { success: false, message: 'Não foi possível registrar o depósito. Nada foi alterado.' })
  }
  return e.json(200, { success: true, message: 'Depósito registrado.', ...resultado })
})

routerAdd('POST', '/backend/v1/deposito/corrigir', (e) => {
  const usr = (m) => new Error('USR:' + m)
  const dia = (v) => String(v || '').slice(0, 10)

  if (!e.auth || e.auth.collection().name !== 'users') {
    return e.json(401, { success: false, message: 'Operação negada: usuário não autenticado.' })
  }
  let usuario
  try {
    usuario = $app.findRecordById('users', e.auth.id)
  } catch (_) {
    return e.json(401, { success: false, message: 'Operação negada: usuário não autenticado.' })
  }
  if (usuario.getString('role') !== 'administrador') {
    return e.json(403, { success: false, message: 'Operação negada: só o administrador corrige depósitos.' })
  }
  const empresaId = usuario.getString('empresa_id') || ''
  const corpo = (e.requestInfo() && e.requestInfo().body) || {}
  const id = String(corpo.id || '').trim()
  const motivo = String(corpo.motivo || '').trim().slice(0, 300)
  const novoC = Math.round((Number(corpo.valor_liquido || 0) || 0) * 100)
  const confirmarAlta = corpo.confirmar_taxa_alta === true
  if (!id) return e.json(400, { success: false, message: 'Informe o depósito.' })
  if (motivo.length < 5) return e.json(400, { success: false, message: 'Informe o motivo da correção (mínimo 5 letras).' })
  if (!(novoC > 0)) return e.json(400, { success: false, message: 'Informe o novo valor que caiu no banco (maior que zero).' })
  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)

  let resultado = null
  try {
    $app.runInTransaction((txApp) => {
      let dep
      try {
        dep = txApp.findRecordById('depositos', id)
      } catch (_) {
        throw usr('Depósito não encontrado.')
      }
      if ((dep.getString('empresa_id') || '') !== empresaId) throw usr('Depósito não encontrado.')

      // valores vigentes: os do depósito ou os da última correção
      const ultimas = txApp.findRecordsByFilter('depositos_correcoes', 'deposito_id = {:d}', '-created', 1, 0, { d: id }) || []
      const brutoC = Math.round(dep.getFloat('valor_bruto') * 100)
      let atualC = Math.round(dep.getFloat('valor_liquido') * 100)
      let taxaAtualC = Math.round(dep.getFloat('taxa') * 100)
      let taxaLancAtual = dep.getString('taxa_lancamento_id')
      if (ultimas.length > 0) {
        atualC = Math.round(ultimas[0].getFloat('liquido_novo') * 100)
        taxaAtualC = Math.round(ultimas[0].getFloat('taxa_nova') * 100)
        taxaLancAtual = ultimas[0].getString('taxa_lancamento_id')
      }
      if (novoC > brutoC) throw usr('O novo valor (' + novoC / 100 + ') é maior que o bruto dos títulos (' + brutoC / 100 + ').')
      if (novoC === atualC) throw usr('O valor informado é igual ao valor atual do depósito.')
      const novaTaxaC = brutoC - novoC
      const percentual = Math.round((novaTaxaC / brutoC) * 10000) / 100
      let teto = 5
      try {
        const t = parseFloat(String(txApp.findFirstRecordByData('permissoes', 'chave', 'deposito_taxa_teto').getString('valor')).replace(',', '.'))
        if (isFinite(t) && t > 0 && t <= 100) teto = t
      } catch (_) {}
      if (percentual > teto && !confirmarAlta) {
        throw usr('A taxa de ' + percentual + '% está acima do limite de ' + teto + '%. Confira o valor; se estiver correto, confirme a taxa alta.')
      }

      const colLanc = txApp.findCollectionByNameOrId('lancamentos')
      const nomeConta = dep.getString('conta')
      const dataDep = dia(dep.getString('data_deposito'))

      // estorna a despesa de taxa vigente (contra-lançamento, como o estorno do sistema)
      let estornoId = ''
      if (taxaAtualC > 0 && taxaLancAtual) {
        let o
        try {
          o = txApp.findRecordById('lancamentos', taxaLancAtual)
        } catch (_) {
          throw usr('A despesa de taxa do depósito não foi encontrada.')
        }
        const jaEstornada = txApp.findRecordsByFilter('lancamentos', 'estorno_de = {:i}', '', 1, 0, { i: o.id }) || []
        if (o.getString('status') !== 'realizado' || jaEstornada.length > 0) throw usr('A despesa de taxa vigente já foi estornada.')
        const x = new Record(colLanc)
        x.set('tipo', 'despesa')
        x.set('descricao', '[ESTORNO] ' + o.getString('descricao') + ' - Ref: ' + o.id + ' (correção do depósito: ' + motivo + ')')
        x.set('categoria', o.getString('categoria'))
        x.set('categoria_id', o.getString('categoria_id'))
        x.set('valor', o.getFloat('valor'))
        x.set('competencia', o.getString('competencia'))
        x.set('data_lancamento', hoje)
        x.set('data_realizacao', hoje)
        x.set('status', 'realizado')
        x.set('conta', o.getString('conta'))
        x.set('observacoes', 'Estorno da taxa do depósito ' + dep.id + '. Motivo: ' + motivo)
        x.set('usuario_id', usuario.id)
        x.set('empresa_id', empresaId)
        x.set('estorno_de', o.id)
        txApp.save(x)
        estornoId = x.id
      }

      // lança a taxa correta (nada se a nova taxa for zero)
      let novaTaxaLancId = ''
      if (novaTaxaC > 0) {
        let idCat = dep.getString('categoria_taxa_id')
        if (!idCat) {
          try {
            idCat = txApp.findFirstRecordByData('permissoes', 'chave', 'categoria_taxa_id').getString('valor')
          } catch (_) {}
        }
        let catTaxa
        try {
          catTaxa = txApp.findRecordById('categorias', idCat)
        } catch (_) {
          throw usr('A categoria da taxa não existe mais. Escolha outra na configuração de depósitos.')
        }
        if (catTaxa.getString('tipo') !== 'despesa' || !catTaxa.getBool('ativa')) throw usr('A categoria da taxa deve ser uma despesa ativa.')
        const t = new Record(colLanc)
        t.set('tipo', 'despesa')
        t.set('descricao', 'Taxa de maquineta e cartão - depósito de ' + dataDep.slice(8, 10) + '/' + dataDep.slice(5, 7) + '/' + dataDep.slice(0, 4) + ' (' + nomeConta + ') - corrigida')
        t.set('categoria', catTaxa.getString('nome'))
        t.set('categoria_id', catTaxa.id)
        t.set('conta', nomeConta)
        t.set('valor', novaTaxaC / 100)
        t.set('competencia', dataDep.slice(0, 7))
        t.set('data_lancamento', dataDep)
        t.set('data_realizacao', dataDep)
        t.set('status', 'realizado')
        t.set('observacoes', 'Taxa corrigida do depósito ' + dep.id + ' (bruto ' + brutoC / 100 + ' menos o que caiu ' + novoC / 100 + '). Motivo: ' + motivo)
        t.set('usuario_id', usuario.id)
        t.set('empresa_id', empresaId)
        txApp.save(t)
        novaTaxaLancId = t.id
      }

      const cor = new Record(txApp.findCollectionByNameOrId('depositos_correcoes'))
      cor.set('deposito_id', dep.id)
      cor.set('liquido_anterior', atualC / 100)
      cor.set('liquido_novo', novoC / 100)
      cor.set('taxa_anterior', taxaAtualC / 100)
      cor.set('taxa_nova', novaTaxaC / 100)
      cor.set('motivo', motivo)
      cor.set('estorno_lancamento_id', estornoId)
      cor.set('taxa_lancamento_id', novaTaxaLancId)
      cor.set('empresa_id', empresaId)
      cor.set('usuario_id', usuario.id)
      txApp.save(cor)

      const audit = new Record(txApp.findCollectionByNameOrId('auditoria'))
      audit.set('usuario_id', usuario.id)
      audit.set('acao', 'deposito_corrigido')
      audit.set('descricao', 'Depósito ' + dep.id + ' corrigido: líquido ' + atualC / 100 + ' para ' + novoC / 100 + ' (taxa ' + taxaAtualC / 100 + ' para ' + novaTaxaC / 100 + '). Motivo: ' + motivo)
      audit.set('referencia_id', dep.id)
      audit.set('detalhes', { liquido_anterior: atualC / 100, liquido_novo: novoC / 100, taxa_anterior: taxaAtualC / 100, taxa_nova: novaTaxaC / 100, percentual: percentual, motivo: motivo })
      txApp.save(audit)

      resultado = { liquido: novoC / 100, taxa: novaTaxaC / 100, percentual: percentual }
    })
  } catch (err) {
    const msg = err && err.message ? String(err.message) : ''
    if (msg.indexOf('USR:') === 0) return e.json(400, { success: false, message: msg.slice(4) })
    console.error('deposito/corrigir: falha:', msg)
    return e.json(400, { success: false, message: 'Não foi possível corrigir o depósito. Nada foi alterado.' })
  }
  return e.json(200, { success: true, message: 'Depósito corrigido.', ...resultado })
})
