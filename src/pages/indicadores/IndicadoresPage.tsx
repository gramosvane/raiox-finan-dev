import React, { useEffect, useMemo, useState } from 'react'
import { getLancamentos, getCategorias } from '@/services/financial'
import { calcularDRE, resolverGrupoDRE, roundCents } from '@/lib/financialCalculations'
import type { Categoria, Lancamento } from '@/types/financial'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

const brl = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const mesAtual = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const mesesAnteriores = (competencia: string, quantidade: number) => {
  const [a, m] = competencia.split('-').map(Number)
  const lista: string[] = []
  for (let i = 0; i < quantidade; i++) {
    const d = new Date(a, m - 1 - i, 1)
    lista.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return lista
}

export const IndicadoresPage: React.FC = () => {
  const [competencia, setCompetencia] = useState(mesAtual())
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

  const dre = useMemo(
    () => calcularDRE(comGrupo.filter((l) => l.competencia === competencia)),
    [comGrupo, competencia],
  )

  const margemPct = dre.receitaLiquida > 0 ? dre.margemContribuicao / dre.receitaLiquida : 0
  const pontoEquilibrio = margemPct > 0 ? roundCents(dre.totalDespesasFixas / margemPct) : null
  const folga = pontoEquilibrio !== null ? roundCents(dre.receitaLiquida - pontoEquilibrio) : null

  // Saídas médias dos últimos 3 meses (despesas realizadas, sem estornos; inclui retiradas de sócio)
  const saidasMedias = useMemo(() => {
    const meses = mesesAnteriores(competencia, 3)
    const totais = meses.map((m) =>
      comGrupo
        .filter(
          (l) =>
            l.competencia === m &&
            l.tipo === 'despesa' &&
            l.status === 'realizado' &&
            !l.estorno_de,
        )
        .reduce((s, l) => roundCents(s + l.valor), 0),
    )
    return { meses, totais, media: roundCents(totais.reduce((s, v) => s + v, 0) / meses.length) }
  }, [comGrupo, competencia])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Indicadores</h1>
        <p className="text-sm text-slate-500">
          Ponto de equilíbrio e saídas médias, calculados com a mesma DRE dos Relatórios (retiradas
          e transferências ficam fora do resultado).
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-1.5 max-w-xs">
            <Label htmlFor="ind-comp">Competência</Label>
            <Input
              id="ind-comp"
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
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Ponto de equilíbrio</CardTitle>
              <CardDescription>
                Receita líquida necessária para cobrir as despesas fixas, pela margem de
                contribuição do mês.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Receita líquida do mês</span>
                <span className="font-semibold">{brl(dre.receitaLiquida)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Margem de contribuição</span>
                <span className="font-semibold">
                  {brl(dre.margemContribuicao)} ({(margemPct * 100).toFixed(1)}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Despesas fixas</span>
                <span className="font-semibold">{brl(dre.totalDespesasFixas)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-slate-500">Ponto de equilíbrio</span>
                <span className="font-semibold">
                  {pontoEquilibrio === null
                    ? 'Sem margem de contribuição no mês'
                    : brl(pontoEquilibrio)}
                </span>
              </div>
              {folga !== null && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Folga sobre o ponto de equilíbrio</span>
                  <span
                    className={`font-semibold ${folga >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
                  >
                    {brl(folga)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Saídas médias (3 meses)</CardTitle>
              <CardDescription>
                Média das despesas realizadas nos 3 últimos meses até a competência escolhida.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {saidasMedias.meses.map((m, i) => (
                <div key={m} className="flex justify-between">
                  <span className="text-slate-500">{m}</span>
                  <span className="font-semibold">{brl(saidasMedias.totais[i])}</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2">
                <span className="text-slate-500">Média mensal de saídas</span>
                <span className="font-semibold">{brl(saidasMedias.media)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
