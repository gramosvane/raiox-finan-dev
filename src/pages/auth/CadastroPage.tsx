import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
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
import {
  DollarSign,
  Lock,
  Mail,
  User as UserIcon,
  ArrowLeft,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export const CadastroPage: React.FC = () => {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [successSent, setSuccessSent] = useState(false)
  const [errors, setErrors] = useState<{
    name?: string
    email?: string
    password?: string
    confirmPassword?: string
    general?: string
  }>({})

  const validate = () => {
    const errs: typeof errors = {}
    if (!name.trim()) errs.name = 'O nome completo é obrigatório.'
    if (!email.trim()) {
      errs.email = 'O e-mail é obrigatório.'
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      errs.email = 'E-mail em formato inválido.'
    }
    if (!password) {
      errs.password = 'A senha é obrigatória.'
    } else if (password.length < 8) {
      errs.password = 'A senha deve possuir pelo menos 8 caracteres.'
    }
    if (password !== confirmPassword) {
      errs.confirmPassword = 'As senhas digitadas não coincidem.'
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
      // 1. Criar usuário na coleção nativa users com role padrão 'operador' (apenas o primeiro é admin)
      await pb.collection('users').create({
        email: email.trim(),
        name: name.trim(),
        password: password,
        passwordConfirm: confirmPassword,
      })

      // 2. Enviar email de verificação
      try {
        await pb.collection('users').requestVerification(email.trim())
      } catch (verifErr) {
        console.warn('Verificação enviada ou não configurada:', verifErr)
      }

      setSuccessSent(true)
      toast({
        title: 'Cadastro efetuado!',
        description: 'Sua conta foi criada. Faça login para acessar o sistema.',
      })
    } catch (err: any) {
      const dataErrors = err?.data?.data || {}
      const newErrors: typeof errors = {}

      if (dataErrors.email) newErrors.email = 'Este e-mail já está em uso.'
      if (dataErrors.password) newErrors.password = 'A senha informada não atende aos requisitos.'
      if (Object.keys(newErrors).length === 0) {
        newErrors.general = err?.message || 'Falha ao realizar cadastro. Tente novamente.'
      }
      setErrors(newErrors)
      toast({
        variant: 'destructive',
        title: 'Erro no cadastro',
        description: 'Verifique as informações preenchidas.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4 relative font-sans">
      <div className="w-full max-w-md z-10 animate-fade-in-up">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-[#10B981] to-[#047857] shadow-xl text-white mb-2">
            <DollarSign className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-[#F8FAFC]">Novo Acesso Corporativo</h1>
          <p className="text-xs text-slate-400">
            Crie sua conta para gerir sua empresa com máxima segurança
          </p>
        </div>

        <Card className="bg-[#1E293B] border-slate-700/80 shadow-2xl rounded-2xl">
          {successSent ? (
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-bold text-white">Conta Criada com Sucesso!</h2>
              <p className="text-xs text-slate-300">
                Sua conta foi criada com sucesso para{' '}
                <strong className="text-white">{email}</strong>. Entre com o e-mail e a senha
                cadastrados para acessar o sistema.
              </p>
              <Button
                onClick={() => navigate('/')}
                className="w-full bg-[#10B981] hover:bg-[#047857] text-white font-semibold"
              >
                Ir para o Login
              </Button>
            </CardContent>
          ) : (
            <form onSubmit={handleSubmit}>
              <CardHeader className="space-y-1 pb-4">
                <CardTitle className="text-lg text-[#F8FAFC]">Cadastre seus dados</CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Preencha os campos obrigatórios abaixo
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3.5">
                {errors.general && (
                  <div className="p-3 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs">
                    {errors.general}
                  </div>
                )}

                <div className="space-y-1">
                  <Label htmlFor="name" className="text-xs text-slate-300">
                    Nome Completo
                  </Label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="Ex: Carlos Eduardo Silva"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-[#0F172A] border-slate-700 pl-9 text-slate-100"
                    />
                  </div>
                  {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="email" className="text-xs text-slate-300">
                    E-mail Corporativo
                  </Label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="voce@empresa.com.br"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-[#0F172A] border-slate-700 pl-9 text-slate-100"
                    />
                  </div>
                  {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="password" className="text-xs text-slate-300">
                    Senha (mínimo 8 dígitos)
                  </Label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-[#0F172A] border-slate-700 pl-9 text-slate-100"
                    />
                  </div>
                  {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="confirmPassword" className="text-xs text-slate-300">
                    Confirmar Senha
                  </Label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="bg-[#0F172A] border-slate-700 pl-9 text-slate-100"
                    />
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-xs text-red-400">{errors.confirmPassword}</p>
                  )}
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#10B981] hover:bg-[#047857] text-white font-semibold py-5"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Criando conta...
                    </>
                  ) : (
                    'Finalizar Cadastro'
                  )}
                </Button>

                <div className="text-center w-full">
                  <Link
                    to="/"
                    className="inline-flex items-center text-xs text-slate-400 hover:text-white transition"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                    Voltar para o Login
                  </Link>
                </div>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
