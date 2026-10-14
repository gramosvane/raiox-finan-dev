// Geração de ocorrências de lançamentos recorrentes (lote 10).
// A recorrência começa na data de início e repete a cada N meses (mensal 1, trimestral 3,
// semestral 6, anual 12), no dia informado (1 a 28), até o limite de ocorrências (se houver).

export interface ModeloRecorrencia {
  inicio: string // AAAA-MM-DD
  frequencia: 'mensal' | 'trimestral' | 'semestral' | 'anual'
  dia: number
  ocorrencias?: number | null
  ativo?: boolean | null
}

export interface Ocorrencia {
  competencia: string // AAAA-MM
  data: string // AAAA-MM-DD
}

const PASSO: Record<ModeloRecorrencia['frequencia'], number> = {
  mensal: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
}

const indice = (t: string) => {
  const m = /^(\d{4})-(\d{2})/.exec(String(t))
  return m ? Number(m[1]) * 12 + (Number(m[2]) - 1) : NaN
}

const comp = (idx: number) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`

// Todas as ocorrências do modelo cuja competência está entre `de` e `ate` (AAAA-MM, inclusive)
export function gerarOcorrencias(m: ModeloRecorrencia, de: string, ate: string): Ocorrencia[] {
  if (m.ativo === false) return []
  const ini = indice(m.inicio)
  const a = indice(de)
  const b = indice(ate)
  if (!isFinite(ini) || !isFinite(a) || !isFinite(b)) return []
  const passo = PASSO[m.frequencia] || 1
  const dia = Math.min(28, Math.max(1, Math.round(m.dia || 1)))
  const lista: Ocorrencia[] = []
  for (let n = 0; ; n++) {
    if (m.ocorrencias && n >= m.ocorrencias) break
    const idx = ini + n * passo
    if (idx > b) break
    if (idx >= a) {
      const c = comp(idx)
      lista.push({ competencia: c, data: `${c}-${String(dia).padStart(2, '0')}` })
    }
    if (n > 2000) break
  }
  return lista
}

export const marcadorRecorrencia = (recorrenciaId: string, competencia: string) =>
  `[rec:${recorrenciaId}:${competencia}]`
