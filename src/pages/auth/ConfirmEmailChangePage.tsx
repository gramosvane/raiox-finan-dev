import React, { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export const ConfirmEmailChangePage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()
  const { logout } = useAuth()

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMessage('Token de confirmação de alteração de e-mail inválido.')
      return
    }

    // Regra da especificação: após confirmar, deslogar e direcionar para login com novo email
    pb.collection('users')
      .confirmEmailChange(token, '')
      .then(() => {
        setStatus('success')
        logout()
      })
      .catch((err) => {
        setStatus('error')
        setErrorMessage(err?.message || 'Link inválido ou já expirado.')
      })
  }, [token])

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-[#1E293B] border-slate-700 shadow-2xl text-center">
        <CardHeader>
          <CardTitle className="text-lg text-white">Confirmação de Troca de E-mail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 py-4">
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
              <p className="text-sm text-slate-300">Confirmando alteração do seu e-mail...</p>
            </div>
          )}
          {status === 'success' && (
            <div className="space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <p className="text-sm text-slate-200">
                Seu e-mail foi atualizado com sucesso! Por segurança, sua sessão foi encerrada.
              </p>
              <Button
                onClick={() => navigate('/')}
                className="bg-[#10B981] hover:bg-[#047857] text-white w-full"
              >
                Entrar com o Novo E-mail
              </Button>
            </div>
          )}
          {status === 'error' && (
            <div className="space-y-3">
              <XCircle className="w-12 h-12 text-red-400 mx-auto" />
              <p className="text-sm text-red-300">{errorMessage}</p>
              <Button
                onClick={() => navigate('/')}
                variant="outline"
                className="border-slate-700 text-slate-200 w-full"
              >
                Voltar ao Início
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
