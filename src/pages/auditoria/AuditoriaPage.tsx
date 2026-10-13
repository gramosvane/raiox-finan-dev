import React, { useState } from 'react'
import { verifyMasterPassword, getAuditoriaRegistros } from '@/services/financial'
import { AuditoriaRegistro } from '@/types/financial'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ShieldCheck,
  Lock,
  KeyRound,
  Eye,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  FileText,
  UserCheck,
  RotateCcw,
  LogIn,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export const AuditoriaPage: React.FC = () => {
  const { toast } = useToast()

  // Gate da Senha Mestra
  const [desbloqueado, setDesbloqueado] = useState(false)
  const [masterPassword, setMasterPassword] = useState('')
  const [validando, setValidando] = useState(false)
  const [erroGate, setErroGate] = useState('')

  // Dados da auditoria
  const [registros, setRegistros] = useState<AuditoriaRegistro[]>([])
  const [loading, setLoading] = useState(false)
  const [filtroAcao, setFiltroAcao] = useState<string>('todos')
  const [filtroTexto, setFiltroTexto] = useState('')
  const [paginaAtual, setPaginaAtual] = useState(1)
  const itensPorPagina = 50

  // Modal com payload completo do registro
  const [registroSelecionado, setRegistroSelecionado] = useState<AuditoriaRegistro | null>(null)

  const handleVerificarSenhaMestra = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!masterPassword) {
      setErroGate('Informe a senha mestra para desbloquear a auditoria.')
      return
    }

    setValidando(true)
    setErroGate('')

    try {
      const res = await verifyMasterPassword(masterPassword)
      if (res.authorized) {
        setDesbloqueado(true)
        toast({
          title: 'Acesso Autorizado',
          description: 'Trilha de auditoria blindada liberada com sucesso.',
        })
        carregarRegistros(res.token)
      } else {
        setErroGate(res.message || 'Senha mestra incorreta.')
      }
    } catch (err: any) {
      setErroGate(err?.message || 'Senha mestra incorreta ou não configurada.')
    } finally {
      setValidando(false)
    }
  }

  const carregarRegistros = async (token?: string) => {
    setLoading(true)
    try {
      const list = await getAuditoriaRegistros(token, { all: true })
      setRegistros(list)
    } catch (e: any) {
      console.error('Erro ao buscar auditoria:', e)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar auditoria',
        description: e?.message || 'Falha na comunicação com o servidor.',
      })
    } finally {
      setLoading(false)
    }
  }

  const registrosFiltrados = registros.filter((r) => {
    // Filtro por natureza / ação
    if (filtroAcao === 'todos') {
      // Todas as ações
    } else if (filtroAcao === 'criacao_lancamento') {
      // Somente natureza "Lançamento"
      if (r.acao !== 'criacao_lancamento') return false
      const nat = r.natureza || 'Lançamento'
      if (nat !== 'Lançamento') return false
    } else if (filtroAcao === 'estorno') {
      // Registros com acao 'estorno' OU criacao_lancamento com natureza 'Estorno'
      const isEstorno = r.acao === 'estorno' || r.natureza === 'Estorno'
      if (!isEstorno) return false
    } else if (filtroAcao === 'registro_recebimento') {
      // Registros com acao 'registro_recebimento' OU criacao_lancamento com natureza 'Recebimento'
      const isRecebimento = r.acao === 'registro_recebimento' || r.natureza === 'Recebimento'
      if (!isRecebimento) return false
    } else if (filtroAcao === 'registro_pagamento') {
      // Registros com acao 'registro_pagamento' OU criacao_lancamento com natureza 'Pagamento'
      const isPagamento = r.acao === 'registro_pagamento' || r.natureza === 'Pagamento'
      if (!isPagamento) return false
    } else if (filtroAcao === 'login') {
      if (r.acao !== 'login') return false
    } else if (r.acao !== filtroAcao) {
      return false
    }

    if (filtroTexto.trim()) {
      const q = filtroTexto.toLowerCase()
      const desc = (r.descricao || '').toLowerCase()
      const ac = (r.acao || '').toLowerCase()
      const nat = (r.natureza || '').toLowerCase()
      const uNome = (r.usuario_nome || '').toLowerCase()
      return desc.includes(q) || ac.includes(q) || nat.includes(q) || uNome.includes(q)
    }
    return true
  })

  // Paginação da tela: 50 em 50
  const totalFiltrados = registrosFiltrados.length
  const totalPaginas = Math.max(1, Math.ceil(totalFiltrados / itensPorPagina))
  const indiceInicio = (paginaAtual - 1) * itensPorPagina
  const indiceFim = Math.min(totalFiltrados, indiceInicio + itensPorPagina)
  const registrosExibidos = registrosFiltrados.slice(indiceInicio, indiceFim)

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-[28px] font-semibold text-slate-900 tracking-tight">
              Auditoria
            </h1>
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200/80 text-[11px] font-medium px-2.5 py-0.5 rounded-full">
              Somente Leitura
            </span>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1 font-normal">
            Rastreabilidade total e permanente de cada movimento, estorno e alteração no sistema.
          </p>
        </div>
      </div>

      {/* GATE DE SENHA MESTRA */}
      {!desbloqueado ? (
        <div className="flex items-center justify-center py-12">
          <Card className="w-full max-w-md bg-white border-slate-200/90 shadow-xl rounded-2xl">
            <CardHeader className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 mx-auto flex items-center justify-center shadow-xs">
                <Lock className="w-7 h-7" />
              </div>
              <CardTitle className="text-lg text-slate-900 font-semibold">
                Acesso Restrito — Senha Mestra
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 font-normal">
                Para consultar os registros imutáveis e salvaguardados, digite a senha mestra
                configurada para a sua empresa.
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleVerificarSenhaMestra}>
              <CardContent className="space-y-4">
                {erroGate && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2 font-normal">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-500" />
                    <span>{erroGate}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">Senha Mestra</Label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={masterPassword}
                      onChange={(e) => setMasterPassword(e.target.value)}
                      className="bg-slate-50 border-slate-200 pl-9 text-slate-900 rounded-xl text-sm"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 font-normal">
                    Informe a senha mestra exclusiva cadastrada para a empresa (definida no primeiro
                    uso em Configurações).
                  </p>
                </div>
              </CardContent>

              <CardFooter className="pt-2">
                <Button
                  type="submit"
                  disabled={validando}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl shadow-xs text-sm"
                >
                  {validando ? 'Validando hash de segurança...' : 'Desbloquear Trilha de Auditoria'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      ) : (
        /* CONTEÚDO LIBERADO DA AUDITORIA */
        <div className="space-y-4 animate-fade-in">
          {/* Barra de Filtros */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Filtrar eventos por descrição..."
                value={filtroTexto}
                onChange={(e) => {
                  setFiltroTexto(e.target.value)
                  setPaginaAtual(1)
                }}
                className="bg-slate-50 border-slate-200 pl-9 text-xs text-slate-800 rounded-xl"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 w-full sm:w-auto overflow-x-auto">
              {[
                { id: 'todos', label: 'Todas as Ações' },
                { id: 'criacao_lancamento', label: 'Lançamentos' },
                { id: 'estorno', label: 'Estornos' },
                { id: 'registro_recebimento', label: 'Recebimentos' },
                { id: 'registro_pagamento', label: 'Pagamentos' },
                { id: 'login', label: 'Logins' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setFiltroAcao(f.id)
                    setPaginaAtual(1)
                  }}
                  className={cn(
                    'px-3.5 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap',
                    filtroAcao === f.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tabela de Registros Somente Leitura */}
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700">
                {totalFiltrados > 0
                  ? `Mostrando ${indiceInicio + 1} a ${indiceFim} de ${totalFiltrados}`
                  : '0 registros'}
              </span>
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 w-fit">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                Coleção Blindada (update/delete bloqueados)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs md:text-sm">
                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-200/80">
                  <tr>
                    <th className="py-3 px-4">Data / Hora</th>
                    <th className="py-3 px-3">Tipo de Ação</th>
                    <th className="py-3 px-4">Descrição do Evento</th>
                    <th className="py-3 px-3">Usuário Responsável</th>
                    <th className="py-3 px-3 text-center">Detalhes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-xs text-slate-400">
                        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        Carregando registros de auditoria...
                      </td>
                    </tr>
                  ) : totalFiltrados === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-xs text-slate-400">
                        Nenhum registro encontrado para este filtro.
                      </td>
                    </tr>
                  ) : (
                    registrosExibidos.map((reg) => {
                      const nomeUsuarioExibicao =
                        reg.usuario_nome ||
                        reg.expand?.usuario_id?.name ||
                        reg.expand?.usuario_id?.email ||
                        (reg.usuario_id ? 'Usuário removido' : 'Sistema')

                      return (
                        <tr key={reg.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 text-xs font-normal text-slate-600 whitespace-nowrap">
                            {new Date(reg.created).toLocaleString('pt-BR')}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 border border-slate-200 text-slate-700">
                              {reg.acao.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs font-medium text-slate-900 max-w-md">
                            {reg.descricao}
                          </td>
                          <td className="py-3 px-3 text-xs text-slate-700 whitespace-nowrap font-medium">
                            {nomeUsuarioExibicao}
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setRegistroSelecionado(reg)}
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs h-7 px-2.5 rounded-lg font-medium"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              Payload
                            </Button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginação de 50 em 50 */}
            {totalPaginas > 1 && (
              <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <span>
                  Página {paginaAtual} de {totalPaginas}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={paginaAtual <= 1}
                    onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
                    className="text-xs h-8 px-3 rounded-lg"
                  >
                    Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={paginaAtual >= totalPaginas}
                    onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
                    className="text-xs h-8 px-3 rounded-lg"
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Payload Completo */}
      {registroSelecionado && (
        <Dialog open={!!registroSelecionado} onOpenChange={() => setRegistroSelecionado(null)}>
          <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-lg shadow-2xl rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-base text-slate-900 font-bold flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-600" />
                Registro de Auditoria #{registroSelecionado.id}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Snapshot imutável capturado no instante da operação
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/90 space-y-1.5">
                <p>
                  <span className="text-slate-500 font-medium">Ação:</span>{' '}
                  <strong className="text-slate-800">{registroSelecionado.acao}</strong>
                </p>
                <p>
                  <span className="text-slate-500 font-medium">Descrição:</span>{' '}
                  <strong className="text-slate-800">{registroSelecionado.descricao}</strong>
                </p>
                <p>
                  <span className="text-slate-500 font-medium">Data/Hora:</span>{' '}
                  <span className="text-slate-800 font-semibold">
                    {new Date(registroSelecionado.created).toLocaleString('pt-BR')}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500 font-medium">ID Usuário:</span>{' '}
                  <span className="font-mono text-slate-700">{registroSelecionado.usuario_id}</span>
                </p>
                {registroSelecionado.referencia_id && (
                  <p>
                    <span className="text-slate-500 font-medium">ID Referência:</span>{' '}
                    <span className="font-mono text-slate-700">
                      {registroSelecionado.referencia_id}
                    </span>
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                  Payload JSON Completo:
                </Label>
                <pre className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-48">
                  {JSON.stringify(registroSelecionado.detalhes || {}, null, 2)}
                </pre>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRegistroSelecionado(null)}
                className="border-slate-200 text-slate-600 hover:bg-slate-50 text-xs rounded-xl"
              >
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
