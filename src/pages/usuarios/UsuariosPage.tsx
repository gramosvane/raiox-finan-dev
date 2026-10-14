import React, { useCallback, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { AlertCircle, Loader2, UserPlus } from 'lucide-react'

type Cargo = 'administrador' | 'operador' | 'leitura'

interface UsuarioLinha {
  id: string
  name?: string
  usuario?: string
  email: string
  role?: Cargo
}

const ROTULO_CARGO: Record<Cargo, string> = {
  administrador: 'Administrador',
  operador: 'Operador',
  leitura: 'Leitura',
}

export const UsuariosPage: React.FC = () => {
  const { user } = useAuth()
  const { toast } = useToast()
  const [lista, setLista] = useState<UsuarioLinha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const [nome, setNome] = useState('')
  const [usuario, setUsuario] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')

  const ehAdmin = user?.role === 'administrador'

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const itens = await pb.collection('users').getFullList<UsuarioLinha>({ sort: 'created' })
      setLista(itens)
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível carregar os usuários.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (ehAdmin) carregar()
  }, [ehAdmin, carregar])

  const criar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    const u = usuario.trim().toLowerCase()
    if (!nome.trim()) return setErro('O nome é obrigatório.')
    if (!/^[a-z0-9._-]{3,40}$/.test(u))
      return setErro(
        'O usuário deve ter de 3 a 40 caracteres: letras, números, ponto, hífen ou sublinhado.',
      )
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErro('Informe um e-mail válido.')
    if (senha.length < 8) return setErro('A senha deve ter pelo menos 8 caracteres.')
    if (senha !== confirma) return setErro('As senhas digitadas não coincidem.')

    setSalvando(true)
    try {
      await pb.collection('users').create({
        name: nome.trim(),
        usuario: u,
        email: email.trim(),
        password: senha,
        passwordConfirm: confirma,
      })
      toast({ title: 'Usuário criado', description: `${u} entra como Operador.` })
      setNome('')
      setUsuario('')
      setEmail('')
      setSenha('')
      setConfirma('')
      await carregar()
    } catch (err: any) {
      const campos = err?.response?.data || err?.data?.data || {}
      if (campos.usuario) setErro('Este usuário já existe ou é inválido.')
      else if (campos.email) setErro('Este e-mail já está em uso ou é inválido.')
      else setErro('Não foi possível criar o usuário. Verifique os dados.')
    } finally {
      setSalvando(false)
    }
  }

  const mudarCargo = async (id: string, role: Cargo) => {
    try {
      await pb.send(`/backend/v1/admin/usuarios/${id}/role`, { method: 'POST', body: { role } })
      toast({ title: 'Cargo atualizado' })
      await carregar()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível alterar o cargo',
        description: err?.response?.message || err?.message || 'Tente novamente.',
      })
    }
  }

  if (!ehAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Usuários</CardTitle>
            <CardDescription>Acesso restrito ao administrador.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Usuários</h1>
        <p className="text-sm text-slate-500">
          Cadastre quem acessa o sistema e defina o cargo de cada pessoa.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <UserPlus className="w-5 h-5" /> Novo usuário
          </CardTitle>
          <CardDescription>
            O novo usuário entra como Operador; o cargo pode ser alterado na lista.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={criar} className="grid gap-4 md:grid-cols-2">
            {erro && (
              <div className="md:col-span-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{erro}</span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="u-nome">Nome completo</Label>
              <Input id="u-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-usuario">Usuário (nome curto para entrar)</Label>
              <Input id="u-usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-email">E-mail</Label>
              <Input
                id="u-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-senha">Senha (mínimo 8 caracteres)</Label>
              <Input
                id="u-senha"
                type="password"
                autoComplete="new-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-confirma">Confirmar senha</Label>
              <Input
                id="u-confirma"
                type="password"
                autoComplete="new-password"
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={salvando}>
                {salvando ? 'Criando...' : 'Criar usuário'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Usuários cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Cargo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.name || '—'}</TableCell>
                    <TableCell>{u.usuario || '—'}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      {u.id === user?.id ? (
                        <Badge variant="secondary">
                          {ROTULO_CARGO[u.role || 'operador']} (você)
                        </Badge>
                      ) : (
                        <Select
                          value={u.role || 'operador'}
                          onValueChange={(v) => mudarCargo(u.id, v as Cargo)}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="administrador">Administrador</SelectItem>
                            <SelectItem value="operador">Operador</SelectItem>
                            <SelectItem value="leitura">Leitura</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
