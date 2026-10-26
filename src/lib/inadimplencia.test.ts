import { describe, it, expect } from 'vitest'
import { analisarInadimplencia, diasEntre } from './inadimplencia'
import { analisarReceita } from './analiseOperacional'
import type { GrupoDRECalculo, LancamentoCalculo } from './financialCalculations'

let seq = 0
type Extra = Partial<LancamentoCalculo> & { descricao?: string; data_lancamento?: string }
const R = (valor: number, extra: Extra = {}): LancamentoCalculo & { descricao?: string } =>
  ({
    id: extra.id ?? `r${++seq}`,
    tipo: 'receita',
    categoria: 'Vendas',
    grupo_dre: 'receita_bruta' as GrupoDRECalculo,
    status: 'previsto',
    competencia: '2026-10',
    data_vencimento: '2026-10-10',
    data_realizacao: null,
    valor,
    ...extra,
  }) as LancamentoCalculo & { descricao?: string }

const REF = '2026-10-20'

describe('datas e dias', () => {
  it('diasEntre trata mês, ano e dia 29/02', () => {
    expect(diasEntre('2026-10-10', '2026-10-20')).toBe(10)
    expect(diasEntre('2026-12-31', '2027-01-01')).toBe(1)
    expect(diasEntre('2028-02-28', '2028-03-01')).toBe(2)
    expect(diasEntre('2026-10-20', '2026-10-10')).toBe(-10)
  })
})

describe('vencido x a vencer', () => {
  it('vence hoje NÃO é vencido; vence ontem é vencido com 1 dia', () => {
    const a = analisarInadimplencia(
      [
        R(100, { id: 'hoje', data_vencimento: REF }),
        R(50, { id: 'ontem', data_vencimento: '2026-10-19' }),
      ],
      '2026-10',
      REF,
    )
    expect(a.panorama.vencido).toBe(50)
    expect(a.panorama.aVencer).toBe(100)
    expect(a.panorama.maioresAtrasos).toHaveLength(1)
    expect(a.panorama.maioresAtrasos[0].dias).toBe(1)
  })
  it('sem vencimento ou vencimento inválido fica à parte', () => {
    const a = analisarInadimplencia(
      [
        R(10, { data_vencimento: null }),
        R(20, { data_vencimento: 'lixo' }),
        R(30, { data_vencimento: '2026-02-31' }),
      ],
      '2026-10',
      REF,
    )
    expect(a.panorama.semVencimento).toEqual({ valor: 60, quantidade: 3 })
    expect(a.panorama.vencido).toBe(0)
    expect(a.panorama.emAberto).toBe(60)
  })
  it('reconciliação: vencido + a vencer + sem vencimento = em aberto', () => {
    const a = analisarInadimplencia(
      [
        R(10.1, { data_vencimento: '2026-09-01' }),
        R(20.2),
        R(30.3, { data_vencimento: '2026-12-01' }),
        R(0.4, { data_vencimento: null }),
      ],
      '2026-10',
      REF,
    )
    const p = a.panorama
    expect(Math.round((p.vencido + p.aVencer + p.semVencimento.valor) * 100) / 100).toBe(p.emAberto)
    expect(p.emAberto).toBe(61)
  })
  it('previsto já liquidado, estornado, fora_resultado, despesa e receita financeira não são inadimplência', () => {
    const prev = R(500, { id: 'p1', data_vencimento: '2026-09-01' })
    const liq = R(500, {
      id: 'l1',
      status: 'realizado',
      liquidacao_de: 'p1',
      data_realizacao: '2026-10-05',
    })
    const est = R(70, { status: 'estornado', data_vencimento: '2026-09-01' })
    const fora = R(80, { grupo_dre: 'fora_resultado', data_vencimento: '2026-09-01' })
    const fin = R(90, { grupo_dre: 'receita_financeira', data_vencimento: '2026-09-01' })
    const desp: LancamentoCalculo = { ...R(60, { data_vencimento: '2026-09-01' }), tipo: 'despesa' }
    const a = analisarInadimplencia([prev, liq, est, fora, fin, desp], '2026-10', REF)
    expect(a.panorama.emAberto).toBe(0)
    expect(a.panorama.vencido).toBe(0)
  })
})

