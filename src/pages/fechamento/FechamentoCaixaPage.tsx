import React, { useCallback, useEffect, useMemo, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { getCategorias } from '@/services/financial'
import type { Categoria } from '@/types/financial'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react'

interface DespesaItem {
  descricao: string
  categoria_id: string
  valor: number
}

interface Fechamento {
  id: string
  data: string
  caixa?: string
  numero_fita?: string
  total_fita?: number
  total_sistema: number
  maquineta_pix: number
  maquineta_credito: number
  maquineta_debito: number
  despesas_dinheiro: number
  dinheiro_contado: number
  esperado_dinheiro: number
  diferenca: number
  estornado?: boolean
  observacao?: string
  created: string
}

interface DespesaSinalizada {
  id: string
  descricao: string
  categoria: string
  valor: number
}

interface PermissaoLinha {
  id: string
  chave: string
  valor: string
}

interface LinhaDespesa {
  descricao: string
  categoria_id: string
  valor: string
}

const PRAZOS_PADRAO = { prazo_pix: 1, prazo_debito: 1, prazo_credito: 30 }

const brl = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const hojeISO = () => {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

const num = (txt: string) => {
  const n = Number(String(txt).replace(',', '.'))
  return isFinite(n) && n > 0 ? n : 0
}

const dataBR = (iso: string) => {
  const p = String(iso).slice(0, 10).split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso
}

const somaDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export const FechamentoCaixaPage: React.FC = () => {
  const { user } = useAuth()
  const { toast } = useToast()
  const [lista, setLista] = useState<Fechamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [resultado, setResultado] = useState<Fechamento | null>(null)

  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [data, setData] = useState(hojeISO())
  const [fita, setFita] = useState('')
  const [caixa, setCaixa] = useState('')
  const [numeroFita, setNumeroFita] = useState('')
  const [categoriaReceita, setCategoriaReceita] = useState('')
  const [pix, setPix] = useState('')
  const [credito, setCredito] = useState('')
  const [debito, setDebito] = useState('')
  const [contado, setContado] = useState('')
  const [despesas, setDespesas] = useState<LinhaDespesa[]>([])
  const [obs, setObs] = useState('')

  const [prazos, setPrazos] = useState(PRAZOS_PADRAO)
  const [prazosReg, setPrazosReg] = useState<Record<string, PermissaoLinha>>({})
  const [prazosTxt, setPrazosTxt] = useState({ prazo_pix: '1', prazo_debito: '1', prazo_credito: '30' })

  const [limite, setLimite] = useState<number | null>(null)
  const [limiteReg, setLimiteReg] = useState<PermissaoLinha | null>(null)
  const [limiteTxt, setLimiteTxt] = useState('')
  const [sinalizadas, setSinalizadas] = useState<DespesaSinalizada[]>([])

  const [estornando, setEstornando] = useState<Fechamento | null>(null)
  const [motivo, setMotivo] = useState('')
  const [estornoErro, setEstornoErro] = useState('')
  const [processandoEstorno, setProcessandoEstorno] = useState(false)

  const somenteLeitura = user?.role === 'leitura'
  const ehAdmin = user?.role === 'administrador'

  const catsReceita = useMemo(
    () => categorias.filter((c) => c.tipo === 'receita' && c.ativa !== false),
    [categorias],
  )
  const catsDespesa = useMemo(
    () => categorias.filter((c) => c.tipo === 'despesa' && c.ativa !== false),
    [categorias],
  )

  const carregarPermissoes = useCallback(async () => {
    try {
      const perms = await pb.collection('permissoes').getFullList<PermissaoLinha>()
      const reg = perms.find((p) => p.chave === 'limite_despesa') || null
      setLimiteReg(reg)
      const n = reg ? Number(String(reg.valor).replace(',', '.')) : 0
      setLimite(isFinite(n) && n > 0 ? n : null)
      setLimiteTxt(reg && n > 0 ? String(reg.valor) : '')

      const regs: Record<string, PermissaoLinha> = {}
      const novos = { ...PRAZOS_PADRAO }
      for (const chave of ['prazo_pix', 'prazo_debito', 'prazo_credito'] as const) {
        const p = perms.find((x) => x.chave === chave)
        if (p) {
          regs[chave] = p
          const v = parseInt(String(p.valor).trim(), 10)
          if (isFinite(v) && v >= 0 && v <= 365) novos[chave] = v
        }
      }
      setPrazosReg(regs)
      setPrazos(novos)
      setPrazosTxt({
        prazo_pix: String(novos.prazo_pix),
        prazo_debito: String(novos.prazo_debito),
        prazo_credito: String(novos.prazo_credito),
      })
    } catch {
      setLimite(null)
    }
  }, [])

  const salvarLimite = async () => {
    const n = num(limiteTxt)
    const valor = n > 0 ? String(n) : '0'
    try {
      if (limiteReg) {
        await pb.collection('permissoes').update(limiteReg.id, { valor })
      } else {
        await pb.collection('permissoes').create({ chave: 'limite_despesa', valor })
      }
      toast({ title: n > 0 ? 'Limite de despesa salvo' : 'Limite de despesa removido' })
      await carregarPermissoes()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível salvar o limite',
        description: err?.response?.message || err?.message || 'Tente novamente.',
      })
    }
  }

  const salvarPrazos = async () => {
    try {
      for (const chave of ['prazo_pix', 'prazo_debito', 'prazo_credito'] as const) {
        const n = parseInt(String(prazosTxt[chave]).trim(), 10)
        if (!isFinite(n) || n < 0 || n > 365) {
          toast({ variant: 'destructive', title: 'Prazo inválido', description: 'Use de 0 a 365 dias.' })
          return
        }
        const valor = String(n)
        const reg = prazosReg[chave]
        if (reg) await pb.collection('permissoes').update(reg.id, { valor })
        else await pb.collection('permissoes').create({ chave, valor })
      }
      toast({ title: 'Prazos de recebimento salvos' })
      await carregarPermissoes()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível salvar os prazos',
        description: err?.response?.message || err?.message || 'Tente novamente.',
      })
    }
  }

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await pb
        .collection('fechamentos_caixa')
        .getList<Fechamento>(1, 30, { sort: '-created' })
      setLista(res.items)
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível carregar os fechamentos.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
    carregarPermissoes()
    getCategorias(undefined, true)
      .then((cs) => {
        setCategorias(cs)
        const padrao = cs.find((c) => c.tipo === 'receita' && /^1\.1\b/.test(c.nome))
        if (padrao) setCategoriaReceita((atual) => atual || padrao.id)
      })
      .catch(() => {})
  }, [carregar, carregarPermissoes])

  // Sinalização (não bloqueia): despesas realizadas na data acima do limite definido pelo administrador
  useEffect(() => {
    let ativo = true
    if (!limite || !data) {
      setSinalizadas([])
      return
    }
    pb.collection('lancamentos')
      .getFullList<DespesaSinalizada>({
        filter: `tipo = 'despesa' && status = 'realizado' && data_realizacao >= '${data} 00:00:00' && data_realizacao <= '${data} 23:59:59' && valor > ${limite}`,
        sort: '-valor',
      })
      .then((itens) => {
        if (ativo) setSinalizadas(itens)
      })
      .catch(() => {
        if (ativo) setSinalizadas([])
      })
    return () => {
      ativo = false
    }
  }, [limite, data])

  const totalDespesas = despesas.reduce((s, d) => s + num(d.valor), 0)
  const formas = num(pix) + num(credito) + num(debito)
  const dinheiroRecebido = num(fita) - formas
  const esperado = dinheiroRecebido - totalDespesas
  const formasMaiorQueFita = formas > num(fita)
  const despesasMaiorQueDinheiro = totalDespesas > dinheiroRecebido && !formasMaiorQueFita

  const fechar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    if (!data) return setErro('Informe a data do fechamento.')
    if (fita.trim() === '') return setErro('Informe o valor (total bruto da fita).')
    if (!caixa.trim()) return setErro('Informe o caixa.')
    if (!numeroFita.trim()) return setErro('Informe o número da fita.')
    if (!categoriaReceita) return setErro('Escolha a categoria da receita.')
    if (contado.trim() === '') return setErro('Informe o dinheiro contado na gaveta.')
    if (formasMaiorQueFita) return setErro('PIX, crédito e débito somam mais que o valor da fita.')
    if (despesasMaiorQueDinheiro) return setErro('As despesas do caixa são maiores que o dinheiro recebido.')
    for (const d of despesas) {
      if (d.descricao.trim().length < 3) return setErro('Descreva cada despesa do caixa.')
      if (!d.categoria_id) return setErro('Escolha a categoria de cada despesa do caixa.')
      if (!(num(d.valor) > 0)) return setErro('Informe o valor de cada despesa do caixa.')
    }

    setSalvando(true)
    try {
      const criado = await pb.collection('fechamentos_caixa').create<Fechamento>({
        data,
        total_fita: num(fita),
        caixa: caixa.trim(),
        numero_fita: numeroFita.trim(),
        categoria_id: categoriaReceita,
        maquineta_pix: num(pix),
        maquineta_credito: num(credito),
        maquineta_debito: num(debito),
        dinheiro_contado: num(contado),
        despesas: despesas.map((d) => ({
          descricao: d.descricao.trim(),
          categoria_id: d.categoria_id,
          valor: num(d.valor),
        })),
        observacao: obs.trim(),
      })
      setResultado(criado)
      toast({ title: 'Fechamento registrado e lançamentos gerados' })
      setFita('')
      setNumeroFita('')
      setPix('')
      setCredito('')
      setDebito('')
      setContado('')
      setDespesas([])
      setObs('')
      await carregar()
    } catch (err: any) {
      setErro(err?.response?.message || err?.message || 'Não foi possível registrar o fechamento.')
    } finally {
      setSalvando(false)
    }
  }

  const estornar = async () => {
    if (!estornando) return
    setEstornoErro('')
    if (motivo.trim().length < 5) return setEstornoErro('Informe o motivo (mínimo 5 letras).')
    setProcessandoEstorno(true)
    try {
      await pb.send('/backend/v1/fechamento/estornar', {
        method: 'POST',
        body: { id: estornando.id, motivo: motivo.trim() },
      })
      toast({ title: 'Fechamento estornado' })
      setEstornando(null)
      setMotivo('')
      await carregar()
    } catch (err: any) {
      setEstornoErro(err?.response?.message || err?.message || 'Não foi possível estornar.')
    } finally {
      setProcessandoEstorno(false)
    }
  }

  const corDiferenca = (v: number) =>
    Math.abs(v) < 0.005 ? 'text-emerald-600' : v < 0 ? 'text-rose-600' : 'text-amber-600'

  const atualizaDespesa = (i: number, campo: keyof LinhaDespesa, valor: string) =>
    setDespesas((ds) => ds.map((d, j) => (j === i ? { ...d, [campo]: valor } : d)))

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Fechamento de caixa</h1>
        <p className="text-sm text-slate-500">
          Registre a fita de cada caixa. O sistema confere o dinheiro da gaveta e já lança a receita do
          dia (dinheiro, PIX e cartões) e as despesas pagas do caixa.
        </p>
      </div>

      {!somenteLeitura && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Novo fechamento</CardTitle>
            <CardDescription>
              Cada fita é registrada uma vez por caixa. Para corrigir, estorne o fechamento e registre de
              novo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={fechar} className="space-y-5">
              {erro && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{erro}</span>
                </div>
              )}

              <div className="flex flex-wrap items-start gap-4">
                <div className="space-y-1.5 w-40">
                  <Label htmlFor="fc-data">Data</Label>
                  <Input
                    id="fc-data"
                    type="date"
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 w-48">
                  <Label htmlFor="fc-fita">Valor total (R$)</Label>
                  <Input
                    id="fc-fita"
                    inputMode="decimal"
                    value={fita}
                    onChange={(e) => setFita(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 w-40">
                  <Label htmlFor="fc-caixa">Caixa</Label>
                  <Input
                    id="fc-caixa"
                    placeholder="Ex.: Caixa 1"
                    value={caixa}
                    onChange={(e) => setCaixa(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 w-40">
                  <Label htmlFor="fc-numero">Nº da fita</Label>
                  <Input
                    id="fc-numero"
                    placeholder="Ex.: 2122"
                    value={numeroFita}
                    onChange={(e) => setNumeroFita(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 min-w-[260px]">
                  <Label>Categoria da receita</Label>
                  <Select value={categoriaReceita} onValueChange={setCategoriaReceita}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha" />
                    </SelectTrigger>
                    <SelectContent>
                      {catsReceita.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fc-pix">PIX (R$)</Label>
                  <Input
                    id="fc-pix"
                    inputMode="decimal"
                    value={pix}
                    onChange={(e) => setPix(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fc-cred">Cartão de crédito (R$)</Label>
                  <Input
                    id="fc-cred"
                    inputMode="decimal"
                    value={credito}
                    onChange={(e) => setCredito(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fc-deb">Cartão de débito (R$)</Label>
                  <Input
                    id="fc-deb"
                    inputMode="decimal"
                    value={debito}
                    onChange={(e) => setDebito(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fc-cont">Dinheiro (R$)</Label>
                  <Input
                    id="fc-cont"
                    inputMode="decimal"
                    value={contado}
                    onChange={(e) => setContado(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Despesas pagas do caixa (se houver)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDespesas((ds) => [...ds, { descricao: '', categoria_id: '', valor: '' }])
                    }
                  >
                    <Plus className="w-4 h-4 mr-1" /> Adicionar despesa
                  </Button>
                </div>
                {despesas.length === 0 && (
                  <p className="text-xs text-slate-500">
                    Nenhuma. Quando o caixa pagar algo com dinheiro da gaveta, adicione aqui com a
                    categoria: cada item vira uma despesa no sistema.
                  </p>
                )}
                {despesas.map((d, i) => (
                  <div key={i} className="grid gap-2 md:grid-cols-[1fr_260px_140px_40px] items-start">
                    <Input
                      aria-label={`Descrição da despesa ${i + 1}`}
                      placeholder="Descrição (ex.: compra de água)"
                      value={d.descricao}
                      onChange={(e) => atualizaDespesa(i, 'descricao', e.target.value)}
                    />
                    <Select
                      value={d.categoria_id}
                      onValueChange={(v) => atualizaDespesa(i, 'categoria_id', v)}
                    >
                      <SelectTrigger aria-label={`Categoria da despesa ${i + 1}`}>
                        <SelectValue placeholder="Categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {catsDespesa.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      aria-label={`Valor da despesa ${i + 1}`}
                      inputMode="decimal"
                      placeholder="Valor"
                      value={d.valor}
                      onChange={(e) => atualizaDespesa(i, 'valor', e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover despesa ${i + 1}`}
                      onClick={() => setDespesas((ds) => ds.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fc-obs">Observação (opcional)</Label>
                <Input
                  id="fc-obs"
                  value={obs}
                  maxLength={500}
                  onChange={(e) => setObs(e.target.value)}
                />
              </div>

              {fita.trim() !== '' && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm space-y-2">
                  <div className="font-semibold text-slate-800">O que será lançado</div>
                  <ul className="text-slate-700 space-y-0.5">
                    {dinheiroRecebido > 0 && (
                      <li>
                        Receita em dinheiro, realizada hoje: <b>{brl(dinheiroRecebido)}</b>
                      </li>
                    )}
                    {num(pix) > 0 && (
                      <li>
                        Receita PIX, a receber em {dataBR(somaDias(data, prazos.prazo_pix))}:{' '}
                        <b>{brl(num(pix))}</b>
                      </li>
                    )}
                    {num(debito) > 0 && (
                      <li>
                        Receita no débito, a receber em {dataBR(somaDias(data, prazos.prazo_debito))}:{' '}
                        <b>{brl(num(debito))}</b>
                      </li>
                    )}
                    {num(credito) > 0 && (
                      <li>
                        Receita no crédito, a receber em {dataBR(somaDias(data, prazos.prazo_credito))}:{' '}
                        <b>{brl(num(credito))}</b>
                      </li>
                    )}
                    {despesas.map((d, i) =>
                      num(d.valor) > 0 ? (
                        <li key={i}>
                          Despesa do caixa ({d.descricao.trim() || 'sem descrição'}):{' '}
                          <b>{brl(num(d.valor))}</b>
                        </li>
                      ) : null,
                    )}
                  </ul>
                  <div className="border-t pt-2">
                    <span className="text-slate-500">Dinheiro esperado na gaveta: </span>
                    <b>{brl(esperado)}</b>
                    <span className="text-slate-500"> = fita − PIX − cartões − despesas do caixa</span>
                    {contado.trim() !== '' && (
                      <div className={`font-semibold ${corDiferenca(num(contado) - esperado)}`}>
                        Diferença na gaveta: {brl(num(contado) - esperado)}
                      </div>
                    )}
                  </div>
                  {formasMaiorQueFita && (
                    <div className="text-xs text-rose-700">
                      PIX, crédito e débito somam mais que o valor da fita. Confira os valores.
                    </div>
                  )}
                  {despesasMaiorQueDinheiro && (
                    <div className="text-xs text-rose-700">
                      As despesas do caixa são maiores que o dinheiro recebido. Confira os valores.
                    </div>
                  )}
                </div>
              )}

              <Button type="submit" disabled={salvando}>
                {salvando ? 'Registrando...' : 'Registrar fechamento'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Fechamento registrado: {resultado.caixa} · fita {resultado.numero_fita} ·{' '}
              {dataBR(resultado.data)}
            </CardTitle>
            <CardDescription>
              Os lançamentos já estão em Lançamentos; PIX e cartões aparecem em Contas a Receber até a
              baixa.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4 text-sm">
            <div>
              <div className="text-slate-500">Valor da fita</div>
              <div className="text-lg font-semibold">{brl(resultado.total_fita ?? 0)}</div>
            </div>
            <div>
              <div className="text-slate-500">Dinheiro esperado</div>
              <div className="text-lg font-semibold">{brl(resultado.esperado_dinheiro)}</div>
            </div>
            <div>
              <div className="text-slate-500">Dinheiro contado</div>
              <div className="text-lg font-semibold">{brl(resultado.dinheiro_contado)}</div>
            </div>
            <div>
              <div className="text-slate-500">Diferença na gaveta</div>
              <div className={`text-lg font-semibold ${corDiferenca(resultado.diferenca)}`}>
                {brl(resultado.diferenca)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {ehAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Prazos de recebimento (PIX e cartões)</CardTitle>
            <CardDescription>
              Em quantos dias, depois da venda, o dinheiro costuma cair na conta. O vencimento da receita
              é a data do fechamento mais o prazo.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            {(
              [
                ['prazo_pix', 'PIX (dias)'],
                ['prazo_debito', 'Débito (dias)'],
                ['prazo_credito', 'Crédito (dias)'],
              ] as const
            ).map(([chave, rotulo]) => (
              <div key={chave} className="space-y-1.5 w-32">
                <Label htmlFor={`fc-${chave}`}>{rotulo}</Label>
                <Input
                  id={`fc-${chave}`}
                  inputMode="numeric"
                  value={prazosTxt[chave]}
                  onChange={(e) => setPrazosTxt((p) => ({ ...p, [chave]: e.target.value }))}
                />
              </div>
            ))}
            <Button type="button" onClick={salvarPrazos}>
              Salvar prazos
            </Button>
          </CardContent>
        </Card>
      )}

      {ehAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Limite de despesa por lançamento</CardTitle>
            <CardDescription>
              Despesas acima deste valor são apenas sinalizadas na conferência; nunca bloqueadas.
              Deixe em branco (ou 0) para desligar a sinalização.
            </CardDescription>
            <p className="text-sm font-medium text-slate-700">
              {limite ? `Limite ativo: ${brl(limite)}` : 'Sem limite: sinalização desligada'}
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fc-limite">Limite (R$)</Label>
              <Input
                id="fc-limite"
                inputMode="decimal"
                value={limiteTxt}
                onChange={(e) => setLimiteTxt(e.target.value)}
              />
            </div>
            <Button type="button" onClick={salvarLimite}>
              Salvar limite
            </Button>
          </CardContent>
        </Card>
      )}

      {limite && sinalizadas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Despesas acima de {brl(limite)} em {dataBR(data)}
            </CardTitle>
            <CardDescription>Sinalização para conferência; não bloqueia nada.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sinalizadas.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.descricao}</TableCell>
                    <TableCell>{d.categoria}</TableCell>
                    <TableCell>{brl(d.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Últimos fechamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          ) : lista.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum fechamento registrado ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Caixa · Fita</TableHead>
                  <TableHead>Valor da fita</TableHead>
                  <TableHead>PIX e cartões</TableHead>
                  <TableHead>Despesas do caixa</TableHead>
                  <TableHead>Esperado</TableHead>
                  <TableHead>Contado</TableHead>
                  <TableHead>Diferença</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((f) => (
                  <TableRow key={f.id} className={f.estornado ? 'opacity-60' : ''}>
                    <TableCell>{dataBR(f.data)}</TableCell>
                    <TableCell>
                      {f.caixa ? `${f.caixa} · ${f.numero_fita}` : 'Conferência antiga'}
                    </TableCell>
                    <TableCell>{(f.total_fita ?? 0) > 0 ? brl(f.total_fita ?? 0) : '—'}</TableCell>
                    <TableCell>
                      {brl(f.maquineta_pix + f.maquineta_credito + f.maquineta_debito)}
                    </TableCell>
                    <TableCell>{brl(f.despesas_dinheiro)}</TableCell>
                    <TableCell>{brl(f.esperado_dinheiro)}</TableCell>
                    <TableCell>{brl(f.dinheiro_contado)}</TableCell>
                    <TableCell className={corDiferenca(f.diferenca)}>{brl(f.diferenca)}</TableCell>
                    <TableCell>
                      {f.estornado ? (
                        'Estornado'
                      ) : f.caixa && ehAdmin ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEstornando(f)
                            setMotivo('')
                            setEstornoErro('')
                          }}
                        >
                          Estornar
                        </Button>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!estornando} onOpenChange={(aberto) => !aberto && setEstornando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estornar fechamento</DialogTitle>
            <DialogDescription>
              {estornando
                ? `${estornando.caixa} · fita ${estornando.numero_fita} · ${dataBR(estornando.data)}. `
                : ''}
              Os lançamentos gerados por ele serão estornados. Se algum recebimento de PIX ou cartão já
              tiver sido baixado, o fechamento não pode ser estornado: registre a correção com um
              lançamento de ajuste.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="fc-motivo">Motivo</Label>
            <Input id="fc-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            {estornoErro && <p className="text-xs text-rose-700">{estornoErro}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEstornando(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={estornar} disabled={processandoEstorno}>
              {processandoEstorno ? 'Estornando...' : 'Estornar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
