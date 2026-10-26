// Análise operacional (lote 13): Receita e Custo da operação.
// Biblioteca PURA: não faz rede nem gravação. Não altera calcularDRE.
// Os valores por categoria, departamento e centro de custo são calculados com a PRÓPRIA calcularDRE sobre o
// subconjunto, depois de aplicar a mesma seleção da DRE (estornados fora; previstos já liquidados não contam em
// dobro). Por isso a soma das partes reconcilia com a DRE do mesmo período e regime.
import {
  calcularDRE,
  determinarGrupoDRE,
  roundCents,
  roundPercent,
  type DRECalculada,
  type LancamentoCalculo,
} from './financialCalculations'

export type RegimeAnalise = 'competencia' | 'caixa'

const SEM_DEPARTAMENTO = 'Sem departamento'
const SEM_CENTRO_CUSTO = 'Sem centro de custo'
const SEM_CATEGORIA = 'Sem categoria'

export const periodoValido = (p: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(p || ''))

export function mesAnterior(periodo: string): string {
  if (!periodoValido(periodo)) return ''
  const [a, m] = periodo.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function mesmoMesAnoAnterior(periodo: string): string {
  if (!periodoValido(periodo)) return ''
  const [a, m] = periodo.split('-').map(Number)
  return `${a - 1}-${String(m).padStart(2, '0')}`
}

const mesDaData = (iso?: string | null): string => {
  const t = String(iso || '').slice(0, 7)
  return periodoValido(t) ? t : ''
}

/**
 * Seleciona os lançamentos de um período, com as mesmas regras da DRE:
 * - estornados ficam fora; previstos que já têm liquidação não contam em dobro;
 * - competência: período pela competência (inclui previstos e realizados);
 * - caixa: só realizados, período pelo mês da data de realização.
 */
export function selecionarPeriodo(
  lancamentos: LancamentoCalculo[],
  periodo: string,
  regime: RegimeAnalise = 'competencia',
): LancamentoCalculo[] {
  if (!periodoValido(periodo)) return []
  const validos = (lancamentos || []).filter((l) => l && l.status !== 'estornado')
  const liquidados = new Set<string>()
  for (const l of validos) if (l.liquidacao_de) liquidados.add(l.liquidacao_de)
  return validos.filter((l) => {
    if (l.id && liquidados.has(l.id)) return false
    if (regime === 'caixa') {
      return l.status === 'realizado' && mesDaData(l.data_realizacao) === periodo
    }
    return String(l.competencia || '').slice(0, 7) === periodo
  })
}

export type StatusBase = 'ok' | 'sem_base' | 'base_nao_positiva'

export interface Variacao {
  base: number
  diferenca: number | null
  percentual: number | null
  situacao: StatusBase
}

/** Variação contra uma base. Sem base (período sem lançamentos) ou base zero/negativa: não inventa percentual. */
export function calcularVariacao(atual: number, base: number, temBase: boolean): Variacao {
  const b = roundCents(base || 0)
  if (!temBase) return { base: 0, diferenca: null, percentual: null, situacao: 'sem_base' }
  const diferenca = roundCents((atual || 0) - b)
  if (b <= 0) return { base: b, diferenca, percentual: null, situacao: 'base_nao_positiva' }
  return { base: b, diferenca, percentual: roundPercent((diferenca / b) * 100), situacao: 'ok' }
}

const nomeCategoria = (l: LancamentoCalculo): string => (l.categoria || '').trim() || SEM_CATEGORIA
const chaveCategoria = (l: LancamentoCalculo): string => l.categoria_id || nomeCategoria(l)

function agrupar(
  itens: LancamentoCalculo[],
  chave: (l: LancamentoCalculo) => string,
): Map<string, LancamentoCalculo[]> {
  const m = new Map<string, LancamentoCalculo[]>()
  for (const l of itens) {
    const k = chave(l)
    const arr = m.get(k)
    if (arr) arr.push(l)
    else m.set(k, [l])
  }
  return m
}

const receitaDe = (dre: DRECalculada) => dre.receitaBruta
const custoOperacaoDe = (dre: DRECalculada) =>
  roundCents(dre.custosFornecedores + dre.totalDespesasFixas)

export interface LinhaParticipacao {
  chave: string
  nome: string
  valor: number
  participacao: number | null
}

function comParticipacao(
  linhas: { chave: string; nome: string; valor: number }[],
): LinhaParticipacao[] {
  const total = roundCents(linhas.reduce((s, l) => s + l.valor, 0))
  return linhas
    .map((l) => ({
      ...l,
      participacao: total > 0 ? roundPercent((l.valor / total) * 100) : null,
    }))
    .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'))
}

// ----------------------------------------------------------------------------------------------
// RECEITA
// ----------------------------------------------------------------------------------------------
export interface AnaliseReceita {
  periodo: string
  regime: RegimeAnalise
  receitaOperacional: number
  receitaFinanceira: number
  porCategoria: LinhaParticipacao[]
  /** Ticket médio POR LANÇAMENTO (não é por cliente nem por serviço). */
  ticketMedioPorLancamento: { valor: number | null; quantidade: number }
  previstoRealizado: { realizado: number; previsto: number }
  mesAnterior: { periodo: string; receita: number; variacao: Variacao }
  mesmoMesAnoAnterior: { periodo: string; receita: number; variacao: Variacao }
  dre: DRECalculada
}

const receitaDoPeriodo = (
  lancs: LancamentoCalculo[],
  periodo: string,
  regime: RegimeAnalise,
): { receita: number; temLancamentos: boolean } => {
  const sel = selecionarPeriodo(lancs, periodo, regime)
  return { receita: receitaDe(calcularDRE(sel, 'competencia')), temLancamentos: sel.length > 0 }
}

export function analisarReceita(
  lancamentos: LancamentoCalculo[],
  periodo: string,
  regime: RegimeAnalise = 'competencia',
): AnaliseReceita {
  const sel = selecionarPeriodo(lancamentos, periodo, regime)
  const dre = calcularDRE(sel, 'competencia')

  // Só entram na receita operacional os lançamentos de receita que a DRE classifica em receita_bruta.
  const daReceita = sel.filter(
    (l) =>
      l.tipo === 'receita' &&
      determinarGrupoDRE(l.tipo, l.categoria, l.grupo_dre) === 'receita_bruta',
  )
  const linhas = [...agrupar(daReceita, chaveCategoria).entries()].map(([chave, itens]) => ({
    chave,
    nome: nomeCategoria(itens[0]),
    valor: receitaDe(calcularDRE(itens, 'competencia')),
  }))

  const semEstorno = daReceita.filter((l) => !l.estorno_de)
  const quantidade = semEstorno.length
  const ticket = quantidade > 0 ? roundCents(dre.receitaBruta / quantidade) : null

  const realizadoSel = daReceita.filter((l) => l.status === 'realizado')
  const previstoSel = daReceita.filter((l) => l.status === 'previsto')

  const ant = receitaDoPeriodo(lancamentos, mesAnterior(periodo), regime)
  const anoAnt = receitaDoPeriodo(lancamentos, mesmoMesAnoAnterior(periodo), regime)

  return {
    periodo,
    regime,
    receitaOperacional: dre.receitaBruta,
    receitaFinanceira: dre.rendimentosFinanceiros,
    porCategoria: comParticipacao(linhas),
    ticketMedioPorLancamento: { valor: ticket, quantidade },
    previstoRealizado: {
      realizado: receitaDe(calcularDRE(realizadoSel, 'competencia')),
      previsto: receitaDe(calcularDRE(previstoSel, 'competencia')),
    },
    mesAnterior: {
      periodo: mesAnterior(periodo),
      receita: ant.receita,
      variacao: calcularVariacao(dre.receitaBruta, ant.receita, ant.temLancamentos),
    },
    mesmoMesAnoAnterior: {
      periodo: mesmoMesAnoAnterior(periodo),
      receita: anoAnt.receita,
      variacao: calcularVariacao(dre.receitaBruta, anoAnt.receita, anoAnt.temLancamentos),
    },
    dre,
  }
}

// ----------------------------------------------------------------------------------------------
// CUSTO DA OPERAÇÃO
// ----------------------------------------------------------------------------------------------
export interface LinhaCusto extends LinhaParticipacao {
  grupo?: string
}

export interface LinhaABC {
  chave: string
  nome: string
  valor: number
  participacao: number
  acumulada: number
  classe: 'A' | 'resto'
}

export interface CurvaABC {
  possivel: boolean
  motivo?: string
  linhas: LinhaABC[]
}

export interface AnaliseCustos {
  periodo: string
  regime: RegimeAnalise
  /** Custo da operação = custos variáveis + despesas operacionais. */
  custoOperacao: number
  custosVariaveis: number
  despesasOperacionais: number
  /** Percentual do custo sobre a receita bruta; null quando a receita não é positiva. */
  percentualDaReceita: number | null
  informativos: {
    deducoesImpostos: number
    despesasFinanceiras: number
    capex: number
    depreciacao: number
    foraResultado: number
  }
  porCategoria: LinhaCusto[]
  porDepartamento: LinhaParticipacao[]
  porCentroCusto: LinhaParticipacao[]
  curvaABC: CurvaABC
  mesAnterior: { periodo: string; custoOperacao: number; variacao: Variacao }
  /** receita bruta − deduções − custos variáveis − despesas operacionais (igual ao EBITDA da DRE). */
  ebitdaPelaIdentidade: number
  dre: DRECalculada
}

const custoDoPeriodo = (
  lancs: LancamentoCalculo[],
  periodo: string,
  regime: RegimeAnalise,
): { custo: number; temLancamentos: boolean } => {
  const sel = selecionarPeriodo(lancs, periodo, regime)
  return { custo: custoOperacaoDe(calcularDRE(sel, 'competencia')), temLancamentos: sel.length > 0 }
}

export function calcularCurvaABC(
  linhas: { chave: string; nome: string; valor: number }[],
): CurvaABC {
  const positivas = linhas
    .filter((l) => l.valor > 0)
    .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'))
  const total = roundCents(positivas.reduce((s, l) => s + l.valor, 0))
  if (total <= 0) {
    return {
      possivel: false,
      motivo: 'Sem custo positivo no período: não há classificação válida.',
      linhas: [],
    }
  }
  let acumulado = 0
  let passouDoLimite = false
  const saida: LinhaABC[] = positivas.map((l) => {
    acumulado = roundCents(acumulado + l.valor)
    const acumuladaPct = roundPercent((acumulado / total) * 100)
    const classe: 'A' | 'resto' = passouDoLimite ? 'resto' : 'A'
    // A categoria que ultrapassa 80% ainda é A; as seguintes ficam fora.
    if (!passouDoLimite && acumulado / total >= 0.8) passouDoLimite = true
    return {
      chave: l.chave,
      nome: l.nome,
      valor: l.valor,
      participacao: roundPercent((l.valor / total) * 100),
      acumulada: acumuladaPct,
      classe,
    }
  })
  return { possivel: true, linhas: saida }
}

export function analisarCustos(
  lancamentos: LancamentoCalculo[],
  periodo: string,
  regime: RegimeAnalise = 'competencia',
  depreciacaoPeriodo = 0,
): AnaliseCustos {
  const sel = selecionarPeriodo(lancamentos, periodo, regime)
  const dre = calcularDRE(sel, 'competencia', depreciacaoPeriodo)
  const custoOperacao = custoOperacaoDe(dre)

  const dosCustos = sel.filter((l) => {
    if (l.tipo !== 'despesa') return false
    const g = determinarGrupoDRE(l.tipo, l.categoria, l.grupo_dre)
    return g === 'custos_variaveis' || g === 'despesas_operacionais'
  })

  const porCategoria: LinhaCusto[] = comParticipacao(
    [...agrupar(dosCustos, chaveCategoria).entries()].map(([chave, itens]) => ({
      chave,
      nome: nomeCategoria(itens[0]),
      valor: custoOperacaoDe(calcularDRE(itens, 'competencia')),
    })),
  ).map((l) => ({ ...l }))

  const porDimensao = (rotulo: (l: LancamentoCalculo) => string, vazio: string) =>
    comParticipacao(
      [...agrupar(dosCustos, (l) => rotulo(l).trim() || vazio).entries()].map(([chave, itens]) => ({
        chave,
        nome: chave,
        valor: custoOperacaoDe(calcularDRE(itens, 'competencia')),
      })),
    )

  // fora_resultado não entra na DRE: somado à parte, só como informação (com o sinal do estorno).
  let foraResultado = 0
  for (const l of sel) {
    if (determinarGrupoDRE(l.tipo, l.categoria, l.grupo_dre) === 'fora_resultado') {
      const v = roundCents(l.valor || 0)
      foraResultado = roundCents(foraResultado + (l.estorno_de ? -v : v))
    }
  }

  const receita = dre.receitaBruta
  const ant = custoDoPeriodo(lancamentos, mesAnterior(periodo), regime)

  return {
    periodo,
    regime,
    custoOperacao,
    custosVariaveis: dre.custosFornecedores,
    despesasOperacionais: dre.totalDespesasFixas,
    percentualDaReceita: receita > 0 ? roundPercent((custoOperacao / receita) * 100) : null,
    informativos: {
      deducoesImpostos: dre.impostosDeducoes,
      despesasFinanceiras: dre.despesasFinanceiras,
      capex: dre.investimentos,
      depreciacao: dre.depreciacaoAmortizacao,
      foraResultado,
    },
    porCategoria,
    porDepartamento: porDimensao((l) => l.departamento || '', SEM_DEPARTAMENTO),
    porCentroCusto: porDimensao((l) => l.centro_custo || '', SEM_CENTRO_CUSTO),
    curvaABC: calcularCurvaABC(porCategoria),
    mesAnterior: {
      periodo: mesAnterior(periodo),
      custoOperacao: ant.custo,
      variacao: calcularVariacao(custoOperacao, ant.custo, ant.temLancamentos),
    },
    ebitdaPelaIdentidade: roundCents(
      dre.receitaBruta - dre.impostosDeducoes - dre.custosFornecedores - dre.totalDespesasFixas,
    ),
    dre,
  }
}