describe('faixas e maiores atrasos', () => {
  it('classifica 1-30, 31-60, 61-90 e 91+ dias e ordena os maiores', () => {
    const a = analisarInadimplencia(
      [
        R(100, { id: 'a', data_vencimento: '2026-10-10' }), // 10 dias
        R(200, { id: 'b', data_vencimento: '2026-09-01' }), // 49
        R(300, { id: 'c', data_vencimento: '2026-08-01' }), // 80
        R(400, { id: 'd', data_vencimento: '2026-05-01' }), // 172
        R(400, { id: 'e', data_vencimento: '2026-06-01' }), // 141 (empata em valor)
      ],
      '2026-10',
      REF,
    )
    expect(a.panorama.faixas.map((f) => [f.faixa, f.valor, f.quantidade])).toEqual([
      ['1 a 30 dias', 100, 1],
      ['31 a 60 dias', 200, 1],
      ['61 a 90 dias', 300, 1],
      ['91 dias ou mais', 800, 2],
    ])
    expect(a.panorama.maioresAtrasos.map((t) => t.id)).toEqual(['d', 'e', 'c', 'b', 'a'])
  })
  it('limita aos 10 maiores', () => {
    const muitos = Array.from({ length: 25 }, (_, i) =>
      R(10 + i, { data_vencimento: '2026-09-01' }),
    )
    const a = analisarInadimplencia(muitos, '2026-10', REF)
    expect(a.panorama.maioresAtrasos).toHaveLength(10)
    expect(a.panorama.quantidadeVencida).toBe(25)
  })
})

describe('índice do período', () => {
  it('vencido da competência ÷ faturado da competência (previstos e realizados)', () => {
    const dados = [
      R(600, {
        id: 'rea',
        status: 'realizado',
        data_realizacao: '2026-10-05',
        data_vencimento: null,
      }),
      R(300, { id: 'v', data_vencimento: '2026-10-05' }),
      R(100, { id: 'f', data_vencimento: '2026-11-30' }),
    ]
    const a = analisarInadimplencia(dados, '2026-10', REF)
    expect(a.faturadoPeriodo).toBe(1000)
    expect(a.vencidoPeriodo).toBe(300)
    expect(a.indicePeriodo).toBe(30)
    // o faturado é exatamente a receita da tela Receita (mesma DRE)
    expect(a.faturadoPeriodo).toBe(analisarReceita(dados, '2026-10').receitaOperacional)
  })
  it('sem faturamento positivo: índice nulo, sem inventar percentual', () => {
    expect(analisarInadimplencia([], '2026-10', REF).indicePeriodo).toBeNull()
    expect(analisarInadimplencia([], '2026-10', REF).lancamentosPeriodo).toBe(0)
    const v = R(100, { id: 'v1' })
    const e = R(100, {
      id: 'e1',
      status: 'realizado',
      estorno_de: 'v1',
      data_realizacao: '2026-10-02',
    })
    expect(analisarInadimplencia([v, e], '2026-10', REF).indicePeriodo).toBeNull()
    expect(analisarInadimplencia([v, e], '2026-10', REF).lancamentosPeriodo).toBe(2)
  })
  it('período ou referência inválidos não quebram', () => {
    expect(() => analisarInadimplencia([R(10)], 'xx', 'yy')).not.toThrow()
    const a = analisarInadimplencia([R(10)], 'xx', 'yy')
    expect(a.faturadoPeriodo).toBe(0)
    expect(a.panorama.vencido).toBe(0)
  })
  it('virada de ano: vencimento em dezembro, referência em janeiro', () => {
    const a = analisarInadimplencia(
      [R(100, { competencia: '2026-12', data_vencimento: '2026-12-31' })],
      '2026-12',
      '2027-01-15',
    )
    expect(a.vencidoPeriodo).toBe(100)
    expect(a.panorama.maioresAtrasos[0].dias).toBe(15)
  })
})

