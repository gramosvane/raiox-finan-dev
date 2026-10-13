import React, { useState, useEffect, useMemo } from 'react'
import { useCompetencia } from '@/contexts/CompetenciaContext'
import { useRealtime } from '@/hooks/use-realtime'
import {
  hojeBrasil,
  formatarDataCivil,
  compararDataCivil,
  diferencaDiasCivil,
} from '@/lib/dataCivil'
import { getLancamentos, getCategorias, registrarRealizacaoLancamento } from '@/services/financial'
import { Lancamento, Categoria } from '@/types/financial'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  TrendingDown,
  CheckCircle2,
  Clock,
  Search,
  ArrowDownLeft,
  DollarSign,
  AlertCircle,
  RotateCcw,
  Ban,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { formatBRL } from '@/pages/dashboard/DashboardPage'
import {
  calcularValorEfetivoLancamento,
  roundCents,
  resolverGrupoDRE,
  obterNomeAtualCategoria,
} from '@/lib/financialCalculations'
import {
  prepararObrigacoesContas,
  filtrarObrigacoesPorAba,
  ObrigacaoApresentacao,
} from '@/lib/apresentacaoLancamentos'

export const ContasPagarPage: React.FC = () => {
  const { competencia, competenciaFormatada } = useCompetencia()
  const { toast } = useToast()

  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroTexto, setFiltroTexto] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'previsto' | 'realizado'>('todos')

  // Modal de pagamento
  const [liquidarItem, setLiquidarItem] = useState<Lancamento | null>(null)
  const [dataLiquidacao, setDataLiquidacao] = useState(() => hojeBrasil())
  const [liquidando, setLiquidando] = useState(false)

  const carregarObrigacoes = async () => {
    setLoading(true)
    try {
      // Carrega despesas da competência selecionada E títulos previstos não liquidados de competências anteriores, além do catálogo de categorias
      const [data, cats] = await Promise.all([
        getLancamentos(
          `tipo = 'despesa' && (competencia = '${competencia}' || (competencia < '${competencia}' && (status = 'previsto' || liquidacao_de != '')))`,
        ),
        getCategorias(),
      ])
      setLancamentos(data)
      setCategorias(cats)
    } catch (e) {
      console.error('Erro ao carregar contas a pagar:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarObrigacoes()
  }, [competencia])

  useRealtime('lancamentos', () => {
    carregarObrigacoes()
  })
  useRealtime('categorias', () => {
    carregarObrigacoes()
  })

  // Resumo
  const resumo = useMemo(() => {
    const hoje = hojeBrasil()

    let totalPagar = 0
    let totalAtrasado = 0
    let investimentosMes = 0
    let totalPagoMes = 0

    let totalPrevistoMes = 0

    // Mapeia IDs que já possuem liquidação para não duplicar contagem de pendências
    const idsLiquidados = new Set<string>()
    lancamentos.forEach((l) => {
      if (l.liquidacao_de && l.status !== 'estornado') {
        idsLiquidados.add(l.liquidacao_de)
      }
    })

    lancamentos.forEach((l) => {
      const vEfetivo = calcularValorEfetivoLancamento(l)
      const eCompetenciaAtual = l.competencia === competencia

      const grupo = resolverGrupoDRE(
        {
          tipo: l.tipo,
          categoria: l.categoria,
          categoria_id: l.categoria_id,
          grupo_dre: l.expand?.categoria_id?.grupo_dre,
        },
        categorias,
      )

      if (grupo === 'investimento_capex' && l.status === 'realizado' && eCompetenciaAtual) {
        investimentosMes = roundCents(investimentosMes + vEfetivo)
      }

      if (l.status === 'realizado' && eCompetenciaAtual) {
        totalPagoMes = roundCents(totalPagoMes + vEfetivo)
      } else if (l.status === 'previsto') {
        // Se já foi liquidado por outro lançamento, não conta como pendente
        if (idsLiquidados.has(l.id)) {
          return
        }
        // Total a pagar inclui competência atual e dívidas em aberto de meses anteriores
        totalPagar = roundCents(totalPagar + vEfetivo)
        if (eCompetenciaAtual) {
          totalPrevistoMes = roundCents(totalPrevistoMes + vEfetivo)
        }
        if (l.data_vencimento) {
          const vCivil = l.data_vencimento.slice(0, 10)
          if (vCivil < hoje) {
            totalAtrasado = roundCents(totalAtrasado + vEfetivo)
          }
        }
      }
    })

    return {
      totalPagar,
      totalAtrasado,
      totalVencido: totalAtrasado,
      totalPrevistoMes,
      investimentosMes,
      totalPagoMes,
    }
  }, [lancamentos, competencia, categorias])

  const handleConfirmarPagamento = async () => {
    if (!liquidarItem) return
    const hoje = hojeBrasil()
    const dataLiqCivil = dataLiquidacao ? dataLiquidacao.slice(0, 10) : ''
    if (!dataLiqCivil) {
      toast({
        variant: 'destructive',
        title: 'Erro de validação',
        description:
          'Operação negada: a data de realização é obrigatória para lançamentos com status "Realizado".',
      })
      return
    }
    if (dataLiqCivil > hoje) {
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
      await registrarRealizacaoLancamento(liquidarItem, dataLiquidacao)
      toast({
        title: 'Pagamento Efetuado!',
        description: 'Lançamento liquidado e registrado com sucesso.',
      })
      setLiquidarItem(null)
      carregarObrigacoes()
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Erro na operação',
        description: e?.data?.message || e?.message || 'Falha ao registrar pagamento.',
      })
    } finally {
      setLiquidando(false)
    }
  }

  // FIN-12 e UX-EST-02: Lista de obrigações consolidada
  // - Cada obrigação aparece exatamente UMA vez
  // - O contra-lançamento de liquidação não aparece
  // - Obrigação liquidada aparece como "Pago", com data de realização da liquidação
  // - Estorno aparece como "Estornado" / "Estorno", fora de Quitados/A Pagar
  // - Competência M: títulos de M, anteriores em aberto, ou anteriores quitados em M
  const obrigacoesPreparadas = useMemo(() => {
    return prepararObrigacoesContas(lancamentos, competencia, 'despesa')
  }, [lancamentos, competencia])

  const listaFiltrada = useMemo(() => {
    return filtrarObrigacoesPorAba(obrigacoesPreparadas, filtroStatus, filtroTexto, categorias)
  }, [obrigacoesPreparadas, filtroStatus, filtroTexto, categorias])

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-[28px] font-semibold text-slate-900 tracking-tight">
              Contas a Pagar
            </h1>
            <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200/80 text-[11px] font-medium px-2.5 py-0.5 rounded-full">
              Despesas
            </span>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1 font-normal">
            Gestão de fornecedores, boletos, prazos e controle de pagamentos da competência{' '}
            {competenciaFormatada}.
          </p>
        </div>
      </div>

      {/* Cards Resumo Topo - Padrão Painel Executivo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between min-h-[125px]">
          <div>
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-normal text-slate-600">A pagar (Pendente)</span>
              <Clock className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-2xl lg:text-[24px] font-semibold text-rose-600 tabular-nums mt-2 tracking-tight">
              {formatBRL(resumo.totalPagar)}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 font-normal mt-2">
            Obrigações aguardando quitação
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between min-h-[125px]">
          <div>
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-normal text-slate-600">Vencido / Atrasado</span>
              <AlertCircle className="w-4 h-4 text-rose-600" />
            </div>
            <div className="text-2xl lg:text-[24px] font-semibold text-rose-700 tabular-nums mt-2 tracking-tight">
              {formatBRL(resumo.totalVencido)}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 font-normal mt-2">Exige atenção imediata</div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between min-h-[125px]">
          <div>
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-normal text-slate-600">Previsto no mês</span>
              <TrendingDown className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl lg:text-[24px] font-semibold text-slate-900 tabular-nums mt-2 tracking-tight">
              {formatBRL(resumo.totalPrevistoMes)}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 font-normal mt-2">Competência atual</div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between min-h-[125px]">
          <div>
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-normal text-slate-600">Já quitado</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl lg:text-[24px] font-semibold text-emerald-600 tabular-nums mt-2 tracking-tight">
              {formatBRL(resumo.totalPagoMes)}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 font-normal mt-2">Despesas liquidadas</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar por descrição ou fornecedor..."
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
            className="bg-slate-50 border-slate-200 pl-9 text-xs rounded-xl text-slate-800 placeholder-slate-400"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 w-full sm:w-auto">
          {(['todos', 'previsto', 'realizado'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFiltroStatus(st)}
              className={cn(
                'px-3.5 py-1.5 text-xs font-semibold rounded-lg transition capitalize flex-1 sm:flex-none',
                filtroStatus === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {st === 'todos' ? 'Todos' : st === 'previsto' ? 'A Pagar' : 'Quitados'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela de Contas a Pagar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs md:text-sm">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-200/80">
              <tr>
                <th className="py-3 px-4">Descrição</th>
                <th className="py-3 px-3">Categoria</th>
                <th className="py-3 px-3">Vencimento</th>
                <th className="py-3 px-3">Data Pagto.</th>
                <th className="py-3 px-4 text-right">Valor</th>
                <th className="py-3 px-3 text-center">Status / Prazos</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-xs text-slate-400">
                    <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Carregando contas a pagar...
                  </td>
                </tr>
              ) : listaFiltrada.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-slate-400">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-70" />
                    Nenhuma obrigação encontrada com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                listaFiltrada.map((item) => {
                  const hoje = hojeBrasil()

                  let badgePrazo = null
                  if (item.statusApresentacao === 'a_pagar_receber' && item.data_vencimento) {
                    const vCivil = item.data_vencimento.slice(0, 10)
                    const diff = diferencaDiasCivil(vCivil, hoje)

                    if (diff < 0) {
                      badgePrazo = (
                        <Badge className="bg-rose-50 text-rose-700 text-[10px] border border-rose-200 rounded-md">
                          Vencido há {Math.abs(diff)}d
                        </Badge>
                      )
                    } else if (diff === 0) {
                      badgePrazo = (
                        <Badge className="bg-amber-50 text-amber-700 text-[10px] border border-amber-200 rounded-md">
                          Vence Hoje
                        </Badge>
                      )
                    } else if (diff <= 5) {
                      badgePrazo = (
                        <Badge className="bg-blue-50 text-blue-700 text-[10px] border border-blue-200 rounded-md">
                          Vence em {diff}d
                        </Badge>
                      )
                    }
                  }

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-900 max-w-xs truncate">
                        {item.descricao}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600 whitespace-nowrap font-normal">
                        {obterNomeAtualCategoria(item.itemOriginal as any, categorias)}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600 whitespace-nowrap font-normal">
                        {formatarDataCivil(item.data_vencimento)}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600 whitespace-nowrap font-normal">
                        {formatarDataCivil(item.data_realizacao)}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-rose-600 tabular-nums whitespace-nowrap">
                        {formatBRL(item.valor)}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          {item.statusApresentacao === 'estorno' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 font-medium">
                              <RotateCcw className="w-3 h-3 text-amber-600" /> Estorno
                            </span>
                          ) : item.statusApresentacao === 'estornado' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200 font-medium line-through">
                              <Ban className="w-3 h-3" /> Estornado
                            </span>
                          ) : item.statusApresentacao === 'pago_recebido' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 font-medium">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Pago
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200 font-medium">
                              <Clock className="w-3 h-3 text-rose-600" /> A Pagar
                            </span>
                          )}
                          {badgePrazo}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {item.podeLiquidar && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setLiquidarItem(item.itemOriginal as any)
                              setDataLiquidacao(hojeBrasil())
                            }}
                            className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-7 px-3 rounded-lg font-medium shadow-xs"
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Pagar
                          </Button>
                        )}
                        {item.itemLiquidacao && (
                          <span className="text-[10px] text-slate-400 block">
                            Quitado em {formatarDataCivil(item.data_realizacao)}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Registrar Pagamento */}
      {liquidarItem && (
        <Dialog open={!!liquidarItem} onOpenChange={() => setLiquidarItem(null)}>
          <DialogContent className="bg-white border-slate-200 text-slate-900 shadow-xl rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg text-slate-900 font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-rose-600" />
                Registrar quitação de despesa
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 font-normal">
                Confirmar saída financeira de conta bancária ou caixa da empresa.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                <p className="font-semibold text-slate-900 text-sm">{liquidarItem.descricao}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-500 font-normal">Valor a debitar:</span>
                  <span className="text-rose-600 font-semibold text-sm">
                    {formatBRL(liquidarItem.valor)}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-slate-600">
                  Data do pagamento efetivo
                </Label>
                <Input
                  type="date"
                  value={dataLiquidacao}
                  onChange={(e) => setDataLiquidacao(e.target.value)}
                  className="bg-slate-50 border-slate-200 text-xs rounded-xl"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setLiquidarItem(null)}
                className="border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmarPagamento}
                disabled={liquidando}
                className="bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl"
              >
                {liquidando ? 'Gravando...' : 'Confirmar pagamento'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
