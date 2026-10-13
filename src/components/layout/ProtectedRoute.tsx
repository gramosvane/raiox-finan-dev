import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { Loader2 } from 'lucide-react'

import {
  sessaoExpiradaPorInatividade,
  definirMotivoEncerramento,
  limparRegistroAtividade,
  MENSAGEM_INATIVIDADE,
} from '@/lib/sessaoInatividade'
import pb from '@/lib/pocketbase/client'

export const ProtectedRoute: React.FC = () => {
  const { isAuthenticated, isLoading, logout } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center text-emerald-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  // Verificação síncrona de inatividade ANTES de renderizar qualquer conteúdo protegido
  if (isAuthenticated && sessaoExpiradaPorInatividade()) {
    definirMotivoEncerramento(MENSAGEM_INATIVIDADE)
    limparRegistroAtividade()
    pb.authStore.clear()
    logout()
    return <Navigate to="/" replace />
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}