describe('recebimentos do mês (prazo e atraso médios ponderados)', () => {
  const orig = (id: string, valor: number, lanc: string, venc: string) =>
    R(valor, { id, data_lancamento: lanc, data_vencimento: venc })
  const liq = (id: string, de: string, valor: number, real: string, extra: Extra = {}) =>
    R(valor, { id, status: 'realizado', liquidacao_de: de, data_realizacao: real, ...extra })
  it('pondera por valor, conta o recebido em atraso e ignora liquidação sem datas', () => {
    const dados = [
      orig('o1', 100, '2026-10-01', '2026-10-10'),
      liq('q1', 'o1', 100, '2026-10-15', { data_vencimento: '2026-10-10' }), // prazo 14, atraso 5
      orig('o2', 300, '2026-10-01', '2026-10-20'),
      liq('q2', 'o2', 300, '2026-10-18', { data_vencimento: '2026-10-20' }), // prazo 17, atraso -2
      orig('o3', 50, '', ''),
      liq('q3', 'o3', 50, '2026-10-19', { data_vencimento: null }), // sem datas: fora
    ]
    const r = analisarInadimplencia(dados, '2026-10', REF).recebimentos
    expect(r.liquidacoesConsideradas).toBe(2)
    expect(r.liquidacoesSemDataUtilizavel).toBe(1)
    expect(r.totalConsiderado).toBe(400)
    expect(r.prazoMedioDias).toBe(16.3) // 16,25 arredondado para longe do zero
    expect(r.atrasoMedioDias).toBe(-0.3) // -0,25: adiantamento médio, simétrico ao arredondar
    expect(r.recebidoEmAtraso).toBe(100)
    expect(r.percentualEmAtraso).toBe(25)
  })
  it('recebimento direto (sem previsto) e liquidação estornada ficam fora; mês errado também', () => {
    const dados = [
      R(500, {
        id: 'd1',
        status: 'realizado',
        data_realizacao: '2026-10-03',
        data_vencimento: null,
      }),
      orig('o1', 100, '2026-10-01', '2026-10-10'),
      liq('q1', 'o1', 100, '2026-10-12', { data_vencimento: '2026-10-10' }),
      R(100, { id: 'e1', status: 'realizado', estorno_de: 'q1', data_realizacao: '2026-10-13' }),
      orig('o2', 100, '2026-09-01', '2026-09-10'),
      liq('q2', 'o2', 100, '2026-09-12', { data_vencimento: '2026-09-10' }),
    ]
    const r = analisarInadimplencia(dados, '2026-10', REF).recebimentos
    expect(r.liquidacoesConsideradas).toBe(0)
    expect(r.prazoMedioDias).toBeNull()
    expect(r.percentualEmAtraso).toBeNull()
  })
  it('usa as datas do lançamento original quando a liquidação não as traz', () => {
    const dados = [
      orig('o1', 100, '2026-10-01', '2026-10-05'),
      liq('q1', 'o1', 100, '2026-10-08', { data_vencimento: null }),
    ]
    const r = analisarInadimplencia(dados, '2026-10', REF).recebimentos
    expect(r.liquidacoesConsideradas).toBe(1)
    expect(r.atrasoMedioDias).toBe(3)
  })
})

describe('regressão do baseline Out/2026 (Venda Novembro 1.000, previsto, vence 10/10/2026)', () => {
  const base = [
    R(10000, {
      id: 'b1',
      competencia: '2026-10',
      data_vencimento: null,
      status: 'realizado',
      data_realizacao: '2026-10-02',
    }),
    R(10000, {
      id: 'b5',
      competencia: '2026-10',
      data_vencimento: null,
      status: 'realizado',
      estorno_de: 'b1',
      data_realizacao: '2026-10-03',
    }),
    R(1000, {
      id: 'b13',
      competencia: '2026-11',
      data_vencimento: '2026-10-10',
      descricao: 'Venda Novembro',
    }),
  ]
  it('em 08/10 ainda a vencer; em 26/10 vencido há 16 dias, 100% de Nov/2026', () => {
    const antes = analisarInadimplencia(base, '2026-11', '2026-10-08')
    expect(antes.panorama.aVencer).toBe(1000)
    expect(antes.panorama.vencido).toBe(0)
    const depois = analisarInadimplencia(base, '2026-11', '2026-10-26')
    expect(depois.panorama.vencido).toBe(1000)
    expect(depois.panorama.maioresAtrasos[0]).toMatchObject({
      dias: 16,
      valor: 1000,
      descricao: 'Venda Novembro',
    })
    expect(depois.indicePeriodo).toBe(100)
    // Out/2026: receita bruta 0 (venda estornada): índice nulo
    expect(analisarInadimplencia(base, '2026-10', '2026-10-26').indicePeriodo).toBeNull()
  })
})

describe('volume e robustez', () => {
  it('milhares de lançamentos', () => {
    const muitos = Array.from({ length: 8000 }, (_, i) =>
      R(10.01, { data_vencimento: i % 2 ? '2026-09-01' : '2026-12-01' }),
    )
    const a = analisarInadimplencia(muitos, '2026-10', REF)
    expect(a.panorama.vencido).toBe(40040)
    expect(a.panorama.aVencer).toBe(40040)
    expect(a.panorama.maioresAtrasos).toHaveLength(10)
  })
  it('entradas nulas não quebram', () => {
    expect(() =>
      analisarInadimplencia([null as unknown as LancamentoCalculo], '2026-10', REF),
    ).not.toThrow()
  })
})
