import { describe, it, expect } from 'vitest'
import {
  analisarCustos,
  analisarReceita,
  calcularCurvaABC,
  calcularVariacao,
  mesAnterior,
  mesmoMesAnoAnterior,
  selecionarPeriodo,
} from './analiseOperacional'
import { calcularDRE, type GrupoDRECalculo, type LancamentoCalculo } from './financialCalculations'

let seq = 0
const L = (p: Partial<LancamentoCalculo> & { valor: number }): LancamentoCalculo => ({
  id: p.id ?? `l${++seq}`,
  tipo: 'despesa',
  categoria: 'Cat',
  categoria_id: null,
  grupo_dre: 'despesas_operacionais',
  status: 'realizado',
  competencia: '2026-10',
  data_realizacao: '2026-10-05',
  ...p,
})

const rec = (valor: number, extra: Partial<LancamentoCalculo> = {}) =>
  L({ tipo: 'receita', grupo_dre: 'receita_bruta', categoria: 'Vendas', valor, ...extra })
const des = (
  valor: number,
  grupo: GrupoDRECalculo,
  categoria: string,
  extra: Partial<LancamentoCalculo> = {},
) => L({ tipo: 'despesa', grupo_dre: grupo, categoria, valor, ...extra })

describe('períodos', () => {
  it('mês anterior e mesmo mês do ano anterior, com virada de ano', () => {
    expect(mesAnterior('2026-10')).toBe('2026-09')
    expect(mesAnterior('2026-01')).toBe('2025-12')
    expect(mesmoMesAnoAnterior('2026-10')).toBe('2025-10')
    expect(mesAnterior('2026-13')).toBe('')
    expect(mesAnterior('')).toBe('')
  })
})

describe('seleção dos lançamentos (mesma regra da DRE)', () => {
  it('estornados ficam fora e previstos já liquidados não contam em dobro', () => {
    const prev = des(500, 'custos_variaveis', 'Urnas', {
      id: 'p1',
      status: 'previsto',
      data_realizacao: null,
    })
    const liq = des(500, 'custos_variaveis', 'Urnas', { id: 'l1', liquidacao_de: 'p1' })
    const est = des(99, 'custos_variaveis', 'Urnas', { status: 'estornado' })
    const sel = selecionarPeriodo([prev, liq, est], '2026-10', 'competencia')
    expect(sel.map((x) => x.id)).toEqual(['l1'])
  })
  it('período inválido ou sem lançamentos devolve vazio', () => {
    expect(selecionarPeriodo([rec(10)], 'abc')).toEqual([])
    expect(selecionarPeriodo([rec(10)], '2026-09')).toEqual([])
  })
  it('caixa: só realizados, pelo mês da data de realização (dezembro liquidado em janeiro)', () => {
    const dez = rec(100, {
      competencia: '2026-12',
      status: 'realizado',
      data_realizacao: '2027-01-10',
    })
    expect(selecionarPeriodo([dez], '2026-12', 'competencia')).toHaveLength(1)
    expect(selecionarPeriodo([dez], '2026-12', 'caixa')).toHaveLength(0)
    expect(selecionarPeriodo([dez], '2027-01', 'caixa')).toHaveLength(1)
    expect(selecionarPeriodo([dez], '2027-01', 'competencia')).toHaveLength(0)
  })
  it('caixa ignora previstos', () => {
    const p = rec(100, { status: 'previsto', data_realizacao: null })
    expect(selecionarPeriodo([p], '2026-10', 'caixa')).toHaveLength(0)
    expect(selecionarPeriodo([p], '2026-10', 'competencia')).toHaveLength(1)
  })
  it('data de realização inválida não derruba o cálculo', () => {
    const x = rec(100, { data_realizacao: 'lixo' })
    expect(selecionarPeriodo([x], '2026-10', 'caixa')).toHaveLength(0)
  })
})

describe('variação', () => {
  it('sem base, base zero ou negativa: não inventa percentual', () => {
    expect(calcularVariacao(100, 0, false)).toMatchObject({
      situacao: 'sem_base',
      percentual: null,
      diferenca: null,
    })
    expect(calcularVariacao(100, 0, true)).toMatchObject({
      situacao: 'base_nao_positiva',
      percentual: null,
      diferenca: 100,
    })
    expect(calcularVariacao(100, -50, true)).toMatchObject({
      situacao: 'base_nao_positiva',
      percentual: null,
    })
    expect(calcularVariacao(150, 100, true)).toMatchObject({
      situacao: 'ok',
      percentual: 50,
      diferenca: 50,
    })
    expect(calcularVariacao(50, 100, true)).toMatchObject({ percentual: -50, diferenca: -50 })
  })
})

