import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useCompetencia } from '@/contexts/CompetenciaContext'
import { getLancamentos } from '@/services/financial'
import { useRealtime } from '@/hooks/use-realtime'
import { obterPendenciasNotificacao, PendenciaNotificacao } from '@/lib/apresentacaoLancamentos'
import { formatarDataCivil } from '@/lib/dataCivil'
import pkg from '../../../package.json'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  LayoutDashboard,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  FileSpreadsheet,
  ShieldCheck,
  Settings,
  Users,
  Calculator,
  Wallet,
  Activity,
  ListTree,
  Hourglass,
  Repeat,
  BarChart3,
  PieChart,
  Menu,
  X,
  Bell,
  Search,
  Calendar,
  LogOut,
  ChevronDown,
  DollarSign,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AppLayoutProps {
  children: React.ReactNode
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { competencia, competenciaFormatada, setCompetencia, opcoesCompetencia } = useCompetencia()

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('gfe_sidebar_collapsed') === 'true'
  })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [pendencias, setPendencias] = useState<PendenciaNotificacao[]>([])
  const [popoverOpen, setPopoverOpen] = useState(false)

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('gfe_sidebar_collapsed', String(next))
      return next
    })
  }

  // Carregar pendências abertas usando a regra unificada de apresentação (UX-NOT-01)
  const loadPendencias = async () => {
    try {
      const lancs = await getLancamentos()
      const lista = obterPendenciasNotificacao(lancs as any)
      setPendencias(lista)
    } catch (e) {
      console.error('Erro ao buscar pendencias:', e)
    }
  }

  useEffect(() => {
    loadPendencias()
  }, [competencia])

  useRealtime('lancamentos', () => {
    loadPendencias()
  })

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/lancamentos?busca=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  // Itens de navegação da barra lateral (estilo clean, sem headers de agrupamento)
  const navItems = [
    {
      title: 'Painel Executivo',
      path: '/dashboard',
      icon: LayoutDashboard,
      color: 'text-blue-600',
      activeBg: 'bg-blue-50 text-blue-700',
      hoverBg: 'hover:bg-blue-50/70',
    },
    {
      title: 'Lançamentos',
      path: '/lancamentos',
      icon: ArrowLeftRight,
      color: 'text-indigo-600',
      activeBg: 'bg-indigo-50 text-indigo-700',
      hoverBg: 'hover:bg-indigo-50/70',
    },
    {
      title: 'Contas a Receber',
      path: '/contas-a-receber',
      icon: TrendingUp,
      color: 'text-emerald-600',
      activeBg: 'bg-emerald-50 text-emerald-700',
      hoverBg: 'hover:bg-emerald-50/70',
    },
    {
      title: 'Contas a Pagar',
      path: '/contas-a-pagar',
      icon: TrendingDown,
      color: 'text-rose-600',
      activeBg: 'bg-rose-50 text-rose-700',
      hoverBg: 'hover:bg-rose-50/70',
    },
    {
      title: 'Fechamento de caixa',
      path: '/fechamento-caixa',
      icon: Calculator,
      color: 'text-teal-600',
      activeBg: 'bg-teal-50 text-teal-700',
      hoverBg: 'hover:bg-teal-50/70',
    },
    {
      title: 'Orçamento',
      path: '/orcamento',
      icon: Wallet,
      color: 'text-cyan-600',
      activeBg: 'bg-cyan-50 text-cyan-700',
      hoverBg: 'hover:bg-cyan-50/70',
    },
    {
      title: 'Receita',
      path: '/receita',
      icon: BarChart3,
      color: 'text-emerald-600',
      activeBg: 'bg-emerald-50 text-emerald-700',
      hoverBg: 'hover:bg-emerald-50/70',
    },
    {
      title: 'Custo da operação',
      path: '/custos',
      icon: PieChart,
      color: 'text-rose-600',
      activeBg: 'bg-rose-50 text-rose-700',
      hoverBg: 'hover:bg-rose-50/70',
    },
    {
      title: 'Indicadores',
      path: '/indicadores',
      icon: Activity,
      color: 'text-fuchsia-600',
      activeBg: 'bg-fuchsia-50 text-fuchsia-700',
      hoverBg: 'hover:bg-fuchsia-50/70',
    },
    {
      title: 'Relatórios',
      path: '/relatorios',
      icon: FileSpreadsheet,
      color: 'text-purple-600',
      activeBg: 'bg-purple-50 text-purple-700',
      hoverBg: 'hover:bg-purple-50/70',
    },
    {
      title: 'Auditoria',
      path: '/auditoria',
      icon: ShieldCheck,
      color: 'text-amber-600',
      activeBg: 'bg-amber-50 text-amber-700',
      hoverBg: 'hover:bg-amber-50/70',
    },
    {
      title: 'Depreciação e troca',
      path: '/depreciacao',
      icon: Hourglass,
      color: 'text-orange-600',
      activeBg: 'bg-orange-50 text-orange-700',
      hoverBg: 'hover:bg-orange-50/70',
    },
    {
      title: 'Recorrências',
      path: '/recorrencias',
      icon: Repeat,
      color: 'text-violet-600',
      activeBg: 'bg-violet-50 text-violet-700',
      hoverBg: 'hover:bg-violet-50/70',
    },
    {
      title: 'Plano de categorias',
      path: '/plano-categorias',
      icon: ListTree,
      color: 'text-lime-600',
      activeBg: 'bg-lime-50 text-lime-700',
      hoverBg: 'hover:bg-lime-50/70',
    },
    ...(user?.role === 'administrador'
      ? [
          {
            title: 'Usuários',
            path: '/usuarios',
            icon: Users,
            color: 'text-sky-600',
            activeBg: 'bg-sky-50 text-sky-700',
            hoverBg: 'hover:bg-sky-50/70',
          },
        ]
      : []),
    {
      title: 'Configurações',
      path: '/configuracoes',
      icon: Settings,
      color: 'text-slate-600',
      activeBg: 'bg-slate-100 text-slate-800',
      hoverBg: 'hover:bg-slate-100/70',
    },
  ]

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans antialiased selection:bg-blue-600 selection:text-white">
      {/* HEADER SUPERIOR FIXO (64px) - SaaS Moderno Clean */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/80 z-40 px-4 md:px-6 flex items-center justify-between shadow-xs">
        {/* Esquerda: Hambúrguer mobile & Logo */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Abrir menu lateral"
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Botão de colapsar sidebar em desktop */}
          <button
            type="button"
            aria-label="Alternar barra lateral"
            onClick={toggleSidebar}
            className="hidden md:flex p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <DollarSign className="w-5 h-5 font-bold" />
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="font-bold text-base tracking-tight text-slate-900 flex items-center gap-1.5">
                Raio-X Financeiro
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 tracking-wider">
                  Pro
                </span>
              </span>
              <span className="text-[11px] text-slate-500 -mt-0.5 font-medium">
                Gestão Empresarial Blindada
              </span>
            </div>
          </div>
        </div>

        {/* Centro: Buscador global (desktop) */}
        <div className="hidden lg:flex items-center flex-1 max-w-md mx-8">
          <form onSubmit={handleSearchSubmit} className="relative w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por descrição, conta, cliente ou categoria..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50/90 hover:bg-slate-100/80 focus:bg-white border border-slate-200/90 rounded-full pl-9 pr-4 py-2 text-xs md:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all shadow-xs"
            />
          </form>
        </div>

        {/* Direita: Alertas + Selo do mês + Perfil */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Selo do Mês de Competência */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200/90 px-3.5 py-1.5 rounded-full text-xs md:text-sm font-semibold text-slate-700 transition shadow-2xs group"
              >
                <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span className="capitalize">{competenciaFormatada}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="bg-white border-slate-200 text-slate-800 shadow-xl rounded-2xl p-1.5 max-h-80 overflow-y-auto w-56"
            >
              <DropdownMenuLabel className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
                Mês de Competência
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-100" />
              {opcoesCompetencia.map((op) => (
                <DropdownMenuItem
                  key={op.value}
                  onClick={() => setCompetencia(op.value)}
                  className={cn(
                    'cursor-pointer rounded-xl px-2.5 py-2 flex justify-between items-center text-xs font-medium transition',
                    competencia === op.value
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'hover:bg-slate-50 text-slate-700',
                  )}
                >
                  <span className="capitalize">{op.label}</span>
                  {competencia === op.value && (
                    <span className="w-2 h-2 rounded-full bg-blue-600" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sino de Alertas / Pendências (UX-NOT-01) */}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={
                  pendencias.length > 0
                    ? `Alertas (${pendencias.length} pendências)`
                    : 'Alertas (Nenhuma pendência)'
                }
                className="relative p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
              >
                <Bell className="w-5 h-5" />
                {pendencias.length > 0 && (
                  <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs">
                    {pendencias.length > 99 ? '99+' : pendencias.length}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-80 md:w-96 bg-white border border-slate-200 text-slate-800 shadow-xl rounded-2xl p-0 overflow-hidden"
            >
              <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold text-slate-900">Pendências Financeiras</span>
                </div>
                {pendencias.length > 0 && (
                  <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                    {pendencias.length} {pendencias.length === 1 ? 'pendência' : 'pendências'}
                  </span>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {pendencias.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 space-y-1">
                    <p className="font-semibold text-slate-700">Nenhuma pendência.</p>
                    <p className="text-[11px] text-slate-400">
                      Todos os compromissos previstos estão em dia.
                    </p>
                  </div>
                ) : (
                  pendencias.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        setPopoverOpen(false)
                        navigate(item.destinoRota)
                      }}
                      className="p-3 hover:bg-slate-50/80 cursor-pointer transition flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'text-[10px] uppercase font-bold px-1.5 py-0.2 rounded',
                              item.tipo === 'despesa'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200',
                            )}
                          >
                            {item.tipo === 'despesa' ? 'Pagar' : 'Receber'}
                          </span>
                          <span
                            className={cn(
                              'text-[10px] font-semibold px-1.5 py-0.2 rounded-full',
                              item.motivo === 'Vencida' && 'bg-rose-100 text-rose-800',
                              item.motivo === 'Vence hoje' && 'bg-amber-100 text-amber-800',
                              item.motivo === 'Sem vencimento — cadastro incompleto' &&
                                'bg-slate-100 text-slate-700',
                            )}
                          >
                            {item.motivo}
                          </span>
                        </div>
                        <p className="font-medium text-slate-900 truncate">{item.descricao}</p>
                        <p className="text-[11px] text-slate-400">
                          {item.data_vencimento
                            ? `Vencimento: ${formatarDataCivil(item.data_vencimento)}`
                            : 'Vencimento não informado'}
                        </p>
                      </div>

                      <div className="text-right shrink-0 space-y-1">
                        <span
                          className={cn(
                            'font-semibold tabular-nums text-xs',
                            item.tipo === 'receita' ? 'text-emerald-600' : 'text-rose-600',
                          )}
                        >
                          {new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          }).format(item.valor)}
                        </span>
                        <div className="text-[10px] text-blue-600 font-medium flex items-center justify-end gap-0.5">
                          <span>Ver</span>
                          <ChevronRight className="w-3 h-3" />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Divisor vertical */}
          <div className="h-6 w-px bg-slate-200 hidden sm:block" />

          {/* Perfil no Header */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 p-1 pl-1.5 pr-2.5 rounded-full hover:bg-slate-100 border border-transparent hover:border-slate-200 transition"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-xs">
                  {user?.name ? user.name.slice(0, 2).toUpperCase() : 'GF'}
                </div>
                <div className="hidden xl:flex flex-col text-left">
                  <span className="text-xs font-semibold text-slate-800 leading-tight truncate max-w-[120px]">
                    {user?.name || 'Administrador'}
                  </span>
                  <span className="text-[10px] text-slate-400 leading-tight">
                    {user?.role === 'operador'
                      ? 'Operador'
                      : user?.role === 'leitura'
                        ? 'Leitura'
                        : 'Admin'}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden xl:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 bg-white border-slate-200 text-slate-800 shadow-xl rounded-2xl p-1.5"
            >
              <DropdownMenuLabel className="font-normal px-2.5 py-2">
                <div className="flex flex-col space-y-0.5">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {user?.name || 'Administrador'}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-100" />
              <DropdownMenuItem
                onClick={() => navigate('/configuracoes')}
                className="cursor-pointer rounded-xl px-2.5 py-2 text-xs hover:bg-slate-50 text-slate-700"
              >
                <Settings className="w-4 h-4 mr-2 text-slate-500" />
                <span>Configurações</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-slate-100" />
              <DropdownMenuItem
                onClick={() => {
                  logout()
                  navigate('/')
                }}
                className="cursor-pointer rounded-xl px-2.5 py-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-medium"
              >
                <LogOut className="w-4 h-4 mr-2" />
                <span>Sair da conta</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex pt-16 min-h-[calc(100vh-64px)]">
        {/* SIDEBAR DESKTOP - Clara, Moderna, com ícones coloridos */}
        <aside
          className={cn(
            'hidden md:flex flex-col fixed top-16 bottom-0 left-0 bg-white border-r border-slate-200/90 z-30 transition-all duration-200 ease-in-out shadow-xs',
            sidebarCollapsed ? 'w-20' : 'w-64',
          )}
        >
          {/* Navegação direta e clean (sem títulos de agrupamento) */}
          <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={sidebarCollapsed ? item.title : undefined}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs md:text-sm font-medium transition-all group relative',
                    isActive
                      ? cn(item.activeBg, 'shadow-xs font-semibold')
                      : cn('text-slate-600 hover:text-slate-900', item.hoverBg),
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105',
                      isActive ? 'bg-white shadow-xs' : 'bg-slate-50',
                    )}
                  >
                    <Icon className={cn('w-4 h-4', item.color)} />
                  </div>
                  {!sidebarCollapsed && (
                    <span className="truncate flex-1 tracking-tight">{item.title}</span>
                  )}
                  {!sidebarCollapsed && isActive && (
                    <div className="w-1.5 h-4 rounded-full bg-blue-600 ml-auto" />
                  )}
                </NavLink>
              )
            })}
          </nav>

          {/* Rodapé da Sidebar: Indicador de Sistema Blindado */}
          {!sidebarCollapsed && (
            <div className="p-3 mx-3 mb-3 bg-gradient-to-br from-blue-50/80 to-indigo-50/60 rounded-2xl border border-blue-100/80">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-800 leading-tight">
                    Auditoria Imutável
                  </p>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    Kernel protegido & blindado
                  </p>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* DRAWER MOBILE */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            {/* Overlay escuro */}
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />

            <div className="relative w-72 max-w-xs bg-white h-full shadow-2xl flex flex-col z-10 border-r border-slate-200">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
                    <DollarSign className="w-5 h-5 font-bold" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 text-sm">Raio-X Financeiro</span>
                    <p className="text-[10px] text-slate-400">Gestão Empresarial</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                  const Icon = item.icon
                  const isActive = location.pathname === item.path
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all',
                        isActive
                          ? cn(item.activeBg, 'shadow-xs font-semibold')
                          : cn('text-slate-600 hover:text-slate-900', item.hoverBg),
                      )}
                    >
                      <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center">
                        <Icon className={cn('w-4 h-4', item.color)} />
                      </div>
                      <span className="truncate">{item.title}</span>
                    </NavLink>
                  )
                })}
              </nav>

              <div className="p-3 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                    {user?.name ? user.name.slice(0, 2).toUpperCase() : 'GF'}
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-semibold text-slate-800 truncate">
                      {user?.name || 'Administrador'}
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    logout()
                    navigate('/')
                  }}
                  className="p-2 rounded-lg text-rose-500 hover:bg-rose-50"
                  title="Sair"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ÁREA DE CONTEÚDO PRINCIPAL */}
        <div
          className={cn(
            'flex-1 flex flex-col transition-all duration-200 ease-in-out',
            sidebarCollapsed ? 'md:ml-20' : 'md:ml-64',
          )}
        >
          <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1800px] w-full mx-auto animate-fade-in">
            {children}
          </main>

          {/* FOOTER DISCRETO */}
          <footer className="border-t border-slate-200/80 py-4 px-6 text-center text-xs text-slate-500 bg-white/50">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 max-w-[1800px] mx-auto">
              <span>
                Gestão Financeira Empresarial &copy; {new Date().getFullYear()} — Painel Executivo
                Blindado
              </span>
              <span className="text-slate-400 font-medium">Versão {pkg.version}</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}
