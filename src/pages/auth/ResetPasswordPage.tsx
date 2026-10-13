import React, { useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Lock, Loader2, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()
  const { toast } = useToast()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) {
      setError('Token de recuperação inválido ou ausente.')
      return
    }
    if (password.length < 8) {
      setError('A nova senha deve ter no mínimo 8 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    setError('')

    try {
      await pb.collection('users').confirmPasswordReset(token, password, confirmPassword)
      setSuccess(true)
      toast({
        title: 'Senha redefinida!',
        description: 'Sua senha foi alterada com sucesso. Você já pode fazer login.',
      })
    } catch (err: any) {
      setError(err?.message || 'Falha ao redefinir a senha. O link pode ter expirado.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-[#1E293B] border-slate-700 shadow-2xl rounded-2xl">
        <CardHeader>
          <CardTitle className="text-xl text-white">Criar Nova Senha</CardTitle>
          <CardDescription className="text-slate-400 text-xs">
            Informe sua nova senha segura para restaurar o acesso.
          </CardDescription>
        </CardHeader>

        {success ? (
          <CardContent className="space-y-4 text-center py-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <p className="text-sm text-slate-200">Sua senha foi redefinida com sucesso!</p>
            <Button
              onClick={() => navigate('/')}
              className="w-full bg-[#10B981] hover:bg-[#047857] text-white"
            >
              Ir para o Login
            </Button>
          </CardContent>
        ) : (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Nova Senha</Label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-[#0F172A] border-slate-700 pl-9 text-slate-100"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Confirmar Nova Senha</Label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-[#0F172A] border-slate-700 pl-9 text-slate-100"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#10B981] hover:bg-[#047857] text-white"
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Salvar Nova Senha'}
              </Button>
              <Link to="/" className="text-xs text-slate-400 hover:text-white">
                Cancelar e voltar ao Login
              </Link>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  )
}
