import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCompetencia } from '@/contexts/CompetenciaContext'
import { useRealtime } from '@/hooks/use-realtime'
import { useBensDepreciacao } from '@/hooks/useBensDepreciacao'
import { depreciacaoDoMes } from '@/lib/depreciacao'
import {
  getLancamentos,
  getContas,
  getCategorias,
  getConfiguracoes,
  registrarRealizacaoLancamento,
  getEmpresas,
  getPatrimonio,
} from '@/services/financial'
import { Lancamento, Conta, Categoria, Empresa, ItemPatrimonio } from '@/types/financial'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Wallet,
  TrendingUp,
  Scale,
  CreditCard,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  CheckCircle2,
  Target,
  Sparkles,
  ExternalLink,
  ChevronRight,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { hojeBrasil, diferencaDiasCivil } from '@/lib/dataCivil'
import {
  calcularAging,
  calcularProjecaoCaixaReal,
  calcularPatrimonioCompleto,
  filtrarLancamentosAbertos,
  calcularDRE,
  resolverGrupoDRE,
  obterNomeAtualCategoria,
  calcularValorEfetivoLancamento,
  roundCents,
} from '@/lib/financialCalculations'
import { gerarTextoInformativoPrevistosDRE } from '@/lib/apresentacaoLancamentos'

