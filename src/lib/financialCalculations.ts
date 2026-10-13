/**
 * Utilitários e funções centrais para aritmética financeira exata em centavos (moeda BRL)
 * Evita resíduos e imprecisões de ponto flutuante em JavaScript (IEEE 754)
 */

/**
 * Arredonda qualquer valor monetário para exatamente 2 casas decimais (centavos).
 * Corrige problemas comuns como 0.1 + 0.2 = 0.30000000000000004
 */
export function roundCents(val: number): number {
  if (typeof val !== 'number' || isNaN(val)) return 0
  // Adiciona Number.EPSILON para evitar bugs de descarte no limite do arredondamento
  return Math.round((val + Number.EPSILON) * 100) / 100
}

/**
 * Arredonda percentuais com 2 casas decimais.
 */
export function roundPercent(val: number): number {
  if (typeof val !== 'number' || isNaN(val)) return 0
  return Math.round((val + Number.EPSILON) * 100) / 100
}

/**
 * Regra única em TODA a aplicação: lançamento com estorno_de preenchido vale NEGATIVO.
 * Exemplo: venda de 10.000 realizada + estorno (estorno_de preenchido, valor 10.000) = caixa 0.
 * Retorna o valor com sinal contábil adequado (+valor para normal, -valor para estorno).
 */
export function calcularValorEfetivoLancamento(lancamento: {
  valor: number
  estorno_de?: string | null
}): number {
  const v = roundCents(lancamento.valor || 0)
  const sinal = lancamento.estorno_de ? -1 : 1
  return roundCents(sinal * v)
}

export type GrupoDRECalculo =
  | 'receita_bruta'
  | 'deducoes_tributos'
  | 'custos_variaveis'
  | 'despesas_operacionais'
  | 'investimento_capex'
  | 'receita_financeira'
  | 'despesa_financeira'

export interface LancamentoCalculo {
  id?: string
  tipo: 'receita' | 'despesa'
  categoria: string
  categoria_id?: string | null
  grupo_dre?: GrupoDRECalculo
  departamento?: string
  centro_custo?: string
  valor: number
  status: 'previsto' | 'realizado' | 'estornado'
  data_vencimento?: string | null
  data_realizacao?: string | null
  competencia?: string
  liquidacao_de?: string | null
  estorno_de?: string | null
  empresa_id?: string | null
}

export interface DRECalculada {
  receitaServicos: number
  receitaVendas: number
  receitaOutras: number
  receitaBruta: number
  impostosDeducoes: number
  receitaLiquida: number
  custosFornecedores: number
  margemContribuicao: number
  despesasSalarios: number
  despesasAluguel: number
  despesasMarketing: number
  outrasDespesasOp: number
  totalDespesasFixas: number
  ebitda: number
  margemEbitda: number
  depreciacaoAmortizacao: number
  resultadoOperacional: number
  investimentos: number // CAPEX demonstrativo informativo (fora do resultado operacional)
  rendimentosFinanceiros: number
  despesasFinanceiras: number
  resultadoFinanceiro: number
  resultadoAntesTributos: number
  resultadoLiquido: number
  margemLiquida: number
}

/**
 * Determina o grupo contábil estrutural da DRE a partir do grupo_dre da categoria,
 * com fallback inteligente para compatibilidade com categorias antigas.
 */
/**
 * Extrai e mapeia o Grupo DRE da categoria a partir da lista/mapa de categorias cadastradas,
 * garantindo alinhamento 100% idêntico entre Dashboard e Relatórios.
 */
export interface CategoriaReferencia {
  id?: string
  nome: string
  tipo: 'receita' | 'despesa' | string
  grupo_dre?: GrupoDRECalculo | string | null
}

/**
 * REGRA OFICIAL DE RESOLUÇÃO POR NOME (migração, estorno, liquidação, restauração, relatórios legados):
 * - trim + comparação sem diferenciar maiúsculas/minúsculas + mesmo tipo;
 * - aceitar somente quando houver EXATAMENTE UMA categoria compatível;
 * - nunca escolher categoria por aproximação.
 * Retorna a categoria encontrada se houver exatamente 1 compatível, ou null se houver 0 ou mais de 1.
 */
