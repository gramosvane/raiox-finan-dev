import { formatBRL } from '@/pages/dashboard/DashboardPage'
import {
  LancamentoCalculo,
  roundCents,
  calcularValorEfetivoLancamento,
} from '@/lib/financialCalculations'
import {
  hojeBrasil,
  somarDiasDataCivil,
  compararDataCivil,
  normalizarDataCivil,
  formatarDataCivil,
} from '@/lib/dataCivil'

/**
 * Interface mínima para apresentação de lançamentos
 */
export interface LancamentoApresentacao {
  id?: string
  tipo: 'receita' | 'despesa'
  descricao: string
  valor: number
  competencia?: string
  data_lancamento?: string
  data_vencimento?: string | null
  data_realizacao?: string | null
  status: 'previsto' | 'realizado' | 'estornado' | string
  estorno_de?: string | null
  liquidacao_de?: string | null
  categoria?: string
  categoria_id?: string | null
  departamento?: string | null
  centro_custo?: string | null
  conta?: string
  observacoes?: string
}

/**
 * Mapeia todos os IDs de títulos previstos originais que foram liquidados,
 * identificados pela relação liquidacao_de de lançamentos que não estejam estornados.
 * Retorna também um mapa de id_original -> data_realizacao da liquidação.
 */
export function mapearLiquidadorMap(
  lancamentos: LancamentoApresentacao[],
): Map<string, LancamentoApresentacao> {
  const map = new Map<string, LancamentoApresentacao>()
  for (const l of lancamentos) {
    if (l.liquidacao_de && l.status !== 'estornado') {
      map.set(l.liquidacao_de, l)
    }
  }
  return map
}

/**
 * Mapeia todos os IDs de títulos previstos originais liquidados em um Set<string>.
 */
export function mapearIdsOriginaisLiquidados(lancamentos: LancamentoApresentacao[]): Set<string> {
  const ids = new Set<string>()
  for (const l of lancamentos) {
    if (l.liquidacao_de && l.status !== 'estornado') {
      ids.add(l.liquidacao_de)
    }
  }
  return ids
}

/**
 * Mapeia todos os IDs originais que foram estornados,
 * identificados pela relação estorno_de.
 */
export function mapearIdsOriginaisEstornados(lancamentos: LancamentoApresentacao[]): Set<string> {
  const ids = new Set<string>()
  for (const l of lancamentos) {
    if (l.estorno_de) {
      ids.add(l.estorno_de)
    }
  }
  return ids
}

/**
 * Determina o rótulo/etiqueta de apresentação de um lançamento na tela de Lançamentos:
 * - Contra-lançamento de estorno (estorno_de presente): "Estorno"
 * - Original estornado (status === 'estornado' ou idsEstornados.has(id)): "Estornado"
 * - Original liquidado (idsLiquidados.has(id)): "Liquidado"
 * - Realizado: "Realizado"
 * - Previsto: "Previsto"
 */
export type EtiquetaLancamento =
  | 'Estorno'
  | 'Estornado'
  | 'Liquidado'
  | 'Realizado'
  | 'Previsto'
  | string

export function obterEtiquetaLancamento(
  item: LancamentoApresentacao,
  idsEstornados: Set<string>,
  idsLiquidados: Set<string>,
): EtiquetaLancamento {
  if (item.estorno_de) {
    return 'Estorno'
  }
  if (item.status === 'estornado' || (item.id && idsEstornados.has(item.id))) {
    return 'Estornado'
  }
  if (item.id && idsLiquidados.has(item.id)) {
    return 'Liquidado'
  }
  if (item.status === 'realizado') {
    return 'Realizado'
  }
  if (item.status === 'previsto') {
    return 'Previsto'
  }
  return item.status
}

/**
 * Regras de filtro por status para a tela de Lançamentos (FIN-12 e UX-EST-02):
 * - "todos": todos os movimentos
 * - "realizado": apenas realizados que não sejam original estornado nem contra-lançamento de estorno
 * - "previsto": apenas títulos previstos AINDA EM ABERTO (não liquidados e não estornados)
 * - "estornado": original estornado ou contra-lançamento de estorno
 */
export function filtrarStatusLancamentos(
  item: LancamentoApresentacao,
  filtroStatus: string,
  idsEstornados: Set<string>,
  idsLiquidados: Set<string>,
): boolean {
  if (filtroStatus === 'todos') return true

  const isOriginalEstornado =
    item.status === 'estornado' || Boolean(item.id && idsEstornados.has(item.id))
  const isContraEstorno = Boolean(item.estorno_de)
  const isLiquidado = Boolean(item.id && idsLiquidados.has(item.id))

  if (filtroStatus === 'estornado') {
    return isOriginalEstornado || isContraEstorno
  }

  if (filtroStatus === 'realizado') {
    return item.status === 'realizado' && !isOriginalEstornado && !isContraEstorno
  }

  if (filtroStatus === 'previsto') {
    // Títulos previstos AINDA EM ABERTO: não liquidados e não estornados
    return item.status === 'previsto' && !isLiquidado && !isOriginalEstornado
  }

  return item.status === filtroStatus
}

/**
 * Item de obrigação para apresentação única em Contas a Pagar / Contas a Receber.
 * Cada obrigação aparece exatamente UMA vez (FIN-12 e UX-EST-02).
 */
