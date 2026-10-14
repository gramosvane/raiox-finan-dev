import { describe, it, expect } from 'vitest'
import { calcularDRE, LancamentoCalculo } from './financialCalculations'

describe('Grupo fora_resultado (retirada de sócio e transferência)', () => {
  const base: LancamentoCalculo[] = [
    {
      tipo: 'receita',
      categoria: 'Mensalidades',
      grupo_dre: 'receita_bruta',
      valor: 1000,
      status: 'realizado',
      competencia: '2026-10',
      data_realizacao: '2026-10-05',
    },
    {
      tipo: 'despesa',
      categoria: 'Aluguel',
      grupo_dre: 'despesas_operacionais',
      valor: 300,
      status: 'realizado',
      competencia: '2026-10',
      data_realizacao: '2026-10-06',
    },
  ]

  it('não altera a DRE quando há retirada ou transferência', () => {
    const semRetirada = calcularDRE(base, 'caixa')
    const comRetirada = calcularDRE(
      [
        ...base,
        {
          tipo: 'despesa',
          categoria: 'Retirada de sócio',
          grupo_dre: 'fora_resultado',
          valor: 500,
          status: 'realizado',
          competencia: '2026-10',
          data_realizacao: '2026-10-07',
        },
        {
          tipo: 'receita',
          categoria: 'Transferência recebida',
          grupo_dre: 'fora_resultado',
          valor: 200,
          status: 'realizado',
          competencia: '2026-10',
          data_realizacao: '2026-10-08',
        },
      ],
      'caixa',
    )
    expect(comRetirada.receitaBruta).toBe(semRetirada.receitaBruta)
    expect(comRetirada.ebitda).toBe(semRetirada.ebitda)
    expect(comRetirada.resultadoLiquido).toBe(semRetirada.resultadoLiquido)
    expect(comRetirada.outrasDespesasOp).toBe(semRetirada.outrasDespesasOp)
  })
})