export function resolverCategoriaPorNome(
  nomeTexto: string | undefined | null,
  tipo: 'receita' | 'despesa' | string,
  categorias: CategoriaReferencia[],
): CategoriaReferencia | null {
  if (!nomeTexto || typeof nomeTexto !== 'string') return null
  const nomeNormalizado = nomeTexto.trim().toLowerCase()
  if (!nomeNormalizado) return null

  const compativeis = categorias.filter((c) => {
    const cNome = (c.nome || '').trim().toLowerCase()
    return cNome === nomeNormalizado && c.tipo === tipo
  })

  return compativeis.length === 1 ? compativeis[0] : null
}

/**
 * Função central para obter o nome atual da categoria a exibir em listas e telas:
 * - Se houver categoria_id e a categoria existir no cadastro, retorna o nome ATUAL da categoria.
 * - Caso contrário (legado sem categoria_id ou categoria não encontrada), retorna o texto gravado original.
 */
export function obterNomeAtualCategoria(
  lancamento: { categoria: string; categoria_id?: string | null },
  categorias: CategoriaReferencia[],
): string {
  if (lancamento.categoria_id) {
    const cat = categorias.find((c) => c.id === lancamento.categoria_id)
    if (cat && cat.nome) {
      return cat.nome
    }
  }
  return lancamento.categoria || ''
}

/**
 * FUNÇÃO CENTRAL ÚNICA DE RESOLUÇÃO DO GRUPO DRE:
 * 1º pelo categoria_id;
 * 2º pelo nome somente quando não houver categoria_id (legado), aplicando a regra de resolução por nome.
 * Se nenhuma correspondência inequívoca for encontrada, recorre ao grupo padrão estrutural por tipo.
 * Dashboard, DRE, Relatórios, Contas a Pagar e Contas a Receber usam essa mesma função. Nenhuma tela cria lógica própria.
 */
export function resolverGrupoDRE(
  lancamento: {
    tipo: 'receita' | 'despesa'
    categoria?: string | null
    categoria_id?: string | null
    grupo_dre?: GrupoDRECalculo | string | null
  },
  categorias: CategoriaReferencia[],
): GrupoDRECalculo {
  const tipoFallback = lancamento.tipo === 'receita' ? 'receita_bruta' : 'despesas_operacionais'

  // 1º Pelo categoria_id
  if (lancamento.categoria_id) {
    const catPorId = categorias.find((c) => c.id === lancamento.categoria_id)
    if (catPorId && catPorId.grupo_dre) {
      return catPorId.grupo_dre as GrupoDRECalculo
    }
  }

  // Se o próprio lançamento já traz grupo_dre explícito (e não tinha categoria_id resolvido)
  if (lancamento.grupo_dre) {
    return lancamento.grupo_dre as GrupoDRECalculo
  }

  // 2º Pelo nome somente quando não houver categoria_id (legado)
  if (lancamento.categoria) {
    const catResolvida = resolverCategoriaPorNome(lancamento.categoria, lancamento.tipo, categorias)
    if (catResolvida && catResolvida.grupo_dre) {
      return catResolvida.grupo_dre as GrupoDRECalculo
    }
  }

  return tipoFallback
}

/**
 * Mantido como alias compatível direcionando para resolverGrupoDRE,
 * garantindo compatibilidade regressiva absoluta.
 */
export function obterGrupoDRECategoria(
  categoriaNomeOuId: string | undefined | null,
  categorias: Array<CategoriaReferencia> | Map<string, GrupoDRECalculo | string | null | undefined>,
  tipoFallback: 'receita' | 'despesa' = 'despesa',
  categoriaId?: string | null,
): GrupoDRECalculo {
  if (Array.isArray(categorias)) {
    return resolverGrupoDRE(
      {
        tipo: tipoFallback,
        categoria: categoriaNomeOuId,
        categoria_id: categoriaId,
      },
      categorias,
    )
  }

  if (categorias instanceof Map && categoriaNomeOuId) {
    const grupoEncontrado = categorias.get(categoriaNomeOuId)
    if (grupoEncontrado) return grupoEncontrado as GrupoDRECalculo
  }

  return tipoFallback === 'receita' ? 'receita_bruta' : 'despesas_operacionais'
}

