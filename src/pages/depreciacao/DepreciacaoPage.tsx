import React, { useMemo, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useBensDepreciacao } from '@/hooks/useBensDepreciacao'
import {
  PADROES_BEM,
  competenciaDeTroca,
  depreciacaoAcumulada,
  depreciacaoDoMes,
  depreciacaoMensal,
  mesesParaTroca,
  valorContabil,
} from '@/lib/depreciacao'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { useToast } from '@/hooks/use-toast'
import { AlertCircle } from 'lucide-react'

const brl = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const mesAtual = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const hojeISO = () => `${mesAtual()}-${String(new Date().getDate()).padStart(2, '0')}`

const num = (txt: string) => {
  const n = Number(String(txt).replace(',', '.'))
  return isFinite(n) && n > 0 ? n : 0
}

const mmaaaa = (comp: string) => {
  const p = comp.split('-')
  return p.length === 2 ? `${p[1]}/${p[0]}` : comp
}

export const DepreciacaoPage: React.FC = () => {
  const { user } = useAuth()
  const { toast } = useToast()
  const { bens, carregando, recarregar } = useBensDepreciacao()
  const ehAdmin = user?.role === 'administrador'
  const competencia = mesAtual()

  const [descricao, setDescricao] = useState('')
  const [tipoBem, setTipoBem] = useState('equipamento')
  const [valor, setValor] = useState('')
  const [residual, setResidual] = useState('')
  const [dataAq, setDataAq] = useState(hojeISO())
  const [vidaUtil, setVidaUtil] = useState(String(PADROES_BEM.equipamento.vidaUtilMeses))
  const [troca, setTroca] = useState(String(PADROES_BEM.equipamento.vidaUtilMeses))
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const escolherTipo = (t: string) => {
    setTipoBem(t)
    const meses = String(PADROES_BEM[t]?.vidaUtilMeses || 60)
    setVidaUtil(meses)
    setTroca(meses)
  }

  const ativos = useMemo(() => bens.filter((b) => b.ativo !== false), [bens])
  const depreciacaoMes = useMemo(() => depreciacaoDoMes(ativos, competencia), [ativos, competencia])
  const totalContabil = useMemo(
    () => ativos.reduce((s, b) => s + valorContabil(b, competencia), 0),
    [ativos, competencia],
  )

  const cadastrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    if (descricao.trim().length < 2) return setErro('Informe a descrição do bem.')
    if (!num(valor)) return setErro('Informe o valor do bem.')
    if (!num(vidaUtil)) return setErro('Informe a vida útil em meses.')
    if (num(residual) >= num(valor))
      return setErro('O valor residual deve ser menor que o valor do bem.')

    setSalvando(true)
    try {
      await pb.collection('bens_depreciacao').create({
        descricao: descricao.trim(),
        tipo_bem: tipoBem,
        valor: num(valor),
        valor_residual: num(residual),
        data_aquisicao: dataAq,
        vida_util_meses: Math.round(num(vidaUtil)),
        troca_meses: num(troca) ? Math.round(num(troca)) : Math.round(num(vidaUtil)),
        ativo: true,
      })
      toast({ title: 'Bem cadastrado' })
      setDescricao('')
      setValor('')
      setResidual('')
      await recarregar()
    } catch (err: any) {
      setErro(err?.response?.message || err?.message || 'Não foi possível cadastrar o bem.')
    } finally {
      setSalvando(false)
    }
  }

  const alternarAtivo = async (id: string, ativo: boolean) => {
    try {
      await pb.collection('bens_depreciacao').update(id, { ativo: !ativo })
      await recarregar()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível alterar o bem',
        description: err?.response?.message || err?.message || 'Tente novamente.',
      })
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Depreciação e troca de bens</h1>
        <p className="text-sm text-slate-500">
          Cada bem perde valor em parcelas iguais por mês a partir do mês seguinte à compra. A
          depreciação do mês entra na DRE (Dashboard e Relatórios) abaixo do EBITDA.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-slate-500">Depreciação de {mmaaaa(competencia)}</div>
            <div className="text-xl font-semibold">{brl(depreciacaoMes)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-slate-500">Valor contábil dos bens ativos</div>
            <div className="text-xl font-semibold">{brl(totalContabil)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-slate-500">Bens ativos</div>
            <div className="text-xl font-semibold">{ativos.length}</div>
          </CardContent>
        </Card>
      </div>

      {ehAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cadastrar bem</CardTitle>
            <CardDescription>
              Padrões sugeridos: equipamentos e informática 60 meses; veículos e reformas 120 meses.
              Você pode ajustar vida útil e prazo de troca em cada bem.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={cadastrar} className="grid gap-4 md:grid-cols-3">
              {erro && (
                <div className="md:col-span-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{erro}</span>
                </div>
              )}
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="b-desc">Descrição do bem</Label>
                <Input
                  id="b-desc"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={tipoBem} onValueChange={escolherTipo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PADROES_BEM).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-valor">Valor (R$)</Label>
                <Input
                  id="b-valor"
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-res">Valor residual (R$)</Label>
                <Input
                  id="b-res"
                  inputMode="decimal"
                  value={residual}
                  onChange={(e) => setResidual(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-data">Data da compra</Label>
                <Input
                  id="b-data"
                  type="date"
                  value={dataAq}
                  onChange={(e) => setDataAq(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-vida">Vida útil (meses)</Label>
                <Input
                  id="b-vida"
                  inputMode="numeric"
                  value={vidaUtil}
                  onChange={(e) => setVidaUtil(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-troca">Troca prevista em (meses)</Label>
                <Input
                  id="b-troca"
                  inputMode="numeric"
                  value={troca}
                  onChange={(e) => setTroca(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={salvando}>
                  {salvando ? 'Cadastrando...' : 'Cadastrar bem'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Bens cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : bens.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum bem cadastrado ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bem</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Por mês</TableHead>
                  <TableHead>Acumulada</TableHead>
                  <TableHead>Valor contábil</TableHead>
                  <TableHead>Troca prevista</TableHead>
                  {ehAdmin && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {bens.map((b) => {
                  const falta = mesesParaTroca(b, competencia)
                  return (
                    <TableRow key={b.id} className={b.ativo === false ? 'opacity-50' : ''}>
                      <TableCell>
                        {b.descricao}
                        <div className="text-xs text-slate-500">
                          {PADROES_BEM[b.tipo_bem || '']?.rotulo || 'Bem'} · {b.vida_util_meses}{' '}
                          meses
                        </div>
                      </TableCell>
                      <TableCell>{brl(b.valor)}</TableCell>
                      <TableCell>{brl(depreciacaoMensal(b))}</TableCell>
                      <TableCell>{brl(depreciacaoAcumulada(b, competencia))}</TableCell>
                      <TableCell>{brl(valorContabil(b, competencia))}</TableCell>
                      <TableCell>
                        {mmaaaa(competenciaDeTroca(b))}
                        {b.ativo !== false && isFinite(falta) && falta <= 6 && (
                          <Badge variant="outline" className="ml-2">
                            {falta < 0 ? 'prazo vencido' : `faltam ${falta} meses`}
                          </Badge>
                        )}
                      </TableCell>
                      {ehAdmin && (
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => alternarAtivo(b.id, b.ativo !== false)}
                          >
                            {b.ativo === false ? 'Reativar' : 'Desativar'}
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
