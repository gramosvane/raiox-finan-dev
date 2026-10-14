import React, { useCallback, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { createLancamento, getCategorias } from '@/services/financial'
import type { Categoria } from '@/types/financial'
import { gerarOcorrencias, marcadorRecorrencia } from '@/lib/recorrencia'
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

type Frequencia = 'mensal' | 'trimestral' | 'semestral' | 'anual'

interface RecorrenciaRegistro {
  id: string
  descricao: string
  tipo: 'receita' | 'despesa'
  categoria_id: string
  categoria_nome?: string
  valor: number
  frequencia: Frequencia
  dia: number
  inicio: string
  ocorrencias?: number
  ativo?: boolean
}

const brl = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const mesAtual = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const somarMeses = (comp: string, meses: number) => {
  const [a, m] = comp.split('-').map(Number)
  const idx = a * 12 + (m - 1) + meses
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}

const num = (txt: string) => {
  const n = Number(String(txt).replace(',', '.'))
  return isFinite(n) && n > 0 ? n : 0
}

export const RecorrenciasPage: React.FC = () => {
  const { user } = useAuth()
  const { toast } = useToast()
  const ehAdmin = user?.role === 'administrador'

  const [lista, setLista] = useState<RecorrenciaRegistro[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [horizonte, setHorizonte] = useState('12')

  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo] = useState<'receita' | 'despesa'>('despesa')
  const [categoriaId, setCategoriaId] = useState('')
  const [valor, setValor] = useState('')
  const [frequencia, setFrequencia] = useState<Frequencia>('mensal')
  const [dia, setDia] = useState('5')
  const [inicio, setInicio] = useState(`${mesAtual()}-01`)
  const [ocorrencias, setOcorrencias] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [regs, cats] = await Promise.all([
        pb.collection('recorrencias').getFullList<RecorrenciaRegistro>({ sort: '-created' }),
        getCategorias(undefined, true),
      ])
      setLista(regs)
      setCategorias(cats)
    } catch {
      setLista([])
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const categoriasDoTipo = categorias.filter((c) => c.tipo === tipo)

  const cadastrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    const cat = categorias.find((c) => c.id === categoriaId)
    if (descricao.trim().length < 2) return setErro('Informe a descrição.')
    if (!cat) return setErro('Escolha a categoria.')
    if (!num(valor)) return setErro('Informe o valor.')
    const diaNum = Math.round(num(dia))
    if (diaNum < 1 || diaNum > 28) return setErro('O dia deve ser de 1 a 28.')

    setSalvando(true)
    try {
      await pb.collection('recorrencias').create({
        descricao: descricao.trim(),
        tipo,
        categoria_id: cat.id,
        categoria_nome: cat.nome,
        valor: num(valor),
        frequencia,
        dia: diaNum,
        inicio,
        ocorrencias: num(ocorrencias) ? Math.round(num(ocorrencias)) : undefined,
        ativo: true,
      })
      toast({ title: 'Recorrência cadastrada' })
      setDescricao('')
      setValor('')
      setOcorrencias('')
      await carregar()
    } catch (err: any) {
      setErro(err?.response?.message || err?.message || 'Não foi possível cadastrar.')
    } finally {
      setSalvando(false)
    }
  }

  const alternarAtivo = async (r: RecorrenciaRegistro) => {
    try {
      await pb.collection('recorrencias').update(r.id, { ativo: r.ativo === false })
      await carregar()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível alterar',
        description: err?.response?.message || err?.message || 'Tente novamente.',
      })
    }
  }

  const gerarPrevistos = async () => {
    setGerando(true)
    let criados = 0
    let jaExistiam = 0
    let falhas = 0
    try {
      const de = mesAtual()
      const ate = somarMeses(de, Math.max(1, Math.round(num(horizonte)) || 12))
      for (const r of lista) {
        for (const o of gerarOcorrencias(r, de, ate)) {
          const marcador = marcadorRecorrencia(r.id, o.competencia)
          const existentes = await pb.collection('lancamentos').getList(1, 1, {
            filter: `observacoes ~ '${marcador}'`,
          })
          if (existentes.totalItems > 0) {
            jaExistiam++
            continue
          }
          try {
            await createLancamento({
              tipo: r.tipo,
              descricao: r.descricao,
              categoria: r.categoria_nome || '',
              categoria_id: r.categoria_id,
              valor: r.valor,
              competencia: o.competencia,
              data_lancamento: o.data,
              data_vencimento: o.data,
              status: 'previsto',
              observacoes: `${marcador} gerado pela recorrência`,
            } as unknown as Parameters<typeof createLancamento>[0])
            criados++
          } catch {
            falhas++
          }
        }
      }
      toast({
        title: 'Lançamentos previstos gerados',
        description: `${criados} criados, ${jaExistiam} já existiam${falhas ? `, ${falhas} com erro` : ''}.`,
      })
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Recorrências</h1>
        <p className="text-sm text-slate-500">
          Cadastre o que se repete (aluguel, mensalidades, assinaturas). O sistema gera os
          lançamentos <strong>previstos</strong> dos próximos meses, sem duplicar os que já existem.
        </p>
      </div>

      {ehAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Nova recorrência</CardTitle>
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
                <Label htmlFor="r-desc">Descrição</Label>
                <Input
                  id="r-desc"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select
                  value={tipo}
                  onValueChange={(v) => {
                    setTipo(v as 'receita' | 'despesa')
                    setCategoriaId('')
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="despesa">Despesa</SelectItem>
                    <SelectItem value="receita">Receita</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Categoria</Label>
                <Select value={categoriaId} onValueChange={setCategoriaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriasDoTipo.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-valor">Valor (R$)</Label>
                <Input
                  id="r-valor"
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Frequência</Label>
                <Select value={frequencia} onValueChange={(v) => setFrequencia(v as Frequencia)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="trimestral">Trimestral</SelectItem>
                    <SelectItem value="semestral">Semestral</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-dia">Dia do mês (1 a 28)</Label>
                <Input
                  id="r-dia"
                  inputMode="numeric"
                  value={dia}
                  onChange={(e) => setDia(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-ini">Início</Label>
                <Input
                  id="r-ini"
                  type="date"
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-oc">Quantas vezes (vazio = sem fim)</Label>
                <Input
                  id="r-oc"
                  inputMode="numeric"
                  value={ocorrencias}
                  onChange={(e) => setOcorrencias(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={salvando}>
                  {salvando ? 'Cadastrando...' : 'Cadastrar recorrência'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recorrências cadastradas</CardTitle>
          <CardDescription>
            Gera lançamentos previstos de agora até o prazo escolhido; pode repetir à vontade.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ehAdmin && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="r-hor">Gerar para os próximos (meses)</Label>
                <Input
                  id="r-hor"
                  className="w-32"
                  inputMode="numeric"
                  value={horizonte}
                  onChange={(e) => setHorizonte(e.target.value)}
                />
              </div>
              <Button
                type="button"
                onClick={gerarPrevistos}
                disabled={gerando || lista.length === 0}
              >
                {gerando ? 'Gerando...' : 'Gerar lançamentos previstos'}
              </Button>
            </div>
          )}
          {carregando ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : lista.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma recorrência cadastrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead>Situação</TableHead>
                  {ehAdmin && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((r) => (
                  <TableRow key={r.id} className={r.ativo === false ? 'opacity-50' : ''}>
                    <TableCell>
                      {r.descricao}
                      <div className="text-xs text-slate-500">
                        {r.tipo === 'receita' ? 'Receita' : 'Despesa'}
                      </div>
                    </TableCell>
                    <TableCell>{r.categoria_nome || '—'}</TableCell>
                    <TableCell>{brl(r.valor)}</TableCell>
                    <TableCell>
                      {r.frequencia}, dia {r.dia}
                      {r.ocorrencias ? ` · ${r.ocorrencias}x` : ''}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.ativo === false ? 'outline' : 'secondary'}>
                        {r.ativo === false ? 'inativa' : 'ativa'}
                      </Badge>
                    </TableCell>
                    {ehAdmin && (
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => alternarAtivo(r)}
                        >
                          {r.ativo === false ? 'Reativar' : 'Desativar'}
                        </Button>
                      </TableCell>
                    )}
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