export interface ObrigacaoApresentacao {
  id: string
  itemOriginal: LancamentoApresentacao
  itemLiquidacao?: LancamentoApresentacao
  tipo: 'receita' | 'despesa'
  descricao: string
  categoria?: string
  categoria_id?: string | null
  departamento?: string | null
  centro_custo?: string | null
  valor: number
  data_vencimento?: string | null
  data_realizacao?: string | null
  statusApresentacao: 'pago_recebido' | 'a_pagar_receber' | 'estornado' | 'estorno'
  etiquetaStatus: 'Pago' | 'Recebido' | 'A Pagar' | 'A Receber' | 'Estornado' | 'Estorno'
  competencia: string
  podeLiquidar: boolean
}

/**
 * Prepara a lista de obrigações para Contas a Pagar ou Contas a Receber,
 * aplicando as regras consolidadas do Lote 2:
 * 1. O contra-lançamento de liquidação (liquidacao_de != null) não aparece como segunda linha.
 * 2. A obrigação liquidada aparece como "Pago"/"Recebido", com a data_realizacao vinda da liquidação.
 * 3. Original estornado recebe etiqueta "Estornado" e contra-lançamento de estorno recebe etiqueta "Estorno".
 * 4. Na competência M, exibe:
 *    (a) títulos da competência M;
 *    (b) títulos de competências anteriores ainda em aberto;
 *    (c) títulos de competências anteriores pagos/recebidos DENTRO do mês M.
 *    Títulos de meses anteriores quitados ANTES do mês M não aparecem.
 */
export function prepararObrigacoesContas(
  todosLancamentosTipo: LancamentoApresentacao[],
  competenciaM: string,
  tipo: 'despesa' | 'receita',
): ObrigacaoApresentacao[] {
  // 1. Mapeia liquidações e estornos
  const liquidacaoMap = mapearLiquidadorMap(todosLancamentosTipo)
  const idsOriginaisEstornados = mapearIdsOriginaisEstornados(todosLancamentosTipo)

  const resultado: ObrigacaoApresentacao[] = []

  for (const l of todosLancamentosTipo) {
    // Regra 1: O lançamento de liquidação NÃO aparece como uma segunda obrigação nessas telas
    if (l.liquidacao_de) {
      continue
    }

    const id = l.id || ''
    const contraLancamentoLiq = liquidacaoMap.get(id)
    const isLiquidado = Boolean(contraLancamentoLiq)
    const isOriginalEstornado = l.status === 'estornado' || idsOriginaisEstornados.has(id)
    const isContraEstorno = Boolean(l.estorno_de)

    // Data de realização efetiva (se liquidado, vem do lançamento de liquidação)
    const dataRealizacaoEfetiva = isLiquidado
      ? contraLancamentoLiq?.data_realizacao ||
        contraLancamentoLiq?.data_lancamento ||
        l.data_realizacao ||
        null
      : l.data_realizacao || null

    // Determina se a obrigação está realizada/paga
    const estaRealizadoOuLiquidado = l.status === 'realizado' || isLiquidado

    // Competência do pagamento/realização (AAAA-MM da data de realização)
    const mesLiquidacaoOuPagamento = dataRealizacaoEfetiva
      ? dataRealizacaoEfetiva.slice(0, 7)
      : l.competencia

    // Regra de competência M:
    // (a) Títulos da competência M (l.competencia === competenciaM);
    // (b) Títulos de competências anteriores ainda em aberto (!estaRealizadoOuLiquidado && !isOriginalEstornado);
    // (c) Títulos de competências anteriores pagos/recebidos DENTRO do mês M (mesLiquidacaoOuPagamento === competenciaM);
    // Títulos de meses anteriores quitados antes do mês M não aparecem.
    const eDaCompetencia = l.competencia === competenciaM
    const eAnteriorAberto =
      l.competencia < competenciaM &&
      !estaRealizadoOuLiquidado &&
      !isOriginalEstornado &&
      !isContraEstorno
    const eAnteriorQuitadoNoMes =
      l.competencia < competenciaM &&
      estaRealizadoOuLiquidado &&
      mesLiquidacaoOuPagamento === competenciaM

    // Se não se enquadrar em nenhum dos critérios da competência M, ignora
    if (!eDaCompetencia && !eAnteriorAberto && !eAnteriorQuitadoNoMes) {
      continue
    }

    // Determina status de apresentação e etiqueta
    let statusApresentacao: 'pago_recebido' | 'a_pagar_receber' | 'estornado' | 'estorno'
    let etiquetaStatus: 'Pago' | 'Recebido' | 'A Pagar' | 'A Receber' | 'Estornado' | 'Estorno'

    if (isContraEstorno) {
      statusApresentacao = 'estorno'
      etiquetaStatus = 'Estorno'
    } else if (isOriginalEstornado) {
      statusApresentacao = 'estornado'
      etiquetaStatus = 'Estornado'
    } else if (estaRealizadoOuLiquidado) {
      statusApresentacao = 'pago_recebido'
      etiquetaStatus = tipo === 'despesa' ? 'Pago' : 'Recebido'
    } else {
      statusApresentacao = 'a_pagar_receber'
      etiquetaStatus = tipo === 'despesa' ? 'A Pagar' : 'A Receber'
    }

    const podeLiquidar =
      l.status === 'previsto' && !isLiquidado && !isOriginalEstornado && !isContraEstorno

    resultado.push({
      id,
      itemOriginal: l,
      itemLiquidacao: contraLancamentoLiq,
      tipo,
      descricao: l.descricao,
      categoria: l.categoria,
      categoria_id: l.categoria_id,
      departamento: l.departamento,
      centro_custo: l.centro_custo,
      valor: l.valor,
      data_vencimento: l.data_vencimento || null,
      data_realizacao: dataRealizacaoEfetiva,
      statusApresentacao,
      etiquetaStatus,
      competencia: l.competencia,
      podeLiquidar,
    })
  }

  return resultado
}

