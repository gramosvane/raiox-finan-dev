import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
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
import {
  DollarSign,
  Lock,
  Mail,
  ArrowRight,
  Loader2,
  ShieldCheck,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  sessaoExpiradaPorInatividade,
  registrarAtividade,
  consumirMotivoEncerramento,
  emitirLoginMultiAbas,
} from '@/lib/sessaoInatividade'

export const LoginPage: React.FC = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { isAuthenticated, isLoading } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({})
  const [motivoInatividade, setMotivoInatividade] = useState<string | null>(null)

  useEffect(() => {
    // Consumir aviso de inatividade se existir
    const msg = consumirMotivoEncerramento()
    if (msg) {
      setMotivoInatividade(msg)
    }
  }, [])

  // A2: Se acessar "/" com sessão ativa válida e dentro do tempo de inatividade, redirecionar para /dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated && pb.authStore.isValid) {
      if (!sessaoExpiradaPorInatividade()) {
        navigate('/dashboard', { replace: true })
      }
    }
  }, [isAuthenticated, isLoading, navigate])

  const validate = () => {
    const errs: { email?: string; password?: string } = {}
    if (!email) {
      errs.email = 'O e-mail é obrigatório.'
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      errs.email = 'Informe um e-mail válido.'
    }
    if (!password) {
      errs.password = 'A senha é obrigatória.'
    } else if (password.length < 8) {
      errs.password = 'A senha deve ter pelo menos 8 caracteres.'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    setErrors({})

    try {
      await pb.collection('users').authWithPassword(email.trim(), password)
      // Reiniciar a última atividade com o timestamp do login (A1)
      const agora = Date.now()
      registrarAtividade(agora)
      emitirLoginMultiAbas(agora)
      setMotivoInatividade(null)

      toast({
        title: 'Bem-vindo de volta!',
        description: 'Autenticação realizada com sucesso.',
      })
      navigate('/dashboard')
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'E-mail ou senha incorretos.'
      setErrors({ general: 'Falha no acesso: Verifique suas credenciais e tente novamente.' })
      toast({
        variant: 'destructive',
        title: 'Falha no login',
        description: 'Credenciais inválidas. Verifique os dados digitados.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Elementos sutis de fundo */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-100/60 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-100/60 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md z-10 animate-fade-in-up">
        {/* Header do Produto */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/25 mb-3 text-white">
            <DollarSign className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Raio-X Financeiro
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Controle executivo, DRE, ROI e auditoria blindada
          </p>
        </div>

        <Card className="bg-white border-slate-200/90 shadow-xl rounded-2xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-slate-900 font-bold">Acessar Conta</CardTitle>
            <CardDescription className="text-slate-500 text-xs">
              Informe seu e-mail e senha cadastrados para acessar o sistema.
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {motivoInatividade && (
                <div
                  data-testid="aviso-inatividade"
                  className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2 font-medium animate-fade-in"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
                  <span>{motivoInatividade}</span>
                </div>
              )}

              {errors.general && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-500" />
                  <span>{errors.general}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs text-slate-700 font-semibold">
                  E-mail ou Usuário
                </Label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="voce@empresa.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-slate-50 border-slate-200 pl-9 text-slate-900 placeholder-slate-400 rounded-xl focus-visible:ring-blue-500 focus-visible:ring-1"
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-rose-600 font-medium mt-1">{errors.email}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs text-slate-700 font-semibold">
                    Senha
                  </Label>
                  <Link
                    to="/esqueci-senha"
                    className="text-xs text-blue-600 hover:text-blue-700 font-semibold transition"
                  >
                    Esqueci minha senha
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-slate-50 border-slate-200 pl-9 pr-10 text-slate-900 placeholder-slate-400 rounded-xl focus-visible:ring-blue-500 focus-visible:ring-1"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-rose-600 font-medium mt-1">{errors.password}</p>
                )}
              </div>

              <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-blue-900 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <span>
                  Ambiente blindado: todas as movimentações e acessos são auditados imutavelmente.
                </span>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-2">
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all py-5 rounded-xl shadow-xs"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Autenticando...
                  </>
                ) : (
                  <>
                    Entrar no Sistema
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
