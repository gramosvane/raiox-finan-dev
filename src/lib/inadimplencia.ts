// Análise de inadimplência (lote 14). Biblioteca PURA: sem rede e sem gravação. Não altera calcularDRE nem
// analiseOperacional. Usa a mesma seleção de lançamentos da DRE para a receita faturada do período.
//
// Definições:
// - Em aberto: receita do grupo receita_bruta, status previsto, SEM liquidação e não estornada.
// - Vencido: em aberto com data de vencimento anterior à data de referência (vence hoje NÃO é vencido).
//   Sem data de vencimento válida: não entra no vencido nem no a vencer (fica em "sem vencimento").
// - Índice do período (competência) = vencido em aberto da competência ÷ receita faturada da competência.
// - Recebimentos do mês: liquidações de receita com data de realização no mês; prazo e atraso médios são
//   ponderados por valor. Recebimentos diretos (sem previsto) não têm vencimento e ficam fora dos prazos.
import {
  calcularDRE,
  determinarGrupoDRE,
  roundCents,
  roundPercent,
  type LancamentoCalculo,
} from './financialCalculations'
import { periodoValido, selecionarPeriodo } from './analiseOperacional'

const dataCivil = (v?: string | null): string => {
  const t = String(v || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return ''
  const [a, m, d] = t.split('-').map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d))
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? t : ''
}

export const diasEntre = (de: string, ate: string): number => {
  const [a1, m1, d1] = de.split('-').map(Number)
  const [a2, m2, d2] = ate.split('-').map(Number)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000)
}

// Arredonda para 1 casa, com meio para longe do zero (simétrico para atrasos negativos = adiantamentos).
const arred1 = (v: number): number => (v < 0 ? -1 : 1) * (Math.round(Math.abs(v) * 10) / 10)

const ehReceitaBruta = (l: LancamentoCalculo) =>
  l.tipo === 'receita' && determinarGrupoDRE(l.tipo, l.categoria, l.grupo_dre) === 'receita_bruta'

export interface TituloEmAberto {
  id: string
  descricao: string
  categoria: string
  vencimento: string
  dias: number
  valor: number
}

export interface FaixaAtraso {
  faixa: '1 a 30 dias' | '31 a 60 dias' | '61 a 90 dias' | '91 dias ou mais'
  valor: number
  quantidade: number
}

export interface AnaliseInadimplencia {
  periodo: string
  referencia: string
  faturadoPeriodo: number
  /** Quantidade de lançamentos da competência (0 = sem dados). */
  lancamentosPeriodo: number
  vencidoPeriodo: number
  /** Percentual vencido ÷ faturado da competência; null quando o faturado não é positivo. */
  indicePeriodo: number | null
  panorama: {
    emAberto: number
    aVencer: number
    semVencimento: { valor: number; quantidade: number }
    vencido: number
    quantidadeVencida: number
    faixas: FaixaAtraso[]
    maioresAtrasos: TituloEmAberto[]
  }
  recebimentos: {
    totalConsiderado: number
    prazoMedioDias: number | null
    atrasoMedioDias: number | null
    recebidoEmAtraso: number
    percentualEmAtraso: number | null
    liquidacoesConsideradas: number
    liquidacoesSemDataUtilizavel: number
  }
}

const faixaDe = (dias: number): FaixaAtraso['faixa'] =>
  dias <= 30
    ? '1 a 30 dias'
    : dias <= 60
      ? '31 a 60 dias'
      : dias <= 90
        ? '61 a 90 dias'
        : '91 dias ou mais'