/**
 * Filtro de exibição das abas em Contas a Pagar / Receber:
 * - 'todos': todos os registros (inclusive estornados/estornos como histórico)
 * - 'previsto' (A Pagar / A Receber): apenas obrigações em aberto (exclui estorno/estornado e liquidados)
 * - 'realizado' (Quitados / Recebidos): apenas obrigações pagas/recebidas (exclui estorno/estornado)
 */
export function filtrarObrigacoesPorAba(
  obrigacoes: ObrigacaoApresentacao[],
  filtroStatus: 'todos' | 'previsto' | 'realizado',
  filtroTexto: string = '',
  categorias: Array<{ id?: string; nome: string }> = [],
): ObrigacaoApresentacao[] {
  return obrigacoes.filter((ob) => {
    // Filtro de aba
    if (filtroStatus === 'previsto') {
      if (ob.statusApresentacao !== 'a_pagar_receber') return false
    } else if (filtroStatus === 'realizado') {
      if (ob.statusApresentacao !== 'pago_recebido') return false
    }

    // Filtro de texto
    const termoBusca = filtroTexto.trim().toLowerCase()
    if (termoBusca) {
      const matchDesc = (ob.descricao || '').toLowerCase().includes(termoBusca)
      const matchCatTexto = (ob.categoria || '').toLowerCase().includes(termoBusca)
      const matchCatId = (ob.categoria_id || '').toLowerCase().includes(termoBusca)

      // Nome atual da categoria via relação (mesma lógica já utilizada na 0.0.76 com fallback)
      let matchCatNome = false
      if (ob.categoria_id) {
        const catObj = categorias.find((c) => c.id === ob.categoria_id)
        if (catObj && catObj.nome) {
          matchCatNome = catObj.nome.toLowerCase().includes(termoBusca)
        }
      }

      if (!matchDesc && !matchCatNome && !matchCatTexto && !matchCatId) {
        return false
      }
    }

    return true
  })
}

/**
 * Formatação da coluna "% Receita Líquida" (UX-DRE-02):
 * - Receita líquida <= 0: exibe "—"
 * - Base única: (valor / receitaLiquida) * 100
 * - Exibição com 1 casa decimal: "33,3%"
 */
export function formatarPercentualReceitaLiquida(valor: number, receitaLiquida: number): string {
  if (receitaLiquida <= 0) {
    return '—'
  }
  const pct = (valor / receitaLiquida) * 100
  return `${pct.toFixed(1).replace('.', ',')}%`
}

/**
 * Formatação para CSV da coluna "% Receita Líquida" (compatível com Excel pt-BR / internacional)
 */
export function formatarPercentualReceitaLiquidaCSV(valor: number, receitaLiquida: number): string {
  if (receitaLiquida <= 0) {
    return '—'
  }
  const pct = (valor / receitaLiquida) * 100
  return `${pct.toFixed(1)}%`
}

/**
 * Gera o texto da linha informativa sobre títulos previstos na DRE (FIN-05):
 * Não altera nenhum valor. Se houver receitas e despesas previstas na competência, informa separadamente.
 */
export function gerarTextoInformativoPrevistosDRE(
  lancamentosPeriodo: LancamentoCalculo[],
): string | null {
  // IDs de liquidação para não contar previstos já liquidados
  const idsLiquidados = new Set<string>()
  for (const l of lancamentosPeriodo) {
    if (l.liquidacao_de && l.status !== 'estornado') {
      idsLiquidados.add(l.liquidacao_de)
    }
  }

  let receitasPrevistas = 0
  let despesasPrevistas = 0

  for (const l of lancamentosPeriodo) {
    if (l.status === 'previsto' && !(l.id && idsLiquidados.has(l.id))) {
      const v = roundCents(calcularValorEfetivoLancamento(l))
      if (l.tipo === 'receita') {
        receitasPrevistas = roundCents(receitasPrevistas + v)
      } else if (l.tipo === 'despesa') {
        despesasPrevistas = roundCents(despesasPrevistas + v)
      }
    }
  }

  if (receitasPrevistas === 0 && despesasPrevistas === 0) {
    return null
  }

  if (receitasPrevistas > 0 && despesasPrevistas > 0) {
    return `Inclui ${formatBRL(receitasPrevistas)} em receitas previstas e ${formatBRL(despesasPrevistas)} em despesas previstas ainda não realizadas.`
  }

  if (receitasPrevistas > 0) {
    return `Inclui ${formatBRL(receitasPrevistas)} em receitas previstas ainda não realizadas.`
  }

  return `Inclui ${formatBRL(despesasPrevistas)} em despesas previstas ainda não realizadas.`
}

/**
 * Estrutura de uma linha da DRE Completo para apresentação e exportação unificada (FIN-11)
 */
export interface LinhaDREVisual {
  codigo: string
  descricao: string
  valor: number
  tipoLinha: 'total' | 'subtotal' | 'detalhe' | 'informativo'
  nivel: number // 0 = título do bloco, 1 = detalhe
  percentualReceitaLiquida: string
  sinal: '+' | '-' | '=' | ''
}

export interface BlocoDREVisual {
  titulo: string
  linhas: LinhaDREVisual[]
  subtotal: LinhaDREVisual
}

/**
 * Monta as linhas dinâmicas da DRE Completo que de fato recebem valor do cálculo (FIN-11):
 * - Exibe linhas com valor !== 0 ou linhas agregadas preenchidas
 * - Receita bruta: soma das linhas de detalhe exibidas = subtotal exibido
 * - Despesas operacionais antes do EBITDA: soma das linhas exibidas = total exibido
 * - Não exibe linhas fixas zeradas que o cálculo não preenche
 * - Se uma linha fixa tiver valor diferente de zero, ela deve aparecer
 */
