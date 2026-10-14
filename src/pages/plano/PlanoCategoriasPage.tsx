import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { createCategoria, getCategorias } from '@/services/financial'
import type { GrupoDRE } from '@/types/financial'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { Loader2 } from 'lucide-react'

type Tipo = 'receita' | 'despesa'

interface ItemPlano {
  nome: string
  tipo: Tipo
  grupo: GrupoDRE
}

interface SecaoPlano {
  titulo: string
  explicacao: string
  itens: ItemPlano[]
}

const r = (nome: string, grupo: GrupoDRE): ItemPlano => ({ nome, tipo: 'receita', grupo })
const d = (nome: string, grupo: GrupoDRE): ItemPlano => ({ nome, tipo: 'despesa', grupo })

// Plano de categorias sugerido para funerária com plano mensal (DRE gerencial segmentada).
// O número no início do nome mantém a ordem da DRE nas listas.
const PLANO: SecaoPlano[] = [
  {
    titulo: '1. Receita bruta operacional',
    explicacao: 'Tudo o que a empresa fatura com planos e serviços.',
    itens: [
      r('1.1 Mensalidades de planos', 'receita_bruta'),
      r('1.2 Adesões e taxas de entrada', 'receita_bruta'),
      r('1.3 Serviços funerários avulsos', 'receita_bruta'),
      r('1.4 Serviços adicionais (traslado, ornamentação, coroas)', 'receita_bruta'),
      r('1.5 Venda de urnas e artefatos', 'receita_bruta'),
      r('1.6 Taxas de reativação e segunda via', 'receita_bruta'),
      r('1.7 Reembolsos de auxílio funeral e convênios', 'receita_bruta'),
      r('1.8 Outras receitas operacionais', 'receita_bruta'),
    ],
  },
  {
    titulo: '2. Deduções e tributos sobre a receita',
    explicacao: 'Impostos e taxas que saem direto da receita.',
    itens: [
      d('2.1 Simples Nacional (DAS)', 'deducoes_tributos'),
      d('2.2 ISS', 'deducoes_tributos'),
      d('2.3 Taxas de maquineta e cartão', 'deducoes_tributos'),
      d('2.4 Cancelamentos e abatimentos de mensalidade', 'deducoes_tributos'),
    ],
  },
  {
    titulo: '3. Custos do serviço (variáveis)',
    explicacao: 'O que cada serviço prestado custa; sobe e desce com o volume.',
    itens: [
      d('3.1 Urnas e caixões', 'custos_variaveis'),
      d('3.2 Ornamentação, flores e coroas', 'custos_variaveis'),
      d('3.3 Tanatopraxia e preparação do corpo', 'custos_variaveis'),
      d('3.4 Sepultamento, taxas cemiteriais e cartório', 'custos_variaveis'),
      d('3.5 Transporte e traslado do serviço', 'custos_variaveis'),
      d('3.6 Materiais e EPIs do serviço', 'custos_variaveis'),
      d('3.7 Plantão e diárias de serviço', 'custos_variaveis'),
      d('3.8 Comissões de vendas e cobrança', 'custos_variaveis'),
    ],
  },
  {
    titulo: '4. Despesas operacionais (fixas)',
    explicacao: 'O custo de manter a empresa funcionando, com ou sem serviços no mês.',
    itens: [
      d('4.1 Salários e encargos', 'despesas_operacionais'),
      d('4.2 Pró-labore', 'despesas_operacionais'),
      d('4.3 Aluguel e condomínio', 'despesas_operacionais'),
      d('4.4 Água, energia, telefone e internet', 'despesas_operacionais'),
      d('4.5 Manutenção e conservação', 'despesas_operacionais'),
      d('4.6 Combustível e veículos administrativos', 'despesas_operacionais'),
      d('4.7 Seguros', 'despesas_operacionais'),
      d('4.8 Marketing e divulgação', 'despesas_operacionais'),
      d('4.9 Contabilidade e assessoria jurídica', 'despesas_operacionais'),
      d('4.10 Sistemas e software', 'despesas_operacionais'),
      d('4.11 Material de escritório e limpeza', 'despesas_operacionais'),
      d('4.12 Alimentação e copa', 'despesas_operacionais'),
      d('4.13 Treinamento e uniformes', 'despesas_operacionais'),
      d('4.14 Perdas com inadimplência', 'despesas_operacionais'),
      d('4.15 Outras despesas operacionais', 'despesas_operacionais'),
    ],
  },
  {
    titulo: '5. Resultado financeiro',
    explicacao: 'Rendimentos e despesas de dinheiro (juros, tarifas), fora da operação.',
    itens: [
      r('5.1 Rendimentos de aplicações', 'receita_financeira'),
      r('5.2 Juros e multas recebidos', 'receita_financeira'),
      d('5.3 Juros e multas pagos', 'despesa_financeira'),
      d('5.4 Tarifas bancárias', 'despesa_financeira'),
      d('5.5 Juros de empréstimos e financiamentos', 'despesa_financeira'),
      d('5.6 IOF', 'despesa_financeira'),
    ],
  },
  {
    titulo: '6. Investimentos (CAPEX), fora do EBITDA',
    explicacao: 'Compras que ficam na empresa: aparecem no patrimônio, não no resultado.',
    itens: [
      d('6.1 Veículos e frota', 'investimento_capex'),
      d('6.2 Equipamentos e câmaras frias', 'investimento_capex'),
      d('6.3 Reformas e benfeitorias', 'investimento_capex'),
      d('6.4 Móveis e informática', 'investimento_capex'),
    ],
  },
  {
    titulo: '7. Fora do resultado (não entram na DRE)',
    explicacao: 'Movimentam o caixa e as contas, mas não são lucro nem prejuízo.',
    itens: [
      d('7.1 Retirada de sócio (distribuição de lucros)', 'fora_resultado'),
      d('7.2 Transferência enviada entre contas', 'fora_resultado'),
      r('7.3 Transferência recebida entre contas', 'fora_resultado'),
      r('7.4 Aporte de sócio', 'fora_resultado'),
      d('7.5 Amortização de empréstimos (principal)', 'fora_resultado'),
    ],
  },
]

