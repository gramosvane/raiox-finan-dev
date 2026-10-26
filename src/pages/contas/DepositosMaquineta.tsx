import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { hojeBrasil, formatarDataCivil } from '@/lib/dataCivil'
import { valorPositivoBR, valorDigitadoInvalido } from '@/lib/numeroBR'
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

const MAX_TITULOS = 100
const MAX_LINHAS = 12
const SEM_RESPOSTA =
  'Sem resposta do servidor. Antes de tentar de novo, atualize a lista de depósitos: o registro pode ter sido gravado.'

const brl = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const num = valorPositivoBR

const centavos = (v: number) => Math.round((Number(v) || 0) * 100)

const ehMaquineta = (descricao: string) => /pix|cart[aã]o|d[eé]bito|cr[eé]dito|maquineta/i.test(descricao)

// Dia civil de Brasília de um instante gravado pelo PocketBase (UTC, "2026-11-01 01:00:00.000Z"): 22h do dia 31 em Brasília é dia 31.
const diaBrasilDe = (criado: string) => {
  const d = new Date(String(criado).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? '' : hojeBrasil(d)
}

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
  const [totalDepositos, setTotalDepositos] = useState(0)
  const [correcoes, setCorrecoes] = useState<Correcao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [falhaCarga, setFalhaCarga] = useState(false)
  const [categoriasFinanceiras, setCategoriasFinanceiras] = useState<Categoria[]>([])
  const [permissoes, setPermissoes] = useState<Record<string, PermissaoLinha>>({})
  const [catTaxaId, setCatTaxaId] = useState('')
  const [catTaxaSalva, setCatTaxaSalva] = useState('')
  const salvandoCfg = useRef(false)
  const [salvandoCfgUi, setSalvandoCfgUi] = useState(false)
  const [tetoTxt, setTetoTxt] = useState('5')
  const [tetoSalvo, setTetoSalvo] = useState(5)

  // diálogo de registro
  const [aberto, setAberto] = useState(false)
  const [abertos, setAbertos] = useState<TituloAberto[]>([])
  const [carregandoTitulos, setCarregandoTitulos] = useState(false)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [somenteMaquineta, setSomenteMaquineta] = useState(true)
  const [dataDeposito, setDataDeposito] = useState(() => hojeBrasil())
  const [conta, setConta] = useState('')
  const [linhas, setLinhas] = useState<LinhaExtrato[]>([{ rotulo: '', valor: '' }])
  const [obs, setObs] = useState('')
  const [confirmaAlta, setConfirmaAlta] = useState(false)
  const [confirmaFuturos, setConfirmaFuturos] = useState(false)
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

  const teto = tetoSalvo

  const carregar = useCallback(async () => {
    setCarregando(true)
    setFalhaCarga(false)
    try {
      const [deps, cors, perms, cats] = await Promise.all([
        pb.collection('depositos').getList<Deposito>(1, 200, { sort: '-created' }),
        pb.collection('depositos_correcoes').getFullList<Correcao>({ sort: '-created' }),
        pb.collection('permissoes').getFullList<PermissaoLinha>(),
        getCategorias('despesa', true),
      ])
      setDepositos(deps.items)
      setTotalDepositos(deps.totalItems)
      setCorrecoes(cors)
      const financeiras = cats.filter((c) => c.grupo_dre === 'despesa_financeira')
      setCategoriasFinanceiras(financeiras)
      const m: Record<string, PermissaoLinha> = {}
      for (const p of perms) m[p.chave] = p
      setPermissoes(m)
      // categoria gravada que não é mais despesa ativa do grupo Despesa financeira conta como "não configurada"
      const idSalvo = m['categoria_taxa_id']?.valor || ''
      const idValido = financeiras.some((c) => c.id === idSalvo) ? idSalvo : ''
      setCatTaxaId(idValido)
      setCatTaxaSalva(idValido)
      const t = Number(String(m['deposito_taxa_teto']?.valor || '5').replace(',', '.'))
      const tetoOk = isFinite(t) && t > 0 && t <= 100 ? t : 5
      setTetoSalvo(tetoOk)
      setTetoTxt(String(tetoOk).replace('.', ','))
    } catch {
      setFalhaCarga(true)
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

  // somenteCategoria: o botão do diálogo grava SÓ a categoria (o limite é um campo da seção de configuração, que o diálogo não mostra)
  const salvarConfig = async (somenteCategoria = false) => {
    let t = tetoSalvo
    if (!somenteCategoria) {
      t = Number(String(tetoTxt).replace(',', '.'))
      if (!(isFinite(t) && t > 0 && t <= 100)) {
        toast({ variant: 'destructive', title: 'Limite inválido', description: 'Use um percentual entre 0,1 e 100.' })
        return
      }
    }
    if (!catTaxaId) {
      toast({ variant: 'destructive', title: 'Escolha a categoria da taxa', description: 'Sem ela os depósitos com taxa não podem ser registrados.' })
      return
    }
    if (salvandoCfg.current) return
    salvandoCfg.current = true
    setSalvandoCfgUi(true)
    try {
      const itens: Array<[string, string]> = [['categoria_taxa_id', catTaxaId]]
      if (!somenteCategoria) itens.push(['deposito_taxa_teto', String(t)])
      for (const [k, valor] of itens) {
        const reg = permissoes[k]
        if (reg) await pb.collection('permissoes').update(reg.id, { valor })
        else await pb.collection('permissoes').create({ chave: k, valor })
      }
      toast({ title: somenteCategoria ? 'Categoria da taxa salva' : 'Configuração da taxa salva' })
      if (somenteCategoria) {
        // recarrega só as permissões, sem descartar o que foi digitado no campo Limite da seção de configuração
        const perms = await pb.collection('permissoes').getFullList<PermissaoLinha>()
        const m: Record<string, PermissaoLinha> = {}
        for (const p of perms) m[p.chave] = p
        setPermissoes(m)
        setCatTaxaSalva(m['categoria_taxa_id']?.valor || '')
      } else {
        await carregar()
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível salvar',
        description: err?.response?.message || err?.message || 'Tente novamente.',
      })
    } finally {
      salvandoCfg.current = false
      setSalvandoCfgUi(false)
    }
  }

  const abrirRegistro = async () => {
    setAberto(true)
    setErro('')
    setMarcados(new Set())
    setBusca('')
    setSomenteMaquineta(true)
    setConta('')
    setLinhas([{ rotulo: '', valor: '' }])
    setObs('')
    setConfirmaAlta(false)
    setConfirmaFuturos(false)
    setDataDeposito(hojeBrasil())
    setChave(novaChave())
    const ok = await carregarTitulos()
    if (!ok) setErro('Não foi possível carregar os títulos em aberto. Feche e abra de novo.')
  }

  // Recarrega os títulos em aberto SEM mexer em conta, linhas do extrato e observação; tira da seleção os que já não estão
  // em aberto. Devolve false se falhar (a lista velha não fica na tela como se fosse atual).
  const carregarTitulos = async (): Promise<boolean> => {
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
      const lista = previstos.filter((p) => !jaBaixados.has(p.id))
      const ids = new Set(lista.map((l) => l.id))
      setAbertos(lista)
      setMarcados((prev) => {
        const resta = Array.from(prev).filter((id) => ids.has(id))
        return resta.length === prev.size ? prev : new Set(resta)
      })
      return true
    } catch {
      setAbertos([])
      setMarcados(new Set())
      return false
    } finally {
      setCarregandoTitulos(false)
    }
  }

  const linhasPreenchidas = linhas.some((l) => l.valor.trim() !== '' || l.rotulo.trim() !== '')
  const emPreenchimento = marcados.size > 0 || linhasPreenchidas

  const tentarFechar = () => {
    if (enviando) return
    if (emPreenchimento && !window.confirm('Descartar o depósito que está sendo preenchido?')) return
    setAberto(false)
  }

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return abertos.filter(
      (a) =>
        (!somenteMaquineta || ehMaquineta(a.descricao) || marcados.has(a.id)) &&
        (!t || a.descricao.toLowerCase().includes(t)),
    )
  }, [abertos, busca, somenteMaquineta, marcados])

  const selecionados = abertos.filter((a) => marcados.has(a.id))
  const brutoC = selecionados.reduce((s, a) => s + centavos(a.valor), 0)
  const liquidoC = linhas.reduce((s, l) => s + centavos(num(l.valor)), 0)
  const taxaC = brutoC - liquidoC
  const percentual = brutoC > 0 && taxaC > 0 ? Math.round((taxaC / brutoC) * 10000) / 100 : 0
  const liquidoMaior = liquidoC > brutoC && brutoC > 0
  const taxaAlta = percentual > teto
  const semCategoria = taxaC > 0 && !catTaxaSalva
  const futuros = selecionados.filter((a) => {
    const venc = String(a.data_vencimento || '').slice(0, 10)
    return venc && venc > dataDeposito
  })
  const chavesLinhas = linhas
    .filter((l) => num(l.valor) > 0)
    .map((l) => `${l.rotulo.trim().toLowerCase()}|${centavos(num(l.valor))}`)
  const linhaRepetida = new Set(chavesLinhas).size !== chavesLinhas.length

  // qualquer mudança nos números invalida as confirmações já dadas
  useEffect(() => {
    setConfirmaAlta(false)
  }, [brutoC, liquidoC])
  useEffect(() => {
    setConfirmaFuturos(false)
  }, [marcados, dataDeposito])

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
    if (marcados.size > MAX_TITULOS) return setErro(`Marque no máximo ${MAX_TITULOS} títulos por depósito.`)
    if (!conta) return setErro('Escolha a conta bancária onde o dinheiro caiu.')
    if (linhas.some((l) => valorDigitadoInvalido(l.valor))) return setErro('Há valor inválido nas linhas do extrato. Use números como 1.234,56.')
    if (liquidoC <= 0) return setErro('Informe o valor que caiu (linhas do extrato).')
    if (liquidoMaior) return setErro('O valor que caiu é maior que o bruto dos títulos. Confira a seleção.')
    if (semCategoria) {
      return setErro(
        catTaxaId
          ? 'Clique em "Salvar categoria" (campo acima, neste diálogo) para gravar a categoria escolhida e depois confirme o depósito.'
          : 'Escolha a categoria da taxa (campo acima, neste diálogo) e clique em "Salvar categoria".',
      )
    }
    if (futuros.length > 0 && !confirmaFuturos) return setErro('Há título com vencimento futuro marcado: confirme abaixo ou desmarque.')
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
          bruto_conferido: brutoC / 100,
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
      const msg = err?.response?.message || SEM_RESPOSTA
      setErro(msg)
      if (!err?.response?.message) {
        await carregar()
      } else {
        // o servidor recusou (título já baixado, bruto mudou...): atualiza a lista para a seleção refletir o que existe agora
        const ok = await carregarTitulos()
        if (!ok) setErro(msg + ' (Não foi possível atualizar a lista de títulos: feche e abra de novo.)')
      }
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

  useEffect(() => {
    setConfirmaAltaCorr(false)
  }, [novoLiquido])

  const corrigir = async () => {
    if (!corrigindo) return
    setErroCorr('')
    if (valorDigitadoInvalido(novoLiquido) || !(num(novoLiquido) > 0)) return setErroCorr('Informe o valor correto que caiu no banco (ex.: 1.234,56).')
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
      setErroCorr(err?.response?.message || SEM_RESPOSTA)
      if (!err?.response?.message) await carregar()
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
      ) : falhaCarga ? (
        <div className="text-sm text-rose-700">
          Não foi possível carregar os depósitos.{' '}
          <button type="button" className="underline font-semibold" onClick={carregar}>
            Tentar de novo
          </button>
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
                const cors = correcoes.filter((c) => c.deposito_id === d.id)
                return (
                  <tr key={d.id} className="border-b align-top">
                    <td className="py-2 pr-2">
                      {formatarDataCivil(d.data_deposito)}
                      {v.corrigido && <span className="ml-1 text-amber-700">(corrigido)</span>}
                      <details className="text-[11px] text-slate-500">
                        <summary className="cursor-pointer">{d.qtd_titulos} título(s): composição</summary>
                        <ul className="list-disc pl-4">
                          {(d.titulos || []).map((t) => (
                            <li key={t.id}>
                              {t.descricao}: {brl(t.valor)}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-1">
                          Extrato original ({brl(d.valor_liquido)}):{' '}
                          {(d.linhas_extrato || [])
                            .map((l) => `${l.rotulo || 'linha'} ${brl(l.valor)}`)
                            .join(' · ')}
                        </div>
                        {cors.length > 0 && (
                          <div className="mt-1 text-amber-800">
                            Correções (mais recente primeiro):
                            <ul className="list-disc pl-4">
                              {cors.map((c) => (
                                <li key={c.id}>
                                  {brl(c.liquido_anterior)} para {brl(c.liquido_novo)} em{' '}
                                  {formatarDataCivil(diaBrasilDe(c.created))}: {c.motivo}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
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
          {totalDepositos > depositos.length && (
            <p className="text-[11px] text-slate-500 mt-1">
              Mostrando os {depositos.length} depósitos mais recentes de {totalDepositos}.
            </p>
          )}
        </div>
      )}

      {ehAdmin && (
        <div className="border-t pt-4 space-y-3">
          <div className="text-sm font-medium text-slate-800">Configuração da taxa de maquineta</div>
          <p className="text-xs text-slate-500">
            A taxa é lançada como despesa na categoria escolhida (grupo Despesa financeira, como o contador
            orienta). Acima do limite, o sistema não presume que a diferença é taxa e pede confirmação.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 min-w-[260px]">
              <Label className="text-xs text-slate-600">Categoria da taxa</Label>
              <Select value={catTaxaId} onValueChange={setCatTaxaId}>
                <SelectTrigger aria-label="Categoria da taxa de maquineta">
                  <SelectValue placeholder={categoriasFinanceiras.length ? 'Escolha a categoria' : 'Nenhuma categoria de despesa financeira'} />
                </SelectTrigger>
                <SelectContent>
                  {categoriasFinanceiras.map((c) => (
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
            <Button type="button" variant="outline" disabled={salvandoCfgUi} onClick={() => salvarConfig(false)}>
              Salvar
            </Button>
          </div>
          {categoriasFinanceiras.length === 0 && (
            <p className="text-xs text-rose-700">
              Falta uma categoria ativa no grupo Despesa financeira. Crie "5.7 Taxas de maquineta e cartão" em Plano
              de categorias.
            </p>
          )}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={(v) => !v && tentarFechar()}>
        <DialogContent className="bg-white sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar depósito da maquineta</DialogTitle>
            <DialogDescription>
              Marque os títulos que o banco pagou, informe cada linha do extrato (o valor que caiu) e confira
              a taxa. A baixa não pode ser desfeita; o valor que caiu pode ser corrigido depois.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            {!catTaxaSalva && ehAdmin && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                <div className="text-xs text-amber-900">
                  Antes de registrar, escolha a categoria da taxa (despesa financeira). É só uma vez.
                </div>
                {categoriasFinanceiras.length === 0 && (
                  <div className="text-xs text-rose-700">
                    Não há categoria ativa no grupo Despesa financeira. Crie "5.7 Taxas de maquineta e cartão" em Plano de categorias.
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-[240px]">
                    <Select value={catTaxaId} onValueChange={setCatTaxaId}>
                      <SelectTrigger aria-label="Categoria da taxa (neste diálogo)">
                        <SelectValue placeholder="Escolha a categoria da taxa" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoriasFinanceiras.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" size="sm" variant="outline" disabled={salvandoCfgUi} onClick={() => salvarConfig(true)}>
                    Salvar categoria
                  </Button>
                </div>
              </div>
            )}

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
                <Label className="text-xs text-slate-600">
                  Títulos em aberto ({visiveis.length} de {abertos.length})
                </Label>
                <Input
                  aria-label="Buscar título"
                  placeholder="Buscar (ex.: PIX, débito, crédito)"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="h-8 w-60 text-xs"
                />
                <label className="flex items-center gap-1 text-xs text-slate-600">
                  <input type="checkbox" checked={somenteMaquineta} onChange={(e) => setSomenteMaquineta(e.target.checked)} />
                  Só PIX e cartão
                </label>
                <Button type="button" variant="outline" size="sm" onClick={marcarVencidos}>
                  Marcar tudo que venceu até esta data
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setMarcados(new Set())}>
                  Limpar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={carregandoTitulos || enviando}
                  onClick={async () => {
                    const ok = await carregarTitulos()
                    setErro(ok ? '' : 'Não foi possível atualizar a lista de títulos: feche e abra de novo.')
                  }}
                >
                  Atualizar títulos
                </Button>
              </div>
              <div className="border rounded-xl max-h-64 overflow-y-auto">
                {carregandoTitulos ? (
                  <div className="p-3 text-xs text-slate-600 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando títulos...
                  </div>
                ) : visiveis.length === 0 ? (
                  <div className="p-3 text-xs text-slate-500">Nenhum título em aberto com este filtro.</div>
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
              <div className="text-[11px] text-slate-500">Até {MAX_TITULOS} títulos por depósito.</div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-600">Linhas do extrato do banco (o valor que caiu)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={linhas.length >= MAX_LINHAS}
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
                <div key={i} className="space-y-0.5">
                  <div className="grid gap-2 grid-cols-[1fr_150px_40px] items-center">
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
                      placeholder="Valor (ex.: 1.234,56)"
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
                  {valorDigitadoInvalido(l.valor) && (
                    <div className="text-[11px] text-rose-700">Valor inválido. Use números como 1.234,56.</div>
                  )}
                </div>
              ))}
              {linhaRepetida && (
                <div className="text-[11px] text-amber-700">
                  Há linhas repetidas (mesma descrição e valor). Confira com o extrato do banco.
                </div>
              )}
              <div className="text-[11px] text-slate-500">Até {MAX_LINHAS} linhas.</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Conta: {conta || '(escolha)'}</span>
                <span>Caiu em {formatarDataCivil(dataDeposito)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Títulos marcados ({marcados.size}), bruto</span>
                <b>{brl(brutoC / 100)}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Caiu no banco (soma das {linhas.filter((l) => num(l.valor) > 0).length} linhas)</span>
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
              {futuros.length > 0 && (
                <label className="flex items-start gap-2 text-xs text-amber-800 pt-1">
                  <input type="checkbox" checked={confirmaFuturos} onChange={(e) => setConfirmaFuturos(e.target.checked)} className="mt-0.5" />
                  <span>
                    {futuros.length} título(s) marcado(s) vencem DEPOIS da data do depósito. Confirmo que o banco já
                    pagou esses títulos.
                  </span>
                </label>
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

            {erro && (
              <div role="alert" className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {erro}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={tentarFechar} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="button" onClick={registrar} disabled={enviando} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {enviando ? 'Registrando...' : 'Confirmar depósito'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!corrigindo} onOpenChange={(v) => !v && !enviandoCorr && setCorrigindo(null)}>
        <DialogContent className="bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Corrigir o valor que caiu</DialogTitle>
            <DialogDescription>
              {corrigindo
                ? `Depósito de ${formatarDataCivil(corrigindo.data_deposito)} em ${corrigindo.conta}. Bruto ${brl(corrigindo.valor_bruto)}. A taxa será refeita (a anterior é estornada) e o histórico fica guardado. As baixas dos títulos não mudam. Use só se você digitou o valor errado; se marcou título a mais ou a menos, veja a orientação em docs/operacao/09.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {corrigindo && (
            <div className="space-y-3 text-sm">
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
                {valorDigitadoInvalido(novoLiquido) && <div className="text-[11px] text-rose-700">Valor inválido. Use números como 1.234,56.</div>}
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
              {erroCorr && (
                <div role="alert" className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {erroCorr}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCorrigindo(null)} disabled={enviandoCorr}>
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