export function montarLinhasDRECompleto(
  dreData: {
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
    investimentos: number
    rendimentosFinanceiros: number
    despesasFinanceiras: number
    resultadoFinanceiro: number
    resultadoLiquido: number
    margemLiquida: number
  },
  isCsv: boolean = false,
): {
  linhasExibicao: Array<{
    descricao: string
    valorFormatado: string
    valorNumerico: number
    percentual: string
    estilo: 'bloco-titulo' | 'detalhe' | 'subtotal' | 'informativo' | 'destaque'
  }>
  linhasCsv: Array<string[]>
} {
  const formatPct = isCsv ? formatarPercentualReceitaLiquidaCSV : formatarPercentualReceitaLiquida
  const rLiq = dreData.receitaLiquida

  // 1. Bloco Receita Bruta
  const detalhesReceitaBruta: Array<{ descricao: string; valor: number }> = []
  if (dreData.receitaServicos !== 0) {
    detalhesReceitaBruta.push({
      descricao: 'Receita de Serviços Prestados',
      valor: dreData.receitaServicos,
    })
  }
  if (dreData.receitaVendas !== 0) {
    detalhesReceitaBruta.push({ descricao: 'Receita com Vendas', valor: dreData.receitaVendas })
  }
  if (dreData.receitaOutras !== 0) {
    detalhesReceitaBruta.push({ descricao: 'Receita Operacional', valor: dreData.receitaOutras })
  }

  // 2. Bloco Despesas Operacionais (antes do EBITDA)
  const detalhesDespesasFixas: Array<{ descricao: string; valor: number }> = []
  if (dreData.despesasSalarios !== 0) {
    detalhesDespesasFixas.push({
      descricao: 'Despesas com Salários e Benefícios',
      valor: dreData.despesasSalarios,
    })
  }
  if (dreData.despesasAluguel !== 0) {
    detalhesDespesasFixas.push({
      descricao: 'Despesas de Aluguel e Ocupação',
      valor: dreData.despesasAluguel,
    })
  }
  if (dreData.despesasMarketing !== 0) {
    detalhesDespesasFixas.push({
      descricao: 'Investimento em Marketing e Vendas',
      valor: dreData.despesasMarketing,
    })
  }
  if (dreData.outrasDespesasOp !== 0) {
    detalhesDespesasFixas.push({
      descricao: 'Despesas operacionais',
      valor: dreData.outrasDespesasOp,
    })
  }

  // Montagem da tabela visual
  const linhasExibicao: Array<{
    descricao: string
    valorFormatado: string
    valorNumerico: number
    percentual: string
    estilo: 'bloco-titulo' | 'detalhe' | 'subtotal' | 'informativo' | 'destaque'
  }> = []

  // (+) RECEITA BRUTA OPERACIONAL
  linhasExibicao.push({
    descricao: '(+) RECEITA BRUTA OPERACIONAL',
    valorFormatado: formatBRL(dreData.receitaBruta),
    valorNumerico: dreData.receitaBruta,
    percentual: '—',
    estilo: 'bloco-titulo',
  })

  for (const det of detalhesReceitaBruta) {
    linhasExibicao.push({
      descricao: det.descricao,
      valorFormatado: formatBRL(det.valor),
      valorNumerico: det.valor,
      percentual: '—',
      estilo: 'detalhe',
    })
  }

  // (-) Deduções da Receita Bruta / Impostos Incidentes
  linhasExibicao.push({
    descricao: '(-) Deduções da Receita Bruta / Impostos Incidentes',
    valorFormatado: `(${formatBRL(dreData.impostosDeducoes)})`,
    valorNumerico: -dreData.impostosDeducoes,
    percentual: formatPct(dreData.impostosDeducoes, rLiq),
    estilo: 'detalhe',
  })

  // (=) RECEITA OPERACIONAL LÍQUIDA
  linhasExibicao.push({
    descricao: '(=) RECEITA OPERACIONAL LÍQUIDA',
    valorFormatado: formatBRL(dreData.receitaLiquida),
    valorNumerico: dreData.receitaLiquida,
    percentual: rLiq > 0 ? (isCsv ? '100.0%' : '100,0%') : '—',
    estilo: 'subtotal',
  })

  // (-) Custos Variáveis / Fornecedores
  linhasExibicao.push({
    descricao: '(-) Custos Variáveis / Fornecedores',
    valorFormatado: `(${formatBRL(dreData.custosFornecedores)})`,
    valorNumerico: -dreData.custosFornecedores,
    percentual: formatPct(dreData.custosFornecedores, rLiq),
    estilo: 'detalhe',
  })

  // (=) MARGEM DE CONTRIBUIÇÃO
  linhasExibicao.push({
    descricao: '(=) MARGEM DE CONTRIBUIÇÃO',
    valorFormatado: formatBRL(dreData.margemContribuicao),
    valorNumerico: dreData.margemContribuicao,
    percentual: formatPct(dreData.margemContribuicao, rLiq),
    estilo: 'subtotal',
  })

  // Despesas operacionais do bloco
  for (const det of detalhesDespesasFixas) {
    linhasExibicao.push({
      descricao: det.descricao,
      valorFormatado: `(${formatBRL(det.valor)})`,
      valorNumerico: -det.valor,
      percentual: formatPct(det.valor, rLiq),
      estilo: 'detalhe',
    })
  }

  // (=) EBITDA OPERACIONAL
  linhasExibicao.push({
    descricao: '(=) EBITDA OPERACIONAL',
    valorFormatado: formatBRL(dreData.ebitda),
    valorNumerico: dreData.ebitda,
    percentual: formatPct(dreData.ebitda, rLiq),
    estilo: 'subtotal',
  })

  // (-) Depreciação & Amortização (se houver diferente de zero)
  if (dreData.depreciacaoAmortizacao !== 0) {
    linhasExibicao.push({
      descricao: '(-) Depreciação & Amortização do Exercício',
      valorFormatado: `(${formatBRL(dreData.depreciacaoAmortizacao)})`,
      valorNumerico: -dreData.depreciacaoAmortizacao,
      percentual: formatPct(dreData.depreciacaoAmortizacao, rLiq),
      estilo: 'detalhe',
    })
  }

  // (=) RESULTADO OPERACIONAL (EBIT)
  linhasExibicao.push({
    descricao: '(=) RESULTADO OPERACIONAL (EBIT)',
    valorFormatado: formatBRL(dreData.resultadoOperacional),
    valorNumerico: dreData.resultadoOperacional,
    percentual: formatPct(dreData.resultadoOperacional, rLiq),
    estilo: 'subtotal',
  })

  // [Info] CAPEX / Investimentos de Capital segregados
  linhasExibicao.push({
    descricao: '[Info] CAPEX / Investimentos de Capital segregados',
    valorFormatado: formatBRL(dreData.investimentos),
    valorNumerico: dreData.investimentos,
    percentual: 'Patrimônio',
    estilo: 'informativo',
  })

  // (+/-) Resultado Financeiro Líquido (se houver rendimento, despesa ou resultado != 0)
  if (
    dreData.rendimentosFinanceiros !== 0 ||
    dreData.despesasFinanceiras !== 0 ||
    dreData.resultadoFinanceiro !== 0
  ) {
    linhasExibicao.push({
      descricao: '(+/-) Resultado Financeiro Líquido',
      valorFormatado: formatBRL(dreData.resultadoFinanceiro),
      valorNumerico: dreData.resultadoFinanceiro,
      percentual: formatPct(dreData.resultadoFinanceiro, rLiq),
      estilo: 'detalhe',
    })
  }

  // (=) RESULTADO LÍQUIDO DO PERÍODO
  linhasExibicao.push({
    descricao: '(=) RESULTADO LÍQUIDO DO PERÍODO',
    valorFormatado: formatBRL(dreData.resultadoLiquido),
    valorNumerico: dreData.resultadoLiquido,
    percentual: formatPct(dreData.resultadoLiquido, rLiq),
    estilo: 'destaque',
  })

  // Linhas para o CSV (mesma fonte de dados da tela)
  const linhasCsv: Array<string[]> = []
  for (const l of linhasExibicao) {
    linhasCsv.push([l.descricao, l.valorNumerico.toFixed(2), l.percentual])
  }

  return { linhasExibicao, linhasCsv }
}

