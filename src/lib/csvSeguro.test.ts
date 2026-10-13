import { describe, it, expect } from 'vitest'
import { neutralizarCelulaCsv } from './csvSeguro'

describe('neutralizarCelulaCsv', () => {
  it('prefixa texto que começa com caractere de fórmula', () => {
    expect(neutralizarCelulaCsv('=1+1')).toBe("'=1+1")
    expect(neutralizarCelulaCsv('+cmd')).toBe("'+cmd")
    expect(neutralizarCelulaCsv('-cmd')).toBe("'-cmd")
    expect(neutralizarCelulaCsv('@SOMA(A1)')).toBe("'@SOMA(A1)")
    expect(neutralizarCelulaCsv('\t=1+1')).toBe("'\t=1+1")
    expect(neutralizarCelulaCsv('\r=1+1')).toBe("'\r=1+1")
    expect(neutralizarCelulaCsv(' =1+1')).toBe("' =1+1")
    expect(neutralizarCelulaCsv('\n=1+1')).toBe("'\n=1+1")
    expect(neutralizarCelulaCsv('  \t@SOMA(A1)')).toBe("'  \t@SOMA(A1)")
    expect(neutralizarCelulaCsv('\tabc')).toBe("'\tabc")
    expect(neutralizarCelulaCsv('\u00a0=1+1')).toBe("'\u00a0=1+1")
    expect(neutralizarCelulaCsv('=HYPERLINK("http://x","y")')).toBe(`'=HYPERLINK("http://x","y")`)
  })

  it('não altera números simples, inclusive negativos', () => {
    for (const v of ['-1000.00', '1000.00', '-4711.00', '+5', '0.00', '-12,50', '12.5%', '-3.0%']) {
      expect(neutralizarCelulaCsv(v)).toBe(v)
    }
  })

  it('não altera texto comum, datas, ids e rótulos', () => {
    for (const v of [
      'Venda Teste',
      '2026-10-05',
      '',
      'abc123',
      '(+) Receita bruta',
      '[ESTORNO] Venda',
    ]) {
      expect(neutralizarCelulaCsv(v)).toBe(v)
    }
  })

  it('texto com sinal que não é número simples é neutralizado', () => {
    expect(neutralizarCelulaCsv('-5 desconto')).toBe("'-5 desconto")
    expect(neutralizarCelulaCsv('+55 19 99999-0000')).toBe("'+55 19 99999-0000")
  })
})
