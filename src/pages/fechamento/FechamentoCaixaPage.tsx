import React, { useCallback, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
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
import { useToast } from '@/hooks/use-toast'
import { AlertCircle, Loader2 } from 'lucide-react'

interface Fechamento {
  id: string
  data: string
  total_sistema: number
  maquineta_pix: number
  maquineta_credito: number
  maquineta_debito: number
  despesas_dinheiro: number
  dinheiro_contado: number
  esperado_dinheiro: number
  diferenca: number
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

export const FechamentoCaixaPage: React.FC = () => {
  const { user } = useAuth()
  const { toast } = useToast()
  const [lista, setLista] = useState<Fechamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [resultado, setResultado] = useState<Fechamento | null>(null)

  const [data, setData] = useState(hojeISO())
  const [pix, setPix] = useState('')
  const [credito, setCredito] = useState('')
  const [debito, setDebito] = useState('')
  const [despesas, setDespesas] = useState('')
  const [contado, setContado] = useState('')
  const [obs, setObs] = useState('')

  const [limite, setLimite] = useState<number | null>(null)
  const [limiteReg, setLimiteReg] = useState<PermissaoLinha | null>(null)
  const [limiteTxt, setLimiteTxt] = useState('')
  const [sinalizadas, setSinalizadas] = useState<DespesaSinalizada[]>([])

  const somenteLeitura = user?.role === 'leitura'
  const ehAdmin = user?.role === 'administrador'

  const carregarLimite = useCallback(async () => {
    try {
      const perms = await pb.collection('permissoes').getFullList<PermissaoLinha>()
      const reg = perms.find((p) => p.chave === 'limite_despesa') || null
      setLimiteReg(reg)
      const n = reg ? Number(String(reg.valor).replace(',', '.')) : 0
      setLimite(isFinite(n) && n > 0 ? n : null)
      setLimiteTxt(reg && n > 0 ? String(reg.valor) : '')
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
      await carregarLimite()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível salvar o limite',
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
    carregarLimite()
  }, [carregar, carregarLimite])

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

  const fechar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    if (!data) return setErro('Informe a data do fechamento.')
    if (contado.trim() === '') return setErro('Informe o dinheiro contado.')

    setSalvando(true)
    try {
      const criado = await pb.collection('fechamentos_caixa').create<Fechamento>({
        data,
        maquineta_pix: num(pix),
        maquineta_credito: num(credito),
        maquineta_debito: num(debito),
        despesas_dinheiro: num(despesas),
        dinheiro_contado: num(contado),
        observacao: obs.trim(),
      })
      setResultado(criado)
      toast({ title: 'Fechamento registrado' })
      await carregar()
    } catch (err: any) {
      setErro(err?.response?.message || err?.message || 'Não foi possível registrar o fechamento.')
    } finally {
      setSalvando(false)
    }
  }

  const corDiferenca = (v: number) =>
    Math.abs(v) < 0.005 ? 'text-emerald-600' : v < 0 ? 'text-rose-600' : 'text-amber-600'

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Fechamento de caixa</h1>
        <p className="text-sm text-slate-500">
          Conferência do dia: o sistema soma as receitas realizadas e compara com o relatório da
          maquineta, as despesas pagas em dinheiro e o dinheiro contado.
        </p>
      </div>

      {!somenteLeitura && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Nova conferência</CardTitle>
            <CardDescription>
              Registro imutável: para corrigir, faça uma nova conferência da mesma data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={fechar} className="grid gap-4 md:grid-cols-3">
              {erro && (
                <div className="md:col-span-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{erro}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="fc-data">Data</Label>
                <Input
                  id="fc-data"
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fc-pix">Maquineta: PIX (R$)</Label>
                <Input
                  id="fc-pix"
                  inputMode="decimal"
                  value={pix}
                  onChange={(e) => setPix(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fc-cred">Maquineta: crédito (R$)</Label>
                <Input
                  id="fc-cred"
                  inputMode="decimal"
                  value={credito}
                  onChange={(e) => setCredito(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fc-deb">Maquineta: débito (R$)</Label>
                <Input
                  id="fc-deb"
                  inputMode="decimal"
                  value={debito}
                  onChange={(e) => setDebito(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fc-desp">Despesas pagas em dinheiro (R$)</Label>
                <Input
                  id="fc-desp"
                  inputMode="decimal"
                  value={despesas}
                  onChange={(e) => setDespesas(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fc-cont">Dinheiro contado (R$)</Label>
                <Input
                  id="fc-cont"
                  inputMode="decimal"
                  value={contado}
                  onChange={(e) => setContado(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 md:col-span-3">
                <Label htmlFor="fc-obs">Observação (opcional)</Label>
                <Input
                  id="fc-obs"
                  value={obs}
                  maxLength={500}
                  onChange={(e) => setObs(e.target.value)}
                />
              </div>
              <div className="md:col-span-3">
                <Button type="submit" disabled={salvando}>
                  {salvando ? 'Registrando...' : 'Registrar conferência'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {ehAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Limite de despesa por lançamento</CardTitle>
            <CardDescription>
              Despesas acima deste valor são apenas sinalizadas na conferência; nunca bloqueadas.
              Deixe em branco para não sinalizar.
            </CardDescription>
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

      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resultado de {dataBR(resultado.data)}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4 text-sm">
            <div>
              <div className="text-slate-500">Total do sistema (receitas realizadas)</div>
              <div className="text-lg font-semibold">{brl(resultado.total_sistema)}</div>
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
              <div className="text-slate-500">Diferença</div>
              <div className={`text-lg font-semibold ${corDiferenca(resultado.diferenca)}`}>
                {brl(resultado.diferenca)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Últimas conferências</CardTitle>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          ) : lista.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma conferência registrada ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Sistema</TableHead>
                  <TableHead>Maquineta</TableHead>
                  <TableHead>Esperado</TableHead>
                  <TableHead>Contado</TableHead>
                  <TableHead>Diferença</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>{dataBR(f.data)}</TableCell>
                    <TableCell>{brl(f.total_sistema)}</TableCell>
                    <TableCell>
                      {brl(f.maquineta_pix + f.maquineta_credito + f.maquineta_debito)}
                    </TableCell>
                    <TableCell>{brl(f.esperado_dinheiro)}</TableCell>
                    <TableCell>{brl(f.dinheiro_contado)}</TableCell>
                    <TableCell className={corDiferenca(f.diferenca)}>{brl(f.diferenca)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
