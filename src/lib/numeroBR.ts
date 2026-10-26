// Leitura de valores digitados no formato brasileiro. Antes, "1.234,56" ou "R$ 120,00" viravam zero em silêncio e
// "1.234" virava 1,23. Regras:
//  - "R$" e espaços são ignorados;
//  - com vírgula: os pontos são separadores de milhar e a vírgula é o decimal ("1.234,56" = 1234,56);
//  - só com pontos em grupos de três ("1.234" ou "12.345.678"): milhar ("1.234" = 1234);
//  - ponto isolado fora desse padrão é decimal ("290.5" = 290,5);
//  - qualquer letra ou símbolo estranho torna o valor inválido (null), nunca zero.
export function parseValorBR(txt: string): number | null {
  let t = String(txt ?? '')
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
  if (t === '') return null
  if (/[^0-9.,-]/.test(t)) return null
  if (t.includes(',')) {
    if ((t.match(/,/g) || []).length > 1) return null
    t = t.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
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

/** Verdadeiro quando há texto digitado que não vira um valor positivo. */
export function valorDigitadoInvalido(txt: string): boolean {
  if (String(txt ?? '').trim() === '') return false
  const n = parseValorBR(txt)
  return n === null || n <= 0
}
