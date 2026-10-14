import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
import { Loader2 } from 'lucide-react'

interface CategoriaLinha {
  id: string
  nome: string
  tipo: 'receita' | 'despesa'
  ativa?: boolean
}

interface OrcamentoLinha {
  id: string
  categoria_id: string
  competencia: string
  valor: number
}

interface LancamentoLinha {
  categoria_id?: string
  valor: number
  status: string
  estorno_de?: string | null
}

const brl = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const mesAtual = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const num = (txt: string) => {
  const n = Number(String(txt).replace(',', '.'))
  return isFinite(n) && n > 0 ? n : 0
}

export const OrcamentoPage: React.FC = () => {
  const { user } = useAuth()
  const { toast } = useToast()
  const ehAdmin = user?.role === 'administrador'

  const [competencia, setCompetencia] = useState(mesAtual())
  const [categorias, setCategorias] = useState<CategoriaLinha[]>([])
  const [orcamentos, setOrcamentos] = useState<OrcamentoLinha[]>([])
  const [realizado, setRealizado] = useState<Record<string, number>>({})
  const [edicao, setEdicao] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [cats, orcs, lancs] = await Promise.all([
        pb.collection('categorias').getFullList<CategoriaLinha>({ sort: 'tipo,nome' }),
        pb.collection('orcamentos').getFullList<OrcamentoLinha>({
          filter: `competencia = '${competencia}'`,
        }),
        pb.collection('lancamentos').getFullList<LancamentoLinha>({
          filter: `competencia = '${competencia}' && status != 'estornado'`,
        }),
      ])
      setCategorias(cats.filter((c) => c.ativa !== false))
      setOrcamentos(orcs)
      const soma: Record<string, number> = {}
      for (const l of lancs) {
        if (!l.categoria_id) continue
        const sinal = l.estorno_de ? -1 : 1
        soma[l.categoria_id] =
          Math.round(((soma[l.categoria_id] || 0) + sinal * l.valor) * 100) / 100
      }
      setRealizado(soma)
      setEdicao({})
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível carregar o orçamento',
        description: err?.message || 'Tente novamente.',
      })
    } finally {
      setCarregando(false)
    }
  }, [competencia, toast])

  useEffect(() => {
    carregar()
  }, [carregar])

  const porCategoria = useMemo(() => {
    const m: Record<string, OrcamentoLinha> = {}
    for (const o of orcamentos) m[o.categoria_id] = o
    return m
  }, [orcamentos])

  const salvar = async () => {
    setSalvando(true)
    try {
      for (const [catId, txt] of Object.entries(edicao)) {
        const valor = num(txt)
        const atual = porCategoria[catId]
        if (atual) {
          if (atual.valor !== valor) await pb.collection('orcamentos').update(atual.id, { valor })
        } else if (valor > 0) {
          await pb.collection('orcamentos').create({ categoria_id: catId, competencia, valor })
        }
      }
      toast({ title: 'Orçamento salvo' })
      await carregar()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível salvar o orçamento',
        description: err?.response?.message || err?.message || 'Tente novamente.',
      })
    } finally {
      setSalvando(false)
    }
  }

  const linhas = (tipo: 'receita' | 'despesa') => categorias.filter((c) => c.tipo === tipo)

  const bloco = (titulo: string, tipo: 'receita' | 'despesa') => {
    const itens = linhas(tipo)
    const totOrc = itens.reduce((s, c) => s + (porCategoria[c.id]?.valor || 0), 0)
    const totReal = itens.reduce((s, c) => s + (realizado[c.id] || 0), 0)
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{titulo}</CardTitle>
          <CardDescription>
            Orçado {brl(totOrc)} · Realizado {brl(totReal)} · Diferença {brl(totReal - totOrc)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {itens.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma categoria cadastrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Orçado (R$)</TableHead>
                  <TableHead>Realizado</TableHead>
                  <TableHead>Diferença</TableHead>
                  <TableHead>% do orçado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((c) => {
                  const orc = porCategoria[c.id]?.valor || 0
                  const real = realizado[c.id] || 0
                  const valorCampo =
                    edicao[c.id] !== undefined ? edicao[c.id] : orc ? String(orc) : ''
                  return (
                    <TableRow key={c.id}>
                      <TableCell>{c.nome}</TableCell>
                      <TableCell>
                        {ehAdmin ? (
                          <Input
                            className="w-32"
                            inputMode="decimal"
                            value={valorCampo}
                            onChange={(e) => setEdicao({ ...edicao, [c.id]: e.target.value })}
                          />
                        ) : (
                          brl(orc)
                        )}
                      </TableCell>
                      <TableCell>{brl(real)}</TableCell>
                      <TableCell>{brl(real - orc)}</TableCell>
                      <TableCell>{orc > 0 ? `${Math.round((real / orc) * 100)}%` : '—'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Orçamento</h1>
        <p className="text-sm text-slate-500">
          Valor planejado por categoria em cada mês, comparado com o que foi lançado (sem estornos).
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="orc-comp">Competência</Label>
            <Input
              id="orc-comp"
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </div>
          {ehAdmin && (
            <Button type="button" onClick={salvar} disabled={salvando || carregando}>
              {salvando ? 'Salvando...' : 'Salvar orçamento'}
            </Button>
          )}
        </CardContent>
      </Card>

      {carregando ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <>
          {bloco('Receitas', 'receita')}
          {bloco('Despesas', 'despesa')}
        </>
      )}
    </div>
  )
}
