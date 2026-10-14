import { useCallback, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'

export interface BemRegistro {
  id: string
  descricao: string
  tipo_bem?: string
  valor: number
  valor_residual?: number
  data_aquisicao: string
  vida_util_meses: number
  troca_meses?: number
  ativo?: boolean
  observacao?: string
}

// Carrega os bens depreciáveis cadastrados. Em caso de erro (ou sem permissão), devolve lista vazia:
// a DRE continua funcionando sem depreciação.
export function useBensDepreciacao() {
  const [bens, setBens] = useState<BemRegistro[]>([])
  const [carregando, setCarregando] = useState(true)

  const recarregar = useCallback(async () => {
    try {
      const lista = await pb
        .collection('bens_depreciacao')
        .getFullList<BemRegistro>({ sort: '-created' })
      setBens(lista)
    } catch {
      setBens([])
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  return { bens, carregando, recarregar }
}
