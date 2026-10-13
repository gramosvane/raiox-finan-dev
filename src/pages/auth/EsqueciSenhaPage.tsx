import React, { useState } from 'react'
import { Link } from 'react-router-dom'
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
import { Mail, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export const EsqueciSenhaPage: React.FC = () => {
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setError('Informe um e-mail válido.')
      return
    }

    setLoading(true)
    setError('')

    try {
      await pb.collection('users').requestPasswordReset(email.trim())
      setSent(true)
      toast({
        title: 'Instruções enviadas!',
        description: 'Se o e-mail estiver cadastrado, você receberá o link de redefinição.',
      })
    } catch (err: any) {
      // Por segurança não revelamos se existe ou não, mas confirmamos o envio
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-[#1E293B] border-slate-700/80 shadow-2xl rounded-2xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl text-white">Recuperação de Senha</CardTitle>
          <CardDescription className="text-slate-400 text-xs">
            Digite seu e-mail cadastrado para enviarmos as instruções de redefinição.
          </CardDescription>
        </CardHeader>

        {sent ? (
          <CardContent className="space-y-4 text-center py-6">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <p className="text-sm text-slate-200">
              Caso o e-mail <strong className="text-white">{email}</strong> esteja cadastrado em
              nossa base, um link seguro de recuperação foi enviado.
            </p>
            <div className="pt-2">
              <Link to="/">
                <Button
                  variant="outline"
                  className="w-full border-slate-700 text-slate-200 hover:bg-slate-800"
                >
                  Voltar ao Login
                </Button>
              </Link>
            </div>
          </CardContent>
        ) : (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs text-slate-300">
                  E-mail
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
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#10B981] hover:bg-[#047857] text-white"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  'Enviar link de recuperação'
                )}
              </Button>
              <Link
                to="/"
                className="inline-flex items-center text-xs text-slate-400 hover:text-white mx-auto"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Voltar ao Login
              </Link>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  )
}
