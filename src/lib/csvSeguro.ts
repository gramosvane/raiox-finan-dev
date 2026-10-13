// Neutraliza células de CSV que o Excel poderia interpretar como fórmula (injeção de fórmula, OWASP).
// Números simples (inclusive negativos e com %) NÃO são alterados.
const NUMERO_SIMPLES = /^[+-]?\d+([.,]\d+)?%?$/
const INICIO_PERIGOSO = /^(?:[\t\r]|\s*[=+@-])/

export function neutralizarCelulaCsv(valor: string): string {
  if (INICIO_PERIGOSO.test(valor) && !NUMERO_SIMPLES.test(valor)) {
    return `'${valor}`
  }
  return valor
}
