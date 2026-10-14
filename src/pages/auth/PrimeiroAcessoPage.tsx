import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { DollarSign, Loader2, ShieldCheck, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { registrarAtividade, emitirLoginMultiAbas } from '@/lib/sessaoInatividade'
import { setMasterPasswordServer } from '@/services/financial'

type Etapa = 'verificando' | 'administrador' | 'senhaMestra' | 'erro'

export const PrimeiroAcessoPage: React.FC = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [etapa, setEtapa] = useState<Etapa>('verificando')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')

  const [senhaMestra, setSenhaMestra] = useState('')
  const [confirmaMestra, setConfirmaMestra] = useState('')

  useEffect(() => {
    let ativo = true
    pb.send<{ success: boolean; inicializado: boolean }>('/backend/v1/setup/status', {
      method: 'GET',
    })
      .then((res) => {
        if (!ativo) return
        if (res.inicializado) {
          navigate('/', { replace: true })
        } else {
          setEtapa('administrador')
        }
      })
      .catch(() => {
        if (!ativo) return
        setErro('Não foi possível verificar o estado do sistema. Tente novamente.')
        setEtapa('erro')
      })
    return () => {
      ativo = false
    }
  }, [navigate])

  const criarAdministrador = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    if (!nome.trim()) return setErro('O nome é obrigatório.')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErro('Informe um e-mail válido.')
    if (senha.length < 8) return setErro('A senha deve ter pelo menos 8 caracteres.')
    if (senha !== confirma) return setErro('As senhas digitadas não coincidem.')

    setLoading(true)
    try {
      await pb.send('/backend/v1/setup/administrador', {
        method: 'POST',
        body: {
          name: nome.trim(),
          email: email.trim(),
          password: senha,
          passwordConfirm: confirma,
        },
      })
      await pb.collection('users').authWithPassword(email.trim(), senha)
      const agora = Date.now()
      registrarAtividade(agora)
      emitirLoginMultiAbas(agora)
      setEtapa('senhaMestra')
    } catch (err: any) {
      setErro(err?.response?.message || err?.message || 'Não foi possível criar o administrador.')
    } finally {
      setLoading(false)
    }
  }

  const definirSenhaMestra = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    if (senhaMestra.length < 8) return setErro('A Senha Mestra deve ter pelo menos 8 caracteres.')
    if (senhaMestra !== confirmaMestra) return setErro('As senhas digitadas não coincidem.')
    if (senhaMestra === senha)
      return setErro('A Senha Mestra deve ser diferente da senha de acesso.')

    setLoading(true)
    try {
      const res = await setMasterPasswordServer('', senhaMestra)
      if (!res.success) {
        setErro(res.message || 'Não foi possível definir a Senha Mestra.')
        return
      }
      toast({ title: 'Tudo pronto!', description: 'Administrador e Senha Mestra configurados.' })
      navigate('/dashboard', { replace: true })
    } catch (err: any) {
      setErro(err?.response?.message || err?.message || 'Não foi possível definir a Senha Mestra.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/25 mb-3 text-white">
            <DollarSign className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Raio-X Financeiro
          </h1>
          <p className="text-sm text-slate-500 mt-1">Primeiro acesso ao sistema</p>
        </div>

        <Card className="bg-white border-slate-200/90 shadow-xl rounded-2xl">
          {etapa === 'verificando' && (
            <CardContent className="py-10 flex items-center justify-center gap-2 text-slate-600 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Verificando o sistema...
            </CardContent>
          )}

          {etapa === 'erro' && (
            <>
              <CardHeader>
                <CardTitle className="text-xl text-slate-900 font-bold">
                  Não foi possível continuar
                </CardTitle>
                <CardDescription className="text-slate-500 text-xs">{erro}</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button className="w-full" onClick={() => navigate('/')}>
                  Voltar ao login
                </Button>
              </CardFooter>
            </>
          )}

          {etapa === 'administrador' && (
            <form onSubmit={criarAdministrador}>
              <CardHeader className="space-y-1 pb-4">
                <CardTitle className="text-xl text-slate-900 font-bold">1. Administrador</CardTitle>
                <CardDescription className="text-slate-500 text-xs">
                  Crie o administrador principal do sistema. Este passo só pode ser feito uma vez.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {erro && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{erro}</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="pa-nome" className="text-xs text-slate-700 font-semibold">
                    Nome completo
                  </Label>
                  <Input id="pa-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pa-email" className="text-xs text-slate-700 font-semibold">
                    E-mail
                  </Label>
                  <Input
                    id="pa-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pa-senha" className="text-xs text-slate-700 font-semibold">
                    Senha (mínimo 8 caracteres)
                  </Label>
                  <Input
                    id="pa-senha"
                    type="password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pa-confirma" className="text-xs text-slate-700 font-semibold">
                    Confirmar senha
                  </Label>
                  <Input
                    id="pa-confirma"
                    type="password"
                    value={confirma}
                    onChange={(e) => setConfirma(e.target.value)}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-3 pt-2">
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Criando...' : 'Criar administrador'}
                </Button>
              </CardFooter>
            </form>
          )}

          {etapa === 'senhaMestra' && (
            <form onSubmit={definirSenhaMestra}>
              <CardHeader className="space-y-1 pb-4">
                <CardTitle className="text-xl text-slate-900 font-bold">2. Senha Mestra</CardTitle>
                <CardDescription className="text-slate-500 text-xs">
                  A Senha Mestra protege a Auditoria. Ela deve ser diferente da senha de acesso.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {erro && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{erro}</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="pa-mestra" className="text-xs text-slate-700 font-semibold">
                    Senha Mestra (mínimo 8 caracteres)
                  </Label>
                  <Input
                    id="pa-mestra"
                    type="password"
                    value={senhaMestra}
                    onChange={(e) => setSenhaMestra(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pa-mestra-conf" className="text-xs text-slate-700 font-semibold">
                    Confirmar Senha Mestra
                  </Label>
                  <Input
                    id="pa-mestra-conf"
                    type="password"
                    value={confirmaMestra}
                    onChange={(e) => setConfirmaMestra(e.target.value)}
                  />
                </div>
                <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-blue-900 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <span>Guarde esta senha em local seguro. Sem ela a Auditoria não abre.</span>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-3 pt-2">
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Salvando...' : 'Concluir primeiro acesso'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={loading}
                  className="w-full text-slate-500"
                  onClick={() => navigate('/dashboard', { replace: true })}
                >
                  Definir depois (em Configurações)
                </Button>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
