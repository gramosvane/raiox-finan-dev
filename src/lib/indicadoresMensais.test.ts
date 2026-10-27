import { describe, it, expect } from 'vitest'
import {
  calcularDRE,
  roundCents,
  resumoCompetencia,
  fluxoCaixaDoMes,
  LancamentoCalculo,
} from './financialCalculations'

// Cenário do estudo de 27/10/2026: dois caixas, dinheiro 1.000, PIX 3.400, débito 1.000, crédito 1.600 (fita 7.000),
// despesa em dinheiro 250. O faturamento do mês é 7.000 desde o fechamento, mesmo com PIX e cartões ainda "a receber".
let seq = 0
function l(p: Partial<LancamentoCalculo> & Pick<LancamentoCalculo, 'tipo' | 'valor' | 'status'>): LancamentoCalculo {
  seq += 1
  return {
    id: p.id ?? 'l' + seq,
    categoria: p.tipo === 'receita' ? 'Mensalidades' : 'Despesa',
    competencia: '2026-10',
    ...p,
  } as LancamentoCalculo
}

function mesBase(): LancamentoCalculo[] {
  return [
    l({ id: 'din', tipo: 'receita', valor: 1000, status: 'realizado', data_realizacao: '2026-10-27' }),
    l({ id: 'pix', tipo: 'receita', valor: 3400, status: 'previsto', data_vencimento: '2026-10-27' }),
    l({ id: 'deb', tipo: 'receita', valor: 1000, status: 'previsto', data_vencimento: '2026-10-28' }),
    l({ id: 'cre', tipo: 'receita', valor: 1600, status: 'previsto', data_vencimento: '2026-11-27' }),
    l({ id: 'dsp', tipo: 'despesa', valor: 250, status: 'realizado', data_realizacao: '2026-10-27' }),
  ]
}

describe('resumoCompetencia (mesmo critério da DRE)', () => {
  it('o faturamento mostra o vendido (7.000) mesmo com PIX e cartões ainda a receber', () => {
    const r = resumoCompetencia(mesBase())
    expect(r.faturamento).toBe(7000)
    expect(r.despesas).toBe(250)
    expect(r.lucro).toBe(6750)
  })

  it('bate com a receita bruta da DRE', () => {
    const base = mesBase()
    expect(resumoCompetencia(base).faturamento).toBe(calcularDRE(base, 'competencia').receitaBruta)
  })

  it('baixar um previsto não conta a receita duas vezes', () => {
    const base = mesBase()
    base.push(
      l({ tipo: 'receita', valor: 3400, status: 'realizado', liquidacao_de: 'pix', data_realizacao: '2026-10-28' }),
    )
    expect(resumoCompetencia(base).faturamento).toBe(7000)
  })

  it('depósito com taxa: a receita fica bruta e a taxa entra como despesa financeira', () => {
    const base = mesBase()
    base.push(
      l({ tipo: 'receita', valor: 1000, status: 'realizado', liquidacao_de: 'deb', data_realizacao: '2026-10-28' }),
      l({ tipo: 'despesa', valor: 9.4, status: 'realizado', grupo_dre: 'despesa_financeira', data_realizacao: '2026-10-28' }),
    )
    const r = resumoCompetencia(base)
    expect(r.faturamento).toBe(7000)
    expect(r.despesas).toBe(259.4)
  })

  it('transferência entre contas e retirada de sócio ficam fora do resultado', () => {
    const base = mesBase()
    base.push(
      l({ tipo: 'receita', valor: 1000, status: 'realizado', grupo_dre: 'fora_resultado', data_realizacao: '2026-10-30' }),
      l({ tipo: 'despesa', valor: 1000, status: 'realizado', grupo_dre: 'fora_resultado', data_realizacao: '2026-10-30' }),
      l({ tipo: 'despesa', valor: 500, status: 'realizado', grupo_dre: 'fora_resultado', data_realizacao: '2026-10-30' }),
    )
    const r = resumoCompetencia(base)
    expect(r.faturamento).toBe(7000)
    expect(r.despesas).toBe(250)
  })

  it('estorno abate a receita e estornado sai do cálculo', () => {
    const base = mesBase()
    base.push(l({ tipo: 'receita', valor: 1000, status: 'realizado', estorno_de: 'din', data_realizacao: '2026-10-28' }))
    expect(resumoCompetencia(base).faturamento).toBe(6000)
    const cancelado = mesBase().map((x) => (x.id === 'pix' ? { ...x, status: 'estornado' as const } : x))
    expect(resumoCompetencia(cancelado).faturamento).toBe(3600)
  })

  it('receita financeira não é faturamento, mas entra nas receitas do resultado', () => {
    const base = mesBase()
    base.push(l({ tipo: 'receita', valor: 40, status: 'realizado', grupo_dre: 'receita_financeira', data_realizacao: '2026-10-29' }))
    const r = resumoCompetencia(base)
    expect(r.faturamento).toBe(7000)
    expect(r.receitas).toBe(7040)
  })
})