/**
 * Determina o grupo contábil estrutural da DRE a partir do grupo_dre da categoria,
 * com fallback inteligente para compatibilidade com categorias antigas.
 */
export function determinarGrupoDRE(
  tipo: 'receita' | 'despesa',
  _categoriaNome: string = '',
  grupoDefinido?: GrupoDRECalculo,
  _departamentoOuCentro?: string,
): GrupoDRECalculo {
  if (grupoDefinido) {
    return grupoDefinido
  }
  // Sem heurísticas mágicas por texto ou centro de custo:
  // Se não foi definido na categoria, atribui ao grupo padrão de receita ou despesa
  return tipo === 'receita' ? 'receita_bruta' : 'despesas_operacionais'
}

/**
 * Calcula a DRE estrutural oficial com proteção de centavos:
 * Receita Bruta
 * ( - ) Deduções e Tributos sobre Vendas
 * ( = ) Receita Líquida
 * ( - ) Custos (Fornecedores / Custos Diretos)
 * ( = ) Margem de Contribuição / Lucro Bruto
 * ( - ) Despesas Operacionais Fixas (Salários, Aluguel, Marketing, Gerais)
 * ( = ) EBITDA
 * ( - ) Depreciações e Amortizações (se houver)
 * ( = ) Resultado Operacional (EBIT) — ATENÇÃO: CAPEX NÃO é subtraído aqui!
 * ( + / - ) Resultado Financeiro (Receitas Financeiras − Despesas Financeiras)
 * ( = ) Resultado Antes dos Tributos / Resultado Líquido
 */