/**
 * Detalhes estruturais de apresentação de um lançamento (UX-EST-03)
 */
export interface DetalheApresentacaoLancamento {
  etiquetaPrincipal: EtiquetaLancamento
  statusTecnico: string
  dataRealizacaoExibicao: string | null
  originalReferenciado?: {
    id: string
    descricao: string
    data_lancamento: string
  }
  motivoEstorno?: string | null
}

export interface ItemApresentacaoTabelaLancamento<
  T extends LancamentoApresentacao = LancamentoApresentacao,
> {
  item: T
  isContraLancamentoEstorno: boolean
  isOriginalEstornado: boolean
  isFilhoEstornoAgrupado: boolean
  descricaoExibicao: string
  valorExibicaoTexto: string
  efeitoLiquidoZero: boolean
}

/**
 * Monta a lista e metadados de apresentação para a tabela de Lançamentos (UX-TXT-03 e UX-EST-01):
 * - Contra-lançamento (estorno_de preenchido):
 *   a) valor com o sinal do efeito: estorno de receita "− R$ 10.000,00"; estorno de despesa "+ R$ 100,00"
 *   b) cor neutra (cinza), sem o verde de receita nem o vermelho de despesa
 *   c) descrição legível montada a partir do original: "Estorno de: <Desc> — DD/MM/AAAA"
 *   d) ID interno não aparece
 * - Original estornado: valor riscado e indicação "efeito líquido R$ 0,00"
 * - Agrupamento: quando original e estorno estiverem na mesma lista, o estorno aparece logo abaixo do original com recuo e o símbolo "↳".
 *   Se o original não estiver na lista, o estorno aparece na sua posição normal.
 */
export function prepararListaApresentacaoLancamentos<
  T extends LancamentoApresentacao = LancamentoApresentacao,
