import React, { useCallback, useEffect, useMemo, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { hojeBrasil, formatarDataCivil } from '@/lib/dataCivil'
import { getCategorias } from '@/services/financial'
import type { Categoria } from '@/types/financial'
import { SeletorContaBaixa } from '@/components/SeletorContaBaixa'
import { Button } from '@/components/ui/button'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Landmark, Loader2, Plus, Trash2 } from 'lucide-react'

interface TituloAberto {
  id: string
  descricao: string
  valor: number
  data_vencimento?: string
  data_lancamento?: string
}

interface Deposito {
  id: string
  data_deposito: string
  conta: string
  valor_bruto: number
  valor_liquido: number
  taxa: number
  percentual: number
  qtd_titulos: number
  titulos: Array<{ id: string; descricao: string; valor: number }>
  linhas_extrato: Array<{ rotulo: string; valor: number }>
  observacao?: string
  created: string
}

interface Correcao {
  id: string
  deposito_id: string
  liquido_anterior: number
  liquido_novo: number
  taxa_nova: number
  motivo: string
  created: string
}

interface PermissaoLinha {
  id: string
  chave: string
  valor: string
}

interface LinhaExtrato {
  rotulo: string
  valor: string
}

const ROTULOS_EXTRATO = [
  'Mastercard débito',
  'Mastercard crédito',
  'Visa débito',
  'Visa crédito',
  'Elo débito',
  'PIX',
]

const brl = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const num = (txt: string) => {
  const n = Number(String(txt).replace(',', '.'))
  return isFinite(n) && n > 0 ? n : 0
}

const centavos = (v: number) => Math.round((Number(v) || 0) * 100)