export function calcularDRE(
  lancamentos: LancamentoCalculo[],
  regime: 'competencia' | 'caixa' = 'competencia',
): DRECalculada {
  // A DRE Gerencial opera por competência por padrão (inclui previstos e realizados, exceto estornados e liquidados duplicados)
  // Se regime === 'caixa', considera exclusivamente os realizados
  const itensValidos = lancamentos.filter((l) => {
    if (l.status === 'estornado') return false
    if (regime === 'caixa') {
      return l.status === 'realizado'
    }
    // No regime de competência, considera realizados e previstos (descartando previstos que já tenham liquidação)
    return true
  })

  // Elimina previstos que já foram liquidados para não duplicar no regime de competência
  const idsLiquidados = new Set<string>()
  for (const l of itensValidos) {
    if (l.liquidacao_de) {
      idsLiquidados.add(l.liquidacao_de)
    }
  }
  const filtrados = itensValidos.filter((l) => !(l.id && idsLiquidados.has(l.id)))

  let receitaServicos = 0
  let receitaVendas = 0
  let receitaOutras = 0
  let rendimentosFinanceiros = 0

  let impostosDeducoes = 0
  let custosFornecedores = 0
  let despesasSalarios = 0
  let despesasAluguel = 0
  let despesasMarketing = 0
  let outrasDespesasOp = 0
  let investimentos = 0 // CAPEX demonstrativo
  let despesasFinanceiras = 0
  const depreciacaoAmortizacao = 0

  for (const l of filtrados) {
    const v = roundCents(l.valor)
    const grupo = determinarGrupoDRE(
      l.tipo,
      l.categoria,
      l.grupo_dre,
      l.departamento || l.centro_custo,
    )

    // Se o lançamento for um estorno (estorno_de presente), ele DEVE abater o grupo original
    const sinal = l.estorno_de ? -1 : 1
    const valorComSinal = roundCents(sinal * v)

    if (l.tipo === 'receita') {
      if (grupo === 'receita_financeira') {
        rendimentosFinanceiros = roundCents(rendimentosFinanceiros + valorComSinal)
      } else {
        receitaOutras = roundCents(receitaOutras + valorComSinal)
      }
    } else if (l.tipo === 'despesa') {
      switch (grupo) {
        case 'deducoes_tributos':
          impostosDeducoes = roundCents(impostosDeducoes + valorComSinal)
          break
        case 'custos_variaveis':
          custosFornecedores = roundCents(custosFornecedores + valorComSinal)
          break
        case 'investimento_capex':
          investimentos = roundCents(investimentos + valorComSinal)
          break
        case 'despesa_financeira':
          despesasFinanceiras = roundCents(despesasFinanceiras + valorComSinal)
          break
        case 'despesas_operacionais':
        default:
          outrasDespesasOp = roundCents(outrasDespesasOp + valorComSinal)
          break
      }
    }
  }

  const receitaBruta = roundCents(receitaServicos + receitaVendas + receitaOutras)
  // Sem clamp Math.max(0, ...): se impostos forem 300 e receita 100, receitaLiquida é -200
  const receitaLiquida = roundCents(receitaBruta - impostosDeducoes)
  const margemContribuicao = roundCents(receitaLiquida - custosFornecedores)

  const totalDespesasFixas = roundCents(
    despesasSalarios + despesasAluguel + despesasMarketing + outrasDespesasOp,
  )

  const ebitda = roundCents(margemContribuicao - totalDespesasFixas)
  const margemEbitda = receitaLiquida > 0 ? roundPercent((ebitda / receitaLiquida) * 100) : 0

  const resultadoOperacional = roundCents(ebitda - depreciacaoAmortizacao)
  const resultadoFinanceiro = roundCents(rendimentosFinanceiros - despesasFinanceiras)
  const resultadoAntesTributos = roundCents(resultadoOperacional + resultadoFinanceiro)
  const resultadoLiquido = resultadoAntesTributos
  const margemLiquida =
    receitaLiquida > 0 ? roundPercent((resultadoLiquido / receitaLiquida) * 100) : 0

  return {
    receitaServicos,
    receitaVendas,
    receitaOutras,
    receitaBruta,
    impostosDeducoes,
    receitaLiquida,
    custosFornecedores,
    margemContribuicao,
    despesasSalarios,
    despesasAluguel,
    despesasMarketing,
    outrasDespesasOp,
    totalDespesasFixas,
    ebitda,
    margemEbitda,
    depreciacaoAmortizacao,
    resultadoOperacional,
    investimentos,
    rendimentosFinanceiros,
    despesasFinanceiras,
    resultadoFinanceiro,
    resultadoAntesTributos,
    resultadoLiquido,
    margemLiquida,
  }
}

/**
 * Calcula o ROI (Return on Investment) com validações e arredondamento.
 */
export function calcularROI(
  lucroLiquido: number,
  totalInvestimentos: number,
): { roiPercentual: number; roiAbsoluto: number } {
  const lucro = roundCents(lucroLiquido)
  const inv = roundCents(totalInvestimentos)
  if (inv <= 0) {
    return { roiPercentual: 0, roiAbsoluto: lucro }
  }
  const roiPercentual = roundPercent((lucro / inv) * 100)
  return { roiPercentual, roiAbsoluto: lucro }
}

export interface IndicadoresLiquidez {
  caixaTotal: number
  contasReceberPendentes: number
  contasPagarPendentes: number
  liquidezCorrente: number | null
  liquidezImediata: number | null
  liquidezSeca: number | null
  liquidezAjustada?: number | null // Opcional / Gerencial
  aplicavel: boolean
}

/**
 * Calcula índices de liquidez (Corrente, Imediata, Seca) com garantia de centavos.
 * Se não houver contas a pagar pendentes, retorna 'não aplicável' (null) para não inventar divisor 1.
 */
