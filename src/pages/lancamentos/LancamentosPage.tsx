import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCompetencia } from '@/contexts/CompetenciaContext'
import { useRealtime } from '@/hooks/use-realtime'
import { hojeBrasil, formatarDataCivil } from '@/lib/dataCivil'
import {
  getLancamentos,
  createLancamento,
  estornarLancamento,
  editarLancamentoControlado,
  getCategorias,
  getContas,
  getDepartamentos,
  getCentrosCusto,
  getEmpresas,
} from '@/services/financial'
import {
  Lancamento,
  Categoria,
  Conta,
  Departamento,
  CentroCusto,
  Empresa,
  TipoLancamento,
  StatusLancamento,
} from '@/types/financial'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Filter,
  Search,
  Eye,
  Edit,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Ban,
  Calendar,
  Layers,
  Building,
  CreditCard,
  User,
  Info,
  AlertCircle,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  calcularValorEfetivoLancamento,
  roundCents,
  obterNomeAtualCategoria,
} from '@/lib/financialCalculations'
import {
  obterDetalhesApresentacaoLancamento,
  prepararListaApresentacaoLancamentos,
  formatarObservacoesListaApresentacao,
  formatarDescricaoDetalheApresentacao,
  formatarObservacoesDetalheApresentacao,
} from '@/lib/apresentacaoLancamentos'