describe('receita', () => {
  const dados = [
    rec(1000, { categoria: 'Planos', categoria_id: 'c1' }),
    rec(500, { categoria: 'Serviços', categoria_id: 'c2' }),
    rec(300, {
      categoria: 'Serviços',
      categoria_id: 'c2',
      status: 'previsto',
      data_realizacao: null,
    }),
    L({ tipo: 'receita', grupo_dre: 'receita_financeira', categoria: 'Juros', valor: 40 }),
    L({ tipo: 'receita', grupo_dre: 'fora_resultado', categoria: 'Transferência', valor: 7000 }),
    // meses de comparação
    rec(800, { competencia: '2026-09', categoria: 'Planos', categoria_id: 'c1' }),
    rec(900, { competencia: '2025-10', categoria: 'Planos', categoria_id: 'c1' }),
  ]
  it('receita operacional exclui financeira e fora_resultado; soma das categorias = DRE', () => {
    const r = analisarReceita(dados, '2026-10')
    expect(r.receitaOperacional).toBe(1800)
    expect(r.receitaFinanceira).toBe(40)
    expect(r.porCategoria.reduce((s, c) => s + c.valor, 0)).toBe(r.dre.receitaBruta)
    expect(r.porCategoria.map((c) => c.nome)).toEqual(['Planos', 'Serviços'])
    expect(r.porCategoria[0].participacao).toBeCloseTo(55.56, 2)
  })
  it('previsto x realizado e ticket médio por lançamento', () => {
    const r = analisarReceita(dados, '2026-10')
    expect(r.previstoRealizado).toEqual({ realizado: 1500, previsto: 300 })
    expect(r.ticketMedioPorLancamento).toEqual({ valor: 600, quantidade: 3 })
  })
  it('comparativos com base', () => {
    const r = analisarReceita(dados, '2026-10')
    expect(r.mesAnterior.receita).toBe(800)
    expect(r.mesAnterior.variacao.percentual).toBe(125)
    expect(r.mesmoMesAnoAnterior.receita).toBe(900)
    expect(r.mesmoMesAnoAnterior.variacao.percentual).toBe(100)
  })
  it('estorno reduz a receita e não conta como lançamento no ticket', () => {
    const v = rec(10000, { id: 'v1' })
    const e = rec(10000, { id: 'e1', estorno_de: 'v1' })
    const r = analisarReceita([v, e], '2026-10')
    expect(r.receitaOperacional).toBe(0)
    expect(r.ticketMedioPorLancamento.quantidade).toBe(1)
    expect(r.ticketMedioPorLancamento.valor).toBe(0)
  })
  it('receita negativa após estornos: ticket negativo, sem erro e sem percentual inventado', () => {
    const r = analisarReceita(
      [rec(100, { id: 'a' }), rec(300, { id: 'b', estorno_de: 'a' })],
      '2026-10',
    )
    expect(r.receitaOperacional).toBe(-200)
    expect(r.mesAnterior.variacao.situacao).toBe('sem_base')
  })
  it('período vazio: tudo zero, ticket nulo, comparativos sem base', () => {
    const r = analisarReceita([], '2026-10')
    expect(r.receitaOperacional).toBe(0)
    expect(r.ticketMedioPorLancamento).toEqual({ valor: null, quantidade: 0 })
    expect(r.porCategoria).toEqual([])
    expect(r.mesAnterior.variacao.situacao).toBe('sem_base')
  })
  it('valores fracionários em reais não acumulam erro de ponto flutuante', () => {
    const r = analisarReceita([rec(0.1), rec(0.2)], '2026-10')
    expect(r.receitaOperacional).toBe(0.3)
  })
  it('lançamento sem categoria vira "Sem categoria"', () => {
    const r = analisarReceita([rec(10, { categoria: '' })], '2026-10')
    expect(r.porCategoria[0].nome).toBe('Sem categoria')
  })
})