export function calcularIndicesLiquidez(
  caixaTotal: number,
  contasReceberPendentes: number,
  contasPagarPendentes: number,
  estoques: number = 0,
  fatorAjusteRecebiveis?: number, // Se fornecido, calcula a liquidez ajustada gerencial
): IndicadoresLiquidez {
  const caixa = roundCents(caixaTotal)
  const aReceber = roundCents(contasReceberPendentes)
  const aPagar = roundCents(contasPagarPendentes)
  const estoqueVal = roundCents(estoques)

  if (aPagar <= 0) {
    return {
      caixaTotal: caixa,
      contasReceberPendentes: aReceber,
      contasPagarPendentes: aPagar,
      liquidezCorrente: null,
      liquidezImediata: null,
      liquidezSeca: null,
      liquidezAjustada: null,
      aplicavel: false,
    }
  }

  const passivoCirculante = aPagar
  const ativoCirculante = roundCents(caixa + aReceber)

  const liquidezCorrente = roundPercent(ativoCirculante / passivoCirculante)
  const liquidezImediata = roundPercent(caixa / passivoCirculante)

  const ativoSemEstoque = Math.max(0, roundCents(ativoCirculante - estoqueVal))
  const liquidezSeca = roundPercent(ativoSemEstoque / passivoCirculante)

  const liquidezAjustada =
    fatorAjusteRecebiveis !== undefined
      ? roundPercent((caixa + roundCents(aReceber * fatorAjusteRecebiveis)) / passivoCirculante)
      : null

  return {
    caixaTotal: caixa,
    contasReceberPendentes: aReceber,
    contasPagarPendentes: aPagar,
    liquidezCorrente,
    liquidezImediata,
    liquidezSeca,
    liquidezAjustada,
    aplicavel: true,
  }
}

export interface AgingResult {
  aVencer: number
  ate30: number
  ate60: number
  ate90: number
  mais90: number
  total: number
}

/**
 * Calcula bandas de Aging (envelhecimento de títulos a receber ou a pagar)
 * com base na data de vencimento e tolerância a fuso horário.
 */
export function calcularAging(
  lancamentos: LancamentoCalculo[],
  tipo: 'receita' | 'despesa',
  dataReferencia?: Date | string,
): AgingResult {
  // FIN-08: normalizar a data de referência civil (AAAA-MM-DD) sem desvio de fuso
  let refCivil: string
  if (typeof dataReferencia === 'string') {
    refCivil = dataReferencia.slice(0, 10)
  } else if (dataReferencia instanceof Date) {
    // Para manter compatibilidade com testes que passam Date simulada
    const ano = dataReferencia.getFullYear()
    const mes = String(dataReferencia.getMonth() + 1).padStart(2, '0')
    const dia = String(dataReferencia.getDate()).padStart(2, '0')
    refCivil = `${ano}-${mes}-${dia}`
  } else {
    // Referência padrão: hoje em Brasília
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    refCivil = formatter.format(new Date())
  }

  const [refAno, refMes, refDia] = refCivil.split('-').map(Number)
  const refTime = Date.UTC(refAno, refMes - 1, refDia)

  const bandas: AgingResult = {
    aVencer: 0,
    ate30: 0,
    ate60: 0,
    ate90: 0,
    mais90: 0,
    total: 0,
  }

  const pendentes = lancamentos.filter((l) => l.tipo === tipo && l.status === 'previsto')

  for (const l of pendentes) {
    const v = calcularValorEfetivoLancamento(l)
    bandas.total = roundCents(bandas.total + v)

    if (!l.data_vencimento) {
      bandas.aVencer = roundCents(bandas.aVencer + v)
      continue
    }

    // FIN-08: ler vencimento civil pelos primeiros 10 caracteres
    const vencCivil = l.data_vencimento.slice(0, 10)
    const [vAno, vMes, vDia] = vencCivil.split('-').map(Number)
    const vencTime = Date.UTC(vAno, vMes - 1, vDia)
    const diffDias = Math.round((refTime - vencTime) / (1000 * 60 * 60 * 24))

    if (diffDias <= 0) {
      bandas.aVencer = roundCents(bandas.aVencer + v)
    } else if (diffDias <= 30) {
      bandas.ate30 = roundCents(bandas.ate30 + v)
    } else if (diffDias <= 60) {
      bandas.ate60 = roundCents(bandas.ate60 + v)
    } else if (diffDias <= 90) {
      bandas.ate90 = roundCents(bandas.ate90 + v)
    } else {
      bandas.mais90 = roundCents(bandas.mais90 + v)
    }
  }

  return bandas
}

/**
 * Filtra lançamentos efetivamente em aberto (previstos),
 * desconsiderando aqueles que já possuem um lançamento de liquidação relacionado por liquidacao_de.
 */