>(lancamentosFiltrados: T[], todosLancamentos: T[]): ItemApresentacaoTabelaLancamento<T>[] {
  const idsOriginaisEstornados = mapearIdsOriginaisEstornados(todosLancamentos)
  const mapaPorId = new Map<string, T>()
  todosLancamentos.forEach((l) => {
    if (l.id) mapaPorId.set(l.id, l)
  })

  const idsPresentesFiltrados = new Set<string>()
  lancamentosFiltrados.forEach((l) => {
    if (l.id) idsPresentesFiltrados.add(l.id)
  })

  // Mapear estornos filhos cujo original está presente nesta mesma lista
  const estornosFilhosPorOriginalId = new Map<string, T[]>()
  const idsEstornosAgrupadosComoFilhos = new Set<string>()

  for (const item of lancamentosFiltrados) {
    if (item.estorno_de && idsPresentesFiltrados.has(item.estorno_de)) {
      const arr = estornosFilhosPorOriginalId.get(item.estorno_de) || []
      arr.push(item)
      estornosFilhosPorOriginalId.set(item.estorno_de, arr)
      if (item.id) idsEstornosAgrupadosComoFilhos.add(item.id)
    }
  }

  const formatarMoeda = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Math.abs(val))
  }

  const construirItemMetadados = (
    item: T,
    isFilhoEstornoAgrupado: boolean,
  ): ItemApresentacaoTabelaLancamento<T> => {
    const isContraLancamento = Boolean(item.estorno_de)
    const isOriginalEstornado =
      !isContraLancamento &&
      (item.status === 'estornado' || (Boolean(item.id) && idsOriginaisEstornados.has(item.id!)))

    let descricaoExibicao = item.descricao
    let valorExibicaoTexto = ''

    if (isContraLancamento) {
      // Sinal do efeito:
      // Contra-lançamento de receita (item.tipo === 'receita') estorna a receita -> efeito "− R$ X"
      // Contra-lançamento de despesa (item.tipo === 'despesa') estorna a despesa -> efeito "+ R$ X"
      const sinal = item.tipo === 'receita' ? '−' : '+'
      valorExibicaoTexto = `${sinal} ${formatarMoeda(item.valor)}`

      // Descrição legível a partir do original
      const orig = item.estorno_de ? mapaPorId.get(item.estorno_de) : null
      if (orig) {
        const dataOrig = formatarDataCivil(orig.data_lancamento, '')
        descricaoExibicao = dataOrig
          ? `Estorno de: ${orig.descricao} — ${dataOrig}`
          : `Estorno de: ${orig.descricao}`
      } else {
        // Se o original não estiver em memória por algum motivo extraordinário, limpa ID da descrição existente se houver
        const descLimpa = item.descricao
          .replace(/\[ESTORNO\]\s*/i, '')
          .replace(/- Ref: [^\s]+ /i, '')
        descricaoExibicao = `Estorno de: ${descLimpa}`
      }
    } else {
      const sinal = item.tipo === 'receita' ? '+' : '-'
      valorExibicaoTexto = `${sinal} ${formatarMoeda(item.valor)}`
    }

    return {
      item,
      isContraLancamentoEstorno: isContraLancamento,
      isOriginalEstornado,
      isFilhoEstornoAgrupado,
      descricaoExibicao,
      valorExibicaoTexto,
      efeitoLiquidoZero: isOriginalEstornado,
    }
  }

  const resultado: ItemApresentacaoTabelaLancamento<T>[] = []

  for (const item of lancamentosFiltrados) {
    // Se for um contra-lançamento cujo original está nesta mesma lista, ele será renderizado logo após o original
    if (item.id && idsEstornosAgrupadosComoFilhos.has(item.id)) {
      continue
    }

    resultado.push(construirItemMetadados(item, false))

    // Se este item possui estornos filhos presentes nesta lista, insere-os imediatamente abaixo
    if (item.id && estornosFilhosPorOriginalId.has(item.id)) {
      const filhos = estornosFilhosPorOriginalId.get(item.id)!
      for (const f of filhos) {
        resultado.push(construirItemMetadados(f, true))
      }
    }
  }

  return resultado
}

/**
 * Extrai o motivo do estorno a partir da descrição ou observações estruturadas
 * geradas na criação do estorno (ex: "... (${motivo})" ou "Motivo: ${motivo}")
 */
export function extrairMotivoEstorno(
  contraLancamento?: LancamentoApresentacao | null,
): string | null {
  if (!contraLancamento) return null
  if (contraLancamento.observacoes) {
    const matchObs = contraLancamento.observacoes.match(/Motivo:\s*(.+)$/i)
    if (matchObs && matchObs[1]) {
      return matchObs[1].trim()
    }
  }
  if (contraLancamento.descricao) {
    const matchDesc = contraLancamento.descricao.match(/\(([^)]+)\)\s*$/)
    if (matchDesc && matchDesc[1]) {
      return matchDesc[1].trim()
    }
  }
  return null
}

/**
 * Resolve as informações completas de apresentação para o modal de detalhe do lançamento (UX-EST-03):
 * Reutiliza obterEtiquetaLancamento, respeitando as relações liquidacao_de / estorno_de.
 * 4.1. Liquidado: original mostra "Liquidado" e a data de realização vinculada à liquidação.
 * 4.2. Estornado: original mostra "Estornado"; contra-lançamento mostra "Estorno".
 *      Quando aplicável, detalhe mostra referência à descrição original, data do lançamento original e motivo do estorno.
 * 4.3. Previsto: continua "Previsto".
 * 4.4. Realizado: continua "Realizado".
 */
/**
 * 5B-R1: Formatação de linha secundária (Observações) na LISTA de lançamentos
 * - Estorno: exibe apenas "Motivo: <motivo>", removendo menções a "ID: <id>".
 * - Liquidação: remove o trecho "Ref original: <id>" (ex: "Realização quitada em 06/10/2026.").
 */
export function formatarObservacoesListaApresentacao(item: LancamentoApresentacao): string {
  const obs = item.observacoes || ''
  if (!obs) return ''

  if (item.estorno_de) {
    // Remove "Estorno referente ao lançamento original ID: <id>." preservando "Motivo: <motivo>"
    const motivo = extrairMotivoEstorno(item)
    if (motivo) {
      return `Motivo: ${motivo}`
    }
    // Caso padrão se não achou motivo explícito: remove especificamente o ID referenciado
    const idRef = item.estorno_de
    let limpo = obs.replace(new RegExp(`ID:\\s*${idRef}\\.?\\s*`, 'gi'), '')
    limpo = limpo.replace(/Estorno referente ao lançamento original\.?\s*/gi, '')
    return limpo.trim()
  }

  if (item.liquidacao_de) {
    // Remove especificamente "Ref original: <id>" (ou variações com o próprio item.liquidacao_de)
    const idRef = item.liquidacao_de
    let limpo = obs.replace(new RegExp(`\\.?\\s*Ref original:\\s*${idRef}\\.?`, 'gi'), '')
    limpo = limpo.trim()
    if (limpo && !limpo.endsWith('.')) {
      limpo += '.'
    }
    return limpo
  }

  return obs
}

