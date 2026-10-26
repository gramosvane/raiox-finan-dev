import { describe, expect, it } from 'vitest'
import { parseValorBR, valorPositivoBR, valorDigitadoInvalido } from './numeroBR'

describe('parseValorBR', () => {
  it('lê o formato brasileiro com milhar e vírgula', () => {
    expect(parseValorBR('1.234,56')).toBe(1234.56)
    expect(parseValorBR('R$ 120,00')).toBe(120)
    expect(parseValorBR('  1.234.567,89 ')).toBe(1234567.89)
    expect(parseValorBR('290,5')).toBe(290.5)
  })
  it('lê milhar sem vírgula e decimal com ponto isolado', () => {
    expect(parseValorBR('1.234')).toBe(1234)
    expect(parseValorBR('12.345.678')).toBe(12345678)
    expect(parseValorBR('290.5')).toBe(290.5)
    expect(parseValorBR('290.50')).toBe(290.5)
    expect(parseValorBR('1000')).toBe(1000)
  })
  it('valor inválido é null, nunca zero', () => {
    expect(parseValorBR('')).toBeNull()
    expect(parseValorBR('abc')).toBeNull()
    expect(parseValorBR('12a')).toBeNull()
    expect(parseValorBR('1,2,3')).toBeNull()
    expect(parseValorBR('10%')).toBeNull()
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
