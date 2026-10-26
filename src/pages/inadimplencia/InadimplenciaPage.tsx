import React, { useEffect, useMemo, useState } from 'react'
import { getLancamentos, getCategorias } from '@/services/financial'
import { resolverGrupoDRE } from '@/lib/financialCalculations'
import { analisarInadimplencia } from '@/lib/inadimplencia'
import { hojeBrasil, formatarDataCivil } from '@/lib/dataCivil'
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
import { Loader2 } from 'lucide-react'

const brl = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const mesDe = (dataCivil: string) => dataCivil.slice(0, 7)

const dias = (v: number | null) =>
  v === null ? 'Não calculável' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`

export const InadimplenciaPage: React.FC = () => {
  const [referencia, setReferencia] = useState(hojeBrasil())
  const [competencia, setCompetencia] = useState(mesDe(hojeBrasil()))
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

  const a = useMemo(
    () => analisarInadimplencia(comGrupo, competencia, referencia),
    [comGrupo, competencia, referencia],
  )

  const semDados = !carregando && comGrupo.length === 0

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Inadimplência</h1>
        <p className="text-sm text-slate-500">
          Receita a receber que passou do vencimento. Não é taxa de inadimplência de clientes: o
          sistema não identifica o cliente. Considera receita prevista sem liquidação, com a mesma
          seleção de lançamentos da DRE.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-start gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="ina-ref">Data de referência</Label>
            <Input
              id="ina-ref"
              type="date"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              Vence hoje não é vencido. Datas passadas refazem o cálculo com os dados de hoje.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ina-comp">Competência</Label>
            <Input
              id="ina-comp"
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {carregando ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : semDados ? (
        <p className="text-sm text-slate-500">Sem dados: nenhum lançamento cadastrado.</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-slate-500">
                  Vencido em aberto (todas as competências)
                </div>
                <div className="text-xl font-semibold">{brl(a.panorama.vencido)}</div>
                <div className="text-xs text-slate-500">
                  {a.panorama.quantidadeVencida} título(s)
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-slate-500">A vencer</div>
                <div className="text-xl font-semibold">{brl(a.panorama.aVencer)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-slate-500">Sem vencimento utilizável</div>
                <div className="text-xl font-semibold">{brl(a.panorama.semVencimento.valor)}</div>
                <div className="text-xs text-slate-500">
                  {a.panorama.semVencimento.quantidade} título(s)
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-slate-500">Total em aberto</div>
                <div className="text-xl font-semibold">{brl(a.panorama.emAberto)}</div>
                <div className="text-xs text-slate-500">= vencido + a vencer + sem vencimento</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Índice de inadimplência da competência</CardTitle>
              <CardDescription>
                Valor vencido ainda em aberto da competência ÷ receita faturada da competência
                (receita operacional líquida de estornos, previstos e realizados). Não divide o
                vencido de outras competências pelo faturamento de um mês só.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Receita faturada da competência</span>
                <span className="font-semibold">{brl(a.faturadoPeriodo)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Vencido em aberto da competência</span>
                <span className="font-semibold">{brl(a.vencidoPeriodo)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-slate-700">Índice</span>
                <span className="font-semibold">
                  {a.indicePeriodo === null
                    ? a.lancamentosPeriodo === 0
                      ? 'Sem dados'
                      : 'Não calculável — faturamento não positivo'
                    : `${a.indicePeriodo.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Vencido por faixa de atraso</CardTitle>
              <CardDescription>
                Dias corridos entre o vencimento e a data de referência.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Faixa</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Títulos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {a.panorama.faixas.map((f) => (
                    <TableRow key={f.faixa}>
                      <TableCell>{f.faixa}</TableCell>
                      <TableCell>{brl(f.valor)}</TableCell>
                      <TableCell>{f.quantidade}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Maiores valores vencidos</CardTitle>
              <CardDescription>
                Os 10 maiores valores em aberto e vencidos (desempate pelos dias de atraso). Não é
                ordenado por antiguidade.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {a.panorama.maioresAtrasos.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nenhum título vencido na data de referência.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Dias de atraso</TableHead>
                      <TableHead>Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {a.panorama.maioresAtrasos.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{t.descricao || '—'}</TableCell>
                        <TableCell>{t.categoria || '—'}</TableCell>
                        <TableCell>{formatarDataCivil(t.vencimento)}</TableCell>
                        <TableCell>{t.dias}</TableCell>
                        <TableCell>{brl(t.valor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recebimentos do mês {competencia}</CardTitle>
              <CardDescription>
                Liquidações de receita com data de realização no mês, ponderadas por valor.
                Recebimentos diretos, sem vencimento, não entram nos prazos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Valor considerado</span>
                <span className="font-semibold">{brl(a.recebimentos.totalConsiderado)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  Prazo médio de recebimento (lançamento → realização)
                </span>
                <span className="font-semibold">{dias(a.recebimentos.prazoMedioDias)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  Atraso médio (vencimento → realização; negativo = antes do vencimento)
                </span>
                <span className="font-semibold">{dias(a.recebimentos.atrasoMedioDias)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Recebido em atraso</span>
                <span className="font-semibold">
                  {brl(a.recebimentos.recebidoEmAtraso)}
                  {a.recebimentos.percentualEmAtraso === null
                    ? ''
                    : ` (${a.recebimentos.percentualEmAtraso.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`}
                </span>
              </div>
              <div className="text-xs text-slate-500 pt-1">
                {a.recebimentos.liquidacoesConsideradas} liquidação(ões) considerada(s);{' '}
                {a.recebimentos.liquidacoesSemDataUtilizavel} fora por falta de datas utilizáveis.
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
