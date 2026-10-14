import { describe, it, expect } from 'vitest'
import {
  depreciacaoMensal,
  depreciacaoDoMes,
  depreciacaoAcumulada,
  depreciacaoAcumuladaAno,
  valorContabil,
  competenciaDeTroca,
  mesesParaTroca,
} from './depreciacao'
import { gerarOcorrencias, marcadorRecorrencia } from './recorrencia'
import { calcularDRE } from './financialCalculations'

describe('Depreciação linear gerencial', () => {
  const camara = {
    valor: 12000,
    valor_residual: 0,
    data_aquisicao: '2026-01-15',
    vida_util_meses: 60,
    troca_meses: 72,
    ativo: true,
  }

  it('calcula a parcela mensal e começa no mês seguinte à aquisição', () => {
    expect(depreciacaoMensal(camara)).toBe(200)
    expect(depreciacaoDoMes([camara], '2026-01')).toBe(0)
    expect(depreciacaoDoMes([camara], '2026-02')).toBe(200)
    expect(depreciacaoDoMes([camara], '2031-01')).toBe(200)
    expect(depreciacaoDoMes([camara], '2031-02')).toBe(0)
  })

  it('respeita valor residual e não deprecia bem inativo', () => {
    const veiculo = { ...camara, valor: 100000, valor_residual: 40000, vida_util_meses: 120 }
    expect(depreciacaoMensal(veiculo)).toBe(500)
    expect(depreciacaoDoMes([{ ...camara, ativo: false }], '2026-06')).toBe(0)
  })

  it('acumula, calcula valor contábil, troca e acumulado do ano', () => {
    expect(depreciacaoAcumulada(camara, '2026-07')).toBe(1200)
    expect(valorContabil(camara, '2026-07')).toBe(10800)
    expect(depreciacaoAcumulada(camara, '2040-01')).toBe(12000)
    expect(competenciaDeTroca(camara)).toBe('2032-01')
    expect(mesesParaTroca(camara, '2031-07')).toBe(6)
    expect(depreciacaoAcumuladaAno([camara], '2026-12')).toBe(2200)
  })
})

describe('Recorrência de lançamentos', () => {
  it('gera ocorrências mensais dentro do período, respeitando o limite', () => {
    const lista = gerarOcorrencias(
      { inicio: '2026-10-05', frequencia: 'mensal', dia: 5, ocorrencias: 3 },
      '2026-10',
      '2027-12',
    )
    expect(lista.map((o) => o.data)).toEqual(['2026-10-05', '2026-11-05', '2026-12-05'])
  })

  it('gera trimestral e anual e ignora modelo inativo', () => {
    expect(
      gerarOcorrencias(
        { inicio: '2026-01-01', frequencia: 'trimestral', dia: 10 },
        '2026-01',
        '2026-12',
      ).map((o) => o.competencia),
    ).toEqual(['2026-01', '2026-04', '2026-07', '2026-10'])
    expect(
      gerarOcorrencias(
        { inicio: '2026-03-01', frequencia: 'anual', dia: 31 },
        '2026-01',
        '2028-12',
      ).map((o) => o.data),
    ).toEqual(['2026-03-28', '2027-03-28', '2028-03-28'])
    expect(
      gerarOcorrencias(
        { inicio: '2026-01-01', frequencia: 'mensal', dia: 1, ativo: false },
        '2026-01',
        '2026-12',
      ),
    ).toEqual([])
    expect(marcadorRecorrencia('abc', '2026-10')).toBe('[rec:abc:2026-10]')
  })
})

describe('DRE com depreciação', () => {
  it('desconta a depreciação só do resultado operacional (EBITDA não muda)', () => {
    const base = [
      {
        tipo: 'receita' as const,
        categoria: 'M',
        grupo_dre: 'receita_bruta' as const,
        valor: 1000,
        status: 'realizado' as const,
        competencia: '2026-10',
      },
      {
        tipo: 'despesa' as const,
        categoria: 'A',
        grupo_dre: 'despesas_operacionais' as const,
        valor: 300,
        status: 'realizado' as const,
        competencia: '2026-10',
      },
    ]
    const sem = calcularDRE(base, 'competencia')
    const com = calcularDRE(base, 'competencia', 200)
    expect(com.ebitda).toBe(sem.ebitda)
    expect(com.depreciacaoAmortizacao).toBe(200)
    expect(com.resultadoOperacional).toBe(sem.resultadoOperacional - 200)
    expect(com.resultadoLiquido).toBe(sem.resultadoLiquido - 200)
  })
})
