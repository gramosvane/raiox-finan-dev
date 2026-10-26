import React, { useEffect, useMemo, useState } from 'react'
import { getLancamentos, getCategorias } from '@/services/financial'
import { resolverGrupoDRE } from '@/lib/financialCalculations'
import {
  analisarCustos,
  type LinhaParticipacao,
  type RegimeAnalise,
  type Variacao,
} from '@/lib/analiseOperacional'
import { useBensDepreciacao } from '@/hooks/useBensDepreciacao'
import { depreciacaoDoMes } from '@/lib/depreciacao'
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

const TabelaParticipacao: React.FC<{ titulo: string; linhas: LinhaParticipacao[] }> = ({
  titulo,
  linhas,
}) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-lg">{titulo}</CardTitle>
    </CardHeader>
    <CardContent>
      {linhas.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum custo no período.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Participação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => (
              <TableRow key={l.chave}>
                <TableCell>{l.nome}</TableCell>
                <TableCell>{brl(l.valor)}</TableCell>
                <TableCell>
                  {l.participacao === null ? '—' : `${l.participacao.toFixed(1)}%`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
)

export const CustosPage: React.FC = () => {
  const [competencia, setCompetencia] = useState(mesAtual())
  const [regime, setRegime] = useState<RegimeAnalise>('competencia')
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [carregando, setCarregando] = useState(true)
  const { bens } = useBensDepreciacao()

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

  const depreciacaoMes = useMemo(() => depreciacaoDoMes(bens, competencia), [bens, competencia])

  const analise = useMemo(
    () => analisarCustos(comGrupo, competencia, regime, depreciacaoMes),
    [comGrupo, competencia, regime, depreciacaoMes],
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Custo da operação</h1>
        <p className="text-sm text-slate-500">
          Custo da operação = custos variáveis + despesas operacionais. Deduções e impostos,
          despesas financeiras, CAPEX, depreciação e retiradas ficam fora do total e aparecem só
          como informação. Usa a mesma seleção de lançamentos da DRE.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cus-comp">Período</Label>
            <Input
              id="cus-comp"
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
                  Custo da operação de {mmaaaa(competencia)}
                </div>
                <div className="text-xl font-semibold">{brl(analise.custoOperacao)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-slate-500">Custos variáveis</div>
                <div className="text-xl font-semibold">{brl(analise.custosVariaveis)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-slate-500">Despesas operacionais</div>
                <div className="text-xl font-semibold">{brl(analise.despesasOperacionais)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-slate-500">Custo sobre a receita bruta</div>
                <div className="text-xl font-semibold">
                  {analise.percentualDaReceita === null
                    ? '—'
                    : `${analise.percentualDaReceita.toFixed(1)}%`}
                </div>
                {analise.percentualDaReceita === null && (
                  <div className="text-xs text-slate-500">Sem receita positiva no período</div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Conferência com a DRE</CardTitle>
              <CardDescription>
                Receita bruta − deduções − custos variáveis − despesas operacionais = EBITDA, antes
                da depreciação.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Deduções e impostos (fora do total)</span>
                <span className="font-semibold">{brl(analise.informativos.deducoesImpostos)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Despesas financeiras (fora do total)</span>
                <span className="font-semibold">
                  {brl(analise.informativos.despesasFinanceiras)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">CAPEX / investimentos (fora do total)</span>
                <span className="font-semibold">{brl(analise.informativos.capex)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Depreciação do mês (fora do total)</span>
                <span className="font-semibold">{brl(analise.informativos.depreciacao)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  Retiradas e transferências, fora do resultado
                </span>
                <span className="font-semibold">{brl(analise.informativos.foraResultado)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-slate-700">EBITDA pela identidade</span>
                <span className="font-semibold">{brl(analise.ebitdaPelaIdentidade)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-700">EBITDA da DRE</span>
                <span className="font-semibold">{brl(analise.dre.ebitda)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Mês anterior</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap justify-between gap-2 text-sm">
              <span className="text-slate-500">
                {mmaaaa(analise.mesAnterior.periodo)}: {brl(analise.mesAnterior.custoOperacao)}
              </span>
              <span className="font-semibold">{textoVariacao(analise.mesAnterior.variacao)}</span>
            </CardContent>
          </Card>

          <TabelaParticipacao titulo="Custo por categoria" linhas={analise.porCategoria} />
          <TabelaParticipacao titulo="Custo por departamento" linhas={analise.porDepartamento} />
          <TabelaParticipacao titulo="Custo por centro de custo" linhas={analise.porCentroCusto} />

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Curva ABC (80%)</CardTitle>
              <CardDescription>
                Categorias do maior para o menor custo; grupo A = as primeiras que somam cerca de
                80% do custo, incluindo a que ultrapassa o limite. Vale para o período e o regime
                escolhidos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!analise.curvaABC.possivel ? (
                <p className="text-sm text-slate-500">{analise.curvaABC.motivo}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Participação</TableHead>
                      <TableHead>Acumulada</TableHead>
                      <TableHead>Classe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analise.curvaABC.linhas.map((l) => (
                      <TableRow key={l.chave}>
                        <TableCell>{l.nome}</TableCell>
                        <TableCell>{brl(l.valor)}</TableCell>
                        <TableCell>{l.participacao.toFixed(1)}%</TableCell>
                        <TableCell>{l.acumulada.toFixed(1)}%</TableCell>
                        <TableCell>{l.classe === 'A' ? 'A' : '—'}</TableCell>
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
