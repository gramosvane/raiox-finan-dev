import React, { useEffect, useMemo, useState } from 'react'
import { getLancamentos, getCategorias } from '@/services/financial'
import { resolverGrupoDRE } from '@/lib/financialCalculations'
import { analisarReceita, type RegimeAnalise, type Variacao } from '@/lib/analiseOperacional'
import type { Categoria, Lancamento } from '@/types/financial'
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
import { Loader2 } from 'lucide-react'

const brl = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const mesAtual = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const mmaaaa = (p: string) => {
  const x = p.split('-')
  return x.length === 2 ? `${x[1]}/${x[0]}` : p
}

const textoVariacao = (v: Variacao) => {
  if (v.situacao === 'sem_base') return 'Sem base de comparação (período sem lançamentos)'
  const dif = v.diferenca ?? 0
  const sinal = dif > 0 ? '+' : ''
  if (v.situacao === 'base_nao_positiva')
    return `${sinal}${brl(dif)} (percentual indisponível: a base não é positiva)`
  const p = v.percentual ?? 0
  return `${sinal}${brl(dif)} (${p > 0 ? '+' : ''}${p.toFixed(1)}%)`
}

export const ReceitaPage: React.FC = () => {
  const [competencia, setCompetencia] = useState(mesAtual())
  const [regime, setRegime] = useState<RegimeAnalise>('competencia')
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let ativo = true
    Promise.all([getLancamentos(), getCategorias()])
      .then(([lancs, cats]) => {
        if (!ativo) return
        setLancamentos(lancs)
        setCategorias(cats)
      })
      .catch(() => {})
      .finally(() => {
        if (ativo) setCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [])

  const comGrupo = useMemo(
    () =>
      lancamentos.map((l) => ({
        ...l,
        grupo_dre: resolverGrupoDRE(
          {
            tipo: l.tipo,
            categoria: l.categoria,
            categoria_id: l.categoria_id,
            grupo_dre: l.expand?.categoria_id?.grupo_dre,
          },
          categorias,
        ),
      })),
    [lancamentos, categorias],
  )

  const analise = useMemo(
    () => analisarReceita(comGrupo, competencia, regime),
    [comGrupo, competencia, regime],
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Receita</h1>
        <p className="text-sm text-slate-500">
          Receita operacional do período, por categoria, com comparativos. Usa a mesma seleção de
          lançamentos da DRE: estornos abatem, previstos já liquidados não contam em dobro, e
          retiradas e transferências ficam fora.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="rec-comp">Período</Label>
            <Input
              id="rec-comp"
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 min-w-[260px]">
            <Label>Regime</Label>
            <Select value={regime} onValueChange={(v) => setRegime(v as RegimeAnalise)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="competencia">Competência (previstos e realizados)</SelectItem>
                <SelectItem value="caixa">
                  Caixa (só realizados, pela data de realização)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {carregando ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-slate-500">
                  Receita operacional de {mmaaaa(competencia)}
                </div>
                <div className="text-xl font-semibold">{brl(analise.receitaOperacional)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-slate-500">Receita financeira (à parte)</div>
                <div className="text-xl font-semibold">{brl(analise.receitaFinanceira)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-slate-500">Ticket médio por lançamento</div>
                <div className="text-xl font-semibold">
                  {analise.ticketMedioPorLancamento.valor === null
                    ? '—'
                    : brl(analise.ticketMedioPorLancamento.valor)}
                </div>
                <div className="text-xs text-slate-500">
                  {analise.ticketMedioPorLancamento.quantidade} lançamento(s) de receita; não é por
                  cliente nem por serviço
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-slate-500">Realizado x previsto</div>
                <div className="text-sm">
                  Realizado:{' '}
                  <span className="font-semibold">{brl(analise.previstoRealizado.realizado)}</span>
                </div>
                <div className="text-sm">
                  Previsto (a receber):{' '}
                  <span className="font-semibold">{brl(analise.previstoRealizado.previsto)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Comparativos</CardTitle>
              <CardDescription>
                Sem inventar percentual: quando o período de comparação não tem lançamentos, ou a
                base não é positiva, o sistema avisa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-slate-500">
                  Mês anterior ({mmaaaa(analise.mesAnterior.periodo)}):{' '}
                  {brl(analise.mesAnterior.receita)}
                </span>
                <span className="font-semibold">{textoVariacao(analise.mesAnterior.variacao)}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-slate-500">
                  Mesmo mês do ano anterior ({mmaaaa(analise.mesmoMesAnoAnterior.periodo)}):{' '}
                  {brl(analise.mesmoMesAnoAnterior.receita)}
                </span>
                <span className="font-semibold">
                  {textoVariacao(analise.mesmoMesAnoAnterior.variacao)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Receita por categoria</CardTitle>
              <CardDescription>
                A receita por tipo de serviço só fica clara quando o plano de categorias separa os
                serviços.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analise.porCategoria.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma receita operacional no período.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Participação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analise.porCategoria.map((c) => (
                      <TableRow key={c.chave}>
                        <TableCell>{c.nome}</TableCell>
                        <TableCell>{brl(c.valor)}</TableCell>
                        <TableCell>
                          {c.participacao === null ? '—' : `${c.participacao.toFixed(1)}%`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