export function filtrarLancamentosAbertos(
  lancamentos: LancamentoCalculo[],
  tipo?: 'receita' | 'despesa',
): LancamentoCalculo[] {
  // IDs liquidados
  const idsLiquidados = new Set<string>()
  for (const l of lancamentos) {
    if (l.liquidacao_de && l.status !== 'estornado') {
      idsLiquidados.add(l.liquidacao_de)
    }
  }

  return lancamentos.filter((l) => {
    if (tipo && l.tipo !== tipo) return false
    if (l.status !== 'previsto') return false
    if (l.id && idsLiquidados.has(l.id)) return false
    return true
  })
}

export interface ProjecaoItem {
  label: string
  dias: number
  dataLimite: string
  saldoInicial: number
  recebimentosPrevistos: number
  pagamentosPrevistos: number
  saldoProjetado: number
  detalhe: string
}

export interface ProjecaoCaixaResult {
  itens: ProjecaoItem[]
  menorSaldo: number
  itemMenor: ProjecaoItem
  dataReferencia180Dias: string
}

/**
 * Calcula a projeção de fluxo de caixa real baseada em vencimentos:
 * Saldo inicial real + recebimentos previstos por vencimento − pagamentos previstos por vencimento = saldo projetado
 * Horizontes reais: Hoje (atrasados + hoje), 30 dias, 60 dias, 90 dias e 180 dias.
 */
export function calcularProjecaoCaixaReal(
  saldoInicialCaixa: number,
  lancamentos: LancamentoCalculo[],
  dataReferencia?: Date | string,
): ProjecaoCaixaResult {
  // FIN-08: normalizar a data de referência civil (AAAA-MM-DD)
  let refCivil: string
  if (typeof dataReferencia === 'string') {
    refCivil = dataReferencia.slice(0, 10)
  } else if (dataReferencia instanceof Date) {
    const ano = dataReferencia.getFullYear()
    const mes = String(dataReferencia.getMonth() + 1).padStart(2, '0')
    const dia = String(dataReferencia.getDate()).padStart(2, '0')
    refCivil = `${ano}-${mes}-${dia}`
  } else {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    refCivil = formatter.format(new Date())
  }

  const [refAno, refMes, refDia] = refCivil.split('-').map(Number)

  const saldoBase = roundCents(saldoInicialCaixa)

  // Apenas lançamentos previstos que NÃO foram liquidados
  const previstosAbertos = filtrarLancamentosAbertos(lancamentos)

  const horizontes = [
    { label: 'Hoje', dias: 0 },
    { label: '30 dias', dias: 30 },
    { label: '60 dias', dias: 60 },
    { label: '90 dias', dias: 90 },
    { label: '180 dias', dias: 180 },
  ]

  // Função auxiliar para verificar se o lançamento vence até N dias civis
  // Vencidos antes da data de referência caem em "Hoje" (dias === 0) e acumulam nos horizontes futuros
  const itens: ProjecaoItem[] = horizontes.map((h) => {
    const utcLimite = new Date(Date.UTC(refAno, refMes - 1, refDia + h.dias))
    const limAno = utcLimite.getUTCFullYear()
    const limMes = String(utcLimite.getUTCMonth() + 1).padStart(2, '0')
    const limDia = String(utcLimite.getUTCDate()).padStart(2, '0')
    const dataLimiteStr = `${limAno}-${limMes}-${limDia}`
    const dataLimiteFormatadaBR = `${limDia}/${limMes}/${limAno}`

    let totalReceitas = 0
    let totalDespesas = 0

    for (const l of previstosAbertos) {
      const v = calcularValorEfetivoLancamento(l)
      if (!l.data_vencimento) {
        // Se não possui vencimento cadastrado, contabiliza na janela imediata de Hoje
        if (l.tipo === 'receita') totalReceitas = roundCents(totalReceitas + v)
        if (l.tipo === 'despesa') totalDespesas = roundCents(totalDespesas + v)
        continue
      }

      const vencCivil = l.data_vencimento.slice(0, 10)

      // Comparação direta de texto AAAA-MM-DD
      if (vencCivil <= dataLimiteStr) {
        if (l.tipo === 'receita') {
          totalReceitas = roundCents(totalReceitas + v)
        } else if (l.tipo === 'despesa') {
          totalDespesas = roundCents(totalDespesas + v)
        }
      }
    }

    const saldoProj = roundCents(saldoBase + totalReceitas - totalDespesas)

    return {
      label: h.label,
      dias: h.dias,
      dataLimite: dataLimiteStr,
      saldoInicial: saldoBase,
      recebimentosPrevistos: totalReceitas,
      pagamentosPrevistos: totalDespesas,
      saldoProjetado: saldoProj,
      detalhe:
        h.dias === 0
          ? 'Títulos vencidos e com vencimento para hoje'
          : `Previstos até ${dataLimiteFormatadaBR}`,
    }
  })

  const menorSaldo = Math.min(...itens.map((i) => i.saldoProjetado))
  const itemMenor = itens.find((i) => i.saldoProjetado === menorSaldo) || itens[itens.length - 1]

  const utc180 = new Date(Date.UTC(refAno, refMes - 1, refDia + 180))
  const d180Formatada = `${String(utc180.getUTCDate()).padStart(2, '0')}/${String(utc180.getUTCMonth() + 1).padStart(2, '0')}/${utc180.getUTCFullYear()}`

  return {
    itens,
    menorSaldo,
    itemMenor,
    dataReferencia180Dias: d180Formatada,
  }
}