const chave = (nome: string, tipo: Tipo) => `${tipo}|${nome.trim().toLowerCase()}`

export const PlanoCategoriasPage: React.FC = () => {
  const { user } = useAuth()
  const { toast } = useToast()
  const ehAdmin = user?.role === 'administrador'

  const [existentes, setExistentes] = useState<Set<string>>(new Set())
  const [carregando, setCarregando] = useState(true)
  const [criando, setCriando] = useState(false)
  const [progresso, setProgresso] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const cats = await getCategorias()
      setExistentes(new Set(cats.map((c) => chave(c.nome, c.tipo as Tipo))))
    } catch {
      setExistentes(new Set())
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const faltantes = useMemo(
    () => PLANO.flatMap((s) => s.itens).filter((i) => !existentes.has(chave(i.nome, i.tipo))),
    [existentes],
  )
  const total = useMemo(() => PLANO.reduce((s, sec) => s + sec.itens.length, 0), [])

  const carregarPlano = async () => {
    setCriando(true)
    let ok = 0
    let falhas = 0
    for (let i = 0; i < faltantes.length; i++) {
      const item = faltantes[i]
      setProgresso(`Criando ${i + 1} de ${faltantes.length}: ${item.nome}`)
      try {
        await createCategoria({ nome: item.nome, tipo: item.tipo, grupo_dre: item.grupo })
        ok++
      } catch {
        falhas++
      }
    }
    setProgresso('')
    setCriando(false)
    toast({
      title: 'Plano de categorias carregado',
      description: `${ok} criadas${falhas ? `, ${falhas} não puderam ser criadas` : ''}.`,
    })
    await carregar()
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Plano de categorias</h1>
        <p className="text-sm text-slate-500">
          Sugestão de plano para funerária com planos mensais, organizado como a DRE: do faturamento
          até o resultado. Nada é apagado nem alterado: só são criadas as categorias que ainda não
          existem.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center gap-4">
          {carregando ? (
            <span className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin" /> Verificando...
            </span>
          ) : (
            <span className="text-sm text-slate-700">
              {total - faltantes.length} de {total} categorias do plano já existem.
            </span>
          )}
          {ehAdmin ? (
            <Button
              type="button"
              onClick={carregarPlano}
              disabled={criando || carregando || faltantes.length === 0}
            >
              {criando ? 'Criando...' : `Criar as ${faltantes.length} que faltam`}
            </Button>
          ) : (
            <span className="text-sm text-slate-500">Somente o administrador carrega o plano.</span>
          )}
          {progresso && <span className="text-xs text-slate-500">{progresso}</span>}
        </CardContent>
      </Card>

      {PLANO.map((secao) => (
        <Card key={secao.titulo}>
          <CardHeader>
            <CardTitle className="text-lg">{secao.titulo}</CardTitle>
            <CardDescription>{secao.explicacao}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 md:grid-cols-2">
              {secao.itens.map((item) => {
                const existe = existentes.has(chave(item.nome, item.tipo))
                return (
                  <li
                    key={`${item.tipo}-${item.nome}`}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span>{item.nome}</span>
                    <Badge variant={existe ? 'secondary' : 'outline'}>
                      {existe ? 'já existe' : 'a criar'}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
