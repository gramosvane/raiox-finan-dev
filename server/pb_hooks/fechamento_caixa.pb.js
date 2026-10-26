// Fechamento (conferência) de caixa diário.
// - O usuário e a empresa vêm do servidor; o cliente não define total do sistema, esperado nem diferença.
// - total_sistema = soma das RECEITAS com status 'realizado' e data_realizacao no dia (da empresa do usuário).
//
// MODO GERAÇÃO (o cliente envia categoria_id da receita; é o modo da tela atual). Um fechamento por caixa e
// número de fita (um dia pode ter 2 ou 3 caixas). Valores:
//   fita (total_fita)  = total BRUTO dos recebimentos da fita do caixa
//   dinheiro recebido  = fita - (PIX + crédito + débito)
//   esperado_dinheiro  = dinheiro recebido - despesas do caixa (soma da lista despesas_itens)
//   diferenca          = dinheiro_contado - esperado_dinheiro (negativo = falta; positivo = sobra)
// Na MESMA transação do registro (tudo ou nada), com o usuário logado como responsável, o servidor gera:
//   - receita do DINHEIRO (realizada) na categoria escolhida, na CONTA do caixa informada (tipo caixa, ex.: Cofre);
//   - receitas de PIX, débito e crédito PREVISTAS, com vencimento = data + prazo da forma (permissoes:
//     prazo_pix, prazo_debito, prazo_credito; padrão 0, 1 e 31 dias, como a Rede/Itaú repassa). A baixa é a baixa normal do Contas a Receber;
//   - uma despesa realizada por item de despesas_itens, na categoria de cada item.
//
// MODO CONFERÊNCIA (sem categoria_id; clientes antigos): só confere e NÃO gera lançamento.
//   Com total_fita: esperado = fita - formas - despesas_dinheiro. Sem total_fita: esperado = total_sistema - formas - despesas.
// A auditoria é gravada na mesma transação; se falhar, o fechamento não é gravado.
onRecordCreateRequest((e) => {
  // (o escopo do manipulador é isolado no PocketBase: funções auxiliares ficam dentro dele)
  const arredonda2 = (v) => Math.round((Number(v) || 0) * 100) / 100
  const somaDias = (iso, dias) => {
    const d = new Date(iso + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + dias)
    return d.toISOString().slice(0, 10)
  }
  const dataBR = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4)

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

  const corpo = (e.requestInfo() && e.requestInfo().body) || {}
  const fitaBruta = corpo.total_fita
  const temFita = fitaBruta !== undefined && fitaBruta !== null && String(fitaBruta).trim() !== ''
  let fita = 0
  if (temFita) {
    const nf = Number(String(fitaBruta).replace(',', '.'))
    if (!isFinite(nf) || nf < 0) {
      throw new BadRequestError('O total da fita deve ser um número maior ou igual a zero.')
    }
    fita = arredonda2(nf)
  }
  rec.set('total_fita', fita)

  const categoriaReceitaId = String(corpo.categoria_id || '').trim()
  const gerar = categoriaReceitaId !== ''
  const caixa = String(corpo.caixa || '').trim().slice(0, 40)
  const numeroFita = String(corpo.numero_fita || '').trim().slice(0, 40)
  const contaInformada = String(corpo.conta || '').trim()
  let contaCaixa = ''

  // despesas do caixa (lista) — só no modo geração
  const itens = []
  if (gerar) {
    if (!temFita) throw new BadRequestError('Informe o valor (total bruto da fita).')
    if (!caixa) throw new BadRequestError('Informe o caixa.')
    if (!numeroFita) throw new BadRequestError('Informe o número da fita.')
    if (!contaInformada) throw new BadRequestError('Escolha a conta do caixa onde o dinheiro fica (ex.: Cofre).')
    const bruto = Array.isArray(corpo.despesas) ? corpo.despesas : []
    if (bruto.length > 50) throw new BadRequestError('Muitas despesas na lista (máximo 50).')
    let soma = 0
    for (const it of bruto) {
      const descricao = String((it && it.descricao) || '').trim().slice(0, 200)
      const cid = String((it && it.categoria_id) || '').trim()
      const valor = arredonda2(Number((it && it.valor) || 0))
      if (descricao.length < 3) throw new BadRequestError('Descreva cada despesa do caixa (mínimo 3 letras).')
      if (!cid) throw new BadRequestError('Escolha a categoria de cada despesa do caixa.')
      if (!(valor > 0)) throw new BadRequestError('O valor de cada despesa do caixa deve ser maior que zero.')
      itens.push({ descricao: descricao, categoria_id: cid, valor: valor })
      soma = arredonda2(soma + valor)
    }
    v.despesas_dinheiro = soma
    rec.set('despesas_dinheiro', soma)
    rec.set('despesas_itens', itens)
    rec.set('caixa', caixa)
    rec.set('numero_fita', numeroFita)
    rec.set('categoria_id', categoriaReceitaId)
    rec.set('estornado', false)
  }

  const formas = arredonda2(v.maquineta_pix + v.maquineta_credito + v.maquineta_debito)
  if (gerar && formas > fita) {
    throw new BadRequestError('PIX, crédito e débito somam mais que o valor da fita.')
  }
  const dinheiroRecebido = arredonda2(fita - formas)
  if (gerar && v.despesas_dinheiro > dinheiroRecebido) {
    throw new BadRequestError('As despesas do caixa são maiores que o dinheiro recebido na fita.')
  }

  const empresaId = e.auth.getString('empresa_id')
  if (gerar && !empresaId) {
    throw new BadRequestError('Seu usuário não tem empresa vinculada. Cadastre a empresa em Configurações.')
  }
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

  const base = temFita ? fita : total
  const esperado = arredonda2(base - formas - v.despesas_dinheiro)
  rec.set('diferenca_lancamentos', 0)
  rec.set('total_sistema', total)
  rec.set('esperado_dinheiro', esperado)
  rec.set('diferenca', arredonda2(v.dinheiro_contado - esperado))
  rec.set('usuario_id', e.auth.id)
  rec.set('empresa_id', empresaId || '')

  // A transação é aberta aqui: registro, lançamentos gerados e auditoria usam o mesmo escopo.
  e.app.runInTransaction((txApp) => {
    const original = e.app
    e.app = txApp
    try {
      if (gerar) {
        // categorias válidas (tipo certo) e fita ainda não registrada para este caixa
        let catReceita
        try {
          catReceita = txApp.findRecordById('categorias', categoriaReceitaId)
        } catch (_) {
          throw new BadRequestError('Categoria da receita não encontrada.')
        }
        if (catReceita.getString('tipo') !== 'receita') {
          throw new BadRequestError('A categoria da receita deve ser uma categoria de receita.')
        }
        if (!catReceita.getBool('ativa')) {
          throw new BadRequestError('A categoria da receita está inativa.')
        }
        const catsDespesa = {}
        for (const it of itens) {
          if (!catsDespesa[it.categoria_id]) {
            let c
            try {
              c = txApp.findRecordById('categorias', it.categoria_id)
            } catch (_) {
              throw new BadRequestError('Categoria de despesa não encontrada.')
            }
            if (c.getString('tipo') !== 'despesa') {
              throw new BadRequestError('A categoria de cada despesa do caixa deve ser uma categoria de despesa.')
            }
            if (!c.getBool('ativa')) {
              throw new BadRequestError('Há categoria de despesa inativa na lista.')
            }
            catsDespesa[it.categoria_id] = c
          }
        }
        // conta do dinheiro: precisa existir na empresa e ser do tipo caixa (nome canônico do cadastro)
        const normaliza = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
        let contasEmp = []
        try {
          contasEmp = txApp.findRecordsByFilter('contas', "empresa_id = {:e} || empresa_id = ''", '', 500, 0, { e: empresaId }) || []
        } catch (_) {}
        let contaRec = null
        for (const c of contasEmp) {
          if (normaliza(c.getString('nome')) === normaliza(contaInformada)) {
            contaRec = c
            break
          }
        }
        if (!contaRec) {
          throw new BadRequestError('A conta informada não existe. Cadastre-a em Configurações, Contas Bancárias / Caixa.')
        }
        if (contaRec.getString('tipo') !== 'caixa') {
          throw new BadRequestError('O dinheiro do caixa deve entrar em uma conta do tipo caixa (ex.: Cofre).')
        }
        contaCaixa = contaRec.getString('nome')
        rec.set('conta', contaCaixa)

        let jaExiste = false
        try {
          txApp.findFirstRecordByFilter(
            'fechamentos_caixa',
            'caixa = {:c} && numero_fita = {:n} && empresa_id = {:e} && estornado != true',
            { c: caixa, n: numeroFita, e: empresaId },
          )
          jaExiste = true
        } catch (_) {}
        if (jaExiste) {
          throw new BadRequestError(
            'Esta fita já foi registrada para este caixa. Para corrigir, estorne o fechamento anterior e refaça.',
          )
        }
      }

      e.next()

      if (gerar) {
        const prazo = (chave, padrao) => {
          try {
            const p = txApp.findFirstRecordByData('permissoes', 'chave', chave)
            const n = parseInt(String(p.getString('valor')).trim(), 10)
            return isFinite(n) && n >= 0 && n <= 365 ? n : padrao
          } catch (_) {
            return padrao
          }
        }
        const colLanc = txApp.findCollectionByNameOrId('lancamentos')
        const rotulo = caixa + ' nº ' + numeroFita + ' de ' + dataBR(dataTxt)
        const criar = (tipo, descricao, cat, valor, status, vencimento, conta) => {
          const l = new Record(colLanc)
          l.set('tipo', tipo)
          l.set('descricao', descricao)
          l.set('categoria', cat.getString('nome'))
          l.set('categoria_id', cat.id)
          l.set('valor', valor)
          l.set('competencia', dataTxt.slice(0, 7))
          l.set('data_lancamento', dataTxt)
          l.set('status', status)
          if (status === 'realizado') l.set('data_realizacao', dataTxt)
          if (vencimento) l.set('data_vencimento', vencimento)
          if (conta) l.set('conta', conta)
          l.set('empresa_id', empresaId)
          l.set('usuario_id', e.auth.id)
          l.set('fechamento_id', e.record.id)
          l.set('observacoes', 'Gerado pelo fechamento de caixa ' + rotulo)
          txApp.save(l)
        }
        const catReceita = txApp.findRecordById('categorias', categoriaReceitaId)
        if (dinheiroRecebido > 0) {
          criar('receita', 'Fechamento ' + rotulo + ' - dinheiro', catReceita, dinheiroRecebido, 'realizado', '', contaCaixa)
        }
        if (v.maquineta_pix > 0) {
          criar('receita', 'Fechamento ' + rotulo + ' - PIX', catReceita, v.maquineta_pix, 'previsto', somaDias(dataTxt, prazo('prazo_pix', 0)))
        }
        if (v.maquineta_debito > 0) {
          criar('receita', 'Fechamento ' + rotulo + ' - cartão de débito', catReceita, v.maquineta_debito, 'previsto', somaDias(dataTxt, prazo('prazo_debito', 1)))
        }
        if (v.maquineta_credito > 0) {
          criar('receita', 'Fechamento ' + rotulo + ' - cartão de crédito', catReceita, v.maquineta_credito, 'previsto', somaDias(dataTxt, prazo('prazo_credito', 31)))
        }
        for (const it of itens) {
          const c = txApp.findRecordById('categorias', it.categoria_id)
          criar('despesa', 'Despesa do ' + caixa + ' - ' + it.descricao, c, it.valor, 'realizado', '', contaCaixa)
        }
      }
    } finally {
      e.app = original
    }
  })
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
    caixa: e.record.getString('caixa'),
    numero_fita: e.record.getString('numero_fita'),
    total_fita: e.record.getFloat('total_fita'),
    diferenca_lancamentos: e.record.getFloat('diferenca_lancamentos'),
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
