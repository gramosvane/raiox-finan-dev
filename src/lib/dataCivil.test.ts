import { describe, it, expect } from 'vitest'
import {
  hojeBrasil,
  normalizarDataCivil,
  formatarDataCivil,
  compararDataCivil,
  diferencaDiasCivil,
  somarDiasDataCivil,
} from './dataCivil'

describe('FIN-08: Tratamento de Datas Civis no Fuso de Brasília', () => {
  it('CENÁRIO 1: Reprodução do defeito real — 20/10/2026 nunca vira 19/10/2026', () => {
    const dataDigitada = '2026-10-20'
    const exibicao = formatarDataCivil(dataDigitada)
    expect(exibicao).toBe('20/10/2026')
    expect(exibicao).not.toBe('19/10/2026')
  })

  it('CENÁRIO 2: Registro legado gravado com timestamp UTC à meia-noite', () => {
    // Formato antigo que causava o bug no Brasil ao chamar toLocaleDateString()
    const legadoUTC = '2026-10-20T00:00:00.000Z'
    expect(normalizarDataCivil(legadoUTC)).toBe('2026-10-20')
    expect(formatarDataCivil(legadoUTC)).toBe('20/10/2026')
    expect(formatarDataCivil(legadoUTC)).not.toBe('19/10/2026')
  })

  it('CENÁRIO 3: 31/10/2026 às 22h no horário de Brasília (relógio simulado)', () => {
    // Brasília está em UTC-3. 22:00 BRT corresponde a 01:00 UTC do dia 01/11/2026.
    // Antes da correção, new Date().toISOString() resultaria em "2026-11-01T01:00:00.000Z",
    // fazendo a data sugerida pular para 01/11 e a competência avançar indevidamente.
    const relogioSimulado = new Date('2026-11-01T01:00:00.000Z') // 31/10/2026 22:00 em São Paulo
    const dataSugerida = hojeBrasil(relogioSimulado)
    const competencia = dataSugerida.slice(0, 7)

    expect(dataSugerida).toBe('2026-10-31')
    expect(competencia).toBe('2026-10')
    expect(dataSugerida).not.toBe('2026-11-01')
  })

  it('CENÁRIO 4: 01/11/2026 às 00h30 no horário de Brasília (relógio simulado)', () => {
    // 00:30 BRT de 01/11/2026 corresponde a 03:30 UTC de 01/11/2026.
    const relogioSimulado = new Date('2026-11-01T03:30:00.000Z') // 01/11/2026 00:30 em São Paulo
    const dataSugerida = hojeBrasil(relogioSimulado)
    const competencia = dataSugerida.slice(0, 7)

    expect(dataSugerida).toBe('2026-11-01')
    expect(competencia).toBe('2026-11')
  })

  it('CENÁRIO 5: Separação entre meses — Lançamento com data 01/11/2026', () => {
    const dataLanc = '2026-11-01'
    const compDerived = dataLanc.slice(0, 7)
    expect(compDerived).toBe('2026-11')
    expect(compDerived).not.toBe('2026-10')
    expect(formatarDataCivil(dataLanc)).toBe('01/11/2026')
  })

  it('CENÁRIO 6: Vencimento e Aging — Conta com vencimento 20/10/2026', () => {
    const vencimento = '2026-10-20'

    // Cenário A: relógio em 19/10/2026 às 22h BRT (01:00 UTC do dia 20/10)
    // No horário de Brasília ainda é 19/10/2026 -> NÃO vencida
    const relogioA = new Date('2026-10-20T01:00:00.000Z')
    const hojeA = hojeBrasil(relogioA)
    expect(hojeA).toBe('2026-10-19')
    const cmpA = compararDataCivil(vencimento, hojeA)
    // vencimento (20/10) > hoje (19/10) -> NÃO vencida (cmpA > 0)
    expect(cmpA).toBeGreaterThan(0)
    expect(vencimento < hojeA).toBe(false)

    // Cenário B: relógio em 21/10/2026 às 10h BRT -> VENCIDA
    const relogioB = new Date('2026-10-21T13:00:00.000Z')
    const hojeB = hojeBrasil(relogioB)
    expect(hojeB).toBe('2026-10-21')
    const cmpB = compararDataCivil(vencimento, hojeB)
    // vencimento (20/10) < hoje (21/10) -> VENCIDA (cmpB < 0)
    expect(cmpB).toBeLessThan(0)
    expect(vencimento < hojeB).toBe(true)
  })

  it('CENÁRIO 7: Estorno no último dia do mês — 22h de 31/10/2026 BRT', () => {
    const relogioSimulado = new Date('2026-11-01T01:00:00.000Z') // 31/10 22h em Brasília
    const dataContraLancamento = hojeBrasil(relogioSimulado)
    const competenciaContra = dataContraLancamento.slice(0, 7)

    expect(dataContraLancamento).toBe('2026-10-31')
    expect(competenciaContra).toBe('2026-10')
  })

  it('CENÁRIO 8: Regressão financeira — Cenário oficial sem alteração de valores (6.000 -> -4.000)', async () => {
    // Importa dinamicamente as funções de cálculo para validar que não foram alteradas
    const { calcularDRE, calcularValorEfetivoLancamento } = await import('./financialCalculations')
    const lancamentosBase = [
      {
        id: '1',
        tipo: 'receita' as const,
        descricao: 'Venda de produtos',
        categoria: 'Receita Operacional',
        grupo_dre: 'receita_bruta' as const,
        valor: 10000,
        status: 'realizado' as const,
        competencia: '2026-10',
        data_lancamento: '2026-10-20',
      },
      {
        id: '2',
        tipo: 'despesa' as const,
        descricao: 'Impostos sobre vendas',
        categoria: 'Impostos',
        grupo_dre: 'deducoes_tributos' as const,
        valor: 1000,
        status: 'realizado' as const,
        competencia: '2026-10',
        data_lancamento: '2026-10-20',
      },
      {
        id: '3',
        tipo: 'despesa' as const,
        descricao: 'Fornecedores',
        categoria: 'Fornecedores',
        grupo_dre: 'custos_variaveis' as const,
        valor: 3000,
        status: 'realizado' as const,
        competencia: '2026-10',
        data_lancamento: '2026-10-20',
      },
      {
        id: '4',
        tipo: 'despesa' as const,
        descricao: 'Compra de Máquinas CAPEX',
        categoria: 'Equipamentos',
        grupo_dre: 'investimento_capex' as const,
        valor: 20000,
        status: 'realizado' as const,
        competencia: '2026-10',
        data_lancamento: '2026-10-20',
      },
    ]

    const dreInicial = calcularDRE(lancamentosBase, 'competencia')
    expect(dreInicial.receitaLiquida).toBe(9000)
    expect(dreInicial.resultadoLiquido).toBe(6000)
    expect(dreInicial.investimentos).toBe(20000)

    // Após estorno da venda:
    const lancamentosComEstorno = [
      ...lancamentosBase,
      {
        id: '5',
        tipo: 'receita' as const,
        descricao: 'Estorno de Venda',
        categoria: 'Receita Operacional',
        grupo_dre: 'receita_bruta' as const,
        valor: 10000,
        status: 'realizado' as const,
        competencia: '2026-10',
        data_lancamento: '2026-10-31',
        estorno_de: '1',
      },
    ]

    const dreAposEstorno = calcularDRE(lancamentosComEstorno, 'competencia')
    expect(dreAposEstorno.resultadoLiquido).toBe(-4000)
  })

  it('Operações auxiliares de dias civis somam e calculam diferenças corretamente', () => {
    expect(somarDiasDataCivil('2026-10-20', 10)).toBe('2026-10-30')
    expect(somarDiasDataCivil('2026-10-31', 1)).toBe('2026-11-01')
    expect(diferencaDiasCivil('2026-10-25', '2026-10-20')).toBe(5)
    expect(diferencaDiasCivil('2026-10-20', '2026-10-25')).toBe(-5)
    expect(diferencaDiasCivil('2026-10-20', '2026-10-20')).toBe(0)
  })
})
