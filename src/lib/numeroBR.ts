// Leitura de valores digitados no formato brasileiro. Antes, "1.234,56" ou "R$ 120,00" viravam zero em silêncio e
// "1.234" virava 1,23. Regras:
//  - "R$" e espaços são ignorados;
//  - com vírgula: formato estrito "1.234,56" (milhar com ponto em grupos de três, no máximo 2 casas depois da vírgula);
//    qualquer outra combinação ("1,234.56", "12.34,56", "10,555") é inválida, nunca lida errado em silêncio;
//  - só com pontos em grupos de três, sem zero à esquerda ("1.234" ou "12.345.678"): milhar ("1.234" = 1234);
//  - ponto isolado fora desse padrão é decimal ("290.5" = 290,5; "0.500" = 0,5);
//  - qualquer letra ou símbolo estranho torna o valor inválido (null), nunca zero.
export function parseValorBR(txt: string): number | null {
  let t = String(txt ?? '')
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
  if (t === '') return null
  if (/[^0-9.,-]/.test(t)) return null
  if (t.includes(',')) {
    if (!/^-?([1-9]\d{0,2}(\.\d{3})+|\d+),\d{0,2}$/.test(t)) return null
    t = t.replace(/\./g, '').replace(',', '.')
  } else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '')
  }
  const n = Number(t)
  return isFinite(n) ? n : null
}

/** Valor positivo digitado (0 quando vazio, inválido ou não positivo). */
export function valorPositivoBR(txt: string): number {
  const n = parseValorBR(txt)
  return n !== null && n > 0 ? n : 0
}

/** Verdadeiro quando há texto digitado que não vira um valor positivo (0 também conta como inválido). */
export function valorDigitadoInvalido(txt: string): boolean {
  if (String(txt ?? '').trim() === '') return false
  const n = parseValorBR(txt)
  return n === null || n <= 0
}

/** Verdadeiro quando há texto digitado que não é número ou é negativo; 0 e vazio são aceitos (campos opcionais como PIX). */
export function valorDigitadoIlegivel(txt: string): boolean {
  if (String(txt ?? '').trim() === '') return false
  const n = parseValorBR(txt)
  return n === null || n < 0
}
