/**
 * Módulo de tratamento de datas civis no fuso horário oficial de Brasília (FIN-08).
 *
 * Regras do projeto:
 * 1. DATAS CIVIS: data_lancamento, data_vencimento e data_realizacao são datas civis (AAAA-MM-DD),
 *    sem conversão de fuso horário.
 * 2. EXIBIÇÃO: Pega os 10 primeiros caracteres do valor gravado e formata diretamente para "dd/mm/aaaa".
 *    Nunca usa new Date(...).toLocaleDateString() para datas civis.
 * 3. COMPARAÇÃO: Compara diretamente textos normalizados "AAAA-MM-DD" com "hoje" em Brasília.
 * 4. HOJE EM BRASÍLIA: Retorna "AAAA-MM-DD" usando Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).
 */

/**
 * Retorna a data civil corrente no fuso de Brasília ("America/Sao_Paulo") no formato "AAAA-MM-DD".
 * Pode receber uma data base (Date) opcional, facilitando simulações de relógio em testes.
 */
export function hojeBrasil(referencia?: Date): string {
  const d = referencia || new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // 'en-CA' produz YYYY-MM-DD nativamente
  return formatter.format(d)
}

/**
 * Extrai e normaliza os 10 primeiros caracteres de uma data civil ("AAAA-MM-DD").
 * Mantém total compatibilidade com formatos legados gravados com timestamp UTC (ex: "2026-10-20T00:00:00.000Z").
 */
export function normalizarDataCivil(valor?: string | null): string {
  if (!valor || typeof valor !== 'string') return ''
  const trimmed = valor.trim()
  if (trimmed.length < 10) return ''
  return trimmed.slice(0, 10)
}

/**
 * Formata uma data civil ("AAAA-MM-DD" ou formato legado iniciando com "AAAA-MM-DD")
 * para a representação textual "DD/MM/AAAA", sem nenhuma conversão de fuso horário.
 * Retorna o fallback especificado caso o valor seja nulo/vazio.
 */
export function formatarDataCivil(valor?: string | null, fallback = '—'): string {
  const norm = normalizarDataCivil(valor)
  if (!norm) return fallback

  // Formato AAAA-MM-DD
  const partes = norm.split('-')
  if (
    partes.length === 3 &&
    partes[0].length === 4 &&
    partes[1].length === 2 &&
    partes[2].length === 2
  ) {
    const [ano, mes, dia] = partes
    return `${dia}/${mes}/${ano}`
  }

  return norm
}

/**
 * Adiciona ou subtrai dias civis a partir de uma data civil "AAAA-MM-DD" no formato ISO civil.
 * Não passa por UTC nem sofre salto de horário de verão.
 */
export function somarDiasDataCivil(dataCivil: string, dias: number): string {
  const norm = normalizarDataCivil(dataCivil)
  if (!norm) return ''
  const [ano, mes, dia] = norm.split('-').map(Number)
  // Usar Date em UTC apenas como manipulador de calendário simples
  const utcDate = new Date(Date.UTC(ano, mes - 1, dia + dias))
  const anoRes = utcDate.getUTCFullYear()
  const mesRes = String(utcDate.getUTCMonth() + 1).padStart(2, '0')
  const diaRes = String(utcDate.getUTCDate()).padStart(2, '0')
  return `${anoRes}-${mesRes}-${diaRes}`
}

/**
 * Calcula a diferença em dias civis inteiros: (dataA - dataB).
 * Retorna valor positivo se dataA > dataB, negativo se dataA < dataB, ou 0 se iguais.
 */
export function diferencaDiasCivil(dataA: string, dataB: string): number {
  const normA = normalizarDataCivil(dataA)
  const normB = normalizarDataCivil(dataB)
  if (!normA || !normB) return 0

  const [anoA, mesA, diaA] = normA.split('-').map(Number)
  const [anoB, mesB, diaB] = normB.split('-').map(Number)

  const utcA = Date.UTC(anoA, mesA - 1, diaA)
  const utcB = Date.UTC(anoB, mesB - 1, diaB)

  return Math.round((utcA - utcB) / (1000 * 60 * 60 * 24))
}

/**
 * Compara duas datas civis lexicograficamente (AAAA-MM-DD).
 * Retorna:
 *  -1 se dataA < dataB
 *   0 se dataA === dataB
 *   1 se dataA > dataB
 */
export function compararDataCivil(dataA?: string | null, dataB?: string | null): number {
  const normA = normalizarDataCivil(dataA)
  const normB = normalizarDataCivil(dataB)

  if (normA < normB) return -1
  if (normA > normB) return 1
  return 0
}
