import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import {
  getContas,
  createConta,
  deleteConta,
  getCategorias,
  createCategoria,
  updateCategoria,
  deleteCategoria,
  inativarCategoria,
  reativarCategoria,
  getDepartamentos,
  createDepartamento,
  deleteDepartamento,
  getCentrosCusto,
  createCentroCusto,
  deleteCentroCusto,
  getConfiguracoes,
  setConfiguracao,
  verifyMasterPassword,
  setMasterPasswordServer,
  getMasterPasswordStatus,
  getEmpresas,
  createEmpresa,
  updateEmpresa,
  deleteEmpresa,
  getPatrimonio,
  createItemPatrimonio,
  deleteItemPatrimonio,
} from '@/services/financial'
import {
  Conta,
  Categoria,
  Departamento,
  CentroCusto,
  Empresa,
  ItemPatrimonio,
  GrupoDRE,
} from '@/types/financial'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Settings,
  User,
  KeyRound,
  Shield,
  CreditCard,
  Tags,
  Building2,
  Building,
  Scale,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Database,
  Edit2,
  Power,
  RotateCcw,
  Filter,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { formatBRL } from '@/pages/dashboard/DashboardPage'
import { SecaoControleDados } from './SecaoControleDados'

export const ConfiguracoesPage: React.FC = () => {
  const { user, refreshUser } = useAuth()
  const { toast } = useToast()

  const [secaoAtiva, setSecaoAtiva] = useState<
    | 'perfil'
    | 'senha'
    | 'mestra'
    | 'empresas'
    | 'patrimonio'
    | 'contas'
    | 'categorias'
    | 'departamentos'
    | 'centros'
    | 'metas'
    | 'dados'
  >('perfil')

  // PERFIL
  const [nome, setNome] = useState(user?.name || '')
  const [novoEmail, setNovoEmail] = useState('')
  const [salvandoPerfil, setSalvandoPerfil] = useState(false)

  // TROCAR SENHA LOGIN
  const [senhaAntiga, setSenhaAntiga] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmaNovaSenha, setConfirmaNovaSenha] = useState('')
  const [trocandoSenha, setTrocandoSenha] = useState(false)

  // SENHA MESTRA
  const [mestraAtual, setMestraAtual] = useState('')
  const [mestraNova, setMestraNova] = useState('')
  const [confirmaMestraNova, setConfirmaMestraNova] = useState('')
  const [trocandoMestra, setTrocandoMestra] = useState(false)
  const [mestraConfigurada, setMestraConfigurada] = useState(false)

  // CRUD CONTAS
  const [contas, setContas] = useState<Conta[]>([])
  const [novaContaNome, setNovaContaNome] = useState('')
  const [novaContaTipo, setNovaContaTipo] = useState<'caixa' | 'banco' | 'cartao'>('banco')
  const [novaContaSaldo, setNovaContaSaldo] = useState('0')

  // CRUD CATEGORIAS
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [novaCatNome, setNovaCatNome] = useState('')
  const [novaCatTipo, setNovaCatTipo] = useState<'receita' | 'despesa'>('despesa')
  const [novaCatGrupoDRE, setNovaCatGrupoDRE] = useState<GrupoDRE | ''>('')
  const [filtroStatusCat, setFiltroStatusCat] = useState<'todas' | 'ativas' | 'inativas'>('todas')
  const [editandoCat, setEditandoCat] = useState<Categoria | null>(null)
  const [editCatNome, setEditCatNome] = useState('')
  const [editCatTipo, setEditCatTipo] = useState<'receita' | 'despesa'>('despesa')
  const [editCatGrupoDRE, setEditCatGrupoDRE] = useState<GrupoDRE | ''>('')
  const [salvandoEdicaoCat, setSalvandoEdicaoCat] = useState(false)

  // CRUD DEPARTAMENTOS
  const [departamentos, setDepartamentos] = useState<Departamento[]>([])
  const [novoDepNome, setNovoDepNome] = useState('')

  // CRUD EMPRESAS
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [novaEmpresaNome, setNovaEmpresaNome] = useState('')
  const [novaEmpresaCnpj, setNovaEmpresaCnpj] = useState('')
  const [novaEmpresaPadrao, setNovaEmpresaPadrao] = useState(false)

  // CRUD PATRIMÔNIO (ATIVOS E PASSIVOS)
  const [itensPatrimonio, setItensPatrimonio] = useState<ItemPatrimonio[]>([])
  const [novoPatTipo, setNovoPatTipo] = useState<'ativo' | 'passivo'>('ativo')
  const [novoPatCategoria, setNovoPatCategoria] = useState('Imóveis')
  const [novoPatDescricao, setNovoPatDescricao] = useState('')
  const [novoPatValor, setNovoPatValor] = useState('')
  const [novoPatEmpresaId, setNovoPatEmpresaId] = useState('')

  // METAS
  const [metaEbitda, setMetaEbitda] = useState('20')
  const [salvandoMeta, setSalvandoMeta] = useState(false)

  const carregarTudo = async () => {
    try {
      const [cts, cats, deps, cfgs, emps, pats, statusMestra] = await Promise.all([
        getContas(),
        getCategorias(),
        getDepartamentos(),
        getConfiguracoes(),
        getEmpresas(),
        getPatrimonio(),
        getMasterPasswordStatus(),
      ])
      setContas(cts)
      setCategorias(cats)
      setDepartamentos(deps)
      setEmpresas(emps)
      setItensPatrimonio(pats)
      setMestraConfigurada(statusMestra.configurada || Boolean(cfgs['senha_mestra_hash']))
      if (cfgs['meta_ebitda']) setMetaEbitda(cfgs['meta_ebitda'])
    } catch (e) {
      console.error('Erro ao carregar dados de configuracoes:', e)
    }
  }

  useEffect(() => {
    carregarTudo()
  }, [])

  // 1. Atualizar Perfil e Iniciar Troca de E-mail
  const handleAtualizarPerfil = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSalvandoPerfil(true)
    try {
      await pb.collection('users').update(user.id, { name: nome.trim() })
      if (novoEmail.trim() && novoEmail.trim() !== user.email) {
        await pb.collection('users').requestEmailChange(novoEmail.trim())
        toast({
          title: 'Link de Confirmação Enviado',
          description: `Um e-mail foi enviado para ${novoEmail} para concluir a alteração.`,
        })
      }
      await refreshUser()
      toast({
        title: 'Perfil Atualizado',
        description: 'Seus dados foram atualizados com sucesso.',
      })
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: err?.message || 'Falha ao atualizar perfil.',
      })
    } finally {
      setSalvandoPerfil(false)
    }
  }

  // 2. Trocar Senha de Login
  const handleTrocarSenhaLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (novaSenha.length < 8) {
      toast({ variant: 'destructive', title: 'Senha Curta', description: 'Mínimo de 8 dígitos.' })
      return
    }
    if (novaSenha !== confirmaNovaSenha) {
      toast({
        variant: 'destructive',
        title: 'Senhas Diferentes',
        description: 'As senhas não coincidem.',
      })
      return
    }

    setTrocandoSenha(true)
    try {
      await pb.collection('users').update(user.id, {
        oldPassword: senhaAntiga,
        password: novaSenha,
        passwordConfirm: confirmaNovaSenha,
      })
      toast({ title: 'Senha Alterada', description: 'Nova senha de login salva com sucesso.' })
      setSenhaAntiga('')
      setNovaSenha('')
      setConfirmaNovaSenha('')
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao trocar senha',
        description: 'Senha atual incorreta.',
      })
    } finally {
      setTrocandoSenha(false)
    }
  }

  // 3. Cadastrar ou Trocar Senha Mestra (100% Server-side via pb_hooks)
  const handleTrocarSenhaMestra = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mestraNova) {
      toast({
        variant: 'destructive',
        title: 'Campo Obrigatório',
        description: 'Informe a nova senha mestra desejada.',
      })
      return
    }
    if (mestraNova.length < 8) {
      toast({
        variant: 'destructive',
        title: 'Senha Fraca',
        description: 'A senha mestra deve possuir no mínimo 8 caracteres.',
      })
      return
    }
    if (mestraNova !== confirmaMestraNova) {
      toast({
        variant: 'destructive',
        title: 'Divergência',
        description: 'A nova senha e a confirmação diferem.',
      })
      return
    }

    if (mestraConfigurada && !mestraAtual) {
      toast({
        variant: 'destructive',
        title: 'Senha Atual Obrigatória',
        description:
          'Já existe uma senha mestra configurada. Informe a senha atual para alterá-la.',
      })
      return
    }

    setTrocandoMestra(true)
    try {
      const resp = await setMasterPasswordServer(mestraAtual, mestraNova)
      if (resp.success) {
        toast({
          title: mestraConfigurada ? 'Senha Mestra Atualizada!' : 'Senha Mestra Cadastrada!',
          description: resp.message || 'Senha mestra processada e salvaguardada com sucesso.',
        })
        setMestraAtual('')
        setMestraNova('')
        setConfirmaMestraNova('')
        setMestraConfigurada(true)
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro ao definir senha mestra',
          description: resp.message || 'Falha ao processar solicitação no servidor.',
        })
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: err?.data?.message || err?.message || 'Falha ao redefinir senha mestra.',
      })
    } finally {
      setTrocandoMestra(false)
    }
  }

  // 4. Salvar Meta EBITDA
  const handleSalvarMeta = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvandoMeta(true)
    try {
      await setConfiguracao('meta_ebitda', metaEbitda)
      toast({ title: 'Meta Salva', description: 'Meta de margem EBITDA atualizada.' })
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao salvar meta.' })
    } finally {
      setSalvandoMeta(false)
    }
  }

  // CRUD CONTAS
  const handleCriarConta = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novaContaNome.trim()) return
    try {
      await createConta({
        nome: novaContaNome.trim(),
        tipo: novaContaTipo,
        saldo_inicial: parseFloat(novaContaSaldo) || 0,
      })
      setNovaContaNome('')
      setNovaContaSaldo('0')
      carregarTudo()
      toast({ title: 'Conta criada com sucesso.' })
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err?.message })
    }
  }

  const handleExcluirConta = async (id: string) => {
    try {
      await deleteConta(id)
      carregarTudo()
      toast({ title: 'Conta removida.' })
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err?.message })
    }
  }

  // CRUD CATEGORIAS
  const handleCriarCategoria = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novaCatNome.trim()) {
      toast({
        variant: 'destructive',
        title: 'Nome obrigatório',
        description: 'Informe o nome da categoria.',
      })
      return
    }
    if (!novaCatGrupoDRE) {
      toast({
        variant: 'destructive',
        title: 'Grupo DRE obrigatório',
        description: 'Selecione o Grupo DRE Estrutural para a categoria.',
      })
      return
    }
    try {
      await createCategoria({
        nome: novaCatNome.trim(),
        tipo: novaCatTipo,
        grupo_dre: novaCatGrupoDRE as GrupoDRE,
      })
      setNovaCatNome('')
      setNovaCatGrupoDRE('')
      carregarTudo()
      toast({ title: 'Categoria cadastrada com sucesso.' })
    } catch (err: any) {
      const msg = err?.data?.message || err?.response?.data?.message || err?.message || ''
      if (
        msg.toLowerCase().includes('categoria já cadastrada') ||
        msg.toLowerCase().includes('unique') ||
        msg.toLowerCase().includes('já existe') ||
        msg.toLowerCase().includes('duplicad') ||
        err?.data?.nome?.code === 'validation_not_unique' ||
        err?.response?.data?.nome?.code === 'validation_not_unique'
      ) {
        toast({
          variant: 'destructive',
          title: 'Categoria já cadastrada.',
          description: msg || 'Categoria já cadastrada.',
        })
      } else {
        toast({ variant: 'destructive', title: 'Erro', description: msg })
      }
    }
  }

  const handleExcluirCategoria = async (id: string) => {
    try {
      await deleteCategoria(id)
      carregarTudo()
      toast({ title: 'Categoria excluída com sucesso.' })
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'Falha ao excluir categoria.'
      toast({
        variant: 'destructive',
        title: 'Exclusão não permitida',
        description: msg,
      })
    }
  }

  const handleInativarCategoria = async (id: string) => {
    try {
      await inativarCategoria(id)
      carregarTudo()
      toast({
        title: 'Categoria inativada',
        description: 'A categoria não poderá ser selecionada em novos lançamentos.',
      })
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao inativar',
        description: err?.data?.message || err?.message || 'Falha ao inativar categoria.',
      })
    }
  }

  const handleReativarCategoria = async (id: string) => {
    try {
      await reativarCategoria(id)
      carregarTudo()
      toast({
        title: 'Categoria reativada',
        description: 'A categoria voltou a ficar disponível para novos lançamentos.',
      })
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao reativar',
        description: err?.data?.message || err?.message || 'Falha ao reativar categoria.',
      })
    }
  }

  const handleAbrirEdicaoCategoria = (cat: Categoria) => {
    setEditandoCat(cat)
    setEditCatNome(cat.nome)
    setEditCatTipo(cat.tipo)
    setEditCatGrupoDRE(cat.grupo_dre || '')
  }

  const handleSalvarEdicaoCategoria = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editandoCat) return
    if (!editCatNome.trim()) {
      toast({ variant: 'destructive', title: 'Nome obrigatório', description: 'Informe o nome.' })
      return
    }
    if (!editCatGrupoDRE) {
      toast({
        variant: 'destructive',
        title: 'Grupo DRE obrigatório',
        description: 'Selecione o Grupo DRE.',
      })
      return
    }

    setSalvandoEdicaoCat(true)
    try {
      await updateCategoria(editandoCat.id, {
        nome: editCatNome.trim(),
        tipo: editCatTipo,
        grupo_dre: editCatGrupoDRE as GrupoDRE,
      })
      toast({ title: 'Categoria atualizada com sucesso.' })
      setEditandoCat(null)
      carregarTudo()
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'Falha ao atualizar categoria.'
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar categoria',
        description: msg,
      })
    } finally {
      setSalvandoEdicaoCat(false)
    }
  }

  // CRUD DEPARTAMENTOS
  const handleCriarDepartamento = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novoDepNome.trim()) return
    try {
      await createDepartamento({ nome: novoDepNome.trim() })
      setNovoDepNome('')
      await carregarTudo()
      toast({ title: 'Departamento cadastrado com sucesso.' })
    } catch {
      toast({ title: 'Erro ao cadastrar departamento.', variant: 'destructive' })
    }
  }

  const handleExcluirDepartamento = async (id: string) => {
    try {
      await deleteDepartamento(id)
      await carregarTudo()
      toast({ title: 'Departamento excluído com sucesso.' })
    } catch {
      toast({ title: 'Erro ao excluir departamento.', variant: 'destructive' })
    }
  }
  // CRUD EMPRESAS HANDLERS
  const handleCriarEmpresa = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novaEmpresaNome.trim()) return
    try {
      await createEmpresa({
        nome: novaEmpresaNome.trim(),
        cnpj: novaEmpresaCnpj.trim() || undefined,
        padrao: novaEmpresaPadrao || empresas.length === 0,
      })
      setNovaEmpresaNome('')
      setNovaEmpresaCnpj('')
      setNovaEmpresaPadrao(false)
      carregarTudo()
      toast({ title: 'Empresa cadastrada com sucesso.' })
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao cadastrar empresa',
        description: err?.message,
      })
    }
  }

  const handleExcluirEmpresa = async (id: string) => {
    try {
      await deleteEmpresa(id)
      carregarTudo()
      toast({ title: 'Empresa removida.' })
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao remover', description: err?.message })
    }
  }

  const handleDefinirEmpresaPadrao = async (emp: Empresa) => {
    try {
      // Desmarca as demais e marca a selecionada
      for (const e of empresas) {
        if (e.id === emp.id && !e.padrao) {
          await updateEmpresa(e.id, { padrao: true })
        } else if (e.id !== emp.id && e.padrao) {
          await updateEmpresa(e.id, { padrao: false })
        }
      }
      carregarTudo()
      toast({ title: 'Empresa padrão atualizada.' })
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao atualizar', description: err?.message })
    }
  }

  // CRUD PATRIMÔNIO HANDLERS
  const handleCriarItemPatrimonio = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novoPatDescricao.trim()) return
    const v = parseFloat(novoPatValor.replace(',', '.'))
    if (isNaN(v) || v <= 0) {
      toast({
        variant: 'destructive',
        title: 'Valor inválido',
        description: 'Informe um valor positivo maior que zero.',
      })
      return
    }

    try {
      await createItemPatrimonio({
        tipo: novoPatTipo,
        categoria: novoPatCategoria,
        descricao: novoPatDescricao.trim(),
        valor: v,
        data_referencia: new Date().toISOString(),
        empresa_id: novoPatEmpresaId || undefined,
      })
      setNovoPatDescricao('')
      setNovoPatValor('')
      carregarTudo()
      toast({ title: 'Item patrimonial cadastrado.' })
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: err?.message })
    }
  }

  const handleExcluirItemPatrimonio = async (id: string) => {
    try {
      await deleteItemPatrimonio(id)
      carregarTudo()
      toast({ title: 'Item patrimonial removido.' })
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao remover', description: err?.message })
    }
  }

  const menus = [
    { id: 'perfil', label: 'Meu Perfil', icon: User },
    { id: 'senha', label: 'Senha de Acesso', icon: KeyRound },
    { id: 'mestra', label: 'Senha Mestra (Auditoria)', icon: Shield },
    { id: 'empresas', label: 'Empresas & Unidades', icon: Building },
    { id: 'patrimonio', label: 'Patrimônio (Ativos / Passivos)', icon: Scale },
    { id: 'contas', label: 'Contas Bancárias / Caixa', icon: CreditCard },
    { id: 'categorias', label: 'Categorias Financeiras', icon: Tags },
    { id: 'departamentos', label: 'Departamentos', icon: Building2 },
    { id: 'metas', label: 'Metas Financeiras', icon: Settings },
    { id: 'dados', label: 'Controle de Dados & Servidor', icon: Database },
  ] as const

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="pt-1">
        <h1 className="text-2xl md:text-[28px] font-semibold text-slate-900 tracking-tight">
          Configurações
        </h1>
        <p className="text-xs md:text-sm text-slate-500 mt-1 font-normal">
          Gerenciamento de contas, plano de categorias, segurança e parâmetros
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Menu Lateral de Abas */}
        <div className="space-y-1 bg-white border border-slate-200/90 p-2.5 rounded-2xl h-fit shadow-xs">
          {menus.map((m) => {
            const Icon = m.icon
            const isAct = secaoAtiva === m.id
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSecaoAtiva(m.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition text-left',
                  isAct
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50',
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{m.label}</span>
              </button>
            )
          })}
        </div>

        {/* Conteúdo da Aba */}
        <div className="md:col-span-3">
          {/* ABA 1: MEU PERFIL */}
          {secaoAtiva === 'perfil' && (
            <Card className="bg-white border-slate-200/80 shadow-xs rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-900">
                  Dados do Usuário
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 font-normal">
                  Atualize suas credenciais e nome exibido no sistema.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleAtualizarPerfil}>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">Nome Completo</Label>
                    <Input
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">E-mail Atual</Label>
                    <Input
                      disabled
                      value={user?.email || ''}
                      className="bg-slate-100 border-slate-200 text-xs text-slate-500 cursor-not-allowed rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">
                      Alterar E-mail (Opcional)
                    </Label>
                    <Input
                      placeholder="novo.email@empresa.com.br"
                      value={novoEmail}
                      onChange={(e) => setNovoEmail(e.target.value)}
                      className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                    />
                    <p className="text-[11px] text-slate-400 font-normal">
                      Um link de confirmação será enviado. Ao confirmar, você será deslogado para
                      acessar com o novo e-mail.
                    </p>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    type="submit"
                    disabled={salvandoPerfil}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-xl font-medium shadow-xs"
                  >
                    {salvandoPerfil ? 'Salvando...' : 'Salvar Alterações'}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          )}

          {/* ABA 2: SENHA DE ACESSO */}
          {secaoAtiva === 'senha' && (
            <Card className="bg-white border-slate-200/80 shadow-xs rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-900">
                  Alterar Senha de Login
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 font-normal">
                  Senha utilizada para autenticação de entrada na plataforma.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleTrocarSenhaLogin}>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">Senha Atual</Label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={senhaAntiga}
                      onChange={(e) => setSenhaAntiga(e.target.value)}
                      className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">
                      Nova Senha (mínimo 8 caracteres)
                    </Label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={novaSenha}
                      onChange={(e) => setNovaSenha(e.target.value)}
                      className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">
                      Confirmar Nova Senha
                    </Label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={confirmaNovaSenha}
                      onChange={(e) => setConfirmaNovaSenha(e.target.value)}
                      className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                    />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    type="submit"
                    disabled={trocandoSenha}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-xl font-medium shadow-xs"
                  >
                    {trocandoSenha ? 'Atualizando...' : 'Atualizar Senha de Login'}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          )}

          {/* ABA 3: SENHA MESTRA */}
          {secaoAtiva === 'mestra' && (
            <Card className="bg-white border-slate-200/80 shadow-xs rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-amber-600" />
                  Redefinir Senha Mestra (Auditoria)
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 font-normal">
                  Esta senha destrava o painel imutável de auditoria. Ela nunca pode ser recuperada
                  por e-mail (princípio de blindagem).
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleTrocarSenhaMestra}>
                <CardContent className="space-y-4">
                  <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-800 font-normal">
                    <strong>Atenção:</strong> Por segurança,{' '}
                    <strong>não existe senha mestra padrão de fábrica</strong>. No primeiro uso,
                    defina uma senha mestra forte e exclusiva (mínimo de 8 caracteres).
                    {mestraConfigurada ? (
                      <span>
                        {' '}
                        A senha mestra atual já está configurada no servidor. Informe-a abaixo para
                        alterá-la.
                      </span>
                    ) : (
                      <span>
                        {' '}
                        Nenhuma senha mestra cadastrada ainda. Deixe o campo "Senha Mestra Atual" em
                        branco para definir a primeira senha.
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">
                      Senha Mestra Atual{' '}
                      <span className="text-slate-400 font-normal">
                        {mestraConfigurada
                          ? '(obrigatória para alteração)'
                          : '(em branco no 1º cadastro)'}
                      </span>
                    </Label>
                    <Input
                      type="password"
                      placeholder={
                        mestraConfigurada ? '••••••••' : '•••••••• (deixe vazio no 1º cadastro)'
                      }
                      value={mestraAtual}
                      onChange={(e) => setMestraAtual(e.target.value)}
                      className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">Nova Senha Mestra</Label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={mestraNova}
                      onChange={(e) => setMestraNova(e.target.value)}
                      className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">
                      Confirmar Nova Senha Mestra
                    </Label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={confirmaMestraNova}
                      onChange={(e) => setConfirmaMestraNova(e.target.value)}
                      className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                    />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    type="submit"
                    disabled={trocandoMestra}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs rounded-xl font-medium shadow-xs"
                  >
                    {trocandoMestra
                      ? 'Processando...'
                      : mestraConfigurada
                        ? 'Alterar Senha Mestra'
                        : 'Cadastrar Senha Mestra'}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          )}

          {/* ABA 4: CONTAS BANCÁRIAS */}
          {secaoAtiva === 'contas' && (
            <div className="space-y-4">
              <Card className="bg-white border-slate-200/80 shadow-xs rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Cadastrar Nova Conta
                  </CardTitle>
                </CardHeader>
                <form onSubmit={handleCriarConta}>
                  <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs font-medium text-slate-600 mb-1 block">
                        Nome da Conta
                      </Label>
                      <Input
                        placeholder="Ex: Santander Empresas"
                        value={novaContaNome}
                        onChange={(e) => setNovaContaNome(e.target.value)}
                        className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-600 mb-1 block">Tipo</Label>
                      <Select value={novaContaTipo} onValueChange={(v: any) => setNovaContaTipo(v)}>
                        <SelectTrigger className="bg-slate-50 border-slate-200 text-xs text-slate-800 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-slate-200 text-slate-800 rounded-xl shadow-lg">
                          <SelectItem value="banco">Conta Bancária</SelectItem>
                          <SelectItem value="caixa">Caixa Físico</SelectItem>
                          <SelectItem value="cartao">Cartão Corporativo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-600 mb-1 block">
                        Saldo Inicial (R$)
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={novaContaSaldo}
                        onChange={(e) => setNovaContaSaldo(e.target.value)}
                        className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                      />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-xl font-medium shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Adicionar Conta
                    </Button>
                  </CardFooter>
                </form>
              </Card>

              {/* Lista de Contas */}
              <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
                <div className="p-4 border-b border-slate-100 font-medium text-xs text-slate-700">
                  Contas Cadastradas ({contas.length})
                </div>
                <div className="divide-y divide-slate-100">
                  {contas.map((c) => (
                    <div key={c.id} className="p-3.5 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-medium text-slate-900">{c.nome}</p>
                        <p className="text-slate-500 capitalize font-normal">
                          Tipo: {c.tipo} | Saldo Inicial: {formatBRL(c.saldo_inicial)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleExcluirConta(c.id)}
                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-7 w-7 p-0 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ABA 5: CATEGORIAS */}
          {secaoAtiva === 'categorias' && (
            <div className="space-y-4">
              {/* UX-PERM-02: Somente o Administrador cria categoria */}
              <Card className="bg-white border-slate-200/80 shadow-xs rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Nova Categoria
                  </CardTitle>
                </CardHeader>
                {user?.role !== 'administrador' ? (
                  <CardContent className="py-2">
                    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-800 font-medium">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Somente o Administrador pode cadastrar categorias.</span>
                    </div>
                  </CardContent>
                ) : (
                  <form onSubmit={handleCriarCategoria}>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs font-medium text-slate-600 mb-1 block">
                          Nome da Categoria *
                        </Label>
                        <Input
                          placeholder="Ex: Treinamentos, Softwares..."
                          value={novaCatNome}
                          onChange={(e) => setNovaCatNome(e.target.value)}
                          className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-medium text-slate-600 mb-1 block">
                          Tipo de Movimento *
                        </Label>
                        <Select
                          value={novaCatTipo}
                          onValueChange={(v: any) => {
                            setNovaCatTipo(v)
                            setNovaCatGrupoDRE('')
                          }}
                        >
                          <SelectTrigger className="bg-slate-50 border-slate-200 text-xs text-slate-800 rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-slate-200 text-slate-800 rounded-xl shadow-lg">
                            <SelectItem value="receita">Receita</SelectItem>
                            <SelectItem value="despesa">Despesa</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs font-medium text-slate-600 mb-1 block">
                          Grupo DRE Estrutural *
                        </Label>
                        <Select
                          value={novaCatGrupoDRE}
                          onValueChange={(v: GrupoDRE) => setNovaCatGrupoDRE(v)}
                        >
                          <SelectTrigger className="bg-slate-50 border-slate-200 text-xs text-slate-800 rounded-xl">
                            <SelectValue placeholder="Selecione o grupo DRE..." />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-slate-200 text-slate-800 rounded-xl shadow-lg">
                            {novaCatTipo === 'receita' ? (
                              <>
                                <SelectItem value="receita_bruta">
                                  Receita Bruta (Vendas / Serviços)
                                </SelectItem>
                                <SelectItem value="receita_financeira">
                                  Receita Financeira (Juros / Rendimentos)
                                </SelectItem>
                              </>
                            ) : (
                              <>
                                <SelectItem value="deducoes_tributos">
                                  Deduções e Tributos (Simples, ICMS, PIS, COFINS)
                                </SelectItem>
                                <SelectItem value="custos_variaveis">
                                  Custos Variáveis / Fornecedores / CMV
                                </SelectItem>
                                <SelectItem value="despesas_operacionais">
                                  Despesas Operacionais Fixas (Aluguel, Salários, Folha)
                                </SelectItem>
                                <SelectItem value="investimento_capex">
                                  Investimento (CAPEX / Máquinas / Imóveis)
                                </SelectItem>
                                <SelectItem value="despesa_financeira">
                                  Despesa Financeira (Juros Bancários / Tarifas)
                                </SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-xl font-medium shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Adicionar Categoria
                      </Button>
                    </CardFooter>
                  </form>
                )}
              </Card>

              {/* Lista com Filtro de Ativa/Inativa e Ações de Ciclo de Vida (Fase 1B) */}
              <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="font-medium text-slate-700 flex items-center gap-2">
                    <span>Plano de Categorias</span>
                    <span className="text-slate-400 font-normal">
                      ({categorias.filter((c) => c.ativa !== false).length} ativas,{' '}
                      {categorias.filter((c) => c.ativa === false).length} inativas)
                    </span>
                  </div>

                  {/* Filtro de Status Ativa/Inativa */}
                  <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
                    <Filter className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-0.5" />
                    {(
                      [
                        { id: 'todas', label: 'Todas' },
                        { id: 'ativas', label: 'Ativas' },
                        { id: 'inativas', label: 'Inativas' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFiltroStatusCat(f.id)}
                        className={cn(
                          'px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors',
                          filtroStatusCat === f.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-500 hover:text-slate-900',
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* UX-PERM-03: Aviso para quem não é Administrador */}
                {user?.role !== 'administrador' && (
                  <div className="p-3 mx-4 my-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-800 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Somente o Administrador pode alterar categorias.</span>
                  </div>
                )}

                <div className="divide-y divide-slate-100">
                  {categorias
                    .filter((cat) => {
                      if (filtroStatusCat === 'ativas') return cat.ativa !== false
                      if (filtroStatusCat === 'inativas') return cat.ativa === false
                      return true
                    })
                    .map((cat) => {
                      const isAtiva = cat.ativa !== false
                      const isAdmin = user?.role === 'administrador'
                      return (
                        <div
                          key={cat.id}
                          className={cn(
                            'p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors',
                            !isAtiva && 'bg-slate-50/70 opacity-90',
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Badge Ativa / Inativa */}
                            <Badge
                              className={cn(
                                'text-[10px] font-semibold px-2 py-0.5 rounded-md',
                                isAtiva
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-slate-200 text-slate-700 border border-slate-300',
                              )}
                            >
                              {isAtiva ? 'Ativa' : 'Inativa'}
                            </Badge>

                            {/* Badge Tipo */}
                            <Badge
                              className={cn(
                                'text-[10px] capitalize font-medium',
                                cat.tipo === 'receita'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200',
                              )}
                            >
                              {cat.tipo}
                            </Badge>

                            {/* Badge Grupo DRE */}
                            {cat.grupo_dre && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-slate-100 text-slate-600 border-slate-200"
                              >
                                {cat.grupo_dre === 'receita_bruta' && 'Receita Bruta'}
                                {cat.grupo_dre === 'deducoes_tributos' && 'Deduções / Tributos'}
                                {cat.grupo_dre === 'custos_variaveis' && 'Custos Variáveis'}
                                {cat.grupo_dre === 'despesas_operacionais' &&
                                  'Despesas Operacionais'}
                                {cat.grupo_dre === 'investimento_capex' && 'CAPEX'}
                                {cat.grupo_dre === 'receita_financeira' && 'Receita Financeira'}
                                {cat.grupo_dre === 'despesa_financeira' && 'Despesa Financeira'}
                              </Badge>
                            )}

                            <span
                              className={cn(
                                'font-medium ml-1',
                                isAtiva ? 'text-slate-900' : 'text-slate-500 line-through',
                              )}
                            >
                              {cat.nome}
                            </span>
                          </div>

                          {/* Ações Administrativas: Exclusivas para Administrador (UX-PERM-03) */}
                          {isAdmin ? (
                            <div className="flex items-center gap-1.5 self-end sm:self-auto">
                              {/* Editar */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAbrirEdicaoCategoria(cat)}
                                className="h-7 px-2.5 text-xs text-slate-600 hover:text-slate-900 border-slate-200 rounded-lg gap-1"
                                title="Editar categoria"
                              >
                                <Edit2 className="w-3 h-3" />
                                <span>Editar</span>
                              </Button>

                              {/* Inativar / Reativar */}
                              {isAtiva ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleInativarCategoria(cat.id)}
                                  className="h-7 px-2.5 text-xs text-amber-700 hover:bg-amber-50 border-amber-200 rounded-lg gap-1"
                                  title="Inativar categoria para que não possa ser selecionada em novos lançamentos"
                                >
                                  <Power className="w-3 h-3 text-amber-600" />
                                  <span>Inativar</span>
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleReativarCategoria(cat.id)}
                                  className="h-7 px-2.5 text-xs text-emerald-700 hover:bg-emerald-50 border-emerald-200 rounded-lg gap-1"
                                  title="Reativar categoria para seleção em novos lançamentos"
                                >
                                  <RotateCcw className="w-3 h-3 text-emerald-600" />
                                  <span>Reativar</span>
                                </Button>
                              )}

                              {/* Excluir (protegida no servidor contra categorias em uso) */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleExcluirCategoria(cat.id)}
                                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-7 w-7 p-0 rounded-lg"
                                title="Excluir (permitido apenas se sem lançamentos vinculados)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic self-end sm:self-auto">
                              Somente o Administrador pode alterar categorias.
                            </span>
                          )}
                        </div>
                      )
                    })}

                  {categorias.length === 0 && (
                    <div className="p-8 text-center text-xs text-slate-400">
                      Nenhuma categoria cadastrada.
                    </div>
                  )}
                </div>
              </div>

              {/* Modal de Edição de Categoria (Fase 1B) */}
              {editandoCat && (
                <Dialog open={!!editandoCat} onOpenChange={() => setEditandoCat(null)}>
                  <DialogContent className="bg-white border-slate-200 text-slate-900 rounded-2xl shadow-xl">
                    <DialogHeader>
                      <DialogTitle className="text-base text-slate-900 font-semibold flex items-center gap-2">
                        <Edit2 className="w-4 h-4 text-blue-600" />
                        Editar Categoria
                      </DialogTitle>
                      <DialogDescription className="text-xs text-slate-500 font-normal">
                        Edite o nome ou grupo DRE da categoria. Categorias com lançamentos
                        históricos têm o tipo de movimento protegido contra alteração pelo servidor.
                      </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSalvarEdicaoCategoria} className="space-y-3 py-1">
                      <div>
                        <Label className="text-xs font-medium text-slate-600 mb-1 block">
                          Nome da Categoria *
                        </Label>
                        <Input
                          value={editCatNome}
                          onChange={(e) => setEditCatNome(e.target.value)}
                          className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                        />
                      </div>

                      <div>
                        <Label className="text-xs font-medium text-slate-600 mb-1 block">
                          Tipo de Movimento *
                        </Label>
                        <Select
                          value={editCatTipo}
                          onValueChange={(v: any) => {
                            setEditCatTipo(v)
                            setEditCatGrupoDRE('')
                          }}
                        >
                          <SelectTrigger className="bg-slate-50 border-slate-200 text-xs text-slate-800 rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-slate-200 text-slate-800 rounded-xl shadow-lg">
                            <SelectItem value="receita">Receita</SelectItem>
                            <SelectItem value="despesa">Despesa</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-slate-400 font-normal mt-1">
                          Nota: se a categoria possuir lançamentos vinculados, o servidor recusará a
                          mudança de tipo para preservar a integridade histórica.
                        </p>
                      </div>

                      <div>
                        <Label className="text-xs font-medium text-slate-600 mb-1 block">
                          Grupo DRE Estrutural *
                        </Label>
                        <Select
                          value={editCatGrupoDRE}
                          onValueChange={(v: GrupoDRE) => setEditCatGrupoDRE(v)}
                        >
                          <SelectTrigger className="bg-slate-50 border-slate-200 text-xs text-slate-800 rounded-xl">
                            <SelectValue placeholder="Selecione o grupo DRE..." />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-slate-200 text-slate-800 rounded-xl shadow-lg">
                            {editCatTipo === 'receita' ? (
                              <>
                                <SelectItem value="receita_bruta">
                                  Receita Bruta (Vendas / Serviços)
                                </SelectItem>
                                <SelectItem value="receita_financeira">
                                  Receita Financeira (Juros / Rendimentos)
                                </SelectItem>
                              </>
                            ) : (
                              <>
                                <SelectItem value="deducoes_tributos">
                                  Deduções e Tributos (Simples, ICMS, PIS, COFINS)
                                </SelectItem>
                                <SelectItem value="custos_variaveis">
                                  Custos Variáveis / Fornecedores / CMV
                                </SelectItem>
                                <SelectItem value="despesas_operacionais">
                                  Despesas Operacionais Fixas (Aluguel, Salários, Folha)
                                </SelectItem>
                                <SelectItem value="investimento_capex">
                                  Investimento (CAPEX / Máquinas / Imóveis)
                                </SelectItem>
                                <SelectItem value="despesa_financeira">
                                  Despesa Financeira (Juros Bancários / Tarifas)
                                </SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      <DialogFooter className="gap-2 pt-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setEditandoCat(null)}
                          disabled={salvandoEdicaoCat}
                          className="border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs"
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="submit"
                          disabled={salvandoEdicaoCat}
                          className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium"
                        >
                          {salvandoEdicaoCat ? 'Salvando...' : 'Salvar Alterações'}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          )}

          {/* ABA 6: DEPARTAMENTOS */}
          {(secaoAtiva === 'departamentos' || secaoAtiva === 'centros') && (
            <div className="space-y-4">
              <Card className="bg-white border-slate-200/80 shadow-xs rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Novo Departamento
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 font-normal">
                    Cadastre os departamentos organizacionais da empresa (ex: Operacional,
                    Comercial, Administrativo, TI)
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleCriarDepartamento}>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-xs font-medium text-slate-600 mb-1 block">
                        Nome do Departamento
                      </Label>
                      <Input
                        placeholder="Ex: Operacional, Comercial, Administrativo, TI & Tecnologia..."
                        value={novoDepNome}
                        onChange={(e) => setNovoDepNome(e.target.value)}
                        className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                      />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-xl font-medium shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Adicionar Departamento
                    </Button>
                  </CardFooter>
                </form>
              </Card>

              {/* Lista */}
              <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
                <div className="p-4 border-b border-slate-100 font-medium text-xs text-slate-700">
                  Departamentos Ativos ({departamentos.length})
                </div>
                <div className="divide-y divide-slate-100">
                  {departamentos.map((dep) => (
                    <div key={dep.id} className="p-3.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-900">{dep.nome}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleExcluirDepartamento(dep.id)}
                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-7 w-7 p-0 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {departamentos.length === 0 && (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Nenhum departamento cadastrado.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ABA 7: METAS FINANCEIRAS */}
          {secaoAtiva === 'metas' && (
            <Card className="bg-white border-slate-200/80 shadow-xs rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-900">
                  Parâmetros e Metas Financeiras
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 font-normal">
                  Defina os alvos de margem para os cards do dashboard executivo
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleSalvarMeta}>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">
                      Meta Alvo de Margem EBITDA (%)
                    </Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={metaEbitda}
                      onChange={(e) => setMetaEbitda(e.target.value)}
                      className="bg-slate-50 border-slate-200 text-xs text-slate-900 w-48 font-semibold rounded-xl"
                    />
                    <p className="text-[11px] text-slate-400 font-normal">
                      Caso o resultado do mês fique abaixo desta porcentagem, o indicador no
                      dashboard ficará amarelo/vermelho.
                    </p>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    type="submit"
                    disabled={salvandoMeta}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-xl font-medium shadow-xs"
                  >
                    {salvandoMeta ? 'Salvando...' : 'Salvar Meta'}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          )}

          {/* ABA: EMPRESAS & UNIDADES (PONTO C) */}
          {secaoAtiva === 'empresas' && (
            <div className="space-y-4">
              <Card className="bg-white border-slate-200/80 shadow-xs rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Cadastrar Nova Empresa / Unidade
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 font-normal">
                    Permite organizar centros de resultado, despesas, patrimônio e filtros por
                    filial ou matriz.
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleCriarEmpresa}>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs font-medium text-slate-600 mb-1 block">
                          Razão Social / Nome Fantasia *
                        </Label>
                        <Input
                          placeholder="Ex: Matriz Operacional, Filial SP..."
                          value={novaEmpresaNome}
                          onChange={(e) => setNovaEmpresaNome(e.target.value)}
                          className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-medium text-slate-600 mb-1 block">
                          CNPJ (Opcional)
                        </Label>
                        <Input
                          placeholder="00.000.000/0001-00"
                          value={novaEmpresaCnpj}
                          onChange={(e) => setNovaEmpresaCnpj(e.target.value)}
                          className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                        />
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-xl font-medium shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Cadastrar Empresa
                    </Button>
                  </CardFooter>
                </form>
              </Card>

              {/* Lista de Empresas */}
              <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
                <div className="p-4 border-b border-slate-100 font-medium text-xs text-slate-700">
                  Empresas Cadastradas ({empresas.length})
                </div>
                <div className="divide-y divide-slate-100">
                  {empresas.map((emp) => (
                    <div key={emp.id} className="p-3.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <Building className="w-4 h-4 text-slate-400" />
                        <div>
                          <div className="font-semibold text-slate-900 flex items-center gap-2">
                            <span>{emp.nome}</span>
                            {emp.padrao && (
                              <span className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md">
                                Padrão
                              </span>
                            )}
                          </div>
                          {emp.cnpj && (
                            <div className="text-[11px] text-slate-500 font-mono">{emp.cnpj}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!emp.padrao && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDefinirEmpresaPadrao(emp)}
                            className="text-xs h-7 px-2.5 rounded-lg border-slate-200"
                          >
                            Tornar Padrão
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleExcluirEmpresa(emp.id)}
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-7 w-7 p-0 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {empresas.length === 0 && (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Nenhuma empresa cadastrada. A Matriz Operacional padrão é utilizada.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ABA: PATRIMÔNIO (ATIVOS E PASSIVOS EMPRESARIAIS - PONTO A) */}
          {secaoAtiva === 'patrimonio' && (
            <div className="space-y-4">
              <Card className="bg-white border-slate-200/80 shadow-xs rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <Scale className="w-4 h-4 text-blue-600" />
                    Cadastrar Item Patrimonial (Balanço Empresarial)
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 font-normal">
                    Contemple o patrimônio empresarial completo: ATIVOS (imóveis, veículos,
                    máquinas, participações, aplicações) e PASSIVOS (financiamentos, empréstimos
                    bancários, obrigações de longo prazo).
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleCriarItemPatrimonio}>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs font-medium text-slate-600 mb-1 block">
                          Tipo
                        </Label>
                        <Select
                          value={novoPatTipo}
                          onValueChange={(v: 'ativo' | 'passivo') => {
                            setNovoPatTipo(v)
                            setNovoPatCategoria(
                              v === 'ativo' ? 'Imóveis' : 'Financiamento Bancário',
                            )
                          }}
                        >
                          <SelectTrigger className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-slate-200 rounded-xl shadow-lg">
                            <SelectItem value="ativo">
                              Ativo (Bens / Direitos / Aplicações)
                            </SelectItem>
                            <SelectItem value="passivo">
                              Passivo (Dívidas / Financiamentos LP)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs font-medium text-slate-600 mb-1 block">
                          Categoria
                        </Label>
                        <Select value={novoPatCategoria} onValueChange={setNovoPatCategoria}>
                          <SelectTrigger className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-slate-200 rounded-xl shadow-lg">
                            {novoPatTipo === 'ativo' ? (
                              <>
                                <SelectItem value="Imóveis">
                                  Imóveis (Terrenos, Galpões, Salas)
                                </SelectItem>
                                <SelectItem value="Veículos">Veículos & Frotas</SelectItem>
                                <SelectItem value="Máquinas & Equipamentos">
                                  Máquinas & Equipamentos
                                </SelectItem>
                                <SelectItem value="Aplicações & Fundos">
                                  Aplicações Financeiras / Fundos
                                </SelectItem>
                                <SelectItem value="Participações">
                                  Participações Societárias
                                </SelectItem>
                                <SelectItem value="Outros Ativos">
                                  Outros Ativos Permanentes
                                </SelectItem>
                              </>
                            ) : (
                              <>
                                <SelectItem value="Financiamento Bancário">
                                  Financiamento Bancário / Imobiliário
                                </SelectItem>
                                <SelectItem value="Empréstimo PJ">
                                  Empréstimo / Capital de Giro
                                </SelectItem>
                                <SelectItem value="Tributos Parcelados">
                                  Tributos Parcelados (Refis / LP)
                                </SelectItem>
                                <SelectItem value="Fornecedores LP">
                                  Fornecedores Longo Prazo
                                </SelectItem>
                                <SelectItem value="Outros Passivos">
                                  Outras Obrigações Exigíveis
                                </SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs font-medium text-slate-600 mb-1 block">
                          Valor (R$)
                        </Label>
                        <Input
                          placeholder="0,00"
                          value={novoPatValor}
                          onChange={(e) => setNovoPatValor(e.target.value)}
                          className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl font-semibold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <Label className="text-xs font-medium text-slate-600 mb-1 block">
                          Descrição do Bem ou Obrigação
                        </Label>
                        <Input
                          placeholder="Ex: Galpão Industrial Sede, Financiamento Caminhão Scania..."
                          value={novoPatDescricao}
                          onChange={(e) => setNovoPatDescricao(e.target.value)}
                          className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-medium text-slate-600 mb-1 block">
                          Empresa Vinculada
                        </Label>
                        <Select value={novoPatEmpresaId} onValueChange={setNovoPatEmpresaId}>
                          <SelectTrigger className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl">
                            <SelectValue placeholder="Todas as empresas (Consolidado)" />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-slate-200 rounded-xl shadow-lg">
                            <SelectItem value="todas">Consolidado (Todas as empresas)</SelectItem>
                            {empresas.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-xl font-medium shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Adicionar ao Patrimônio
                    </Button>
                  </CardFooter>
                </form>
              </Card>

              {/* Tabela de Patrimônio */}
              <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">
                    Bens, Direitos e Obrigações Cadastradas ({itensPatrimonio.length})
                  </span>
                  <div className="flex items-center gap-4 text-[11px]">
                    <span className="text-emerald-700 font-semibold">
                      Ativos:{' '}
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      }).format(
                        itensPatrimonio
                          .filter((p) => p.tipo === 'ativo')
                          .reduce((acc, c) => acc + c.valor, 0),
                      )}
                    </span>
                    <span className="text-rose-700 font-semibold">
                      Passivos:{' '}
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      }).format(
                        itensPatrimonio
                          .filter((p) => p.tipo === 'passivo')
                          .reduce((acc, c) => acc + c.valor, 0),
                      )}
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {itensPatrimonio.map((p) => (
                    <div key={p.id} className="p-3.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-slate-900 flex items-center gap-2">
                          <span>{p.descricao}</span>
                          <span
                            className={cn(
                              'text-[10px] font-medium px-2 py-0.5 rounded-md border',
                              p.tipo === 'ativo'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200',
                            )}
                          >
                            {p.tipo.toUpperCase()} • {p.categoria}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {p.expand?.empresa_id?.nome
                            ? `Unidade: ${p.expand.empresa_id.nome}`
                            : 'Consolidado da Empresa'}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            'font-bold tabular-nums text-sm',
                            p.tipo === 'ativo' ? 'text-emerald-600' : 'text-rose-600',
                          )}
                        >
                          {new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          }).format(p.valor)}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleExcluirItemPatrimonio(p.id)}
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-7 w-7 p-0 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {itensPatrimonio.length === 0 && (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Nenhum bem, máquina, imóvel ou passivo de longo prazo cadastrado ainda.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ABA: CONTROLE DE DADOS (EXPORTAÇÃO, IMPORTAÇÃO, POSSE LOCAL & TRANSPARÊNCIA) */}
          {secaoAtiva === 'dados' && <SecaoControleDados onDataRestored={carregarTudo} />}
        </div>
      </div>
    </div>
  )
}
