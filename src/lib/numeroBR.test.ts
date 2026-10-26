import { describe, expect, it } from 'vitest'
import { parseValorBR, valorPositivoBR, valorDigitadoInvalido, valorDigitadoIlegivel } from './numeroBR'

describe('parseValorBR', () => {
  it('lê o formato brasileiro com milhar e vírgula', () => {
    expect(parseValorBR('1.234,56')).toBe(1234.56)
    expect(parseValorBR('R$ 120,00')).toBe(120)
    expect(parseValorBR('  1.234.567,89 ')).toBe(1234567.89)
    expect(parseValorBR('290,5')).toBe(290.5)
    expect(parseValorBR('120,')).toBe(120)
    expect(parseValorBR('0,50')).toBe(0.5)
  })
  it('lê milhar sem vírgula e decimal com ponto isolado', () => {
    expect(parseValorBR('1.234')).toBe(1234)
    expect(parseValorBR('12.345.678')).toBe(12345678)
    expect(parseValorBR('290.5')).toBe(290.5)
    expect(parseValorBR('290.50')).toBe(290.5)
    expect(parseValorBR('1000')).toBe(1000)
  })
  it('zero à esquerda não é milhar', () => {
    expect(parseValorBR('0.500')).toBe(0.5)
    expect(parseValorBR('0.500.000')).toBeNull()
    expect(parseValorBR('01.234')).toBe(1.234)
  })
  it('com vírgula, formato fora do padrão é inválido (nunca lido errado em silêncio)', () => {
    expect(parseValorBR('1,234.56')).toBeNull()
    expect(parseValorBR('10,50.00')).toBeNull()
    expect(parseValorBR('1.234,5.6')).toBeNull()
    expect(parseValorBR('12.34,56')).toBeNull()
    expect(parseValorBR('1.23.4,56')).toBeNull()
    expect(parseValorBR('1,2.3.4')).toBeNull()
    expect(parseValorBR('10,555')).toBeNull()
    expect(parseValorBR('1,234')).toBeNull()
  })
  it('valor inválido é null, nunca zero', () => {
    expect(parseValorBR('')).toBeNull()
    expect(parseValorBR('abc')).toBeNull()
    expect(parseValorBR('12a')).toBeNull()
    expect(parseValorBR('1,2,3')).toBeNull()
    expect(parseValorBR('10%')).toBeNull()
    expect(parseValorBR('1e3')).toBeNull()
  })
})

describe('valorPositivoBR e valorDigitadoInvalido', () => {
  it('só valores positivos contam', () => {
    expect(valorPositivoBR('1.234,56')).toBe(1234.56)
    expect(valorPositivoBR('0')).toBe(0)
    expect(valorPositivoBR('-5')).toBe(0)
    expect(valorPositivoBR('lixo')).toBe(0)
  })
  it('detecta texto digitado que não vira valor', () => {
    expect(valorDigitadoInvalido('')).toBe(false)
    expect(valorDigitadoInvalido('120,00')).toBe(false)
    expect(valorDigitadoInvalido('abc')).toBe(true)
    expect(valorDigitadoInvalido('0')).toBe(true)
    expect(valorDigitadoInvalido('-3')).toBe(true)
  })
})

describe('valorDigitadoIlegivel (campos opcionais: 0 e vazio valem)', () => {
  it('aceita vazio e zero, recusa texto e negativo', () => {
    expect(valorDigitadoIlegivel('')).toBe(false)
    expect(valorDigitadoIlegivel('0')).toBe(false)
    expect(valorDigitadoIlegivel('0,00')).toBe(false)
    expect(valorDigitadoIlegivel('1.234,56')).toBe(false)
    expect(valorDigitadoIlegivel('-3')).toBe(true)
    expect(valorDigitadoIlegivel('abc')).toBe(true)
    expect(valorDigitadoIlegivel('1,234.56')).toBe(true)
  })
})