// Chave única do envio (protege contra duplo clique). crypto.randomUUID só existe em página segura (https),
// por isso usamos getRandomValues, que funciona também em http na rede local.
const novaChave = () => {
  const b = new Uint8Array(12)
  crypto.getRandomValues(b)
  return 'k' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

interface Props {
  onMudou?: () => void
}

export const DepositosMaquineta: React.FC<Props> = ({ onMudou }) => {
  const { user } = useAuth()
  const { toast } = useToast()
  const ehAdmin = user?.role === 'administrador'

  const [depositos, setDepositos] = useState<Deposito[]>([])
  const [correcoes, setCorrecoes] = useState<Correcao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [categoriasDespesa, setCategoriasDespesa] = useState<Categoria[]>([])
  const [permissoes, setPermissoes] = useState<Record<string, PermissaoLinha>>({})
  const [catTaxaId, setCatTaxaId] = useState('')
  const [tetoTxt, setTetoTxt] = useState('5')

  // diálogo de registro
  const [aberto, setAberto] = useState(false)
  const [abertos, setAbertos] = useState<TituloAberto[]>([])
  const [carregandoTitulos, setCarregandoTitulos] = useState(false)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [dataDeposito, setDataDeposito] = useState(() => hojeBrasil())
  const [conta, setConta] = useState('')
  const [linhas, setLinhas] = useState<LinhaExtrato[]>([{ rotulo: '', valor: '' }])
  const [obs, setObs] = useState('')
  const [confirmaAlta, setConfirmaAlta] = useState(false)
  const [chave, setChave] = useState(novaChave())
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  // diálogo de correção
  const [corrigindo, setCorrigindo] = useState<Deposito | null>(null)
  const [novoLiquido, setNovoLiquido] = useState('')
  const [motivo, setMotivo] = useState('')
  const [confirmaAltaCorr, setConfirmaAltaCorr] = useState(false)
  const [erroCorr, setErroCorr] = useState('')
  const [enviandoCorr, setEnviandoCorr] = useState(false)

  const teto = useMemo(() => {
    const n = Number(String(tetoTxt).replace(',', '.'))
    return isFinite(n) && n > 0 && n <= 100 ? n : 5
  }, [tetoTxt])

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [deps, cors, perms, cats] = await Promise.all([
        pb.collection('depositos').getList<Deposito>(1, 30, { sort: '-created' }),
        pb.collection('depositos_correcoes').getFullList<Correcao>({ sort: '-created' }),
        pb.collection('permissoes').getFullList<PermissaoLinha>(),
        getCategorias('despesa', true),
      ])
      setDepositos(deps.items)
      setCorrecoes(cors)
      setCategoriasDespesa(cats)
      const m: Record<string, PermissaoLinha> = {}
      for (const p of perms) m[p.chave] = p
      setPermissoes(m)
      setCatTaxaId(m['categoria_taxa_id']?.valor || '')
      setTetoTxt(m['deposito_taxa_teto']?.valor || '5')
    } catch {
      // coleções ainda inexistentes (servidor antigo) ou sem permissão: a tela fica vazia
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const vigente = (d: Deposito) => {
    const c = correcoes.find((x) => x.deposito_id === d.id)
    return c
      ? { liquido: c.liquido_novo, taxa: c.taxa_nova, corrigido: true }
      : { liquido: d.valor_liquido, taxa: d.taxa, corrigido: false }
  }

  const salvarConfig = async () => {
    try {
      const itens: Array<[string, string]> = [
        ['categoria_taxa_id', catTaxaId],
        ['deposito_taxa_teto', String(teto)],
      ]
      for (const [k, valor] of itens) {
        if (!valor) continue
        const reg = permissoes[k]
        if (reg) await pb.collection('permissoes').update(reg.id, { valor })
        else await pb.collection('permissoes').create({ chave: k, valor })
      }
      toast({ title: 'Configuração da taxa salva' })
      await carregar()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível salvar',
        description: err?.response?.message || err?.message || 'Tente novamente.',
      })
    }
  }

  const abrirRegistro = async () => {
    setAberto(true)
    setErro('')
    setMarcados(new Set())
    setBusca('')
    setConta('')
    setLinhas([{ rotulo: '', valor: '' }])
    setObs('')
    setConfirmaAlta(false)
    setDataDeposito(hojeBrasil())
    setChave(novaChave())
    setCarregandoTitulos(true)
    try {
      const [previstos, baixas] = await Promise.all([
        pb.collection('lancamentos').getFullList<TituloAberto>({
          filter: "tipo = 'receita' && status = 'previsto' && estorno_de = '' && liquidacao_de = ''",
          sort: 'data_vencimento',
        }),
        pb.collection('lancamentos').getFullList<{ liquidacao_de: string }>({
          filter: "liquidacao_de != '' && status != 'estornado'",
          fields: 'liquidacao_de',
        }),
      ])
      const jaBaixados = new Set(baixas.map((b) => b.liquidacao_de))
      setAbertos(previstos.filter((p) => !jaBaixados.has(p.id)))
    } catch {
      setErro('Não foi possível carregar os títulos em aberto.')
    } finally {
      setCarregandoTitulos(false)
    }
  }

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return t ? abertos.filter((a) => a.descricao.toLowerCase().includes(t)) : abertos
  }, [abertos, busca])

  const brutoC = abertos.filter((a) => marcados.has(a.id)).reduce((s, a) => s + centavos(a.valor), 0)
  const liquidoC = linhas.reduce((s, l) => s + centavos(num(l.valor)), 0)
  const taxaC = brutoC - liquidoC
  const percentual = brutoC > 0 && taxaC > 0 ? Math.round((taxaC / brutoC) * 10000) / 100 : 0
  const liquidoMaior = liquidoC > brutoC && brutoC > 0
  const taxaAlta = percentual > teto
  const semCategoria = taxaC > 0 && !catTaxaId

  const marcarVencidos = () => {
    const prox = new Set(marcados)
    for (const a of visiveis) {
      const venc = String(a.data_vencimento || '').slice(0, 10)
      if (venc && venc <= dataDeposito) prox.add(a.id)
    }
    setMarcados(prox)
  }

  const alternar = (id: string) => {
    const prox = new Set(marcados)
    if (prox.has(id)) prox.delete(id)
    else prox.add(id)
    setMarcados(prox)
  }

  const atualizaLinha = (i: number, campo: keyof LinhaExtrato, valor: string) =>
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)))

  const registrar = async () => {
    setErro('')
    if (marcados.size === 0) return setErro('Marque os títulos que o banco pagou.')
    if (!conta) return setErro('Escolha a conta bancária onde o dinheiro caiu.')
    if (liquidoC <= 0) return setErro('Informe o valor que caiu (linhas do extrato).')
    if (liquidoMaior) return setErro('O valor que caiu é maior que o bruto dos títulos. Confira a seleção.')
    if (semCategoria) return setErro('Escolha a categoria da taxa na configuração (no fim desta seção).')
    if (taxaAlta && !confirmaAlta) return setErro('A taxa está acima do limite: confira e confirme abaixo.')
    setEnviando(true)
    try {
      await pb.send('/backend/v1/deposito/registrar', {
        method: 'POST',
        body: {
          chave,
          data_deposito: dataDeposito,
          conta,
          titulos: Array.from(marcados),
          linhas: linhas
            .filter((l) => num(l.valor) > 0)
            .map((l) => ({ rotulo: l.rotulo.trim(), valor: num(l.valor) })),
          observacao: obs.trim(),
          confirmar_taxa_alta: confirmaAlta,
        },
      })
      toast({ title: 'Depósito registrado', description: 'Títulos baixados e taxa lançada.' })
      setAberto(false)
      await carregar()
      onMudou?.()
    } catch (err: any) {
      setErro(err?.response?.message || err?.message || 'Não foi possível registrar o depósito.')
    } finally {
      setEnviando(false)
    }
  }

  const abrirCorrecao = (d: Deposito) => {
    setCorrigindo(d)
    setNovoLiquido('')
    setMotivo('')
    setConfirmaAltaCorr(false)
    setErroCorr('')
  }

  const novaTaxaCorr = corrigindo ? centavos(corrigindo.valor_bruto) - centavos(num(novoLiquido)) : 0
  const percCorr =
    corrigindo && novaTaxaCorr > 0
      ? Math.round((novaTaxaCorr / centavos(corrigindo.valor_bruto)) * 10000) / 100
      : 0

  const corrigir = async () => {
    if (!corrigindo) return
    setErroCorr('')
    if (!(num(novoLiquido) > 0)) return setErroCorr('Informe o valor correto que caiu no banco.')
    if (motivo.trim().length < 5) return setErroCorr('Informe o motivo (mínimo 5 letras).')
    if (percCorr > teto && !confirmaAltaCorr) return setErroCorr('A taxa ficaria acima do limite: confirme abaixo.')
    setEnviandoCorr(true)
    try {
      await pb.send('/backend/v1/deposito/corrigir', {
        method: 'POST',
        body: {
          id: corrigindo.id,
          valor_liquido: num(novoLiquido),
          motivo: motivo.trim(),
          confirmar_taxa_alta: confirmaAltaCorr,
        },
      })
      toast({ title: 'Depósito corrigido', description: 'A taxa foi refeita; o histórico foi preservado.' })
      setCorrigindo(null)
      await carregar()
      onMudou?.()
    } catch (err: any) {
      setErroCorr(err?.response?.message || err?.message || 'Não foi possível corrigir.')
    } finally {
      setEnviandoCorr(false)
    }
  }

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4 min-w-0 max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Landmark className="w-4 h-4 text-slate-500" />
            Depósitos da maquineta
          </h2>
          <p className="text-xs text-slate-500">
            Marque os títulos que o banco pagou e informe o valor que caiu: o sistema baixa pelo bruto e
            lança a taxa sozinho.
          </p>
        </div>
        {ehAdmin && (
          <Button type="button" onClick={abrirRegistro} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            Registrar depósito
          </Button>
        )}
      </div>

      {carregando ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : depositos.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum depósito registrado ainda.</p>
      ) : (
        <div className="overflow-x-auto max-w-full">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-2">Depósito</th>
                <th className="pr-2">Conta</th>
                <th className="pr-2">Bruto</th>
                <th className="pr-2">Caiu no banco</th>
                <th className="pr-2">Taxa</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {depositos.map((d) => {
                const v = vigente(d)
                const perc = d.valor_bruto > 0 ? Math.round((v.taxa / d.valor_bruto) * 10000) / 100 : 0
                return (
                  <tr key={d.id} className="border-b align-top">
                    <td className="py-2 pr-2">
                      {formatarDataCivil(d.data_deposito)}
                      {v.corrigido && <span className="ml-1 text-amber-700">(corrigido)</span>}
                      <details className="text-[11px] text-slate-500">
                        <summary className="cursor-pointer">
                          {d.qtd_titulos} título(s): composição
                        </summary>
                        <ul className="list-disc pl-4">
                          {(d.titulos || []).map((t) => (
                            <li key={t.id}>
                              {t.descricao}: {brl(t.valor)}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-1">
                          Extrato:{' '}
                          {(d.linhas_extrato || [])
                            .map((l) => `${l.rotulo || 'linha'} ${brl(l.valor)}`)
                            .join(' · ')}
                        </div>
                      </details>
                    </td>
                    <td className="pr-2">{d.conta}</td>
                    <td className="pr-2">{brl(d.valor_bruto)}</td>
                    <td className="pr-2">{brl(v.liquido)}</td>
                    <td className="pr-2">
                      {brl(v.taxa)} ({perc.toLocaleString('pt-BR')}%)
                    </td>
                    <td>
                      {ehAdmin && (
                        <Button type="button" variant="outline" size="sm" onClick={() => abrirCorrecao(d)}>
                          Corrigir
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {ehAdmin && (
        <div className="border-t pt-4 space-y-3">
          <div className="text-sm font-medium text-slate-800">Configuração da taxa de maquineta</div>
          <p className="text-xs text-slate-500">
            A taxa é lançada como despesa na categoria escolhida (despesa financeira, como o contador
            orienta). Acima do limite, o sistema não presume que a diferença é taxa e pede confirmação.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 min-w-[260px]">
              <Label className="text-xs text-slate-600">Categoria da taxa</Label>
              <Select value={catTaxaId} onValueChange={setCatTaxaId}>
                <SelectTrigger aria-label="Categoria da taxa de maquineta">
                  <SelectValue placeholder="Escolha a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categoriasDespesa.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 w-32">
              <Label htmlFor="dep-teto" className="text-xs text-slate-600">
                Limite da taxa (%)
              </Label>
              <Input id="dep-teto" inputMode="decimal" value={tetoTxt} onChange={(e) => setTetoTxt(e.target.value)} />
            </div>
            <Button type="button" variant="outline" onClick={salvarConfig}>
              Salvar
            </Button>
          </div>
        </div>
      )}

      <Dialog open={aberto} onOpenChange={(v) => !v && setAberto(false)}>
        <DialogContent className="bg-white sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar depósito da maquineta</DialogTitle>
            <DialogDescription>
              Marque os títulos que o banco pagou, informe cada linha do extrato (o valor que caiu) e confira
              a taxa. A baixa não pode ser desfeita; o valor que caiu pode ser corrigido depois.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            {erro && <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">{erro}</div>}

            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1 w-44">
                <Label htmlFor="dep-data" className="text-xs text-slate-600">
                  Data em que caiu no banco
                </Label>
                <Input id="dep-data" type="date" value={dataDeposito} onChange={(e) => setDataDeposito(e.target.value)} />
              </div>
              <div className="min-w-[240px]">
                <SeletorContaBaixa
                  id="dep-conta"
                  rotulo="Conta onde caiu"
                  tipos={['banco']}
                  value={conta}
                  onChange={setConta}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs text-slate-600">Títulos em aberto ({abertos.length})</Label>
                <Input
                  aria-label="Buscar título"
                  placeholder="Buscar (ex.: PIX, débito, crédito)"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="h-8 w-60 text-xs"
                />
                <Button type="button" variant="outline" size="sm" onClick={marcarVencidos}>
                  Marcar tudo que venceu até esta data
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setMarcados(new Set())}>
                  Limpar
                </Button>
              </div>
              <div className="border rounded-xl max-h-64 overflow-y-auto">
                {carregandoTitulos ? (
                  <div className="p-3 text-xs text-slate-600 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando títulos...
                  </div>
                ) : visiveis.length === 0 ? (
                  <div className="p-3 text-xs text-slate-500">Nenhum título em aberto.</div>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {visiveis.map((a) => {
                        const venc = String(a.data_vencimento || '').slice(0, 10)
                        const futuro = venc && venc > dataDeposito
                        return (
                          <tr key={a.id} className={`border-b ${futuro ? 'text-slate-400' : ''}`}>
                            <td className="p-2 w-8">
                              <input
                                type="checkbox"
                                aria-label={`Marcar ${a.descricao}`}
                                checked={marcados.has(a.id)}
                                onChange={() => alternar(a.id)}
                              />
                            </td>
                            <td className="p-2">{a.descricao}</td>
                            <td className="p-2 whitespace-nowrap">
                              {venc ? formatarDataCivil(venc) : 'sem vencimento'}
                              {futuro ? ' (futuro)' : ''}
                            </td>
                            <td className="p-2 text-right whitespace-nowrap">{brl(a.valor)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-600">Linhas do extrato do banco (o valor que caiu)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLinhas((ls) => [...ls, { rotulo: '', valor: '' }])}
                >
                  <Plus className="w-4 h-4 mr-1" /> Adicionar linha
                </Button>
              </div>
              <datalist id="rotulos-extrato">
                {ROTULOS_EXTRATO.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              {linhas.map((l, i) => (
                <div key={i} className="grid gap-2 grid-cols-[1fr_150px_40px] items-center">
                  <Input
                    aria-label={`Descrição da linha ${i + 1} do extrato`}
                    list="rotulos-extrato"
                    placeholder="Ex.: Mastercard débito"
                    value={l.rotulo}
                    onChange={(e) => atualizaLinha(i, 'rotulo', e.target.value)}
                  />
                  <Input
                    aria-label={`Valor da linha ${i + 1} do extrato`}
                    inputMode="decimal"
                    placeholder="Valor"
                    value={l.valor}
                    onChange={(e) => atualizaLinha(i, 'valor', e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover linha ${i + 1}`}
                    disabled={linhas.length === 1}
                    onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Títulos marcados ({marcados.size}), bruto</span>
                <b>{brl(brutoC / 100)}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Caiu no banco (soma das linhas)</span>
                <b>{brl(liquidoC / 100)}</b>
              </div>
              <div className="flex justify-between border-t pt-1">
                <span className="text-slate-700">Taxa (bruto menos o que caiu)</span>
                <b className={taxaAlta ? 'text-amber-700' : ''}>
                  {brl(Math.max(taxaC, 0) / 100)} ({percentual.toLocaleString('pt-BR')}%)
                </b>
              </div>
              {liquidoMaior && (
                <div className="text-xs text-rose-700">O valor que caiu é maior que o bruto dos títulos marcados. Confira a seleção.</div>
              )}
              {semCategoria && (
                <div className="text-xs text-rose-700">
                  Falta escolher a categoria da taxa (configuração no fim da seção Depósitos da maquineta).
                </div>
              )}
              {taxaAlta && !liquidoMaior && (
                <label className="flex items-start gap-2 text-xs text-amber-800 pt-1">
                  <input type="checkbox" checked={confirmaAlta} onChange={(e) => setConfirmaAlta(e.target.checked)} className="mt-0.5" />
                  <span>
                    A taxa está acima do limite de {teto.toLocaleString('pt-BR')}%. Não presumimos que toda
                    diferença é taxa: pode faltar ou sobrar título. Confirmo que a seleção e os valores estão
                    corretos.
                  </span>
                </label>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="dep-obs" className="text-xs text-slate-600">
                Observação (opcional)
              </Label>
              <Input id="dep-obs" value={obs} maxLength={500} onChange={(e) => setObs(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={registrar} disabled={enviando} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {enviando ? 'Registrando...' : 'Confirmar depósito'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!corrigindo} onOpenChange={(v) => !v && setCorrigindo(null)}>
        <DialogContent className="bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Corrigir o valor que caiu</DialogTitle>
            <DialogDescription>
              {corrigindo
                ? `Depósito de ${formatarDataCivil(corrigindo.data_deposito)} em ${corrigindo.conta}. Bruto ${brl(corrigindo.valor_bruto)}. A taxa será refeita (a anterior é estornada) e o histórico fica guardado. As baixas dos títulos não mudam.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {corrigindo && (
            <div className="space-y-3 text-sm">
              {erroCorr && <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">{erroCorr}</div>}
              <div className="text-xs text-slate-500">
                Valor atual: <b>{brl(vigente(corrigindo).liquido)}</b>
              </div>
              <div className="space-y-1">
                <Label htmlFor="corr-valor" className="text-xs text-slate-600">
                  Valor correto que caiu no banco
                </Label>
                <Input id="corr-valor" inputMode="decimal" value={novoLiquido} onChange={(e) => setNovoLiquido(e.target.value)} />
                {num(novoLiquido) > 0 && (
                  <div className={`text-xs ${percCorr > teto ? 'text-amber-700' : 'text-slate-500'}`}>
                    Nova taxa: {brl(Math.max(novaTaxaCorr, 0) / 100)} ({percCorr.toLocaleString('pt-BR')}%)
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="corr-motivo" className="text-xs text-slate-600">
                  Motivo
                </Label>
                <Input id="corr-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </div>
              {percCorr > teto && (
                <label className="flex items-start gap-2 text-xs text-amber-800">
                  <input type="checkbox" checked={confirmaAltaCorr} onChange={(e) => setConfirmaAltaCorr(e.target.checked)} className="mt-0.5" />
                  <span>A taxa ficaria acima do limite de {teto.toLocaleString('pt-BR')}%. Confirmo o valor.</span>
                </label>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCorrigindo(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={corrigir} disabled={enviandoCorr}>
              {enviandoCorr ? 'Corrigindo...' : 'Corrigir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