// Helper para formatar moeda brasileira
export function formatBRL(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

// Mini componente de linha SVG com gradiente (para sparklines de tendência)
const MiniSparkline: React.FC<{ data: number[]; color: 'green' | 'red' | 'blue' }> = ({
  data,
  color,
}) => {
  if (!data || data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const width = 110
  const height = 32

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width
    const y = height - ((val - min) / range) * (height - 8) - 4
    return `${x},${y}`
  })

  const pathD = `M ${points.join(' L ')}`
  const areaD = `${pathD} L ${width},${height} L 0,${height} Z`

  const strokeColor = color === 'green' ? '#10B981' : color === 'red' ? '#EF4444' : '#2563EB'
  const gradId = `spark-grad-${color}-${Math.random().toString(36).substring(2, 7)}`

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.22" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradId})`} />
      <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

// Gráfico de linha limpo para a projeção de liquidez (180 dias)
const LiquidityChart: React.FC<{
  data: Array<{ label: string; saldo: number }>
}> = ({ data }) => {
  if (!data || data.length === 0) return null

  const width = 360
  const height = 150
  const padLeft = 46
  const padRight = 16
  const padTop = 16
  const padBottom = 26

  const saldos = data.map((d) => d.saldo)
  const rawMin = Math.min(...saldos)
  const rawMax = Math.max(...saldos)

  // Escala ajustada aos dados:
  // Se todos forem <= 0, o limite superior é 0.
  // Se todos forem >= 0, o limite inferior é 0.
  // Se houver positivos e negativos, cruza o 0.
  let minVal = rawMin <= 0 ? (rawMax <= 0 ? rawMin : Math.min(0, rawMin)) : 0
  let maxVal = rawMax >= 0 ? (rawMin >= 0 ? rawMax : Math.max(0, rawMax)) : 0

  if (minVal === maxVal) {
    if (minVal < 0) maxVal = 0
    else if (minVal > 0) minVal = 0
    else maxVal = 1
  }
  const range = maxVal - minVal || 1

  const innerW = width - padLeft - padRight
  const innerH = height - padTop - padBottom

  // 5B-R2: Escala com passos redondos e rótulos redondos (1, 2, 2.5 ou 5 vezes 10^n)
  // 3 a 5 rótulos, estendendo a escala até o múltiplo redondo seguinte se necessário.
  // Regras aprovadas: todos <= 0 -> maxVal = 0; todos >= 0 -> minVal = 0; formato "-R$ 10.000".
  const calcularEscalaRedonda = (minimo: number, maximo: number) => {
    let span = Math.abs(maximo - minimo)
    if (span <= 0) span = 1

    // Queremos entre 3 e 4 intervalos (4 a 5 rótulos)
    const rawStep = span / 3
    const orderOfMagnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
    const fraction = rawStep / orderOfMagnitude

    let niceMultiplier = 1
    if (fraction <= 1.2) niceMultiplier = 1
    else if (fraction <= 2.2) niceMultiplier = 2
    else if (fraction <= 3.5) niceMultiplier = 2.5
    else if (fraction <= 7.5) niceMultiplier = 5
    else niceMultiplier = 10

    const step = niceMultiplier * orderOfMagnitude

    let adjustedMin = Math.floor(minimo / step) * step
    let adjustedMax = Math.ceil(maximo / step) * step

    // Se todos <= 0, o limite superior é 0
    if (maximo <= 0) {
      adjustedMax = 0
    }
    // Se todos >= 0, o limite inferior é 0
    if (minimo >= 0) {
      adjustedMin = 0
    }

    if (adjustedMin === adjustedMax) {
      if (adjustedMin < 0) adjustedMax = 0
      else if (adjustedMin > 0) adjustedMin = 0
      else adjustedMax = step
    }

    // Gera rótulos múltiplos exatos de step entre adjustedMin e adjustedMax
    const tickVals: number[] = []
    let curr = adjustedMin
    // Usar arredondamento de precisão para evitar floats estranhos (ex: 2.5 * 10^n)
    while (curr <= adjustedMax + step * 0.001) {
      tickVals.push(Math.round(curr))
      curr += step
    }

    return {
      adjMin: adjustedMin,
      adjMax: adjustedMax,
      step,
      tickVals,
    }
  }

  const { adjMin, adjMax, tickVals } = calcularEscalaRedonda(minVal, maxVal)
  const rangeAjustado = adjMax - adjMin || 1

  const points = data.map((d, i) => {
    const x = padLeft + (i / (data.length - 1)) * innerW
    const y = padTop + innerH - ((d.saldo - adjMin) / rangeAjustado) * innerH
    return { x, y, ...d }
  })

  const lineD = `M ${points.map((p) => `${p.x},${p.y}`).join(' L ')}`
  const areaD = `${lineD} L ${padLeft + innerW},${padTop + innerH} L ${padLeft},${padTop + innerH} Z`

  const ticks = tickVals.map((val) => {
    const y = padTop + innerH - ((val - adjMin) / rangeAjustado) * innerH
    return { val, y }
  })

  const formatarRotuloGrafico = (val: number): string => {
    const arredondado = Math.round(val)
    if (arredondado === 0) return 'R$ 0'
    const sinal = arredondado < 0 ? '-' : ''
    const absVal = Math.abs(arredondado)
    const formatted = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(absVal)
    return `${sinal}R$ ${formatted}`
  }

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible select-none"
      >
        <defs>
          <linearGradient id="liquidity-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Grid lines sutis */}
        {ticks.map((t, idx) => (
          <g key={idx}>
            <line
              x1={padLeft}
              y1={t.y}
              x2={padLeft + innerW}
              y2={t.y}
              stroke="#F1F5F9"
              strokeWidth="1"
            />
            <text
              x={padLeft - 6}
              y={t.y + 3}
              textAnchor="end"
              fontSize="9"
              fill="#94A3B8"
              className="font-mono font-medium"
            >
              {formatarRotuloGrafico(t.val)}
            </text>
          </g>
        ))}

        {/* Linha zero se estiver visível */}
        {adjMin < 0 && adjMax > 0 && (
          <line
            x1={padLeft}
            y1={padTop + innerH - ((0 - adjMin) / rangeAjustado) * innerH}
            x2={padLeft + innerW}
            y2={padTop + innerH - ((0 - adjMin) / rangeAjustado) * innerH}
            stroke="#CBD5E1"
            strokeDasharray="3 3"
            strokeWidth="1"
          />
        )}

        {/* Área e Linha */}
        <path d={areaD} fill="url(#liquidity-area-grad)" />
        <path
          d={lineD}
          fill="none"
          stroke="#2563EB"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Pontos de dados */}
        {points.map((p, idx) => (
          <g key={idx}>
            <circle cx={p.x} cy={p.y} r="3.5" fill="#FFFFFF" stroke="#2563EB" strokeWidth="2" />
            <text
              x={p.x}
              y={height - 8}
              textAnchor="middle"
              fontSize="9"
              fill="#64748B"
              className="font-medium"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-blue-600 font-medium mt-1">
        <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
        <span>Saldo projetado</span>
      </div>
    </div>
  )
}

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const { competencia, competenciaFormatada } = useCompetencia()
  const { toast } = useToast()

  const [todosLancamentos, setTodosLancamentos] = useState<Lancamento[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [config, setConfig] = useState<Record<string, string>>({})
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [itensPatrimonio, setItensPatrimonio] = useState<ItemPatrimonio[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros superiores
  const [empresaFiltro, setEmpresaFiltro] = useState<string>('todas')

  // Modal para liquidar/marcar como realizado
  const [realizarItem, setRealizarItem] = useState<Lancamento | null>(null)
  const [dataRealizacao, setDataRealizacao] = useState(() => hojeBrasil())
  const [liquidando, setLiquidando] = useState(false)

  const carregarDashboard = async () => {
    setLoading(true)
    try {
      const [lancs, cts, cfgs, emps, pats, cats] = await Promise.all([
        getLancamentos(),
        getContas(),
        getConfiguracoes(),
        getEmpresas(),
        getPatrimonio(),
        getCategorias(),
      ])
      setTodosLancamentos(lancs)
      setContas(cts)
      setConfig(cfgs)
      setEmpresas(emps)
      setItensPatrimonio(pats)
      setCategorias(cats)
    } catch (e) {
      console.error('Erro ao carregar dados do dashboard:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDashboard()
  }, [competencia])

  useRealtime('lancamentos', () => {
    carregarDashboard()
  })
  useRealtime('categorias', () => {
    carregarDashboard()
  })

  // Metas do sistema
  const metaEbitda = parseFloat(config['meta_ebitda'] || '20')

  // Filtragem por empresa selecionada (se não for "todas")
  const lancamentosFiltradosEmpresa = useMemo(() => {
    if (empresaFiltro === 'todas') return todosLancamentos
    return todosLancamentos.filter((l) => l.empresa_id === empresaFiltro)
  }, [todosLancamentos, empresaFiltro])

  const contasFiltradasEmpresa = useMemo(() => {
    if (empresaFiltro === 'todas') return contas
    return contas.filter((c) => !c.empresa_id || c.empresa_id === empresaFiltro)
  }, [contas, empresaFiltro])

  const itensPatrimonioFiltrados = useMemo(() => {
    if (empresaFiltro === 'todas') return itensPatrimonio
    return itensPatrimonio.filter((p) => !p.empresa_id || p.empresa_id === empresaFiltro)
  }, [itensPatrimonio, empresaFiltro])

  // CÁLCULOS PRINCIPAIS
  // 1. Visão Financeira:
  // - Caixa: saldo inicial das contas + todos os lançamentos realizados no histórico
  const saldoInicialContas = contasFiltradasEmpresa.reduce(
    (acc, c) => acc + (c.saldo_inicial || 0),
    0,
  )
  const historicoRealizado = lancamentosFiltradosEmpresa.filter((l) => l.status === 'realizado')

  const somaReceitasRealizadasHistorico = historicoRealizado
    .filter((l) => l.tipo === 'receita')
    .reduce((acc, l) => roundCents(acc + calcularValorEfetivoLancamento(l)), 0)

  const somaDespesasRealizadasHistorico = historicoRealizado
    .filter((l) => l.tipo === 'despesa')
    .reduce((acc, l) => roundCents(acc + calcularValorEfetivoLancamento(l)), 0)

  const caixaAtual = roundCents(
    saldoInicialContas + somaReceitasRealizadasHistorico - somaDespesasRealizadasHistorico,
  )

  // - Lançamentos da Competência Atual
  const lancsDoMes = lancamentosFiltradosEmpresa.filter((l) => l.competencia === competencia)
  const lancsDoMesRealizados = lancsDoMes.filter((l) => l.status === 'realizado')

  const receitasDoMes = lancsDoMesRealizados
    .filter((l) => l.tipo === 'receita')
    .reduce((acc, l) => roundCents(acc + calcularValorEfetivoLancamento(l)), 0)

  const despesasDoMes = lancsDoMesRealizados
    .filter((l) => l.tipo === 'despesa')
    .reduce((acc, l) => roundCents(acc + calcularValorEfetivoLancamento(l)), 0)

  const resultadoDoMes = roundCents(receitasDoMes - despesasDoMes)

  // Lançamentos efetivamente abertos (protegidos contra itens que já possuem liquidação registrada)
  const despesasAbertas = useMemo(() => {
    return filtrarLancamentosAbertos(lancamentosFiltradosEmpresa, 'despesa')
  }, [lancamentosFiltradosEmpresa])

  const receitasAbertas = useMemo(() => {
    return filtrarLancamentosAbertos(lancamentosFiltradosEmpresa, 'receita')
  }, [lancamentosFiltradosEmpresa])

  // - Dívida ativa: despesas previstas pendentes reais (sem dupla contagem de liquidadas)
  const dividaTotal = despesasAbertas.reduce(
    (acc, l) => roundCents(acc + calcularValorEfetivoLancamento(l)),
    0,
  )

  // - Contas a receber pendentes reais
  const aReceberTotalPendente = receitasAbertas.reduce(
    (acc, l) => roundCents(acc + calcularValorEfetivoLancamento(l)),
    0,
  )

  // Balanço e Patrimônio Completo:
  // Ativos (Caixa + Recebíveis + Imóveis/Veículos/Aplicações cadastrados) - Passivos (Dívidas + Financiamentos/Empréstimos cadastrados)
  const balancoPatrimonial = useMemo(() => {
    return calcularPatrimonioCompleto(
      caixaAtual,
      aReceberTotalPendente,
      dividaTotal,
      itensPatrimonioFiltrados.map((p) => ({
        tipo: p.tipo,
        categoria: p.categoria,
        valor: p.valor,
      })),
    )
  }, [caixaAtual, aReceberTotalPendente, dividaTotal, itensPatrimonioFiltrados])

  const patrimonioLiquido = balancoPatrimonial.patrimonioLiquidoEmpresarial

  // Tendências dos últimos 6 meses para os mini sparklines
  const sparklineData = useMemo(() => {
    const mesesMap: { [mes: string]: { receitas: number; despesas: number } } = {}
    const hoje = new Date()
    const mesesChaves: string[] = []

    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      mesesChaves.push(k)
      mesesMap[k] = { receitas: 0, despesas: 0 }
    }

    lancamentosFiltradosEmpresa.forEach((l) => {
      if (l.status === 'realizado' && mesesMap[l.competencia]) {
        const vEfetivo = calcularValorEfetivoLancamento(l)
        if (l.tipo === 'receita')
          mesesMap[l.competencia].receitas = roundCents(mesesMap[l.competencia].receitas + vEfetivo)
        if (l.tipo === 'despesa')
          mesesMap[l.competencia].despesas = roundCents(mesesMap[l.competencia].despesas + vEfetivo)
      }
    })

    const seriesResultado = mesesChaves.map((k) =>
      roundCents(mesesMap[k].receitas - mesesMap[k].despesas),
    )
    const seriesReceita = mesesChaves.map((k) => mesesMap[k].receitas)
    const seriesDespesa = mesesChaves.map((k) => mesesMap[k].despesas)

    return { seriesResultado, seriesReceita, seriesDespesa }
  }, [lancamentosFiltradosEmpresa])

  // 2. LIQUIDEZ E AGING (com aritmética exata em centavos via calcularAging sobre títulos abertos)
  const agingReceber = useMemo(() => {
    return calcularAging(receitasAbertas, 'receita')
  }, [receitasAbertas])

  const agingPagar = useMemo(() => {
    return calcularAging(despesasAbertas, 'despesa')
  }, [despesasAbertas])

  // Horizontes de Projeção de Fluxo de Caixa REAL baseada em vencimentos:
  // Saldo inicial real + recebimentos previstos por vencimento − pagamentos previstos por vencimento
  const projecaoCaixaReal = useMemo(() => {
    return calcularProjecaoCaixaReal(caixaAtual, lancamentosFiltradosEmpresa, hojeBrasil())
  }, [caixaAtual, lancamentosFiltradosEmpresa])

  const horizontesProjecao = useMemo(() => {
    return {
      itens: projecaoCaixaReal.itens.map((i) => ({
        label: i.label,
        dias: i.dias,
        saldoInicial: i.saldoInicial,
        entradas: i.recebimentosPrevistos,
        saidas: i.pagamentosPrevistos,
        saldoProjetado: i.saldoProjetado,
        detalhe: i.detalhe,
      })),
      menorSaldo: projecaoCaixaReal.menorSaldo,
      itemMenor: projecaoCaixaReal.itemMenor,
    }
  }, [projecaoCaixaReal])

  // Dados para o gráfico da seção 2
  const dadosGraficoLiquidez = useMemo(() => {
    return projecaoCaixaReal.itens.map((h) => ({
      label: h.label,
      saldo: h.saldoProjetado,
    }))
  }, [projecaoCaixaReal])

  const dataReferencia180Dias = projecaoCaixaReal.dataReferencia180Dias

  // 3. PERFORMANCE E DRE RESUMIDA (calculada com a função central calcularDRE por competência)
  const lancamentosMesParaDRE = useMemo(() => {
    return lancamentosFiltradosEmpresa
      .filter((l) => l.competencia === competencia)
      .map((l) => ({
        ...l,
        grupo_dre: resolverGrupoDRE(
          {
            tipo: l.tipo,
            categoria: l.categoria,
            categoria_id: l.categoria_id,
            grupo_dre: l.expand?.categoria_id?.grupo_dre,
          },
          categorias,
        ),
      }))
  }, [lancamentosFiltradosEmpresa, competencia, categorias])

  const { bens: bensDepreciacao } = useBensDepreciacao()
  const depreciacaoMes = useMemo(
    () => depreciacaoDoMes(bensDepreciacao, competencia),
    [bensDepreciacao, competencia],
  )

  const dreResumida = useMemo(() => {
    const dreCalculada = calcularDRE(lancamentosMesParaDRE, 'competencia', depreciacaoMes)
    const margemBruta =
      dreCalculada.receitaLiquida > 0
        ? (dreCalculada.margemContribuicao / dreCalculada.receitaLiquida) * 100
        : 0

    return {
      receitaBruta: dreCalculada.receitaBruta,
      deducoes: dreCalculada.impostosDeducoes,
      receitaLiquida: dreCalculada.receitaLiquida,
      custos: dreCalculada.custosFornecedores,
      despesasOp: dreCalculada.totalDespesasFixas,
      ebitda: dreCalculada.ebitda,
      margemEbitda: dreCalculada.margemEbitda,
      margemBruta,
      margemLiquida: dreCalculada.margemLiquida,
      investimentos: dreCalculada.investimentos,
      resultadoLiquido: dreCalculada.resultadoLiquido,
    }
  }, [lancamentosMesParaDRE, depreciacaoMes])

  // Linha informativa de previstos na DRE Resumida (FIN-05)
  const textoPrevistosDREResumida = useMemo(() => {
    return gerarTextoInformativoPrevistosDRE(lancamentosMesParaDRE)
  }, [lancamentosMesParaDRE])

  // Capital disponível: Caixa - Contas a pagar pendentes
  const capitalDisponivel = caixaAtual - dividaTotal

  // Estimado a receber do mês (receitas abertas na competência)
  const estimadoAReceberMes = receitasAbertas
    .filter((l) => l.competencia === competencia)
    .reduce((acc, l) => roundCents(acc + calcularValorEfetivoLancamento(l)), 0)

  // Total de recebíveis em atraso (> 0 dias de atraso)
  const recebiveisAtrasadosTotal =
    agingReceber.ate30 + agingReceber.ate60 + agingReceber.ate90 + agingReceber.mais90
  const recebiveisAtrasadosCount = receitasAbertas.filter((l) => {
    if (l.data_vencimento) {
      const hoje = hojeBrasil()
      const vCivil = l.data_vencimento.slice(0, 10)
      return vCivil < hoje
    }
    return false
  }).length

  // 4. ALERTAS DE PENDÊNCIAS (apenas títulos efetivamente abertos)
  const alertasPendencias = useMemo(() => {
    const hoje = hojeBrasil()

    const lista: Array<{
      item: Lancamento
      tipoAlerta: 'vencido_critico' | 'vencido' | 'a_vencer' | 'sem_data'
      titulo: string
      descricao: string
      dias: number
    }> = []

    const abertos = [...receitasAbertas, ...despesasAbertas]

    abertos.forEach((l) => {
      const lancOriginal = lancamentosFiltradosEmpresa.find((orig) => orig.id === l.id)
      if (!lancOriginal) return

      if (!lancOriginal.data_vencimento) {
        lista.push({
          item: lancOriginal,
          tipoAlerta: 'sem_data',
          titulo: 'Lançamento sem data de vencimento',
          descricao: `${lancOriginal.descricao} (${formatBRL(lancOriginal.valor)})`,
          dias: 0,
        })
        return
      }

      const vCivil = lancOriginal.data_vencimento.slice(0, 10)
      // diferencaDiasCivil(hoje, vCivil): positivo se hoje > vencimento (atrasado)
      const diff = diferencaDiasCivil(hoje, vCivil)

      if (diff > 30) {
        lista.push({
          item: lancOriginal,
          tipoAlerta: 'vencido_critico',
          titulo:
            lancOriginal.tipo === 'receita'
              ? 'Recebimento Crítico em Atraso (+30 dias)'
              : 'Pagamento Crítico Atrasado (+30 dias)',
          descricao: `${lancOriginal.descricao} — ${formatBRL(lancOriginal.valor)}`,
          dias: diff,
        })
      } else if (diff > 0) {
        lista.push({
          item: lancOriginal,
          tipoAlerta: 'vencido',
          titulo:
            lancOriginal.tipo === 'receita'
              ? `Recebimento atrasado há ${diff} dia(s)`
              : `Pagamento atrasado há ${diff} dia(s)`,
          descricao: `${lancOriginal.descricao} — ${formatBRL(lancOriginal.valor)}`,
          dias: diff,
        })
      } else if (diff >= -7) {
        lista.push({
          item: lancOriginal,
          tipoAlerta: 'a_vencer',
          titulo:
            lancOriginal.tipo === 'receita'
              ? `Recebimento vence em ${Math.abs(diff)} dia(s)`
              : `Pagamento vence em ${Math.abs(diff)} dia(s)`,
          descricao: `${lancOriginal.descricao} — ${formatBRL(lancOriginal.valor)}`,
          dias: Math.abs(diff),
        })
      }
    })

    // Mais críticos primeiro
    return lista.sort((a, b) => {
      const prioridade = { vencido_critico: 1, vencido: 2, a_vencer: 3, sem_data: 4 }
      return prioridade[a.tipoAlerta] - prioridade[b.tipoAlerta]
    })
  }, [lancamentosFiltradosEmpresa, receitasAbertas, despesasAbertas])

  const handleMarcarComoRealizado = async () => {
    if (!realizarItem) return
    const hoje = hojeBrasil()
    const dataRealCivil = dataRealizacao ? dataRealizacao.slice(0, 10) : ''
    if (!dataRealCivil) {
      toast({
        variant: 'destructive',
        title: 'Erro de validação',
        description:
          'Operação negada: a data de realização é obrigatória para lançamentos com status "Realizado".',
      })
      return
    }
    if (dataRealCivil > hoje) {
      toast({
        variant: 'destructive',
        title: 'Erro de validação',
        description:
          'Lançamento realizado não pode ter data futura. Para valores futuros, use o status Previsto.',
      })
      return
    }

    setLiquidando(true)
    try {
      await registrarRealizacaoLancamento(realizarItem, dataRealizacao)
      toast({
        title: 'Movimento realizado!',
        description: 'Lançamento liquidado e incorporado ao caixa do sistema.',
      })
      setRealizarItem(null)
      carregarDashboard()
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao liquidar',
        description: e?.data?.message || e?.message || 'Falha ao marcar lançamento como realizado.',
      })
    } finally {
      setLiquidando(false)
    }
  }

  return (
    <div className="space-y-12 animate-fade-in pb-20 w-full mx-auto">
      {/* =========================================================================
          TOPO: TÍTULO DA PÁGINA + BOTÃO NOVO MOVIMENTO (IDÊNTICO À REFERÊNCIA)
          ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl md:text-[28px] font-semibold text-slate-900 tracking-tight">
            Painel Executivo
          </h1>
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200/80 text-[11px] font-medium px-2.5 py-0.5 rounded-full">
            <Sparkles className="w-3 h-3 text-blue-600" />
            Ao Vivo
          </span>
        </div>
        <Button
          onClick={() => navigate('/lancamentos')}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs md:text-sm h-10 px-4 rounded-xl shadow-xs transition-colors self-start sm:self-auto"
        >
          + Novo movimento
        </Button>
      </div>

      {/* =========================================================================
          BARRA DE FILTROS FIXA / TOPO (EMPRESA, PERÍODO, COMPETÊNCIA)
          ========================================================================= */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Seletor Empresa ou Grupo (estilo limpo do print) */}
            <div className="flex flex-col gap-1 min-w-[240px]">
              <span className="text-[11px] font-medium text-slate-500">Empresa ou grupo</span>
              <div className="relative">
                <select
                  value={empresaFiltro}
                  onChange={(e) => setEmpresaFiltro(e.target.value)}
                  className="w-full appearance-none bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3.5 py-2 text-xs md:text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer pr-8 transition-colors"
                >
                  <option value="todas">Todas as empresas (Visão Consolidada)</option>
                  {empresas.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nome} {emp.padrao ? '(Padrão)' : ''}
                    </option>
                  ))}
                  {empresas.length === 0 && <option value="matriz">Matriz Operacional</option>}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Chip da Competência Atual */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-500">Competência ativa</span>
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200/80 text-blue-700 px-3.5 py-2 rounded-xl text-xs md:text-sm font-medium shadow-2xs">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span className="capitalize">{competenciaFormatada}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse ml-0.5" />
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-400 font-normal lg:self-end pb-2 flex items-center gap-2">
            <span>{empresas.length || 1} empresa(s) cadastrada(s)</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/configuracoes')}
              className="text-[11px] text-blue-600 hover:text-blue-700 h-6 px-1.5"
            >
              Gerenciar
            </Button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SEÇÃO 1: VISÃO FINANCEIRA
          Título grande estilo capítulo, subtítulo curto em cinza, 4 cards em linha
          ========================================================================= */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl md:text-[22px] font-medium text-slate-900 tracking-tight">
            1. Visão financeira
          </h2>
          <p className="text-xs md:text-sm text-slate-500 mt-1 font-normal">
            Liquidez, resultado, patrimônio e endividamento do grupo.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Caixa disponível */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between min-h-[140px]">
            <div>
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-normal text-slate-600">Caixa disponível</span>
                <Wallet className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-2xl lg:text-[26px] font-semibold text-slate-900 tabular-nums mt-3 tracking-tight">
                {caixaAtual === 0 ? 'R$ 0,00' : formatBRL(caixaAtual)}
              </div>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-normal">
              <span>Saldo das contas ativas</span>
              <MiniSparkline data={sparklineData.seriesReceita} color="green" />
            </div>
          </div>

          {/* Card 2: Fluxo de caixa do mês (FIN-01) */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between min-h-[140px]">
            <div>
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-normal text-slate-600">Fluxo de caixa do mês</span>
                <TrendingUp className="w-4 h-4 text-slate-400" />
              </div>
              <div
                className={cn(
                  'text-2xl lg:text-[26px] font-semibold tabular-nums mt-3 tracking-tight',
                  resultadoDoMes > 0
                    ? 'text-emerald-600'
                    : resultadoDoMes < 0
                      ? 'text-rose-600'
                      : 'text-slate-900',
                )}
              >
                {resultadoDoMes === 0 ? '—' : formatBRL(resultadoDoMes)}
              </div>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-normal">
              <span>Entradas menos saídas realizadas (inclui investimentos)</span>
              <MiniSparkline
                data={sparklineData.seriesResultado}
                color={resultadoDoMes >= 0 ? 'green' : 'red'}
              />
            </div>
          </div>

          {/* Card 3: Patrimônio Líquido Empresarial Completo */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between min-h-[140px]">
            <div>
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-normal text-slate-600">Patrimônio Líquido</span>
                <Scale className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-2xl lg:text-[26px] font-semibold text-slate-900 tabular-nums mt-3 tracking-tight">
                {patrimonioLiquido === 0 ? '—' : formatBRL(patrimonioLiquido)}
              </div>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-normal">
              <span title="Ativos empresariais menos passivos exigíveis">
                Ativos − Passivos (Balanço)
              </span>
              <MiniSparkline data={sparklineData.seriesReceita} color="blue" />
            </div>
          </div>

          {/* Card 4: Dívida ativa */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between min-h-[140px]">
            <div>
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-normal text-slate-600">Dívida ativa</span>
                <CreditCard className="w-4 h-4 text-slate-400" />
              </div>
              <div
                className={cn(
                  'text-2xl lg:text-[26px] font-semibold tabular-nums mt-3 tracking-tight',
                  dividaTotal > 0 ? 'text-rose-600' : 'text-slate-900',
                )}
              >
                {dividaTotal === 0 ? '—' : formatBRL(dividaTotal)}
              </div>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-normal">
              <span>Obrigações pendentes</span>
              <MiniSparkline data={sparklineData.seriesDespesa} color="red" />
            </div>
          </div>
        </div>

        {/* Linha auxiliar: Posição Financeira Simplificada + Ativos/Passivos Cadastrados */}
        <div className="bg-slate-50/80 border border-slate-200/70 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-700">Posição Financeira Simplificada:</span>
            <span className="font-semibold text-slate-900">
              {formatBRL(balancoPatrimonial.posicaoFinanceiraSimplificada)}
            </span>
            <span className="text-[11px] text-slate-400">
              (Caixa + Receber Pendente {formatBRL(aReceberTotalPendente)} − Pagar Pendente{' '}
              {formatBRL(dividaTotal)})
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span>
              Ativos Fixos/Aplicações:{' '}
              <strong className="text-slate-700">
                {formatBRL(balancoPatrimonial.totalAtivosCadastrados)}
              </strong>
            </span>
            <span>•</span>
            <span>
              Passivos/Empréstimos LP:{' '}
              <strong className="text-slate-700">
                {formatBRL(balancoPatrimonial.totalPassivosCadastrados)}
              </strong>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/configuracoes')}
              className="h-6 text-[11px] px-2 rounded-lg bg-white"
            >
              Gerenciar Patrimônio
            </Button>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SEÇÃO 2: LIQUIDEZ E PROJEÇÃO DE FLUXO DE CAIXA REAL POR VENCIMENTOS
          Saldo inicial real + recebimentos previstos por vencimento − pagamentos previstos por vencimento
          ========================================================================= */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xl md:text-[22px] font-medium text-slate-900 tracking-tight flex items-center gap-2">
              2. Liquidez & Fluxo de Caixa Projetado
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Por Vencimento Real
              </span>
            </h2>
            <p className="text-xs md:text-sm text-slate-500 mt-1 font-normal">
              Saldo inicial real + recebimentos por data de vencimento − pagamentos por data de
              vencimento.
            </p>
          </div>
        </div>

        {/* Tabela de horizontes + Card do gráfico de projeção em 180 dias */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Tabela de Horizontes (7 colunas lg) */}
          <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-normal text-[11px]">
                    <th className="py-2.5 px-3 font-medium text-slate-600">Horizonte</th>
                    <th className="py-2.5 px-3 text-right font-medium text-slate-600">
                      Saldo inicial
                    </th>
                    <th className="py-2.5 px-3 text-right font-medium text-slate-600">
                      Prev. Entradas
                    </th>
                    <th className="py-2.5 px-3 text-right font-medium text-slate-600">
                      Prev. Saídas
                    </th>
                    <th className="py-2.5 px-3 text-right font-medium text-slate-900">
                      Saldo projetado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {horizontesProjecao.itens.map((h) => (
                    <tr key={h.label} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800">{h.label}</div>
                        <div className="text-[10px] text-slate-400 font-normal">{h.detalhe}</div>
                      </td>
                      <td className="py-3 px-3 text-right text-slate-500 tabular-nums font-normal">
                        {formatBRL(h.saldoInicial)}
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-600 tabular-nums font-semibold">
                        {formatBRL(h.entradas)}
                      </td>
                      <td className="py-3 px-3 text-right text-rose-600 tabular-nums font-semibold">
                        {formatBRL(h.saidas)}
                      </td>
                      <td
                        className={cn(
                          'py-3 px-3 text-right tabular-nums font-bold text-sm',
                          h.saldoProjetado >= 0 ? 'text-slate-900' : 'text-rose-600',
                        )}
                      >
                        {formatBRL(h.saldoProjetado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Rodapé explicativo do modelo por vencimento */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-normal">
              <span>Projeção calculada a partir de vencimentos e contratos previstos</span>
              <span className="text-slate-500 font-medium">100% auditável</span>
            </div>
          </div>

          {/* Card Maior necessidade de caixa · 180 dias + Gráfico de linha (5 colunas lg) */}
          <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
            <div>
              <p className="text-xs font-normal text-slate-600">
                Ponto de maior atenção de caixa · 180 dias
              </p>
              <p className="text-2xl lg:text-[26px] font-semibold text-slate-900 tabular-nums mt-1.5 tracking-tight">
                {formatBRL(horizontesProjecao.menorSaldo)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5 font-normal">
                Menor saldo projetado por vencimento até {dataReferencia180Dias}
              </p>
            </div>

            <div className="mt-4 pt-2">
              <LiquidityChart data={dadosGraficoLiquidez} />
            </div>
          </div>
        </div>

        {/* Cards de Aging: Contas a receber e Contas a pagar lado a lado */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Aging Receber */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h4 className="text-sm font-medium text-slate-900">Contas a receber · aging</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Total pendente:{' '}
                  <strong className="text-emerald-600 font-semibold">
                    {formatBRL(agingReceber.total)}
                  </strong>
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/contas-a-receber')}
                className="text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 font-medium h-8 px-2.5 rounded-lg"
              >
                Ver tudo &rarr;
              </Button>
            </div>

            {agingReceber.total === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-1">
                <p className="text-xs font-semibold text-slate-700">
                  Nenhuma conta a receber em aberto
                </p>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  As faixas de atraso aparecem quando houver obrigações aprovadas e pendentes.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 pt-1">
                {[
                  {
                    label: 'A Vencer',
                    val: agingReceber.aVencer,
                    bar: 'bg-emerald-500',
                    text: 'text-emerald-600',
                  },
                  {
                    label: '1 a 30 dias',
                    val: agingReceber.ate30,
                    bar: 'bg-amber-400',
                    text: 'text-amber-600',
                  },
                  {
                    label: '31 a 60 dias',
                    val: agingReceber.ate60,
                    bar: 'bg-amber-500',
                    text: 'text-amber-600',
                  },
                  {
                    label: '61 a 90 dias',
                    val: agingReceber.ate90,
                    bar: 'bg-orange-500',
                    text: 'text-orange-600',
                  },
                  {
                    label: '91+ dias',
                    val: agingReceber.mais90,
                    bar: 'bg-rose-500',
                    text: 'text-rose-600',
                  },
                ].map((f) => {
                  const perc = agingReceber.total > 0 ? (f.val / agingReceber.total) * 100 : 0
                  return (
                    <div key={f.label} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600 font-medium">{f.label}</span>
                        <span className={cn('font-semibold tabular-nums', f.text)}>
                          {formatBRL(f.val)} ({perc.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all duration-500', f.bar)}
                          style={{ width: `${perc}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Aging Pagar */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h4 className="text-sm font-medium text-slate-900">Contas a pagar · aging</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Total pendente:{' '}
                  <strong className="text-rose-600 font-semibold">
                    {formatBRL(agingPagar.total)}
                  </strong>
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/contas-a-pagar')}
                className="text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 font-medium h-8 px-2.5 rounded-lg"
              >
                Ver tudo &rarr;
              </Button>
            </div>

            {agingPagar.total === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-1">
                <p className="text-xs font-semibold text-slate-700">
                  Nenhuma conta a pagar em aberto
                </p>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  As faixas de atraso aparecem quando houver obrigações aprovadas e pendentes.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 pt-1">
                {[
                  {
                    label: 'A Vencer',
                    val: agingPagar.aVencer,
                    bar: 'bg-emerald-500',
                    text: 'text-emerald-600',
                  },
                  {
                    label: '1 a 30 dias',
                    val: agingPagar.ate30,
                    bar: 'bg-amber-400',
                    text: 'text-amber-600',
                  },
                  {
                    label: '31 a 60 dias',
                    val: agingPagar.ate60,
                    bar: 'bg-amber-500',
                    text: 'text-amber-600',
                  },
                  {
                    label: '61 a 90 dias',
                    val: agingPagar.ate90,
                    bar: 'bg-orange-500',
                    text: 'text-orange-600',
                  },
                  {
                    label: '91+ dias',
                    val: agingPagar.mais90,
                    bar: 'bg-rose-500',
                    text: 'text-rose-600',
                  },
                ].map((f) => {
                  const perc = agingPagar.total > 0 ? (f.val / agingPagar.total) * 100 : 0
                  return (
                    <div key={f.label} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600 font-medium">{f.label}</span>
                        <span className={cn('font-semibold tabular-nums', f.text)}>
                          {formatBRL(f.val)} ({perc.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all duration-500', f.bar)}
                          style={{ width: `${perc}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* =========================================================================
          SEÇÃO 3: PERFORMANCE
          Título grande estilo capítulo, subtítulo curto em cinza.
          Cards de métricas em linha (Receita líquida, EBITDA gerencial, Margem bruta, Margem líquida)
          Seguidos de DRE Resumida e indicadores adicionais.
          ========================================================================= */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl md:text-[22px] font-medium text-slate-900 tracking-tight">
            3. Performance
          </h2>
          <p className="text-xs md:text-sm text-slate-500 mt-1 font-normal">
            DRE resumida, tendências e orçamento versus realizado no mês.
          </p>
        </div>

        {/* Linha de 4 cards de KPIs de performance (estilo da referência) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Receita líquida */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between min-h-[130px]">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-normal text-slate-600">Receita líquida</span>
              <ArrowUpRight className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl lg:text-[26px] font-semibold text-slate-900 tabular-nums mt-2 tracking-tight">
              {dreResumida.receitaLiquida === 0 ? '—' : formatBRL(dreResumida.receitaLiquida)}
            </div>
            <div className="text-[11px] text-slate-400 font-normal mt-2">
              Bruta menos deduções e impostos
            </div>
          </div>

          {/* EBITDA gerencial */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between min-h-[130px]">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-normal text-slate-600">EBITDA gerencial</span>
              <TrendingUp className="w-4 h-4 text-slate-400" />
            </div>
            <div
              className={cn(
                'text-2xl lg:text-[26px] font-semibold tabular-nums mt-2 tracking-tight',
                dreResumida.ebitda > 0
                  ? 'text-emerald-600'
                  : dreResumida.ebitda < 0
                    ? 'text-rose-600'
                    : 'text-slate-900',
              )}
            >
              {dreResumida.ebitda === 0 ? '—' : formatBRL(dreResumida.ebitda)}
            </div>
            <div className="text-[11px] text-slate-400 font-normal mt-2">
              Margem:{' '}
              {dreResumida.receitaLiquida > 0
                ? `${dreResumida.margemEbitda.toFixed(1).replace('.', ',')}%`
                : '—'}{' '}
              (Meta: {metaEbitda}%)
            </div>
          </div>

          {/* Margem bruta */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between min-h-[130px]">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-normal text-slate-600">Margem bruta</span>
              <Target className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl lg:text-[26px] font-semibold text-slate-900 tabular-nums mt-2 tracking-tight">
              {dreResumida.receitaLiquida > 0
                ? `${dreResumida.margemBruta.toFixed(1).replace('.', ',')}%`
                : '—'}
            </div>
            <div className="text-[11px] text-slate-400 font-normal mt-2">
              Após dedução dos custos operacionais
            </div>
          </div>

          {/* Margem líquida */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between min-h-[130px]">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-normal text-slate-600">Margem líquida</span>
              <Scale className="w-4 h-4 text-slate-400" />
            </div>
            <div
              className={cn(
                'text-2xl lg:text-[26px] font-semibold tabular-nums mt-2 tracking-tight',
                dreResumida.margemLiquida > 0
                  ? 'text-emerald-600'
                  : dreResumida.margemLiquida < 0
                    ? 'text-rose-600'
                    : 'text-slate-900',
              )}
            >
              {dreResumida.receitaLiquida > 0
                ? `${dreResumida.margemLiquida.toFixed(1).replace('.', ',')}%`
                : '—'}
            </div>
            <div className="text-[11px] text-slate-400 font-normal mt-2">
              Resultado final sobre receita
            </div>
          </div>
        </div>

        {/* Detalhamento: DRE Resumida + Indicadores Operacionais */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* DRE Resumida em tabela estruturada (7 colunas lg) */}
          <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-slate-900">DRE Resumida do Mês</h3>
                  <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                    Competência
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  por competência — inclui títulos previstos e realizados do período (
                  {competenciaFormatada})
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/relatorios')}
                className="text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 font-medium"
              >
                DRE Completo &rarr;
              </Button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-600 font-normal">(+) Receita bruta</span>
                <span className="font-semibold text-emerald-600 tabular-nums">
                  {formatBRL(dreResumida.receitaBruta)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-normal">(-) Deduções e impostos</span>
                <span className="text-rose-600 font-normal tabular-nums">
                  ({formatBRL(dreResumida.deducoes)})
                </span>
              </div>
              <div className="flex justify-between py-2 bg-slate-50 px-0 rounded-xl font-medium text-slate-800">
                <span>(=) Receita líquida</span>
                <span className="tabular-nums font-semibold">
                  {formatBRL(dreResumida.receitaLiquida)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-normal">(-) Custos operacionais</span>
                <span className="text-rose-600 font-normal tabular-nums">
                  ({formatBRL(dreResumida.custos)})
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-normal">(-) Despesas administrativas</span>
                <span className="text-rose-600 font-normal tabular-nums">
                  ({formatBRL(dreResumida.despesasOp)})
                </span>
              </div>
              <div className="flex justify-between py-2.5 bg-emerald-50/70 px-0 rounded-xl text-emerald-800 font-semibold">
                <span>(=) EBITDA Operacional</span>
                <span className="tabular-nums font-bold">{formatBRL(dreResumida.ebitda)}</span>
              </div>
              <div className="flex justify-between py-2.5 bg-blue-50/80 px-0 rounded-xl text-blue-900 font-bold">
                <span>(=) Resultado líquido do mês</span>
                <span
                  className={cn(
                    'tabular-nums font-extrabold',
                    dreResumida.resultadoLiquido >= 0 ? 'text-emerald-600' : 'text-rose-600',
                  )}
                >
                  {formatBRL(dreResumida.resultadoLiquido)}
                </span>
              </div>

              {/* Linha informativa sobre títulos previstos na DRE Resumida (FIN-05) */}
              {textoPrevistosDREResumida && (
                <div className="pt-2 text-[11px] text-slate-500 border-t border-slate-100 italic">
                  {textoPrevistosDREResumida}
                </div>
              )}
            </div>
          </div>

          {/* Cards adicionais de apoio (5 colunas lg) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Capital disponível */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
                <span className="text-[11px] font-normal text-slate-500 block">
                  Capital disponível
                </span>
                <p className="text-xl font-semibold text-slate-900 mt-2 tabular-nums">
                  {formatBRL(capitalDisponivel)}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">Caixa livre de obrigações</p>
              </div>

              {/* Estimado a receber */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
                <span className="text-[11px] font-normal text-slate-500 block">
                  Estimado a receber
                </span>
                <p className="text-xl font-semibold text-emerald-600 mt-2 tabular-nums">
                  {formatBRL(estimadoAReceberMes)}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">Previsto na competência</p>
              </div>

              {/* Atrasados */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-normal text-slate-500">Atrasados</span>
                  {recebiveisAtrasadosCount > 0 && (
                    <Badge className="bg-rose-100 text-rose-700 text-[10px] px-1.5 py-0 h-4 border-rose-200 font-normal">
                      {recebiveisAtrasadosCount} títulos
                    </Badge>
                  )}
                </div>
                <p className="text-xl font-semibold text-rose-600 mt-2 tabular-nums">
                  {formatBRL(recebiveisAtrasadosTotal)}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">Recebíveis vencidos</p>
              </div>

              {/* Investimentos / CapEx */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
                <span className="text-[11px] font-normal text-slate-500 block">Investimentos</span>
                <p className="text-xl font-semibold text-slate-900 mt-2 tabular-nums">
                  {formatBRL(dreResumida.investimentos)}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">CapEx no período</p>
              </div>
            </div>

            {/* Banner de atalho para DRE / Relatórios completos */}
            <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-100/80 rounded-2xl p-4.5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-900">Precisa da DRE detalhada?</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Consulte plano de contas, exportações em planilha e comparativo histórico.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/relatorios')}
                className="bg-white border-slate-200 text-blue-700 text-xs font-medium rounded-xl h-8 shrink-0 hover:bg-slate-50"
              >
                Abrir relatórios
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SEÇÃO 4: CENTRAL DE PENDÊNCIAS E ALERTAS
          Título grande estilo capítulo, subtítulo curto em cinza, cards limpos
          ========================================================================= */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl md:text-[22px] font-medium text-slate-900 tracking-tight">
              4. Pendências e alertas
            </h2>
            <p className="text-xs md:text-sm text-slate-500 mt-1 font-normal">
              Controle de vencimentos próximos, atrasos críticos e quitação rápida de lançamentos.
            </p>
          </div>
          <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs font-normal">
            {alertasPendencias.length} ativas
          </Badge>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
          {alertasPendencias.length === 0 ? (
            <div className="py-10 text-center text-slate-400 space-y-1">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto opacity-80" />
              <p className="text-xs font-semibold text-slate-700 mt-2">Tudo em dia!</p>
              <p className="text-[11px] text-slate-400">
                Nenhum título em atraso crítico ou vencendo nos próximos dias.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {alertasPendencias.map(({ item, tipoAlerta, titulo, descricao, dias }) => {
                const isCritico = tipoAlerta === 'vencido_critico'
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors px-2 rounded-xl',
                      isCritico ? 'bg-rose-50/50' : 'hover:bg-slate-50/60',
                    )}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={cn(
                          'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5',
                          isCritico
                            ? 'bg-rose-100 text-rose-700'
                            : tipoAlerta === 'vencido'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-blue-100 text-blue-700',
                        )}
                      >
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-900 truncate">{titulo}</p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{descricao}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      <Button
                        size="sm"
                        onClick={() => {
                          setRealizarItem(item)
                          setDataRealizacao(hojeBrasil())
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3 rounded-xl font-medium"
                      >
                        Quitar movimento
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* =========================================================================
          MODAL DE CONFIRMAÇÃO DE REALIZAÇÃO / QUITAÇÃO
          ========================================================================= */}
      {realizarItem && (
        <Dialog open={!!realizarItem} onOpenChange={() => setRealizarItem(null)}>
          <DialogContent className="bg-white border-slate-200 text-slate-900 shadow-2xl rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg text-slate-900 font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Registrar realização financeira
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 font-normal">
                Este movimento passará a constar como realizado no fluxo de caixa e na DRE da
                empresa.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 space-y-1">
                <p className="font-semibold text-slate-800 text-sm">{realizarItem.descricao}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-500 font-normal">Valor a liquidar:</span>
                  <span className="text-emerald-600 font-bold text-sm">
                    {formatBRL(realizarItem.valor)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-normal">Tipo:</span>
                  <span className="capitalize font-medium text-slate-700">{realizarItem.tipo}</span>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-slate-700">
                  Data efetiva da realização / liquidação
                </Label>
                <Input
                  type="date"
                  value={dataRealizacao}
                  onChange={(e) => setDataRealizacao(e.target.value)}
                  className="bg-white border-slate-200 text-xs rounded-xl"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setRealizarItem(null)}
                className="border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl font-medium"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleMarcarComoRealizado}
                disabled={liquidando}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl"
              >
                {liquidando ? 'Gravando baixa...' : 'Confirmar liquidação'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
