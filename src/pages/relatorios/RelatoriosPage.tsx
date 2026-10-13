import React, { useState, useEffect, useMemo } from 'react'
import { useCompetencia } from '@/contexts/CompetenciaContext'
import { getLancamentos, getContas, getCategorias } from '@/services/financial'
import { Lancamento, Conta, Categoria } from '@/types/financial'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  FileSpreadsheet,
  Download,
  TrendingUp,
  Percent,
  BarChart3,
  Scale,
  DollarSign,
  PieChart,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
} from 'lucide-react'
import { formatBRL } from '@/pages/dashboard/DashboardPage'
import {
  calcularDRE,
  calcularIndicesLiquidez,
  calcularROI,
  roundCents,
  resolverGrupoDRE,
  calcularValorEfetivoLancamento,
  filtrarLancamentosAbertos,
} from '@/lib/financialCalculations'
import {
  montarLinhasDRECompleto,
  gerarTextoInformativoPrevistosDRE,
} from '@/lib/apresentacaoLancamentos'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

export const RelatoriosPage: React.FC = () => {
  const { competencia, competenciaFormatada, opcoesCompetencia } = useCompetencia()
  const { toast } = useToast()

  const [todosLancamentos, setTodosLancamentos] = useState<Lancamento[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)

  // Filtro de período do relatório: Mês Selecionado ou Acumulado do Ano
  const [tipoPeriodo, setTipoPeriodo] = useState<'mes' | 'ano'>('mes')
  const [relatorioAtivo, setRelatorioAtivo] = useState<
    'dre' | 'liquidez' | 'lucro' | 'faturamento' | 'roi' | 'ebitda'
  >('dre')

  const anoCompetencia = competencia ? competencia.split('-')[0] : String(new Date().getFullYear())

  useEffect(() => {
    const fetchDados = async () => {
      setLoading(true)
      try {
        const [lancs, cts, cats] = await Promise.all([
          getLancamentos(),
          getContas(),
          getCategorias(),
        ])
        setTodosLancamentos(lancs)
        setContas(cts)
        setCategorias(cats)
      } catch (e) {
        console.error('Erro ao buscar relatórios:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchDados()
  }, [])

  // Filtragem dos lançamentos pelo período
  const lancamentosFiltrados = useMemo(() => {
    return todosLancamentos.filter((l) => {
      if (tipoPeriodo === 'mes') {
        return l.competencia === competencia
      } else {
        return l.competencia.startsWith(anoCompetencia)
      }
    })
  }, [todosLancamentos, tipoPeriodo, competencia, anoCompetencia])

  // CÁLCULOS DRE COMPLETO (com classificação estrutural e aritmética em centavos)
  const dreData = useMemo(() => {
    const lancamentosComGrupo = lancamentosFiltrados.map((l) => ({
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
    return calcularDRE(lancamentosComGrupo)
  }, [lancamentosFiltrados, categorias])

  // CÁLCULOS DE LIQUIDEZ (com aritmética em centavos)
  const liquidezData = useMemo(() => {
    const saldoInicial = contas.reduce((acc, c) => roundCents(acc + (c.saldo_inicial || 0)), 0)
    const realizados = todosLancamentos.filter((l) => l.status === 'realizado')
    const recHist = realizados
      .filter((l) => l.tipo === 'receita')
      .reduce((a, b) => roundCents(a + calcularValorEfetivoLancamento(b)), 0)
    const despHist = realizados
      .filter((l) => l.tipo === 'despesa')
      .reduce((a, b) => roundCents(a + calcularValorEfetivoLancamento(b)), 0)
    const caixaTotal = roundCents(saldoInicial + recHist - despHist)

    const receitasAbertas = filtrarLancamentosAbertos(todosLancamentos, 'receita')
    const despesasAbertas = filtrarLancamentosAbertos(todosLancamentos, 'despesa')

    const contasReceberPendentes = roundCents(
      receitasAbertas.reduce((a, b) => roundCents(a + calcularValorEfetivoLancamento(b)), 0),
    )

    const contasPagarPendentes = roundCents(
      despesasAbertas.reduce((a, b) => roundCents(a + calcularValorEfetivoLancamento(b)), 0),
    )

    const indices = calcularIndicesLiquidez(
      caixaTotal,
      contasReceberPendentes,
      contasPagarPendentes,
    )

    return {
      caixaTotal,
      contasReceberPendentes,
      contasPagarPendentes,
      corrente: indices.liquidezCorrente,
      imediata: indices.liquidezImediata,
      seca: indices.liquidezSeca,
      aplicavel: indices.aplicavel,
    }
  }, [todosLancamentos, contas])

  // CÁLCULOS ROI (com validação e arredondamento em centavos)
  const roiData = useMemo(() => {
    const totalInvestimentos = dreData.investimentos
    const lucroLiquido = dreData.resultadoLiquido
    const { roiPercentual } = calcularROI(lucroLiquido, totalInvestimentos)

    return {
      totalInvestimentos,
      lucroLiquido,
      roiPercentual,
    }
  }, [dreData])

  // EVOLUÇÃO MENSAL (para gráficos e séries de 12 meses)
  const evolucaoMensal = useMemo(() => {
    const meses = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
    const nomesMeses = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ]

    return meses.map((m, idx) => {
      const compTarget = `${anoCompetencia}-${m}`
      const lancsMes = todosLancamentos.filter(
        (l) => l.competencia === compTarget && l.status === 'realizado',
      )

      const rec = lancsMes
        .filter((l) => l.tipo === 'receita')
        .reduce((a, b) => roundCents(a + calcularValorEfetivoLancamento(b)), 0)
      const desp = lancsMes
        .filter((l) => l.tipo === 'despesa')
        .reduce((a, b) => roundCents(a + calcularValorEfetivoLancamento(b)), 0)
      const lucro = roundCents(rec - desp)
      const margem = rec > 0 ? (lucro / rec) * 100 : 0

      return {
        mes: nomesMeses[idx],
        competencia: compTarget,
        receitas: rec,
        despesas: desp,
        lucro,
        margem,
      }
    })
  }, [todosLancamentos, anoCompetencia])

  // EXPORTAR CSV COMPATÍVEL COM EXCEL
  const exportarCSV = (nomeArquivo: string, linhas: Array<string[]>) => {
    const csvContent =
      '\uFEFF' +
      linhas
        .map((e) => e.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
        .join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `${nomeArquivo}_${competencia}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: 'Exportação Concluída',
      description: `Arquivo ${nomeArquivo}.csv gerado com sucesso.`,
    })
  }

  // Unificação de apresentação de tela e exportação CSV da DRE Completo (FIN-11 e UX-DRE-02)
  const estruturaDRECompleto = useMemo(() => {
    return montarLinhasDRECompleto(dreData, false)
  }, [dreData])

  // Linha informativa de previstos na DRE (FIN-05)
  const textoPrevistosDRE = useMemo(() => {
    return gerarTextoInformativoPrevistosDRE(lancamentosFiltrados)
  }, [lancamentosFiltrados])

  const handleExportarDRE = () => {
    const { linhasCsv } = montarLinhasDRECompleto(dreData, true)
    const cabecalho = [
      [
        'Demonstrativo de Resultado do Exercício (DRE)',
        `Período: ${tipoPeriodo === 'mes' ? competenciaFormatada : `Acumulado ${anoCompetencia}`}`,
      ],
      ['Conta / Descritivo Contábil', 'Valor (R$)', '% Receita Líquida'],
    ]
    const linhas = [...cabecalho, ...linhasCsv]
    exportarCSV('Relatorio_DRE_Contabil', linhas)
  }

  const relatoriosAbas = [
    { id: 'dre', label: 'DRE Completo', icon: FileSpreadsheet },
    { id: 'liquidez', label: 'Índices de Liquidez', icon: Scale },
    { id: 'lucro', label: 'Lucro e Margem', icon: TrendingUp },
    { id: 'faturamento', label: 'Faturamento Anual', icon: BarChart3 },
    { id: 'roi', label: 'ROI (Retorno)', icon: Percent },
    { id: 'ebitda', label: 'EBITDA & Evolução', icon: PieChart },
  ] as const

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Top Header dos Relatórios - Padrão Painel Executivo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div>
          <h1 className="text-2xl md:text-[28px] font-semibold text-slate-900 tracking-tight">
            Relatórios
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1 font-normal">
            Demonstrativos contábeis, índices de solvência e rentabilidade calculados em tempo real.
          </p>
        </div>

        {/* Seletor de Período */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 self-start sm:self-auto">
          <Button
            size="sm"
            onClick={() => setTipoPeriodo('mes')}
            className={cn(
              'text-xs h-8 px-3 rounded-lg font-medium transition',
              tipoPeriodo === 'mes'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/50',
            )}
          >
            Mês ({competenciaFormatada})
          </Button>
          <Button
            size="sm"
            onClick={() => setTipoPeriodo('ano')}
            className={cn(
              'text-xs h-8 px-3 rounded-lg font-medium transition',
              tipoPeriodo === 'ano'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/50',
            )}
          >
            Acumulado ({anoCompetencia})
          </Button>
        </div>
      </div>

      {/* Grid de Seleção de Relatórios */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {relatoriosAbas.map((tab) => {
          const Icon = tab.icon
          const isSelected = relatorioAtivo === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setRelatorioAtivo(tab.id)}
              className={cn(
                'p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between h-24 group shadow-xs',
                isSelected
                  ? 'bg-blue-50/70 border-blue-200 text-blue-900 font-medium ring-1 ring-blue-500/20'
                  : 'bg-white border-slate-200/80 text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900',
              )}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-xl flex items-center justify-center transition-colors',
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600',
                )}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* ÁREA DO RELATÓRIO SELECIONADO */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-6">
        {/* RELATÓRIO 1: DRE COMPLETO */}
        {relatorioAtivo === 'dre' && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-900">
                    Demonstração de Resultado do Exercício (DRE)
                  </h2>
                  <span className="inline-flex items-center text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                    Regime de Competência
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-normal mt-0.5">
                  Estrutura contábil gerencial por competência (inclui títulos previstos e
                  realizados do período) —{' '}
                  {tipoPeriodo === 'mes'
                    ? `Mês ${competenciaFormatada}`
                    : `Acumulado Ano ${anoCompetencia}`}
                </p>
              </div>
              <Button
                onClick={handleExportarDRE}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-3 rounded-xl font-medium shadow-xs"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Exportar CSV Excel
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs md:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px] bg-slate-50">
                    <th className="py-2.5 px-3">Descritivo Contábil</th>
                    <th className="py-2.5 px-3 text-right">Valor em R$</th>
                    <th className="py-2.5 px-3 text-right">% Receita Líquida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {estruturaDRECompleto.linhasExibicao.map((linha, idx) => {
                    if (linha.estilo === 'bloco-titulo') {
                      return (
                        <tr key={idx} className="bg-slate-50 font-bold text-slate-900">
                          <td className="py-2.5 px-3">{linha.descricao}</td>
                          <td className="py-2.5 px-3 text-right text-emerald-600 tabular-nums font-bold">
                            {linha.valorFormatado}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-400">
                            {linha.percentual}
                          </td>
                        </tr>
                      )
                    }

                    if (linha.estilo === 'subtotal') {
                      const isEbitda = linha.descricao.includes('EBITDA')
                      const isReceitaLiquida = linha.descricao.includes(
                        'RECEITA OPERACIONAL LÍQUIDA',
                      )
                      return (
                        <tr
                          key={idx}
                          className={cn(
                            'font-bold',
                            isReceitaLiquida
                              ? 'bg-emerald-50 text-emerald-950'
                              : isEbitda
                                ? 'bg-emerald-50/80 font-extrabold text-emerald-900'
                                : 'bg-slate-50/80 text-slate-800',
                          )}
                        >
                          <td className="py-2.5 px-3">{linha.descricao}</td>
                          <td
                            className={cn(
                              'py-2.5 px-3 text-right tabular-nums',
                              isReceitaLiquida || isEbitda ? 'text-emerald-700' : 'text-slate-900',
                            )}
                          >
                            {linha.valorFormatado}
                          </td>
                          <td
                            className={cn(
                              'py-2.5 px-3 text-right',
                              isReceitaLiquida || isEbitda
                                ? 'text-emerald-700 font-semibold'
                                : 'text-slate-600',
                            )}
                          >
                            {linha.percentual}
                          </td>
                        </tr>
                      )
                    }

                    if (linha.estilo === 'informativo') {
                      return (
                        <tr key={idx} className="text-slate-500 bg-slate-50/40 italic">
                          <td className="py-1.5 px-6">{linha.descricao}</td>
                          <td className="py-1.5 px-3 text-right text-slate-600 tabular-nums">
                            {linha.valorFormatado}
                          </td>
                          <td className="py-1.5 px-3 text-right text-slate-400">
                            {linha.percentual}
                          </td>
                        </tr>
                      )
                    }

                    if (linha.estilo === 'destaque') {
                      return (
                        <tr
                          key={idx}
                          className="bg-blue-50/90 font-extrabold text-slate-900 text-sm"
                        >
                          <td className="py-3 px-3">{linha.descricao}</td>
                          <td
                            className={cn(
                              'py-3 px-3 text-right tabular-nums',
                              linha.valorNumerico >= 0 ? 'text-emerald-700' : 'text-rose-700',
                            )}
                          >
                            {linha.valorFormatado}
                          </td>
                          <td className="py-3 px-3 text-right text-blue-800">{linha.percentual}</td>
                        </tr>
                      )
                    }

                    // estilo 'detalhe'
                    const isDespesa = linha.valorNumerico < 0
                    const isRecOp = linha.descricao === 'Receita Operacional'
                    return (
                      <tr key={idx} className="text-slate-600">
                        <td className={cn('py-1.5', isRecOp ? 'px-6' : 'px-6')}>
                          {linha.descricao}
                        </td>
                        <td
                          className={cn(
                            'py-1.5 px-3 text-right tabular-nums',
                            isDespesa ? 'text-rose-600 font-medium' : 'text-slate-700',
                          )}
                        >
                          {linha.valorFormatado}
                        </td>
                        <td className="py-1.5 px-3 text-right text-slate-500">
                          {linha.percentual}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Linha informativa sobre títulos previstos incluídos na DRE (FIN-05) */}
              {textoPrevistosDRE && (
                <div className="mt-3 p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600 flex items-center justify-between">
                  <span className="font-normal">{textoPrevistosDRE}</span>
                  <span className="text-[11px] text-slate-400 font-medium">Informativo</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* RELATÓRIO 2: ÍNDICES DE LIQUIDEZ */}
        {relatorioAtivo === 'liquidez' && (
          <div className="space-y-6 animate-fade-in">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-semibold text-slate-900">
                Indicadores de Solvência & Liquidez
              </h2>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Capacidade da empresa de honrar suas obrigações financeiras
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-2 shadow-xs">
                <span className="text-xs text-slate-500 font-normal">Liquidez Corrente</span>
                <p className="text-2xl lg:text-[26px] font-semibold text-emerald-600 tabular-nums">
                  {liquidezData.corrente !== null
                    ? liquidezData.corrente.toFixed(2)
                    : 'Não aplicável'}
                  x
                </p>
                <Badge
                  className={
                    liquidezData.corrente >= 1.5
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }
                >
                  {liquidezData.corrente >= 1.5 ? 'Saudável (≥ 1.5)' : 'Atenção (< 1.5)'}
                </Badge>
                <p className="text-[11px] text-slate-400 font-normal">
                  Ativo Circulante ÷ Passivo Circulante
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-2 shadow-xs">
                <span className="text-xs text-slate-500 font-normal">
                  Liquidez Seca (Tradicional)
                </span>
                <p className="text-2xl lg:text-[26px] font-semibold text-blue-600 tabular-nums">
                  {liquidezData.seca !== null ? liquidezData.seca.toFixed(2) : 'Não aplicável'}x
                </p>
                <Badge
                  className={
                    liquidezData.seca >= 1.0
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }
                >
                  {liquidezData.seca >= 1.0 ? 'Excelente (≥ 1.0)' : 'Moderada'}
                </Badge>
                <p className="text-[11px] text-slate-400 font-normal">
                  (Ativo Circulante − Estoques) ÷ Passivo Circulante
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-2 shadow-xs">
                <span className="text-xs text-slate-500 font-normal">Liquidez Imediata</span>
                <p className="text-2xl lg:text-[26px] font-semibold text-purple-600 tabular-nums">
                  {liquidezData.imediata !== null
                    ? liquidezData.imediata.toFixed(2)
                    : 'Não aplicável'}
                  x
                </p>
                <Badge className="bg-purple-50 text-purple-700 border border-purple-200">
                  {liquidezData.imediata >= 0.5 ? 'Disponibilidade Alta' : 'Baixa'}
                </Badge>
                <p className="text-[11px] text-slate-400 font-normal">
                  Saldo de Caixa Imediato ÷ Contas a Pagar
                </p>
              </div>
            </div>
          </div>
        )}

        {/* RELATÓRIO 3: LUCRO E MARGEM */}
        {relatorioAtivo === 'lucro' && (
          <div className="space-y-6 animate-fade-in">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-semibold text-slate-900">
                Evolução Mensal do Lucro Líquido e Margem
              </h2>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Distribuição dos resultados ao longo dos 12 meses de {anoCompetencia}
              </p>
            </div>

            <div className="space-y-2.5">
              {evolucaoMensal.map((mesItem) => {
                const isPositivo = mesItem.lucro >= 0
                return (
                  <div
                    key={mesItem.mes}
                    className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/90 flex items-center justify-between gap-4"
                  >
                    <span className="w-12 font-bold text-slate-800 text-xs">{mesItem.mes}</span>
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500 font-medium">
                          Receitas: {formatBRL(mesItem.receitas)}
                        </span>
                        <span
                          className={cn(
                            'font-bold tabular-nums',
                            isPositivo ? 'text-emerald-600' : 'text-rose-600',
                          )}
                        >
                          Lucro: {formatBRL(mesItem.lucro)} ({mesItem.margem.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            isPositivo ? 'bg-emerald-500' : 'bg-rose-500',
                          )}
                          style={{
                            width: `${Math.min(100, Math.max(5, Math.abs(mesItem.margem)))}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* RELATÓRIO 4: FATURAMENTO */}
        {relatorioAtivo === 'faturamento' && (
          <div className="space-y-6 animate-fade-in">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-semibold text-slate-900">
                Faturamento Bruto Acumulado ({anoCompetencia})
              </h2>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Curva de crescimento de receitas brutas da empresa
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <span className="text-xs text-slate-500 font-normal">Total Faturado no Ano</span>
                <p className="text-2xl lg:text-[26px] font-semibold text-emerald-600 tabular-nums mt-1.5">
                  {formatBRL(evolucaoMensal.reduce((a, b) => a + b.receitas, 0))}
                </p>
              </div>

              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <span className="text-xs text-slate-500 font-normal">
                  Média Mensal de Faturamento
                </span>
                <p className="text-2xl lg:text-[26px] font-semibold text-slate-900 tabular-nums mt-1.5">
                  {formatBRL(evolucaoMensal.reduce((a, b) => a + b.receitas, 0) / 12)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* RELATÓRIO 5: ROI (RETORNO SOBRE INVESTIMENTO) */}
        {relatorioAtivo === 'roi' && (
          <div className="space-y-6 animate-fade-in">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-semibold text-slate-900">
                ROI — Retorno Sobre Investimentos Realizados
              </h2>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Relação entre o lucro líquido obtido e os aportes na categoria "Investimento"
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <span className="text-xs text-slate-500 font-normal">Investimentos no Período</span>
                <p className="text-2xl lg:text-[26px] font-semibold text-blue-600 tabular-nums mt-1.5">
                  {formatBRL(roiData.totalInvestimentos)}
                </p>
              </div>

              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <span className="text-xs text-slate-500 font-normal">Lucro Líquido Gerado</span>
                <p className="text-2xl lg:text-[26px] font-semibold text-emerald-600 tabular-nums mt-1.5">
                  {formatBRL(roiData.lucroLiquido)}
                </p>
              </div>

              <div className="bg-blue-50/70 p-5 rounded-2xl border border-blue-200/80 shadow-xs">
                <span className="text-xs text-blue-700 font-medium">Índice ROI</span>
                <p className="text-2xl lg:text-[26px] font-semibold text-blue-700 tabular-nums mt-1.5">
                  {roiData.roiPercentual.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        )}

        {/* RELATÓRIO 6: EBITDA */}
        {relatorioAtivo === 'ebitda' && (
          <div className="space-y-6 animate-fade-in">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-semibold text-slate-900">
                EBITDA & Margem Operacional
              </h2>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Potencial de geração operacional de caixa sem distorções tributárias
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <span className="text-xs text-slate-500 font-normal">EBITDA do Período</span>
                <p className="text-2xl lg:text-[26px] font-semibold text-emerald-600 tabular-nums mt-1.5">
                  {formatBRL(dreData.ebitda)}
                </p>
              </div>

              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <span className="text-xs text-slate-500 font-normal">Margem EBITDA</span>
                <p className="text-2xl lg:text-[26px] font-semibold text-emerald-600 tabular-nums mt-1.5">
                  {dreData.margemEbitda.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
