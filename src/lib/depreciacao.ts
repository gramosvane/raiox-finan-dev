// Depreciação gerencial linear de bens (lote 10).
// Convenção: a depreciação começa no mês SEGUINTE ao da aquisição e dura vida_util_meses meses,
// até depreciar (valor - valor_residual). Valores em centavos arredondados.
// Padrões sugeridos (ajustáveis por bem): equipamentos e informática 60 meses; veículos e
// reformas 120 meses. O prazo de troca é informativo (alerta); por padrão igual à vida útil.

export interface BemDepreciavel {
  valor: number
  valor_residual?: number | null
  data_aquisicao: string // AAAA-MM-DD (ou ISO)
  vida_util_meses: number
  troca_meses?: number | null
  ativo?: boolean | null
}

export const PADROES_BEM: Record<string, { rotulo: string; vidaUtilMeses: number }> = {
  equipamento: { rotulo: 'Equipamento (câmara fria, ferramentas)', vidaUtilMeses: 60 },
  informatica: { rotulo: 'Informática e móveis', vidaUtilMeses: 60 },
  veiculo: { rotulo: 'Veículo', vidaUtilMeses: 120 },
  reforma: { rotulo: 'Reforma e benfeitoria', vidaUtilMeses: 120 },
  outro: { rotulo: 'Outro', vidaUtilMeses: 60 },
}

const centavos = (v: number) => Math.round((Number(v) || 0) * 100) / 100

// Índice absoluto do mês (ano*12 + mês-1) a partir de AAAA-MM ou AAAA-MM-DD
export const indiceMes = (texto: string): number => {
  const m = /^(\d{4})-(\d{2})/.exec(String(texto))
  if (!m) return NaN
  return Number(m[1]) * 12 + (Number(m[2]) - 1)
}

export const competenciaDeIndice = (idx: number): string => {
  const ano = Math.floor(idx / 12)
  const mes = (idx % 12) + 1
  return `${ano}-${String(mes).padStart(2, '0')}`
}

export function baseDepreciavel(b: BemDepreciavel): number {
  return Math.max(0, centavos(b.valor - (b.valor_residual || 0)))
}

export function depreciacaoMensal(b: BemDepreciavel): number {
  if (!b.vida_util_meses || b.vida_util_meses < 1) return 0
  return centavos(baseDepreciavel(b) / b.vida_util_meses)
}

// Meses já depreciados até a competência informada (inclusive), de 0 a vida_util_meses
export function mesesDepreciados(b: BemDepreciavel, competencia: string): number {
  const ini = indiceMes(b.data_aquisicao)
  const alvo = indiceMes(competencia)
  if (!isFinite(ini) || !isFinite(alvo)) return 0
  const passados = alvo - ini // mês da aquisição = 0; primeiro mês depreciado = 1
  return Math.max(0, Math.min(b.vida_util_meses, passados))
}

export function depreciacaoDoMes(bens: BemDepreciavel[], competencia: string): number {
  const alvo = indiceMes(competencia)
  let total = 0
  for (const b of bens) {
    if (b.ativo === false) continue
    const ini = indiceMes(b.data_aquisicao)
    if (!isFinite(ini) || !isFinite(alvo)) continue
    const n = alvo - ini
    if (n >= 1 && n <= b.vida_util_meses) total = centavos(total + depreciacaoMensal(b))
  }
  return total
}

// Soma da depreciação dos meses AAAA-01 até a competência (acumulado do ano)
export function depreciacaoAcumuladaAno(bens: BemDepreciavel[], competencia: string): number {
  const alvo = indiceMes(competencia)
  if (!isFinite(alvo)) return 0
  const ano = Math.floor(alvo / 12)
  let total = 0
  for (let idx = ano * 12; idx <= alvo; idx++) {
    total = centavos(total + depreciacaoDoMes(bens, competenciaDeIndice(idx)))
  }
  return total
}

export function depreciacaoAcumulada(b: BemDepreciavel, competencia: string): number {
  const n = mesesDepreciados(b, competencia)
  if (n >= b.vida_util_meses) return baseDepreciavel(b)
  return centavos(depreciacaoMensal(b) * n)
}

export function valorContabil(b: BemDepreciavel, competencia: string): number {
  return centavos(b.valor - depreciacaoAcumulada(b, competencia))
}

// Competência prevista de troca: aquisição + troca_meses (padrão: vida útil)
export function competenciaDeTroca(b: BemDepreciavel): string {
  const ini = indiceMes(b.data_aquisicao)
  if (!isFinite(ini)) return ''
  const meses = b.troca_meses && b.troca_meses > 0 ? b.troca_meses : b.vida_util_meses
  return competenciaDeIndice(ini + meses)
}

// Meses que faltam para a troca (negativo = já passou do prazo)
export function mesesParaTroca(b: BemDepreciavel, competenciaAtual: string): number {
  const troca = indiceMes(competenciaDeTroca(b))
  const hoje = indiceMes(competenciaAtual)
  if (!isFinite(troca) || !isFinite(hoje)) return NaN
  return troca - hoje
}