export function analisarInadimplencia(
  lancamentos: LancamentoCalculo[],
  periodo: string,
  referencia: string,
): AnaliseInadimplencia {
  const ref = dataCivil(referencia)
  const todos = (lancamentos || []).filter((l) => l && l.status !== 'estornado')
  const liquidados = new Set<string>()
  const comEstorno = new Set<string>()
  const porId = new Map<string, LancamentoCalculo>()
  for (const l of todos) {
    if (l.liquidacao_de) liquidados.add(l.liquidacao_de)
    if (l.estorno_de) comEstorno.add(l.estorno_de)
    if (l.id) porId.set(l.id, l)
  }

  const emAbertoTodos = todos.filter(
    (l) =>
      ehReceitaBruta(l) &&
      l.status === 'previsto' &&
      !l.estorno_de &&
      !(l.id && liquidados.has(l.id)),
  )

  // ---- período (competência) ----
  const sel = periodoValido(periodo) ? selecionarPeriodo(lancamentos, periodo, 'competencia') : []
  const faturado = calcularDRE(sel, 'competencia').receitaBruta
  const abertosDoPeriodo = sel.filter(
    (l) => ehReceitaBruta(l) && l.status === 'previsto' && !l.estorno_de,
  )
  let vencidoPeriodo = 0
  for (const l of abertosDoPeriodo) {
    const v = dataCivil(l.data_vencimento)
    if (ref && v && v < ref) vencidoPeriodo = roundCents(vencidoPeriodo + roundCents(l.valor))
  }

  // ---- panorama (todas as competências) ----
  let emAberto = 0
  let aVencer = 0
  let semV = { valor: 0, quantidade: 0 }
  let vencido = 0
  const faixasMap = new Map<FaixaAtraso['faixa'], FaixaAtraso>()
  const titulos: TituloEmAberto[] = []
  for (const l of emAbertoTodos) {
    const valor = roundCents(l.valor)
    emAberto = roundCents(emAberto + valor)
    const v = dataCivil(l.data_vencimento)
    if (!v || !ref) {
      semV = { valor: roundCents(semV.valor + valor), quantidade: semV.quantidade + 1 }
    } else if (v < ref) {
      const dias = diasEntre(v, ref)
      vencido = roundCents(vencido + valor)
      const nome = faixaDe(dias)
      const f = faixasMap.get(nome) || { faixa: nome, valor: 0, quantidade: 0 }
      f.valor = roundCents(f.valor + valor)
      f.quantidade += 1
      faixasMap.set(nome, f)
      titulos.push({
        id: l.id || '',
        descricao: (l as { descricao?: string }).descricao || '',
        categoria: l.categoria || '',
        vencimento: v,
        dias,
        valor,
      })
    } else {
      aVencer = roundCents(aVencer + valor)
    }
  }
  const ordemFaixas: FaixaAtraso['faixa'][] = [
    '1 a 30 dias',
    '31 a 60 dias',
    '61 a 90 dias',
    '91 dias ou mais',
  ]
  const faixas = ordemFaixas.map((n) => faixasMap.get(n) || { faixa: n, valor: 0, quantidade: 0 })
  const maiores = [...titulos]
    .sort((a, b) => b.valor - a.valor || b.dias - a.dias || a.id.localeCompare(b.id))
    .slice(0, 10)

  // ---- recebimentos do mês (liquidações de receita, pela data de realização) ----
  let total = 0
  let somaPrazo = 0
  let somaAtraso = 0
  let emAtraso = 0
  let consideradas = 0
  let semData = 0
  if (periodoValido(periodo)) {
    for (const l of todos) {
      if (!l.liquidacao_de || !ehReceitaBruta(l) || l.status !== 'realizado') continue
      if (l.id && comEstorno.has(l.id)) continue
      const real = dataCivil(l.data_realizacao)
      if (!real || real.slice(0, 7) !== periodo) continue
      const orig = porId.get(l.liquidacao_de)
      const venc = dataCivil(l.data_vencimento) || dataCivil(orig?.data_vencimento)
      const origLanc = (orig as { data_lancamento?: string } | undefined)?.data_lancamento
      const lLanc = (l as { data_lancamento?: string }).data_lancamento
      const lanc = dataCivil(origLanc) || dataCivil(lLanc)
      if (!venc || !lanc) {
        semData += 1
        continue
      }
      const valor = roundCents(l.valor)
      consideradas += 1
      total = roundCents(total + valor)
      somaPrazo += valor * diasEntre(lanc, real)
      const atraso = diasEntre(venc, real)
      somaAtraso += valor * atraso
      if (atraso > 0) emAtraso = roundCents(emAtraso + valor)
    }
  }

  return {
    periodo,
    referencia: ref,
    faturadoPeriodo: faturado,
    lancamentosPeriodo: sel.length,
    vencidoPeriodo,
    indicePeriodo: faturado > 0 ? roundPercent((vencidoPeriodo / faturado) * 100) : null,
    panorama: {
      emAberto,
      aVencer,
      semVencimento: semV,
      vencido,
      quantidadeVencida: titulos.length,
      faixas,
      maioresAtrasos: maiores,
    },
    recebimentos: {
      totalConsiderado: total,
      prazoMedioDias: total > 0 ? arred1(somaPrazo / total) : null,
      atrasoMedioDias: total > 0 ? arred1(somaAtraso / total) : null,
      recebidoEmAtraso: emAtraso,
      percentualEmAtraso: total > 0 ? roundPercent((emAtraso / total) * 100) : null,
      liquidacoesConsideradas: consideradas,
      liquidacoesSemDataUtilizavel: semData,
    },
  }
}