/**
 * 5B-R1: Formatação da Descrição no DETALHE (olhinho) do lançamento
 * Para contra-lançamento de estorno: descrição exibida com o texto legível já usado na lista
 * ("Estorno de: <orig.descricao> — <orig.data_lancamento>").
 */
export function formatarDescricaoDetalheApresentacao(
  item: LancamentoApresentacao,
  todosLancamentos: LancamentoApresentacao[],
): string {
  if (item.estorno_de) {
    const orig = todosLancamentos.find((l) => l.id === item.estorno_de)
    if (orig) {
      const dataOrig = formatarDataCivil(orig.data_lancamento, '')
      return dataOrig
        ? `Estorno de: ${orig.descricao} — ${dataOrig}`
        : `Estorno de: ${orig.descricao}`
    }
    const descLimpa = item.descricao.replace(/\[ESTORNO\]\s*/i, '').replace(/- Ref: [^\s]+ /i, '')
    return `Estorno de: ${descLimpa}`
  }
  return item.descricao
}

/**
 * 5B-R1: Formatação das Observações no DETALHE (olhinho) do lançamento
 * Remove o trecho com o ID do lançamento referenciado usando o próprio valor de estorno_de / liquidacao_de.
 */
export function formatarObservacoesDetalheApresentacao(item: LancamentoApresentacao): string {
  return formatarObservacoesListaApresentacao(item)
}

/**
 * EXP-01: Calcula a Situação e o Efeito no caixa (R$) para a exportação de lançamentos (CSV).
 * Reutiliza obterEtiquetaLancamento e calcularValorEfetivoLancamento.
 *
 * Situação: mesma etiqueta da tela (obterEtiquetaLancamento): Liquidado, Estornado, Estorno, Previsto ou Realizado.
 * Efeito no caixa (R$):
 * - status técnico "previsto" -> 0.00
 * - status técnico "realizado":
 *   • Se etiqueta for "Liquidado" (original previsto pago): 0.00 (efeito de caixa está na liquidação)
 *   • Demais realizados (inclusive liquidação, estorno e original realizado estornado):
 *     receita positivo, despesa negativo, aplicando calcularValorEfetivoLancamento (que já inverte quando estorno_de preenchido).
 *
 * Resultado por situação:
 * - "Realizado" (inclusive liquidação) = valor com sinal (pagamento de despesa 500 = -500.00)
 * - "Estornado" (original realizado estornado) = valor com sinal, NÃO zero (Venda Teste = 10000.00)
 * - "Estorno" (contra-lançamento) = sinal invertido (estorno da Venda Teste = -10000.00)
 * - "Liquidado" (original previsto pago) = 0.00
 * - "Previsto" = 0.00
 *
 * Soma da coluna "Efeito no caixa (R$)" de uma competência = cartão "Fluxo de caixa da competência" da tela Lançamentos.
 */
export function calcularEfeitoCaixaApresentacao(
  item: LancamentoApresentacao,
  todosLancamentos: LancamentoApresentacao[],
): { situacao: EtiquetaLancamento; efeitoCaixa: number } {
  const idsEstornados = mapearIdsOriginaisEstornados(todosLancamentos)
  const idsLiquidados = mapearIdsOriginaisLiquidados(todosLancamentos)

  const situacao = obterEtiquetaLancamento(item, idsEstornados, idsLiquidados)

  // Regra EXP-01: status previsto -> 0.00
  if (item.status === 'previsto') {
    return { situacao, efeitoCaixa: 0 }
  }

  // Original previsto liquidado: efeito de caixa está no contra-lançamento de liquidação
  if (situacao === 'Liquidado') {
    return { situacao, efeitoCaixa: 0 }
  }

  // Status "realizado" (ou "estornado" para original realizado)
  // calcularValorEfetivoLancamento devolve o valor em módulo correto (positivo, invertendo se contra-estorno)
  const vEfetivo = calcularValorEfetivoLancamento(item)
  const efeitoCaixa = item.tipo === 'receita' ? vEfetivo : -vEfetivo

  return { situacao, efeitoCaixa }
}

export function obterDetalhesApresentacaoLancamento(
  item: LancamentoApresentacao,
  todosLancamentos: LancamentoApresentacao[],
): DetalheApresentacaoLancamento {
  const idsEstornados = mapearIdsOriginaisEstornados(todosLancamentos)
  const idsLiquidados = mapearIdsOriginaisLiquidados(todosLancamentos)
  const liquidacaoMap = mapearLiquidadorMap(todosLancamentos)

  const etiquetaPrincipal = obterEtiquetaLancamento(item, idsEstornados, idsLiquidados)

  let dataRealizacaoExibicao: string | null = item.data_realizacao || null
  if (etiquetaPrincipal === 'Liquidado' && item.id) {
    const liq = liquidacaoMap.get(item.id)
    if (liq) {
      dataRealizacaoExibicao = liq.data_realizacao || liq.data_lancamento || null
    }
  }

  let originalReferenciado: { id: string; descricao: string; data_lancamento: string } | undefined
  let motivoEstorno: string | null = null

  if (item.estorno_de) {
    // É contra-lançamento de estorno: busca o original
    const orig = todosLancamentos.find((l) => l.id === item.estorno_de)
    if (orig) {
      originalReferenciado = {
        id: orig.id || item.estorno_de,
        descricao: orig.descricao,
        data_lancamento: orig.data_lancamento,
      }
    }
    motivoEstorno = extrairMotivoEstorno(item)
  } else if (etiquetaPrincipal === 'Estornado' && item.id) {
    // É o original que foi estornado: busca o contra-lançamento que aponta para ele
    const contra = todosLancamentos.find((l) => l.estorno_de === item.id)
    if (contra) {
      motivoEstorno = extrairMotivoEstorno(contra)
    }
  }

  // A4 Detalhe: Lançamento com etiqueta "Estornado" e data_realizacao vazia: exibir "—" em vez de "Pendente"
  if (etiquetaPrincipal === 'Estornado' && !dataRealizacaoExibicao) {
    dataRealizacaoExibicao = '—'
  }

  return {
    etiquetaPrincipal,
    statusTecnico: item.status,
    dataRealizacaoExibicao,
    originalReferenciado,
    motivoEstorno,
  }
}