describe('custo da operação', () => {
  const dados = [
    rec(5000),
    des(500, 'deducoes_tributos', 'Impostos'),
    des(1200, 'custos_variaveis', 'Urnas', { categoria_id: 'u', departamento: 'Funerária' }),
    des(300, 'custos_variaveis', 'Flores', {
      categoria_id: 'f',
      departamento: 'Funerária',
      centro_custo: 'Velório',
    }),
    des(800, 'despesas_operacionais', 'Aluguel', { categoria_id: 'a' }),
    des(100, 'despesas_operacionais', 'Água', {
      categoria_id: 'w',
      departamento: 'Administrativo',
    }),
    des(2000, 'investimento_capex', 'Carro'),
    des(60, 'despesa_financeira', 'Tarifa'),
    des(700, 'fora_resultado', 'Retirada de sócio'),
    des(300, 'despesas_operacionais', 'Aluguel', { categoria_id: 'a', competencia: '2026-09' }),
  ]
  it('custo da operação = custos variáveis + despesas operacionais; o resto vira linha informativa', () => {
    const c = analisarCustos(dados, '2026-10', 'competencia', 150)
    expect(c.custosVariaveis).toBe(1500)
    expect(c.despesasOperacionais).toBe(900)
    expect(c.custoOperacao).toBe(2400)
    expect(c.informativos).toEqual({
      deducoesImpostos: 500,
      despesasFinanceiras: 60,
      capex: 2000,
      depreciacao: 150,
      foraResultado: 700,
    })
    expect(c.percentualDaReceita).toBe(48)
  })
  it('reconcilia com a DRE: categorias, departamentos e centros somam o custo; EBITDA pela identidade', () => {
    const c = analisarCustos(dados, '2026-10')
    const soma = (xs: { valor: number }[]) =>
      Math.round(xs.reduce((s, x) => s + x.valor, 0) * 100) / 100
    expect(soma(c.porCategoria)).toBe(c.custoOperacao)
    expect(soma(c.porDepartamento)).toBe(c.custoOperacao)
    expect(soma(c.porCentroCusto)).toBe(c.custoOperacao)
    expect(c.ebitdaPelaIdentidade).toBe(c.dre.ebitda)
    expect(c.dre.ebitda).toBe(5000 - 500 - 1500 - 900)
  })
  it('sem departamento e sem centro de custo aparecem como linha explícita', () => {
    const c = analisarCustos(dados, '2026-10')
    expect(c.porDepartamento.map((d) => d.nome)).toContain('Sem departamento')
    expect(c.porCentroCusto.map((d) => d.nome)).toContain('Sem centro de custo')
    expect(c.porDepartamento.find((d) => d.nome === 'Funerária')?.valor).toBe(1500)
  })
  it('estorno de despesa reduz o custo da categoria', () => {
    const base = des(100, 'custos_variaveis', 'Urnas', { id: 'd1', categoria_id: 'u' })
    const est = des(100, 'custos_variaveis', 'Urnas', {
      id: 'd2',
      categoria_id: 'u',
      estorno_de: 'd1',
    })
    const c = analisarCustos([base, est], '2026-10')
    expect(c.custoOperacao).toBe(0)
    expect(c.curvaABC.possivel).toBe(false)
  })
  it('sem receita: percentual nulo; sem custo: custo zero', () => {
    expect(
      analisarCustos([des(100, 'despesas_operacionais', 'X')], '2026-10').percentualDaReceita,
    ).toBeNull()
    expect(analisarCustos([rec(100)], '2026-10').custoOperacao).toBe(0)
  })
  it('comparativo com o mês anterior', () => {
    const c = analisarCustos(dados, '2026-10')
    expect(c.mesAnterior.custoOperacao).toBe(300)
    expect(c.mesAnterior.variacao.percentual).toBe(700)
  })
})

describe('curva ABC', () => {
  it('ordena do maior para o menor, acumula e inclui a categoria que ultrapassa 80%', () => {
    const abc = calcularCurvaABC([
      { chave: 'a', nome: 'A', valor: 50 },
      { chave: 'b', nome: 'B', valor: 40 },
      { chave: 'c', nome: 'C', valor: 6 },
      { chave: 'd', nome: 'D', valor: 4 },
    ])
    expect(abc.possivel).toBe(true)
    expect(abc.linhas.map((l) => [l.nome, l.classe, l.acumulada])).toEqual([
      ['A', 'A', 50],
      ['B', 'A', 90],
      ['C', 'resto', 96],
      ['D', 'resto', 100],
    ])
  })
  it('desempate determinístico por nome e total zero ou negativo não classifica', () => {
    const abc = calcularCurvaABC([
      { chave: 'z', nome: 'Zeta', valor: 10 },
      { chave: 'a', nome: 'Alfa', valor: 10 },
    ])
    expect(abc.linhas.map((l) => l.nome)).toEqual(['Alfa', 'Zeta'])
    expect(calcularCurvaABC([{ chave: 'x', nome: 'X', valor: -5 }]).possivel).toBe(false)
    expect(calcularCurvaABC([]).possivel).toBe(false)
  })
})

