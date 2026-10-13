import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import pb from '@/lib/pocketbase/client'
import { User } from '@/types/financial'

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  logout: () => {},
  refreshUser: async () => {},
})

import {
  TEMPO_INATIVIDADE_MS,
  STORAGE_KEY_ULTIMA_ATIVIDADE,
  MENSAGEM_INATIVIDADE,
  BROADCAST_CHANNEL_NAME,
  AuthBroadcastMessage,
  sessaoExpiradaPorInatividade,
  obterUltimaAtividade,
  registrarAtividade,
  limparRegistroAtividade,
  definirMotivoEncerramento,
  emitirEncerramentoMultiAbas,
} from '@/lib/sessaoInatividade'

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>((pb.authStore.model as unknown as User) || null)
  const [token, setToken] = useState<string | null>(pb.authStore.token || null)
  const [isLoading, setIsLoading] = useState(true)

  const encerrarSessao = (motivo: 'inatividade' | 'usuario', propagar = true) => {
    pb.authStore.clear()
    limparRegistroAtividade()
    setUser(null)
    setToken(null)
    if (motivo === 'inatividade') {
      definirMotivoEncerramento(MENSAGEM_INATIVIDADE)
    }
    if (propagar) {
      emitirEncerramentoMultiAbas(motivo)
    }
  }

  const logout = () => {
    encerrarSessao('usuario', true)
  }

  useEffect(() => {
    // Escuta alterações na authStore (login, logout, refresh)
    const unsubscribe = pb.authStore.onChange((newToken, model) => {
      setToken(newToken)
      setUser((model as unknown as User) || null)
    })

    // Se houver token, validar sessão E inatividade antes de exibir qualquer tela protegida
    if (pb.authStore.isValid) {
      if (sessaoExpiradaPorInatividade()) {
        encerrarSessao('inatividade', true)
      } else {
        // Se há token válido e não havia registro de atividade (ex.: login feito ou sessão aberta), inicializar
        if (!obterUltimaAtividade()) {
          registrarAtividade(Date.now())
        }
        setUser((pb.authStore.model as unknown as User) || null)
        setToken(pb.authStore.token)
      }
    } else {
      pb.authStore.clear()
      limparRegistroAtividade()
      setUser(null)
      setToken(null)
    }
    setIsLoading(false)

    return () => {
      unsubscribe()
    }
  }, [])

  // Sincronização entre abas (BroadcastChannel e evento storage)
  useEffect(() => {
    let channel: BroadcastChannel | null = null
    try {
      if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
        channel.onmessage = (event: MessageEvent<AuthBroadcastMessage>) => {
          const msg = event.data
          if (!msg) return
          if (msg.type === 'LOGOUT') {
            encerrarSessao(msg.reason, false)
          } else if (msg.type === 'LOGIN') {
            if (pb.authStore.isValid) {
              setUser((pb.authStore.model as unknown as User) || null)
              setToken(pb.authStore.token)
            }
          } else if (msg.type === 'ACTIVITY') {
            // Atividade registrada em outra aba: manter timestamp local atualizado
            try {
              localStorage.setItem(STORAGE_KEY_ULTIMA_ATIVIDADE, String(msg.timestamp))
            } catch {
              /* intentionally ignored */
            }
          }
        }
      }
    } catch {
      channel = null
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'gfe_auth_logout_event' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue)
          encerrarSessao(data.motivo || 'usuario', false)
        } catch {
          encerrarSessao('usuario', false)
        }
      } else if (e.key === 'pocketbase_auth') {
        // Se authStore foi limpa em outra aba
        if (!pb.authStore.isValid) {
          encerrarSessao('usuario', false)
        }
      }
    }

    window.addEventListener('storage', handleStorage)

    return () => {
      if (channel) {
        channel.close()
      }
      window.removeEventListener('storage', handleStorage)
    }
  }, [])
  // Monitoramento ativo de inatividade e eventos de interação do usuário
  useEffect(() => {
    if (!token || !user) return

    let ultimoRegistroRef = Date.now()
    const THROTTLE_MS = 5000 // Throttling: máximo de 1 gravação a cada 5 segundos

    const tratarInteracao = () => {
      const agora = Date.now()
      // Se já ultrapassou o limite durante o uso, encerrar imediatamente
      if (sessaoExpiradaPorInatividade(agora)) {
        encerrarSessao('inatividade', true)
        return
      }
      // Throttling para não gravar em excesso a cada pixel de mousemove
      if (agora - ultimoRegistroRef >= THROTTLE_MS) {
        ultimoRegistroRef = agora
        registrarAtividade(agora)
      }
    }

    const eventos = ['click', 'keydown', 'scroll', 'touchstart', 'mousemove']
    eventos.forEach((evt) => {
      window.addEventListener(evt, tratarInteracao, { passive: true })
    })

    // Intervalo de checagem periódica a cada 10 segundos
    const intervaloChecagem = setInterval(() => {
      if (sessaoExpiradaPorInatividade()) {
        encerrarSessao('inatividade', true)
      }
    }, 10000)

    return () => {
      eventos.forEach((evt) => {
        window.removeEventListener(evt, tratarInteracao)
      })
      clearInterval(intervaloChecagem)
    }
  }, [token, user])

  const refreshUser = async () => {
    if (pb.authStore.isValid) {
      try {
        const refreshed = await pb.collection('users').authRefresh()
        setUser((refreshed.record as unknown as User) || null)
      } catch (err) {
        logout()
      }
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