export interface ItemPatrimonioCalculo {
  tipo: 'ativo' | 'passivo'
  categoria: string
  valor: number
}

export interface BalancoPatrimonialResult {
  totalAtivosCadastrados: number
  totalPassivosCadastrados: number
  patrimonioLiquidoEmpresarial: number
  posicaoFinanceiraSimplificada: number
  caixaDisponivel: number
  contasReceberPendentes: number
  contasPagarPendentes: number
}

/**
 * Calcula Patrimônio Líquido Empresarial Completo:
 * ATIVOS (Caixa + Bancos/Aplicações + Imóveis + Veículos + Máquinas + Outros Ativos)
 * menos
 * PASSIVOS (Empréstimos + Financiamentos + Fornecedores + Impostos + Outras Obrigações).
 * Mantém também a Posição Financeira Simplificada (Caixa + A Receber - A Pagar) para visão de curto prazo.
 */
export function calcularPatrimonioCompleto(
  caixaAtual: number,
  contasReceberAbertas: number,
  contasPagarAbertas: number,
  itensPatrimonio: ItemPatrimonioCalculo[],
): BalancoPatrimonialResult {
  const cx = roundCents(caixaAtual)
  const aRec = roundCents(contasReceberAbertas)
  const aPag = roundCents(contasPagarAbertas)

  let somaAtivos = 0
  let somaPassivos = 0

  for (const item of itensPatrimonio) {
    const v = roundCents(item.valor)
    if (item.tipo === 'ativo') {
      somaAtivos = roundCents(somaAtivos + v)
    } else if (item.tipo === 'passivo') {
      somaPassivos = roundCents(somaPassivos + v)
    }
  }

  // Ativo total empresarial = Caixa atual + Itens de Ativos cadastrados
  // Nota: Contas a receber abertas são incorporadas ao ativo circulante
  const totalAtivos = roundCents(cx + aRec + somaAtivos)
  // Passivo total empresarial = Contas a pagar abertas + Itens de Passivos cadastrados
  const totalPassivos = roundCents(aPag + somaPassivos)

  const patrimonioLiquido = roundCents(totalAtivos - totalPassivos)
  const posicaoSimplificada = roundCents(cx + aRec - aPag)

  return {
    totalAtivosCadastrados: somaAtivos,
    totalPassivosCadastrados: somaPassivos,
    patrimonioLiquidoEmpresarial: patrimonioLiquido,
    posicaoFinanceiraSimplificada: posicaoSimplificada,
    caixaDisponivel: cx,
    contasReceberPendentes: aRec,
    contasPagarPendentes: aPag,
  }
}