export const LancamentosPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const buscaParam = searchParams.get('busca') || ''

  const { competencia, competenciaFormatada, setCompetencia, opcoesCompetencia } = useCompetencia()
  const { toast } = useToast()

  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [loading, setLoading] = useState(true)

  // Cadastros auxiliares
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [departamentos, setDepartamentos] = useState<Departamento[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])

  // Filtros rápidos
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas')
  const [filtroDepartamento, setFiltroDepartamento] = useState<string>('todos')
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('todas')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [filtroTexto, setFiltroTexto] = useState<string>(buscaParam)

  // Drawer de Novo Lançamento
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form State Novo Lançamento
  const [novoTipo, setNovoTipo] = useState<TipoLancamento>('receita')
  const [novaDataLancamento, setNovaDataLancamento] = useState(() => hojeBrasil())
  const [novaDescricao, setNovaDescricao] = useState('')
  const [novaCategoria, setNovaCategoria] = useState('')
  const [novoDepartamento, setNovoDepartamento] = useState('')
  const [novaConta, setNovaConta] = useState('')
  const [novaEmpresaId, setNovaEmpresaId] = useState('')
  const [novoValor, setNovoValor] = useState<string>('')
  const [novoStatus, setNovoStatus] = useState<StatusLancamento>('previsto')
  const [novoVencimento, setNovoVencimento] = useState('')
  const [novaRealizacao, setNovaRealizacao] = useState('')
  const [novasObs, setNovasObs] = useState('')
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // Modal de Detalhes
  const [detalheItem, setDetalheItem] = useState<Lancamento | null>(null)

  const infoDetalhe = useMemo(() => {
    if (!detalheItem) return null
    return obterDetalhesApresentacaoLancamento(detalheItem, lancamentos)
  }, [detalheItem, lancamentos])

  // Modal de Estorno
  const [estornoItem, setEstornoItem] = useState<Lancamento | null>(null)
  const [motivoEstorno, setMotivoEstorno] = useState('')
  const [estornando, setEstornando] = useState(false)

  // Modal de Edição Controlada (Ponto C)
  const [editItem, setEditItem] = useState<Lancamento | null>(null)
  const [editDescricao, setEditDescricao] = useState('')
  const [editValor, setEditValor] = useState('')
  const [editCategoria, setEditCategoria] = useState('')
  const [editDepartamento, setEditDepartamento] = useState('')
  const [editConta, setEditConta] = useState('')
  const [editDataLancamento, setEditDataLancamento] = useState('')
  const [editVencimento, setEditVencimento] = useState('')
  const [editRealizacao, setEditRealizacao] = useState('')
  const [editEmpresaId, setEditEmpresaId] = useState('')
  const [editObs, setEditObs] = useState('')
  const [editMotivo, setEditMotivo] = useState('')
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})

  const carregarDados = async () => {
    setLoading(true)
    try {
      const [lancs, cats, cts, deps, emps] = await Promise.all([
        getLancamentos(`competencia = '${competencia}'`),
        getCategorias(),
        getContas(),
        getDepartamentos(),
        getEmpresas(),
      ])
      setLancamentos(lancs)
      setCategorias(cats)
      setContas(cts)
      setDepartamentos(deps)
      setEmpresas(emps)
      const empPadrao = emps.find((e) => e.padrao) || emps[0]
      if (empPadrao && !novaEmpresaId) {
        setNovaEmpresaId(empPadrao.id)
      }
    } catch (err) {
      console.error('Erro ao carregar lançamentos:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar os lançamentos da competência.',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [competencia])

  useRealtime('lancamentos', () => {
    carregarDados()
  })

  // Atualizar filtro de busca caso venha da URL
  useEffect(() => {
    if (buscaParam) {
      setFiltroTexto(buscaParam)
    }
  }, [buscaParam])

  // Categorias ativas filtradas pelo tipo no formulário (novos lançamentos só aceitam categorias ativas)
  const categoriasDisponiveis = categorias.filter(
    (c) => c.tipo === novoTipo && (c.ativa === undefined || c.ativa === null || c.ativa === true),
  )

  const resetNovoForm = () => {
    setNovoTipo('receita')
    setNovaDataLancamento(hojeBrasil())
    setNovaDescricao('')
    setNovaCategoria('')
    setNovoDepartamento('')
    setNovaConta(contas[0]?.nome || '')
    const empPadrao = empresas.find((e) => e.padrao) || empresas[0]
    setNovaEmpresaId(empPadrao?.id || '')
    setNovoValor('')
    setNovoStatus('previsto')
    setNovoVencimento('')
    setNovaRealizacao('')
    setNovasObs('')
    setFormErrors({})
  }

  const abrirNovoModal = () => {
    resetNovoForm()
    if (categoriasDisponiveis.length > 0) {
      setNovaCategoria(categoriasDisponiveis[0].id)
    }
    setDrawerOpen(true)
  }

  const handleSalvarLancamento = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}

    if (!novaDescricao.trim() || novaDescricao.trim().length < 3) {
      errs.descricao = 'Descrição deve conter no mínimo 3 caracteres.'
    }
    if (!novaCategoria) {
      errs.categoria = 'Selecione uma categoria.'
    }
    const valNumerico = parseFloat(novoValor.replace(',', '.'))
    if (isNaN(valNumerico) || valNumerico <= 0) {
      errs.valor = 'Informe um valor numérico válido maior que zero.'
    }
    if (!novaDataLancamento) {
      errs.data_lancamento = 'Data é obrigatória.'
    }
    const hoje = hojeBrasil()
    if (novoStatus === 'realizado') {
      if (!novaRealizacao) {
        errs.data_realizacao = 'Data de realização é obrigatória para lançamentos realizados.'
      } else if (novaRealizacao.slice(0, 10) > hoje) {
        errs.data_realizacao =
          'Lançamento realizado não pode ter data futura. Para valores futuros, use o status Previsto.'
      }
      if (novaDataLancamento && novaDataLancamento.slice(0, 10) > hoje) {
        errs.data_lancamento =
          'Lançamento realizado não pode ter data futura. Para valores futuros, use o status Previsto.'
      }
    }

    if (Object.keys(errs).length > 0) {
      setFormErrors(errs)
      if (errs.data_realizacao || errs.data_lancamento) {
        toast({
          variant: 'destructive',
          title: 'Erro de validação',
          description: errs.data_realizacao || errs.data_lancamento,
        })
      }
      return
    }

    setSaving(true)
    try {
      // Competência pode ser derivada da data ou da competência selecionada
      const compDerived = novaDataLancamento.slice(0, 7)

      // Identifica o objeto da categoria selecionada
      const catObj =
        categorias.find((c) => c.id === novaCategoria) ||
        categorias.find((c) => c.nome === novaCategoria)

      await createLancamento({
        tipo: novoTipo,
        descricao: novaDescricao.trim(),
        categoria: catObj?.nome || novaCategoria,
        categoria_id: catObj?.id || (novaCategoria.length === 15 ? novaCategoria : undefined),
        departamento: novoDepartamento || undefined,
        centro_custo: novoDepartamento || undefined,
        conta: novaConta || undefined,
        empresa_id: novaEmpresaId || undefined,
        valor: valNumerico,
        competencia: compDerived || competencia,
        data_lancamento: novaDataLancamento,
        data_vencimento: novoVencimento || null,
        data_realizacao: novoStatus === 'realizado' && novaRealizacao ? novaRealizacao : null,
        status: novoStatus,
        observacoes: novasObs.trim() || undefined,
        usuario_id: '',
      })

      toast({
        title: 'Lançamento salvo!',
        description: 'O movimento foi registrado e blindado com sucesso.',
      })

      setDrawerOpen(false)
      resetNovoForm()
      carregarDados()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: err?.message || 'Falha ao registrar lançamento.',
      })
    } finally {
      setSaving(false)
    }
  }

  const abrirEdicao = (item: Lancamento) => {
    setEditItem(item)
    setEditDescricao(item.descricao || '')
    setEditValor(String(item.valor))
    // Usa categoria_id se existir, caso contrário o texto da categoria ou busca pelo id
    const catEncontrada = item.categoria_id
      ? categorias.find((c) => c.id === item.categoria_id)
      : categorias.find((c) => c.nome.toLowerCase() === (item.categoria || '').trim().toLowerCase())
    setEditCategoria(catEncontrada?.id || item.categoria_id || item.categoria || '')
    setEditDepartamento(item.departamento || item.centro_custo || '')
    setEditConta(item.conta || '')
    setEditDataLancamento(item.data_lancamento ? item.data_lancamento.slice(0, 10) : '')
    setEditVencimento(item.data_vencimento ? item.data_vencimento.slice(0, 10) : '')
    setEditRealizacao(item.data_realizacao ? item.data_realizacao.slice(0, 10) : '')
    setEditEmpresaId(item.empresa_id || '')
    setEditObs(item.observacoes || '')
    setEditMotivo('')
    setEditErrors({})
  }

  const handleSalvarEdicaoControlada = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editItem) return

    const errs: Record<string, string> = {}
    if (!editDescricao.trim() || editDescricao.trim().length < 3) {
      errs.descricao = 'Descrição deve conter no mínimo 3 caracteres.'
    }
    const valNumerico = parseFloat(editValor.replace(',', '.'))
    if (isNaN(valNumerico) || valNumerico <= 0) {
      errs.valor = 'Informe um valor numérico válido maior que zero.'
    }
    if (!editCategoria) {
      errs.categoria = 'Selecione uma categoria.'
    }
    const catEscolhida = categorias.find((c) => c.id === editCategoria || c.nome === editCategoria)
    if (
      catEscolhida &&
      catEscolhida.ativa === false &&
      catEscolhida.id !== editItem.categoria_id &&
      catEscolhida.nome !== editItem.categoria
    ) {
      errs.categoria = 'Categorias inativas não podem ser selecionadas para novos vínculos.'
    }
    if (!editMotivo.trim() || editMotivo.trim().length < 5) {
      errs.motivo = 'Motivo da alteração é obrigatório (mínimo de 5 caracteres).'
    }
    const hoje = hojeBrasil()
    if (editItem.status === 'realizado') {
      if (!editRealizacao) {
        errs.data_realizacao = 'Data de realização é obrigatória para lançamentos realizados.'
      } else if (editRealizacao.slice(0, 10) > hoje) {
        errs.data_realizacao =
          'Lançamento realizado não pode ter data futura. Para valores futuros, use o status Previsto.'
      }
      if (editDataLancamento && editDataLancamento.slice(0, 10) > hoje) {
        errs.data_lancamento =
          'Lançamento realizado não pode ter data futura. Para valores futuros, use o status Previsto.'
      }
    }

    if (Object.keys(errs).length > 0) {
      setEditErrors(errs)
      if (errs.data_realizacao || errs.data_lancamento) {
        toast({
          variant: 'destructive',
          title: 'Erro de validação',
          description: errs.data_realizacao || errs.data_lancamento,
        })
      }
      return
    }

    setSalvandoEdicao(true)
    try {
      const compDerived = editDataLancamento ? editDataLancamento.slice(0, 7) : editItem.competencia

      const catObj =
        categorias.find((c) => c.id === editCategoria) ||
        categorias.find((c) => c.nome === editCategoria)

      const resp = await editarLancamentoControlado(editItem.id, {
        descricao: editDescricao.trim(),
        valor: parseFloat(editValor.replace(',', '.')),
        categoria: catObj?.nome || editCategoria,
        categoria_id: catObj?.id || (editCategoria.length === 15 ? editCategoria : undefined),
        departamento: editDepartamento || '',
        centro_custo: editDepartamento || '',
        conta: editConta || '',
        data_lancamento: editDataLancamento || editItem.data_lancamento,
        data_vencimento: editVencimento ? editVencimento : null,
        data_realizacao: editRealizacao ? editRealizacao : null,
        empresa_id: editEmpresaId || null,
        observacoes: editObs.trim(),
        competencia: compDerived,
        motivo: editMotivo.trim(),
      })

      if (resp.success) {
        if (resp.message === 'Nenhum campo foi alterado.') {
          toast({
            title: resp.message,
            description: 'Nenhuma alteração foi necessária ou gravada na auditoria.',
          })
        } else {
          toast({
            title: 'Lançamento atualizado com sucesso!',
            description: 'A alteração foi persistida e registrada na trilha de auditoria blindada.',
          })
        }
        setEditItem(null)
        setEditMotivo('')
        setEditErrors({})
        carregarDados()
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro na edição',
          description: resp.message || 'Falha ao atualizar lançamento.',
        })
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro na edição',
        description:
          err?.data?.message || err?.message || 'Falha ao registrar alteração no servidor.',
      })
    } finally {
      setSalvandoEdicao(false)
    }
  }

  const handleConfirmarEstorno = async () => {
    if (!estornoItem) return
    if (!motivoEstorno.trim()) {
      toast({
        variant: 'destructive',
        title: 'Motivo obrigatório',
        description: 'Informe o motivo do estorno para registro na auditoria.',
      })
      return
    }

    setEstornando(true)
    try {
      await estornarLancamento(estornoItem, motivoEstorno.trim())
      toast({
        title: 'Estorno realizado com sucesso',
        description: 'Um contra-lançamento foi gerado mantendo o histórico protegido.',
      })
      setEstornoItem(null)
      setMotivoEstorno('')
      carregarDados()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro no estorno',
        description: err?.message || 'Falha ao estornar lançamento.',
      })
    } finally {
      setEstornando(false)
    }
  }

  // Mapeamento de lançamentos originais que possuem contra-lançamento apontando para eles
  const idsOriginaisEstornados = useMemo(() => {
    const ids = new Set<string>()
    lancamentos.forEach((l) => {
      if (l.estorno_de) {
        ids.add(l.estorno_de)
      }
    })
    return ids
  }, [lancamentos])

  // Mapeamento de lançamentos previstos que já foram liquidados (por liquidacao_de)
  const idsOriginaisLiquidados = useMemo(() => {
    const ids = new Set<string>()
    lancamentos.forEach((l) => {
      if (l.liquidacao_de) {
        ids.add(l.liquidacao_de)
      }
    })
    return ids
  }, [lancamentos])

  // Filtragem local dos lançamentos da competência
  const lancamentosFiltrados = lancamentos.filter((item) => {
    if (filtroTipo !== 'todos' && item.tipo !== filtroTipo) return false
    if (filtroCategoria !== 'todas') {
      const matchId = item.categoria_id && item.categoria_id === filtroCategoria
      const matchNome =
        item.categoria &&
        (item.categoria === filtroCategoria ||
          categorias.find((c) => c.id === filtroCategoria)?.nome === item.categoria)
      if (!matchId && !matchNome) return false
    }
    if (
      filtroDepartamento !== 'todos' &&
      (item.departamento || item.centro_custo) !== filtroDepartamento
    ) {
      return false
    }
    if (filtroEmpresa !== 'todas' && item.empresa_id !== filtroEmpresa) return false

    // Regras de apresentação e filtro do estorno (Problema 2):
    // - Original estornado: item.status === 'estornado' OU existe contra-lançamento apontando para ele (idsOriginaisEstornados.has(item.id))
    // - Contra-lançamento: Boolean(item.estorno_de)
    const isOriginalEstornado = item.status === 'estornado' || idsOriginaisEstornados.has(item.id)
    const isContraLancamento = Boolean(item.estorno_de)

    const isLiquidado = idsOriginaisLiquidados.has(item.id)

    if (filtroStatus === 'estornado') {
      // filtro "Estornado": mostra os dois (original estornado e seu contra-lançamento)
      if (!isOriginalEstornado && !isContraLancamento) return false
    } else if (filtroStatus === 'realizado') {
      // filtro "Realizado": mostra só realizados que NÃO são original estornado nem contra-lançamento
      if (item.status !== 'realizado' || isOriginalEstornado || isContraLancamento) return false
    } else if (filtroStatus === 'previsto') {
      // FIN-12: Filtro "Previsto" mostra somente títulos ainda em aberto (não liquidados e não estornados)
      if (item.status !== 'previsto' || isLiquidado || isOriginalEstornado) return false
    } else if (filtroStatus !== 'todos') {
      if (item.status !== filtroStatus) return false
    }

    if (filtroTexto.trim()) {
      const q = filtroTexto.toLowerCase()
      const nomeAtualCat = obterNomeAtualCategoria(item, categorias).toLowerCase()
      const matchDesc = item.descricao.toLowerCase().includes(q)
      const matchCat =
        (item.categoria || '').toLowerCase().includes(q) ||
        nomeAtualCat.includes(q) ||
        (item.categoria_id || '').toLowerCase().includes(q)
      const matchConta = (item.conta || '').toLowerCase().includes(q)
      const matchDep = (item.departamento || item.centro_custo || '').toLowerCase().includes(q)
      if (!matchDesc && !matchCat && !matchConta && !matchDep) return false
    }
    return true
  })

  // Totais rápidos da listagem
  const totalReceitas = lancamentosFiltrados
    .filter((l) => l.tipo === 'receita' && l.status === 'realizado')
    .reduce((acc, curr) => roundCents(acc + calcularValorEfetivoLancamento(curr)), 0)

  const totalDespesas = lancamentosFiltrados
    .filter((l) => l.tipo === 'despesa' && l.status === 'realizado')
    .reduce((acc, curr) => roundCents(acc + calcularValorEfetivoLancamento(curr)), 0)

  const saldoLiquido = roundCents(totalReceitas - totalDespesas)

  // Lista estruturada com agrupamento e metadados de apresentação de estorno (A4: UX-TXT-03 e UX-EST-01)
  const itensTabelaApresentacao = useMemo(() => {
    return prepararListaApresentacaoLancamentos(lancamentosFiltrados, lancamentos)
  }, [lancamentosFiltrados, lancamentos])

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Top Header da Tela de Lançamentos - Padrão Painel Executivo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-[28px] font-semibold text-slate-900 tracking-tight">
              Lançamentos
            </h1>
            <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-[11px] font-medium px-2.5 py-0.5 rounded-full">
              <ShieldCheck className="w-3 h-3 text-indigo-600" />
              Blindado & Auditado
            </span>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1 font-normal">
            Movimentos financeiros da competência {competenciaFormatada}. Edição controlada
            permitida com motivo obrigatório — toda alteração gera registro de auditoria
            ANTES/DEPOIS com usuário, data/hora e motivo. Exclusão proibida. Estorno para
            cancelamentos financeiros.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={abrirNovoModal}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs md:text-sm h-10 px-4 rounded-xl shadow-xs transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Novo Lançamento
          </Button>
        </div>
      </div>

      {/* Cards Resumo Rápido do Mês - Padrão Painel Executivo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between min-h-[130px]">
          <div>
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-normal text-slate-600">Receitas Realizadas</span>
              <ArrowUpRight className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl lg:text-[26px] font-semibold text-slate-900 tabular-nums mt-2 tracking-tight">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                totalReceitas,
              )}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 font-normal mt-2">
            Entradas confirmadas no caixa
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between min-h-[130px]">
          <div>
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-normal text-slate-600">Despesas Realizadas</span>
              <ArrowDownLeft className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl lg:text-[26px] font-semibold text-slate-900 tabular-nums mt-2 tracking-tight">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                totalDespesas,
              )}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 font-normal mt-2">
            Saídas confirmadas no caixa
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between min-h-[130px]">
          <div>
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-normal text-slate-600">
                Fluxo de caixa da competência
              </span>
              <ShieldCheck className="w-4 h-4 text-slate-400" />
            </div>
            <div
              className={cn(
                'text-2xl lg:text-[26px] font-semibold tabular-nums mt-2 tracking-tight',
                saldoLiquido > 0
                  ? 'text-emerald-600'
                  : saldoLiquido < 0
                    ? 'text-rose-600'
                    : 'text-slate-900',
              )}
            >
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                saldoLiquido,
              )}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 font-normal mt-2">
            Entradas menos saídas realizadas (inclui investimentos)
          </div>
        </div>
      </div>

      {/* Barra de Filtros Rápidos */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Filtrar por texto..."
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              className="bg-slate-50 border-slate-200 pl-9 text-xs h-9 text-slate-800 placeholder-slate-400 rounded-xl"
            />
          </div>

          {/* Abas Rápidas de Tipo */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 w-full sm:w-auto">
            {['todos', 'receita', 'despesa'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFiltroTipo(t)}
                className={cn(
                  'px-3.5 py-1.5 text-xs font-semibold rounded-lg transition capitalize flex-1 sm:flex-none',
                  filtroTipo === t
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900',
                )}
              >
                {t === 'todos' ? 'Todos os Tipos' : t === 'receita' ? 'Receitas' : 'Despesas'}
              </button>
            ))}
          </div>
        </div>

        {/* Dropdowns secundários */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100">
          <div>
            <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">Categoria</Label>
            <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
              <SelectTrigger className="bg-slate-50 border-slate-200 h-8 text-xs text-slate-800 rounded-xl">
                <SelectValue placeholder="Todas as categorias" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-800 rounded-xl shadow-lg">
                <SelectItem value="todas">Todas as categorias</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} ({c.tipo === 'receita' ? 'Receita' : 'Despesa'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">
              Departamento
            </Label>
            <Select value={filtroDepartamento} onValueChange={setFiltroDepartamento}>
              <SelectTrigger className="bg-slate-50 border-slate-200 h-8 text-xs text-slate-800 rounded-xl">
                <SelectValue placeholder="Todos os departamentos" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-800 rounded-xl shadow-lg">
                <SelectItem value="todos">Todos os departamentos</SelectItem>
                {departamentos.map((dep) => (
                  <SelectItem key={dep.id} value={dep.nome}>
                    {dep.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">Status</Label>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="bg-slate-50 border-slate-200 h-8 text-xs text-slate-800 rounded-xl">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-800 rounded-xl shadow-lg">
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="realizado">Realizado</SelectItem>
                <SelectItem value="previsto">Previsto</SelectItem>
                <SelectItem value="estornado">Estornado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* TABELA DE LANÇAMENTOS */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-800">
            {lancamentosFiltrados.length}{' '}
            {lancamentosFiltrados.length === 1
              ? 'lançamento encontrado'
              : 'lançamentos encontrados'}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
            <span>
              Edição controlada permitida com motivo obrigatório — toda alteração gera registro de
              auditoria ANTES/DEPOIS com usuário, data/hora e motivo. Exclusão proibida. Estorno
              para cancelamentos financeiros.
            </span>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Carregando dados da competência...</p>
          </div>
        ) : lancamentosFiltrados.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Info className="w-10 h-10 text-slate-400 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">Nenhum lançamento encontrado</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Não há movimentos cadastrados para os filtros selecionados nesta competência (
              {competenciaFormatada}).
            </p>
            <Button
              onClick={abrirNovoModal}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-xl shadow-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Lançar Movimento Agora
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="py-3 px-4 font-semibold">Data</th>
                  <th className="py-3 px-3 font-semibold">Tipo</th>
                  <th className="py-3 px-4 font-semibold">Descrição</th>
                  <th className="py-3 px-3 font-semibold hidden md:table-cell">Categoria</th>
                  <th className="py-3 px-3 font-semibold hidden lg:table-cell">Departamento</th>
                  <th className="py-3 px-3 font-semibold hidden sm:table-cell">Conta</th>
                  <th className="py-3 px-4 font-semibold text-right">Valor</th>
                  <th className="py-3 px-3 font-semibold text-center">Status</th>
                  <th className="py-3 px-3 font-semibold text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itensTabelaApresentacao.map((linhaApresentacao) => {
                  const {
                    item,
                    isContraLancamentoEstorno,
                    isOriginalEstornado,
                    isFilhoEstornoAgrupado,
                    descricaoExibicao,
                    valorExibicaoTexto,
                    efeitoLiquidoZero,
                  } = linhaApresentacao

                  const isReceita = item.tipo === 'receita'
                  const dataFormatada = formatarDataCivil(item.data_lancamento, '-')

                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        'hover:bg-slate-50/70 transition-colors group',
                        isFilhoEstornoAgrupado && 'bg-slate-50/40',
                      )}
                    >
                      <td className="py-3.5 px-4 text-xs font-normal text-slate-600 whitespace-nowrap">
                        {isFilhoEstornoAgrupado ? (
                          <div className="flex items-center gap-1.5 pl-2">
                            <span className="text-slate-400 font-bold text-sm leading-none">↳</span>
                            <span>{dataFormatada}</span>
                          </div>
                        ) : (
                          dataFormatada
                        )}
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {isContraLancamentoEstorno ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide bg-slate-100 text-slate-600 border border-slate-200">
                            <RotateCcw className="w-3 h-3 mr-1 text-slate-500" />
                            Estorno
                          </span>
                        ) : (
                          <span
                            className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide',
                              isReceita
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200',
                            )}
                          >
                            {isReceita ? (
                              <>
                                <ArrowUpRight className="w-3 h-3 mr-0.5 text-emerald-600" />
                                Receita
                              </>
                            ) : (
                              <>
                                <ArrowDownLeft className="w-3 h-3 mr-0.5 text-rose-600" />
                                Despesa
                              </>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-900 font-medium max-w-xs">
                        <div className={cn(isFilhoEstornoAgrupado && 'pl-2')}>
                          <p className="truncate" title={descricaoExibicao}>
                            {descricaoExibicao}
                          </p>
                          {item.observacoes && (
                            <p className="text-[11px] text-slate-400 truncate mt-0.5 font-normal">
                              {formatarObservacoesListaApresentacao(item)}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-xs text-slate-600 hidden md:table-cell whitespace-nowrap font-normal">
                        {obterNomeAtualCategoria(item, categorias)}
                      </td>
                      <td className="py-3.5 px-3 text-xs text-slate-500 hidden lg:table-cell whitespace-nowrap font-normal">
                        {item.departamento || item.centro_custo || '—'}
                      </td>
                      <td className="py-3.5 px-3 text-xs text-slate-500 hidden sm:table-cell whitespace-nowrap font-normal">
                        {item.conta || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold tabular-nums whitespace-nowrap">
                        {isContraLancamentoEstorno ? (
                          <span className="text-slate-600 font-medium">{valorExibicaoTexto}</span>
                        ) : isOriginalEstornado ? (
                          <div className="flex flex-col items-end">
                            <span className="text-slate-400 line-through font-normal text-xs">
                              {valorExibicaoTexto}
                            </span>
                            {efeitoLiquidoZero && (
                              <span className="text-[10px] text-slate-400 font-normal">
                                efeito líquido R$ 0,00
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className={isReceita ? 'text-emerald-600' : 'text-rose-600'}>
                            {valorExibicaoTexto}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        {isContraLancamentoEstorno ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 font-medium bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                            <RotateCcw className="w-3 h-3 text-slate-500" /> Estorno
                          </span>
                        ) : isOriginalEstornado ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 line-through bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                            <Ban className="w-3 h-3" /> Estornado
                          </span>
                        ) : item.status === 'realizado' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Realizado
                          </span>
                        ) : idsOriginaisLiquidados.has(item.id) ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                            <CheckCircle2 className="w-3 h-3 text-blue-600" /> Liquidado
                          </span>
                        ) : item.status === 'previsto' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" /> Previsto
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                            {item.status}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetalheItem(item)}
                            title="Ver Detalhes do Lançamento"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {!(
                            item.status === 'estornado' ||
                            idsOriginaisEstornados.has(item.id) ||
                            Boolean(item.estorno_de) ||
                            Boolean(item.liquidacao_de) ||
                            idsOriginaisLiquidados.has(item.id)
                          ) && (
                            <>
                              <button
                                type="button"
                                onClick={() => abrirEdicao(item)}
                                title="Editar Lançamento (Auditoria Obrigatória)"
                                className="p-1.5 rounded-lg text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              {item.status !== 'previsto' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEstornoItem(item)
                                    setMotivoEstorno('')
                                  }}
                                  title="Estornar Lançamento (Cancelamento Financeiro)"
                                  className="p-1.5 rounded-lg text-amber-600 hover:text-amber-700 hover:bg-amber-50 transition"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DRAWER LATERAL: NOVO LANÇAMENTO (Tema Claro SaaS) */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="right"
          className="bg-white border-slate-200 text-slate-900 w-full sm:max-w-md overflow-y-auto"
        >
          <SheetHeader className="pb-4 border-b border-slate-100">
            <SheetTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              Novo Lançamento Financeiro
            </SheetTitle>
            <SheetDescription className="text-xs text-slate-500 font-normal">
              Registros salvos não podem ser excluídos. Eles ficam blindados para fins de auditoria
              e conformidade fiscal.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSalvarLancamento} className="space-y-4 py-4">
            {/* Toggle Tipo: Receita ou Despesa */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600 font-medium">Tipo de Movimento</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNovoTipo('receita')
                    const rCats = categorias.filter((c) => c.tipo === 'receita')
                    if (rCats.length > 0) setNovaCategoria(rCats[0].id)
                  }}
                  className={cn(
                    'py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition',
                    novoTipo === 'receita'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-semibold'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                  )}
                >
                  <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                  Receita
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNovoTipo('despesa')
                    const dCats = categorias.filter((c) => c.tipo === 'despesa')
                    if (dCats.length > 0) setNovaCategoria(dCats[0].id)
                  }}
                  className={cn(
                    'py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition',
                    novoTipo === 'despesa'
                      ? 'bg-rose-50 border-rose-300 text-rose-700 font-semibold'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                  )}
                >
                  <ArrowDownLeft className="w-4 h-4 text-rose-600" />
                  Despesa
                </button>
              </div>
            </div>

            {/* Descrição */}
            <div className="space-y-1">
              <Label className="text-xs text-slate-600 font-medium">Descrição do Movimento *</Label>
              <Input
                placeholder="Ex: Faturamento Contrato Alpha, Aluguel Escritório..."
                value={novaDescricao}
                onChange={(e) => setNovaDescricao(e.target.value)}
                className="bg-slate-50 border-slate-200 text-slate-900 text-xs rounded-xl"
              />
              {formErrors.descricao && (
                <p className="text-[11px] text-rose-500">{formErrors.descricao}</p>
              )}
            </div>

            {/* Valor (R$) */}
            <div className="space-y-1">
              <Label className="text-xs text-slate-600 font-medium">Valor (R$) *</Label>
              <Input
                type="text"
                placeholder="0,00"
                value={novoValor}
                onChange={(e) => setNovoValor(e.target.value)}
                className="bg-slate-50 border-slate-200 text-slate-900 text-sm font-semibold tabular-nums rounded-xl"
              />
              {formErrors.valor && <p className="text-[11px] text-rose-500">{formErrors.valor}</p>}
            </div>

            {/* Categoria */}
            <div className="space-y-1">
              <Label className="text-xs text-slate-600 font-medium">Categoria *</Label>
              <Select value={novaCategoria} onValueChange={setNovaCategoria}>
                <SelectTrigger className="bg-slate-50 border-slate-200 text-xs text-slate-800 rounded-xl">
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-800 rounded-xl shadow-lg">
                  {categoriasDisponiveis.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.categoria && (
                <p className="text-[11px] text-rose-500">{formErrors.categoria}</p>
              )}
            </div>

            {/* Departamento */}
            <div className="space-y-1">
              <Label className="text-xs text-slate-600 font-medium">Departamento (Opcional)</Label>
              <Select
                value={novoDepartamento || 'nenhum'}
                onValueChange={(val) => setNovoDepartamento(val === 'nenhum' ? '' : val)}
              >
                <SelectTrigger className="bg-slate-50 border-slate-200 text-xs text-slate-800 rounded-xl">
                  <SelectValue placeholder="Nenhum (Geral)" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-800 rounded-xl shadow-lg">
                  <SelectItem value="nenhum">Nenhum (Geral)</SelectItem>
                  {departamentos.map((dep) => (
                    <SelectItem key={dep.id} value={dep.nome}>
                      {dep.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Conta Bancária / Caixa */}
            <div className="space-y-1">
              <Label className="text-xs text-slate-600 font-medium">Conta Financeira</Label>
              <Select value={novaConta} onValueChange={setNovaConta}>
                <SelectTrigger className="bg-slate-50 border-slate-200 text-xs text-slate-800 rounded-xl">
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-800 rounded-xl shadow-lg">
                  {contas.map((cta) => (
                    <SelectItem key={cta.id} value={cta.nome}>
                      {cta.nome} ({cta.tipo.toUpperCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Data do Lançamento (Data de competência) e Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-600 font-medium">Data de competência</Label>
                <Input
                  type="date"
                  value={novaDataLancamento}
                  onChange={(e) => setNovaDataLancamento(e.target.value)}
                  className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                />
                <p className="text-[10px] text-slate-500 font-normal">
                  Define o mês do lançamento na DRE.
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-600 font-medium">Status</Label>
                <Select
                  value={novoStatus}
                  onValueChange={(val: any) => {
                    setNovoStatus(val)
                    if (val === 'realizado') {
                      setNovaRealizacao(hojeBrasil())
                    } else {
                      setNovaRealizacao('')
                    }
                  }}
                >
                  <SelectTrigger className="bg-slate-50 border-slate-200 text-xs text-slate-800 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-800 rounded-xl shadow-lg">
                    <SelectItem value="previsto">Previsto</SelectItem>
                    <SelectItem value="realizado">Realizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Vencimento e Realização */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-600 font-medium">Data de Vencimento</Label>
                <Input
                  type="date"
                  value={novoVencimento}
                  onChange={(e) => setNovoVencimento(e.target.value)}
                  className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                />
              </div>

              {novoStatus === 'realizado' && (
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600 font-medium">Data de Realização *</Label>
                  <Input
                    type="date"
                    value={novaRealizacao}
                    onChange={(e) => setNovaRealizacao(e.target.value)}
                    className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                  />
                </div>
              )}
            </div>

            {/* Alerta não bloqueante quando vencimento for anterior à competência */}
            {novoVencimento &&
              novaDataLancamento &&
              novoVencimento.slice(0, 10) < novaDataLancamento.slice(0, 10) && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/90 text-[11px] text-amber-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    O vencimento é anterior à data de competência. Confirme se está correto.
                  </span>
                </div>
              )}

            {/* Empresa / Unidade */}
            {empresas.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-slate-600 font-medium">Empresa / Unidade</Label>
                <Select value={novaEmpresaId} onValueChange={setNovaEmpresaId}>
                  <SelectTrigger className="bg-slate-50 border-slate-200 text-xs text-slate-800 rounded-xl">
                    <SelectValue placeholder="Selecione a empresa..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-800 rounded-xl shadow-lg">
                    {empresas.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.nome} {emp.padrao ? '(Padrão)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Observações */}
            <div className="space-y-1">
              <Label className="text-xs text-slate-600 font-medium">Observações Adicionais</Label>
              <Textarea
                placeholder="Detalhes sobre a nota fiscal, contrato ou transação..."
                value={novasObs}
                onChange={(e) => setNovasObs(e.target.value)}
                rows={3}
                className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
              />
            </div>

            <SheetFooter className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDrawerOpen(false)}
                className="border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl w-full sm:w-auto"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl w-full sm:w-auto"
              >
                {saving ? 'Gravando...' : 'Salvar Lançamento'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* MODAL DE DETALHES DO LANÇAMENTO (Tema Claro SaaS) */}
      {detalheItem && (
        <Dialog open={!!detalheItem} onOpenChange={() => setDetalheItem(null)}>
          <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-lg rounded-2xl shadow-xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'p-1.5 rounded-lg text-white',
                    detalheItem.tipo === 'receita' ? 'bg-emerald-600' : 'bg-rose-600',
                  )}
                >
                  {detalheItem.tipo === 'receita' ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : (
                    <ArrowDownLeft className="w-4 h-4" />
                  )}
                </span>
                <DialogTitle className="text-lg text-slate-900 font-semibold">
                  Detalhes do Lançamento #{detalheItem.id}
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-slate-500 font-normal">
                Informações completas persistidas no banco blindado
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Descrição</span>
                  <span className="font-semibold text-slate-900">
                    {formatarDescricaoDetalheApresentacao(detalheItem, lancamentos)}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Valor</span>
                  <span
                    className={cn(
                      'font-semibold text-sm tabular-nums',
                      detalheItem.tipo === 'receita' ? 'text-emerald-600' : 'text-rose-600',
                    )}
                  >
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                      detalheItem.valor,
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Tipo / Status</span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="capitalize text-slate-700 border-slate-200">
                      {detalheItem.tipo}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={cn(
                        'font-medium text-xs',
                        infoDetalhe?.etiquetaPrincipal === 'Liquidado' &&
                          'bg-blue-50 text-blue-700 border border-blue-200',
                        infoDetalhe?.etiquetaPrincipal === 'Estornado' &&
                          'bg-slate-100 text-slate-600 border border-slate-200 line-through',
                        infoDetalhe?.etiquetaPrincipal === 'Estorno' &&
                          'bg-amber-50 text-amber-700 border border-amber-200',
                        infoDetalhe?.etiquetaPrincipal === 'Realizado' &&
                          'bg-emerald-50 text-emerald-700 border border-emerald-200',
                        infoDetalhe?.etiquetaPrincipal === 'Previsto' &&
                          'bg-amber-50 text-amber-700 border border-amber-200',
                      )}
                    >
                      {infoDetalhe?.etiquetaPrincipal || detalheItem.status}
                    </Badge>
                    {infoDetalhe &&
                      infoDetalhe.statusTecnico &&
                      infoDetalhe.statusTecnico !== infoDetalhe.etiquetaPrincipal.toLowerCase() && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({infoDetalhe.statusTecnico})
                        </span>
                      )}
                  </div>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Categoria</span>
                  <span className="text-slate-800 font-medium">
                    {obterNomeAtualCategoria(detalheItem, categorias)}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Departamento</span>
                  <span className="text-slate-800 font-medium">
                    {detalheItem.departamento || detalheItem.centro_custo || 'Não especificado'}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Conta Financeira</span>
                  <span className="text-slate-800 font-medium">
                    {detalheItem.conta || 'Não especificada'}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Competência</span>
                  <span className="text-blue-600 font-semibold">{detalheItem.competencia}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Data de competência</span>
                  <span className="text-slate-800">
                    {formatarDataCivil(detalheItem.data_lancamento, '-')}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Vencimento</span>
                  <span className="text-slate-800">
                    {formatarDataCivil(detalheItem.data_vencimento, '-')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Data de Realização</span>
                  <span className="text-slate-800 font-medium">
                    {infoDetalhe?.dataRealizacaoExibicao === '—'
                      ? '—'
                      : infoDetalhe?.dataRealizacaoExibicao
                        ? formatarDataCivil(infoDetalhe.dataRealizacaoExibicao)
                        : 'Pendente'}
                  </span>
                </div>
              </div>

              {/* Relação de Estorno no Detalhe (UX-EST-03) */}
              {(infoDetalhe?.originalReferenciado || infoDetalhe?.motivoEstorno) && (
                <div className="bg-amber-50/80 p-3.5 rounded-xl border border-amber-200/90 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-900 text-xs">
                    <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                    <span>Dados do Estorno</span>
                  </div>
                  {infoDetalhe.originalReferenciado && (
                    <div className="text-[11px] text-amber-900 space-y-0.5">
                      <p>
                        <span className="font-medium text-amber-950">Lançamento Original:</span>{' '}
                        {infoDetalhe.originalReferenciado.descricao}
                      </p>
                      <p>
                        <span className="font-medium text-amber-950">
                          Data do Lançamento Original:
                        </span>{' '}
                        {formatarDataCivil(infoDetalhe.originalReferenciado.data_lancamento, '-')}
                      </p>
                    </div>
                  )}
                  {infoDetalhe.motivoEstorno && (
                    <p className="text-[11px] text-amber-900">
                      <span className="font-medium text-amber-950">Motivo do Estorno:</span>{' '}
                      {infoDetalhe.motivoEstorno}
                    </p>
                  )}
                </div>
              )}

              {detalheItem.observacoes && (
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                  <span className="text-slate-500 block mb-1 font-medium">Observações:</span>
                  <p className="text-slate-800">
                    {formatarObservacoesDetalheApresentacao(detalheItem)}
                  </p>
                </div>
              )}

              {/* Rastreabilidade e Auditoria */}
              <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-blue-700 font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Trilha de Blindagem & Autoria</span>
                </div>
                <p className="text-slate-700">
                  Criado em: {new Date(detalheItem.created).toLocaleString('pt-BR')}
                </p>
                <p className="text-slate-500">
                  Identificador de autoria do usuário:{' '}
                  <span className="font-mono text-slate-800">{detalheItem.usuario_id}</span>
                </p>
                {detalheItem.estorno_de && (
                  <p className="text-amber-700 font-medium">
                    Contra-lançamento estornado referente a: ID #{detalheItem.estorno_de}
                  </p>
                )}
                {detalheItem.liquidacao_de && (
                  <p className="text-emerald-700 font-medium">
                    Liquidação / Pagamento referente ao lançamento: ID #{detalheItem.liquidacao_de}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDetalheItem(null)}
                className="border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl"
              >
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL DE EDIÇÃO CONTROLADA COM MOTIVO OBRIGATÓRIO (Tema Claro SaaS) */}
      {editItem && (
        <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
          <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-lg rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200">
                  <Edit className="w-4 h-4" />
                </span>
                <DialogTitle className="text-base text-slate-900 font-semibold">
                  Edição Controlada de Lançamento
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-slate-500 font-normal">
                Toda alteração é auditada e preserva o histórico ANTES/DEPOIS com usuário, carimbo
                de tempo e motivo obrigatório.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSalvarEdicaoControlada} className="space-y-3.5 py-2 text-xs">
              <div className="space-y-1">
                <Label className="text-xs text-slate-600 font-medium">Descrição *</Label>
                <Input
                  value={editDescricao}
                  onChange={(e) => setEditDescricao(e.target.value)}
                  className="bg-slate-50 border-slate-200 text-slate-900 text-xs rounded-xl"
                  placeholder="Descrição do lançamento"
                />
                {editErrors.descricao && (
                  <p className="text-[11px] text-rose-500 font-normal">{editErrors.descricao}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-600 font-medium">Valor (R$) *</Label>
                <Input
                  type="text"
                  value={editValor}
                  onChange={(e) => setEditValor(e.target.value)}
                  className="bg-slate-50 border-slate-200 text-slate-900 text-xs font-semibold tabular-nums rounded-xl"
                />
                {editErrors.valor && (
                  <p className="text-[11px] text-rose-500 font-normal">{editErrors.valor}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600 font-medium">Categoria *</Label>
                  <Select value={editCategoria} onValueChange={setEditCategoria}>
                    <SelectTrigger className="bg-slate-50 border-slate-200 text-xs text-slate-800 rounded-xl">
                      <SelectValue placeholder="Selecione categoria" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-slate-800 rounded-xl shadow-lg">
                      {categorias
                        .filter(
                          (c) =>
                            c.tipo === editItem.tipo &&
                            (c.ativa !== false || c.id === editItem.categoria_id),
                        )
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome} {c.ativa === false ? '(Inativa - Atual)' : ''}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {editErrors.categoria && (
                    <p className="text-[11px] text-rose-500 font-normal">{editErrors.categoria}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-600 font-medium">Departamento</Label>
                  <Select
                    value={editDepartamento || 'nenhum'}
                    onValueChange={(val) => setEditDepartamento(val === 'nenhum' ? '' : val)}
                  >
                    <SelectTrigger className="bg-slate-50 border-slate-200 text-xs rounded-xl">
                      <SelectValue placeholder="Selecione um departamento" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 rounded-xl shadow-lg">
                      <SelectItem value="nenhum">Nenhum</SelectItem>
                      {departamentos.map((dep) => (
                        <SelectItem key={dep.id} value={dep.nome}>
                          {dep.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600 font-medium">Conta Financeira</Label>
                  <Select value={editConta} onValueChange={setEditConta}>
                    <SelectTrigger className="bg-slate-50 border-slate-200 text-xs text-slate-800 rounded-xl">
                      <SelectValue placeholder="Selecione conta" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-slate-800 rounded-xl shadow-lg">
                      {contas.map((cta) => (
                        <SelectItem key={cta.id} value={cta.nome}>
                          {cta.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-600 font-medium">Data de competência</Label>
                  <Input
                    type="date"
                    value={editDataLancamento}
                    onChange={(e) => setEditDataLancamento(e.target.value)}
                    className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                  />
                  <p className="text-[10px] text-slate-500 font-normal">
                    Define o mês do lançamento na DRE.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600 font-medium">Vencimento</Label>
                  <Input
                    type="date"
                    value={editVencimento}
                    onChange={(e) => setEditVencimento(e.target.value)}
                    className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                  />
                </div>

                {editItem.status === 'realizado' && (
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600 font-medium">Realização *</Label>
                    <Input
                      type="date"
                      value={editRealizacao}
                      onChange={(e) => setEditRealizacao(e.target.value)}
                      className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                    />
                  </div>
                )}
              </div>

              {/* Alerta não bloqueante na edição quando vencimento for anterior à competência */}
              {editVencimento &&
                editDataLancamento &&
                editVencimento.slice(0, 10) < editDataLancamento.slice(0, 10) && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/90 text-[11px] text-amber-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      O vencimento é anterior à data de competência. Confirme se está correto.
                    </span>
                  </div>
                )}

              {empresas.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600 font-medium">Empresa / Unidade</Label>
                  <Select value={editEmpresaId} onValueChange={setEditEmpresaId}>
                    <SelectTrigger className="bg-slate-50 border-slate-200 text-xs text-slate-800 rounded-xl">
                      <SelectValue placeholder="Selecione a empresa..." />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-slate-800 rounded-xl shadow-lg">
                      {empresas.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.nome} {emp.padrao ? '(Padrão)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs text-slate-600 font-medium">Observações</Label>
                <Textarea
                  value={editObs}
                  onChange={(e) => setEditObs(e.target.value)}
                  rows={2}
                  className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                />
              </div>

              {/* CAMPO OBRIGATÓRIO DE AUDITORIA: MOTIVO */}
              <div className="space-y-1.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200/90">
                <div className="flex items-center gap-1.5 font-medium text-amber-900 text-xs">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  <span>Motivo da alteração (Obrigatório para Auditoria) *</span>
                </div>
                <Textarea
                  placeholder="Ex: Correção de categoria para emissão da DRE; Ajuste de valor conforme nota complementar..."
                  value={editMotivo}
                  onChange={(e) => setEditMotivo(e.target.value)}
                  rows={2}
                  className="bg-white border-amber-300 text-xs text-slate-900 rounded-xl placeholder:text-slate-400"
                />
                {editErrors.motivo && (
                  <p className="text-[11px] text-rose-600 font-semibold">{editErrors.motivo}</p>
                )}
                <p className="text-[10px] text-amber-800/80 font-normal">
                  Mínimo de 5 caracteres. Este motivo será gravado de forma imutável com usuário e
                  data/hora.
                </p>
              </div>

              <DialogFooter className="gap-2 sm:gap-0 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditItem(null)}
                  disabled={salvandoEdicao}
                  className="border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={salvandoEdicao}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium"
                >
                  {salvandoEdicao ? 'Gravando auditoria...' : 'Salvar Alteração'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE ESTORNO (Tema Claro SaaS) */}
      {estornoItem && (
        <Dialog open={!!estornoItem} onOpenChange={() => setEstornoItem(null)}>
          <DialogContent className="bg-white border-slate-200 text-slate-900 rounded-2xl shadow-xl">
            <DialogHeader>
              <DialogTitle className="text-lg text-slate-900 font-semibold flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-600" />
                Confirmar Estorno Financeiro
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 font-normal">
                Pelo princípio de blindagem, lançamentos contábeis nunca são apagados. Um
                contra-movimento de valor idêntico com sinal oposto será registrado na trilha de
                auditoria.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                <p className="font-semibold text-slate-900">{estornoItem.descricao}</p>
                <p className="text-slate-500 mt-1">
                  Valor original:{' '}
                  <strong className="text-slate-900 font-semibold">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                      estornoItem.valor,
                    )}
                  </strong>
                </p>
                <p className="text-slate-500">
                  Tipo original:{' '}
                  <strong className="capitalize text-slate-900 font-semibold">
                    {estornoItem.tipo}
                  </strong>
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-600 font-medium">
                  Justificativa do Estorno (Obrigatório) *
                </Label>
                <Textarea
                  placeholder="Ex: Lançamento duplicado pelo cliente, nota cancelada..."
                  value={motivoEstorno}
                  onChange={(e) => setMotivoEstorno(e.target.value)}
                  rows={3}
                  className="bg-slate-50 border-slate-200 text-slate-900 text-xs rounded-xl"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setEstornoItem(null)}
                className="border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmarEstorno}
                disabled={estornando}
                className="bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl"
              >
                {estornando ? 'Estornando...' : 'Confirmar Estorno'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