describe('regressão do baseline Out/2026 (21 lançamentos homologados)', () => {
  // competência: itens de 01/11 e "Venda Novembro" pertencem a 2026-11
  const out = '2026-10'
  const nov = '2026-11'
  const base: LancamentoCalculo[] = [
    rec(10000, { id: 'b1', categoria: 'Vendas', competencia: out }),
    des(1000, 'deducoes_tributos', 'Guia Impostos', { id: 'b2', competencia: out }),
    des(3000, 'custos_variaveis', 'Urnas', { id: 'b3', competencia: out }),
    des(20000, 'investimento_capex', 'Maquina nova', { id: 'b4', competencia: out }),
    rec(10000, { id: 'b5', categoria: 'Vendas', competencia: out, estorno_de: 'b1' }),
    des(50, 'custos_variaveis', 'Fornecedores', { id: 'b6', status: 'previsto', competencia: out }),
    des(50, 'custos_variaveis', 'Fornecedores', {
      id: 'b7',
      competencia: out,
      liquidacao_de: 'b6',
    }),
    des(30, 'deducoes_tributos', 'Guia Impostos', {
      id: 'b8',
      status: 'previsto',
      competencia: out,
    }),
    des(50, 'investimento_capex', 'Maquina nova', {
      id: 'b9',
      status: 'previsto',
      competencia: out,
    }),
    des(50, 'investimento_capex', 'Maquina nova', {
      id: 'b10',
      competencia: out,
      liquidacao_de: 'b9',
    }),
    des(10, 'custos_variaveis', 'Fornecedores', {
      id: 'b11',
      status: 'previsto',
      competencia: out,
    }),
    des(20, 'custos_variaveis', 'Fornecedores', {
      id: 'b12',
      status: 'previsto',
      competencia: out,
    }),
    rec(1000, { id: 'b13', categoria: 'Vendas', status: 'previsto', competencia: nov }),
    des(500, 'custos_variaveis', 'Urnas', { id: 'b14', status: 'previsto', competencia: out }),
    des(500, 'custos_variaveis', 'Urnas', { id: 'b15', competencia: out, liquidacao_de: 'b14' }),
    des(1, 'custos_variaveis', 'Fornecedores', { id: 'b16', status: 'previsto', competencia: out }),
    des(100, 'custos_variaveis', 'Fornecedores', {
      id: 'b17',
      status: 'previsto',
      competencia: out,
    }),
    des(100, 'custos_variaveis', 'Fornecedores', { id: 'b18', competencia: nov }),
    des(100, 'custos_variaveis', 'Fornecedores', {
      id: 'b19',
      competencia: nov,
      estorno_de: 'b18',
    }),
    des(100, 'custos_variaveis', 'Fornecedores', {
      id: 'b20',
      status: 'previsto',
      competencia: nov,
    }),
    des(100, 'custos_variaveis', 'Fornecedores', {
      id: 'b21',
      competencia: nov,
      liquidacao_de: 'b20',
    }),
  ]
  it('reproduz receita bruta 0, deduções 1.030, custos 3.681, EBITDA -4.711 e CAPEX 20.050', () => {
    const r = analisarReceita(base, out)
    const c = analisarCustos(base, out)
    expect(r.receitaOperacional).toBe(0)
    expect(c.informativos.deducoesImpostos).toBe(1030)
    expect(c.custoOperacao).toBe(3681)
    expect(c.dre.ebitda).toBe(-4711)
    expect(c.ebitdaPelaIdentidade).toBe(-4711)
    expect(c.informativos.capex).toBe(20050)
    // a própria DRE oficial, sobre o mesmo conjunto, dá os mesmos números
    const oficial = calcularDRE(
      base.filter((l) => l.competencia === out),
      'competencia',
    )
    expect(oficial.ebitda).toBe(-4711)
    expect(oficial.custosFornecedores + oficial.totalDespesasFixas).toBe(3681)
  })
})

describe('volume e robustez', () => {
  it('milhares de lançamentos: calcula e reconcilia', () => {
    const muitos: LancamentoCalculo[] = []
    for (let i = 0; i < 6000; i++) {
      muitos.push(
        des(10.01, i % 2 ? 'custos_variaveis' : 'despesas_operacionais', `Cat${i % 37}`, {
          categoria_id: `c${i % 37}`,
        }),
      )
      muitos.push(rec(25.5, { categoria: `Rec${i % 5}`, categoria_id: `r${i % 5}` }))
    }
    const c = analisarCustos(muitos, '2026-10')
    const r = analisarReceita(muitos, '2026-10')
    expect(c.custoOperacao).toBe(60060)
    expect(r.receitaOperacional).toBe(153000)
    expect(Math.round(c.porCategoria.reduce((s, x) => s + x.valor, 0) * 100) / 100).toBe(
      c.custoOperacao,
    )
  })
  it('entradas nulas ou lixo não quebram', () => {
    expect(() => analisarCustos([null as unknown as LancamentoCalculo], '2026-10')).not.toThrow()
    expect(analisarCustos([], 'xx').custoOperacao).toBe(0)
  })
})