describe('resumoCompetencia: lucro e margem são os da DRE (resultado líquido e margem líquida)', () => {
  it('CAPEX fica fora do lucro, como na DRE, e vem em investimentos', () => {
    const base = mesBase()
    base.push(l({ tipo: 'despesa', valor: 2000, status: 'realizado', grupo_dre: 'investimento_capex', data_realizacao: '2026-10-29' }))
    const r = resumoCompetencia(base)
    expect(r.lucro).toBe(calcularDRE(base, 'competencia').resultadoLiquido)
    expect(r.lucro).toBe(6750)
    expect(r.investimentos).toBe(2000)
  })

  it('impostos, receita financeira e depreciação batem com a DRE (lucro, despesas e margem)', () => {
    const base = mesBase()
    base.push(
      l({ tipo: 'despesa', valor: 420, status: 'realizado', grupo_dre: 'deducoes_tributos', data_realizacao: '2026-10-29' }),
      l({ tipo: 'despesa', valor: 9.4, status: 'realizado', grupo_dre: 'despesa_financeira', data_realizacao: '2026-10-29' }),
      l({ tipo: 'receita', valor: 40, status: 'realizado', grupo_dre: 'receita_financeira', data_realizacao: '2026-10-29' }),
    )
    const dre = calcularDRE(base, 'competencia', 100)
    const r = resumoCompetencia(base, 100)
    expect(r.lucro).toBe(dre.resultadoLiquido)
    expect(r.margem).toBe(dre.margemLiquida)
    expect(r.receitas).toBe(roundCents(dre.receitaBruta + dre.rendimentosFinanceiros))
    expect(r.despesas).toBe(roundCents(r.receitas - r.lucro))
  })
})

describe('fluxoCaixaDoMes (pela data em que o dinheiro entrou ou saiu)', () => {
  it('cartão vendido em outubro e depositado em novembro entra no fluxo de novembro', () => {
    const base = mesBase()
    base.push(
      l({ tipo: 'receita', valor: 1600, status: 'realizado', liquidacao_de: 'cre', data_realizacao: '2026-11-27' }),
    )
    const out = fluxoCaixaDoMes(base, '2026-10')
    const nov = fluxoCaixaDoMes(base, '2026-11')
    expect(out).toEqual({ entradas: 1000, saidas: 250, saldo: 750 })
    expect(nov).toEqual({ entradas: 1600, saidas: 0, saldo: 1600 })
  })

  it('previsto não entra no fluxo de caixa', () => {
    expect(fluxoCaixaDoMes(mesBase(), '2026-10').entradas).toBe(1000)
  })

  it('as duas pontas de uma transferência se anulam e a retirada de sócio reduz o caixa', () => {
    const base = mesBase()
    base.push(
      l({ tipo: 'despesa', valor: 1000, status: 'realizado', grupo_dre: 'fora_resultado', data_realizacao: '2026-10-30' }),
      l({ tipo: 'receita', valor: 1000, status: 'realizado', grupo_dre: 'fora_resultado', data_realizacao: '2026-10-30' }),
      l({ tipo: 'despesa', valor: 500, status: 'realizado', grupo_dre: 'fora_resultado', data_realizacao: '2026-10-31' }),
    )
    expect(fluxoCaixaDoMes(base, '2026-10').saldo).toBe(750 - 500)
  })

  it('estorno vale negativo na data em que foi feito', () => {
    const base = mesBase()
    base.push(l({ tipo: 'receita', valor: 1000, status: 'realizado', estorno_de: 'din', data_realizacao: '2026-11-02' }))
    expect(fluxoCaixaDoMes(base, '2026-10').entradas).toBe(1000)
    expect(fluxoCaixaDoMes(base, '2026-11').entradas).toBe(-1000)
  })

  it('data de realização com hora é lida pelo mês', () => {
    const base = [l({ tipo: 'receita', valor: 10, status: 'realizado', data_realizacao: '2026-10-05 00:00:00.000Z' })]
    expect(fluxoCaixaDoMes(base, '2026-10').entradas).toBe(10)
  })
})
