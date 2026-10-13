import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export interface CompetenciaOption {
  value: string // AAAA-MM
  label: string // Jan/2026
  year: number
  month: number
}

interface CompetenciaContextType {
  competencia: string // Ex: '2026-10'
  competenciaFormatada: string // Ex: 'Out/2026'
  setCompetencia: (comp: string) => void
  opcoesCompetencia: CompetenciaOption[]
}

const CompetenciaContext = createContext<CompetenciaContextType>({
  competencia: '',
  competenciaFormatada: '',
  setCompetencia: () => {},
  opcoesCompetencia: [],
})

const MESES_ABREV = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

export function formatarCompetencia(comp: string): string {
  if (!comp || !comp.includes('-')) return comp
  const [ano, mes] = comp.split('-')
  const mIndex = parseInt(mes, 10) - 1
  return `${MESES_ABREV[mIndex] || mes}/${ano}`
}

export const CompetenciaProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const now = new Date()
  const defaultYear = now.getFullYear()
  const defaultMonth = String(now.getMonth() + 1).padStart(2, '0')
  const initialComp = `${defaultYear}-${defaultMonth}`

  const [competencia, setCompetenciaState] = useState<string>(() => {
    const saved = localStorage.getItem('gfe_competencia_ativa')
    return saved || initialComp
  })

  const setCompetencia = (comp: string) => {
    setCompetenciaState(comp)
    localStorage.setItem('gfe_competencia_ativa', comp)
  }

  // Gerar opções dos últimos 12 meses e próximos 6 meses
  const [opcoesCompetencia, setOpcoesCompetencia] = useState<CompetenciaOption[]>([])

  useEffect(() => {
    const options: CompetenciaOption[] = []
    const date = new Date()

    // Começa 6 meses no futuro e vai até 18 meses atrás
    for (let i = 6; i >= -18; i--) {
      const d = new Date(date.getFullYear(), date.getMonth() + i, 1)
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      const val = `${y}-${String(m).padStart(2, '0')}`
      options.push({
        value: val,
        label: `${MESES_ABREV[m - 1]}/${y}`,
        year: y,
        month: m,
      })
    }
    setOpcoesCompetencia(options)
  }, [])

  return (
    <CompetenciaContext.Provider
      value={{
        competencia,
        competenciaFormatada: formatarCompetencia(competencia),
        setCompetencia,
        opcoesCompetencia,
      }}
    >
      {children}
    </CompetenciaContext.Provider>
  )
}

export const useCompetencia = () => useContext(CompetenciaContext)