/**
 * Item de pendência aberta para a campainha do AppLayout (UX-NOT-01)
 */
export type MotivoPendenciaNotificacao =
  | 'Vencida'
  | 'Vence hoje'
  | 'Sem vencimento — cadastro incompleto'

export interface PendenciaNotificacao {
  id: string
  tipo: 'despesa' | 'receita'
  descricao: string
  valor: number
  data_vencimento: string | null
  motivo: MotivoPendenciaNotificacao
  destinoRota: '/contas-a-pagar' | '/contas-a-receber'
}

/**
 * Calcula a lista de pendências abertas e sua contagem para a campainha de urgência (UX-NOT-02, Lote 5B):
 * Regra:
 * 1. Somente lançamentos realmente abertos e previstos:
 *    - status === 'previsto'
 *    - NÃO ser referenciado por nenhum outro via liquidacao_de (mapearIdsOriginaisLiquidados)
 *    - NÃO ser referenciado por nenhum outro via estorno_de (mapearIdsOriginaisEstornados)
 *    - Seus próprios campos liquidacao_de e estorno_de vazios (não ser contra-lançamento)
 * 2. Critérios de urgência:
 *    - Despesa prevista vencimento < hoje: 'Vencida'
 *    - Despesa prevista vencimento === hoje: 'Vence hoje'
 *    - Receita prevista vencimento < hoje: 'Vencida'
 *    - Receita prevista vencimento === hoje: 'Vence hoje'
 *    - Previsto (despesa ou receita) sem data de vencimento: 'Sem vencimento — cadastro incompleto'
 *    - NÃO entram vencimentos a partir de amanhã (inclusive amanhã e próximos 7 dias).
 * 3. Ordem da lista:
 *    Primeiro "Vencida" (vencimento mais antigo primeiro), depois "Vence hoje", por último "Sem vencimento — cadastro incompleto".
 */
export function obterPendenciasNotificacao(
  lancamentos: LancamentoApresentacao[],
  referenciaHoje?: string,
): PendenciaNotificacao[] {
  const hoje = referenciaHoje || hojeBrasil()

  const idsLiquidados = mapearIdsOriginaisLiquidados(lancamentos)
  const idsEstornados = mapearIdsOriginaisEstornados(lancamentos)

  const pendencias: PendenciaNotificacao[] = []

  for (const l of lancamentos) {
    // Somente status 'previsto'
    if (l.status !== 'previsto') continue

    // Contra-lançamentos nunca contam como pendência
    if (l.liquidacao_de || l.estorno_de) continue

    // Não pode ter sido liquidado nem estornado por outro
    if (l.id && (idsLiquidados.has(l.id) || idsEstornados.has(l.id))) continue

    const id = l.id || ''
    const vencCivil = normalizarDataCivil(l.data_vencimento)
    const destinoRota: '/contas-a-pagar' | '/contas-a-receber' =
      l.tipo === 'despesa' ? '/contas-a-pagar' : '/contas-a-receber'

    // Lançamento previsto sem data de vencimento
    if (!vencCivil) {
      pendencias.push({
        id,
        tipo: l.tipo,
        descricao: l.descricao,
        valor: l.valor,
        data_vencimento: null,
        motivo: 'Sem vencimento — cadastro incompleto',
        destinoRota,
      })
      continue
    }

    const comp = compararDataCivil(vencCivil, hoje)
    if (comp < 0) {
      // Vencimento anterior a hoje
      pendencias.push({
        id,
        tipo: l.tipo,
        descricao: l.descricao,
        valor: l.valor,
        data_vencimento: vencCivil,
        motivo: 'Vencida',
        destinoRota,
      })
    } else if (comp === 0) {
      // Vencimento igual a hoje
      pendencias.push({
        id,
        tipo: l.tipo,
        descricao: l.descricao,
        valor: l.valor,
        data_vencimento: vencCivil,
        motivo: 'Vence hoje',
        destinoRota,
      })
    }
    // comp > 0: a partir de amanhã -> NÃO entra no sino
  }

  // Ordem: Vencida (mais antigo primeiro), depois Vence hoje, depois Sem vencimento
  const pesoMotivo = (m: MotivoPendenciaNotificacao) => {
    if (m === 'Vencida') return 1
    if (m === 'Vence hoje') return 2
    return 3
  }

  pendencias.sort((a, b) => {
    const diffPeso = pesoMotivo(a.motivo) - pesoMotivo(b.motivo)
    if (diffPeso !== 0) return diffPeso

    if (a.motivo === 'Vencida' && a.data_vencimento && b.data_vencimento) {
      return compararDataCivil(a.data_vencimento, b.data_vencimento)
    }

    return 0
  })

  return pendencias
}
