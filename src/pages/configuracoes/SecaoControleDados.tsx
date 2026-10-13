import React, { useState, useRef } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Download,
  Upload,
  Database,
  FileSpreadsheet,
  Server,
  ShieldCheck,
  HardDrive,
  FileJson,
  AlertTriangle,
  CheckCircle2,
  Lock,
  ArrowRight,
  Info,
  Loader2,
  RefreshCw,
  BookOpen,
  Terminal,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { GuiaInstalacaoLocalModal } from './GuiaInstalacaoLocalModal'
import {
  gerarBackupCompleto,
  downloadJsonFile,
  exportarCsvLancamentos,
  exportarCsvContasReceberPagar,
  exportarCsvCategoriasCentrosCusto,
  exportarCsvAuditoria,
  validarBackupJson,
  restaurarBackup,
  BackupData,
  ImportResult,
} from '@/services/dataControl'

interface SecaoControleDadosProps {
  onDataRestored?: () => void
}

export const SecaoControleDados: React.FC<SecaoControleDadosProps> = ({ onDataRestored }) => {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Estados de exportação
  const [exportandoJson, setExportandoJson] = useState(false)
  const [exportandoCsvLanc, setExportandoCsvLanc] = useState(false)
  const [exportandoCsvContas, setExportandoCsvContas] = useState(false)
  const [exportandoCsvCats, setExportandoCsvCats] = useState(false)
  const [exportandoCsvAudit, setExportandoCsvAudit] = useState(false)

  // Estados de importação
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null)
  const [backupParsed, setBackupParsed] = useState<BackupData | null>(null)
  const [modalConfirmacaoAberto, setModalConfirmacaoAberto] = useState(false)
  const [restaurando, setRestaurando] = useState(false)
  const [progressoMensagem, setProgressoMensagem] = useState('')
  const [resultadoImportacao, setResultadoImportacao] = useState<ImportResult | null>(null)
  const [modalResultadoAberto, setModalResultadoAberto] = useState(false)

  // Estado do Guia de Instalação Local
  const [modalGuiaAberto, setModalGuiaAberto] = useState(false)

  // 1. Exportação JSON completa
  const handleBaixarBackupCompleto = async () => {
    setExportandoJson(true)
    try {
      // Importa token em memória se houver
      const { getSessionAuditToken } = await import('@/services/financial')
      const tokenAuditoria = getSessionAuditToken() || undefined
      const { backup, counts, fileName } = await gerarBackupCompleto(tokenAuditoria)
      downloadJsonFile(fileName, backup)

      const total =
        counts.empresas +
        counts.contas +
        counts.categorias +
        counts.centros_custo +
        counts.lancamentos +
        counts.patrimonio +
        counts.auditoria +
        counts.configuracoes

      toast({
        title: 'Backup JSON Gerado com Sucesso',
        description: `Exportados ${total} registros (Empresas: ${counts.empresas}, Contas: ${counts.contas}, Categorias: ${counts.categorias}, Centros: ${counts.centros_custo}, Lançamentos: ${counts.lancamentos}, Patrimônio: ${counts.patrimonio}, Auditoria: ${counts.auditoria}, Configurações: ${counts.configuracoes}).`,
      })
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro na exportação de backup',
        description: err?.message || 'Falha ao conectar com o banco de dados.',
      })
    } finally {
      setExportandoJson(false)
    }
  }

  // 2. Exportações CSV individuais
  const handleExportarCsvLancamentos = async () => {
    setExportandoCsvLanc(true)
    try {
      const qtd = await exportarCsvLancamentos()
      toast({
        title: 'CSV de Lançamentos Gerado',
        description: `${qtd} lançamentos exportados com formato Excel (UTF-8 BOM).`,
      })
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao exportar lançamentos',
        description: err?.message || 'Ocorreu um erro ao processar o CSV.',
      })
    } finally {
      setExportandoCsvLanc(false)
    }
  }

  const handleExportarCsvContasReceberPagar = async () => {
    setExportandoCsvContas(true)
    try {
      const qtd = await exportarCsvContasReceberPagar()
      toast({
        title: 'CSV de Contas a Pagar/Receber Gerado',
        description: `${qtd} registros exportados para planilha com status e vencimentos.`,
      })
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao exportar contas a pagar/receber',
        description: err?.message || 'Ocorreu um erro ao processar o CSV.',
      })
    } finally {
      setExportandoCsvContas(false)
    }
  }

  const handleExportarCsvCategoriasCentros = async () => {
    setExportandoCsvCats(true)
    try {
      const { categorias, centros } = await exportarCsvCategoriasCentrosCusto()
      toast({
        title: 'CSV de Categorias e Centros de Custo Gerado',
        description: `${categorias} categorias e ${centros} centros de custo exportados.`,
      })
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao exportar categorias e centros',
        description: err?.message || 'Ocorreu um erro ao processar o CSV.',
      })
    } finally {
      setExportandoCsvCats(false)
    }
  }

  const handleExportarCsvAuditoria = async () => {
    setExportandoCsvAudit(true)
    try {
      const { getSessionAuditToken } = await import('@/services/financial')
      const tokenAuditoria = getSessionAuditToken() || undefined
      const qtd = await exportarCsvAuditoria(tokenAuditoria)
      toast({
        title: 'CSV de Auditoria Gerado',
        description: `${qtd} registros da trilha imutável exportados com sucesso.`,
      })
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao exportar auditoria',
        description: err?.message || 'Ocorreu um erro ao processar o CSV.',
      })
    } finally {
      setExportandoCsvAudit(false)
    }
  }

  // 3. Seleção e Validação do arquivo JSON de backup
  const handleSelecionarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setArquivoSelecionado(file)

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string)
        const validacao = validarBackupJson(json)

        if (!validacao.valido || !validacao.data) {
          toast({
            variant: 'destructive',
            title: 'Arquivo de Backup Inválido',
            description: validacao.erro || 'O arquivo selecionado não possui a estrutura esperada.',
          })
          setArquivoSelecionado(null)
          setBackupParsed(null)
          if (fileInputRef.current) fileInputRef.current.value = ''
          return
        }

        setBackupParsed(validacao.data)
        setModalConfirmacaoAberto(true)
      } catch (parseError: any) {
        toast({
          variant: 'destructive',
          title: 'Erro ao ler arquivo JSON',
          description: 'O arquivo não é um JSON válido: ' + parseError.message,
        })
        setArquivoSelecionado(null)
        setBackupParsed(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }

    reader.readAsText(file, 'utf-8')
  }

  // 4. Execução da restauração confirmada
  const handleConfirmarRestauracao = async () => {
    if (!backupParsed) return

    setRestaurando(true)
    setProgressoMensagem('Iniciando conferência de integridade...')

    try {
      const { getSessionAuditToken } = await import('@/services/financial')
      const tokenAuditoria = getSessionAuditToken() || undefined

      const resultado = await restaurarBackup(backupParsed, {
        tokenAuditoria,
        onProgress: (msg) => setProgressoMensagem(msg),
      })

      setResultadoImportacao(resultado)
      setModalConfirmacaoAberto(false)
      setModalResultadoAberto(true)

      const totalImportados =
        resultado.importados.empresas +
        resultado.importados.contas +
        resultado.importados.categorias +
        resultado.importados.centros_custo +
        resultado.importados.lancamentos +
        resultado.importados.patrimonio +
        resultado.importados.auditoria +
        resultado.importados.configuracoes

      const totalExistentes =
        resultado.ignoradosExistentes.empresas +
        resultado.ignoradosExistentes.contas +
        resultado.ignoradosExistentes.categorias +
        resultado.ignoradosExistentes.centros_custo +
        resultado.ignoradosExistentes.lancamentos +
        resultado.ignoradosExistentes.patrimonio +
        resultado.ignoradosExistentes.auditoria +
        resultado.ignoradosExistentes.configuracoes

      toast({
        title: 'Restauração Concluída',
        description: `${totalImportados} novos registros inseridos. ${totalExistentes} registros já existiam e foram preservados sem duplicação.`,
      })

      onDataRestored?.()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Falha durante a restauração',
        description: err?.message || 'Erro inesperado ao restaurar dados.',
      })
    } finally {
      setRestaurando(false)
      setProgressoMensagem('')
      setArquivoSelecionado(null)
      setBackupParsed(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      {/* PAINEL INFORMATIVO: ONDE FICAM MEUS DADOS */}
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/60 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 shadow-2xs">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                Onde ficam meus dados?
                <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-medium">
                  Transparência & Posse Local
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 font-normal mt-0.5">
                Esclarecimento técnico e honesto sobre custódia, privacidade e soberania das suas
                informações financeiras
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-5 space-y-4 text-xs text-slate-600">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
              <div className="flex items-center gap-2 font-medium text-slate-900">
                <Database className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span>1. Armazenamento Atual em Nuvem</span>
              </div>
              <p className="text-slate-500 font-normal leading-relaxed">
                Os dados da sua empresa ficam armazenados em um banco de dados dedicado PocketBase
                hospedado na infraestrutura segura da <strong>Skip Cloud</strong>, com rotinas de
                replicação e backups automáticos gerenciados pela nuvem.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
              <div className="flex items-center gap-2 font-medium text-slate-900">
                <HardDrive className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                <span>2. Posse e Backup Local 100% Completo</span>
              </div>
              <p className="text-slate-500 font-normal leading-relaxed">
                O arquivo de backup JSON gerado nesta tela contém{' '}
                <strong>100% de todas as 8 coleções</strong> do sistema (empresas, contas,
                categorias, centros de custo, lançamentos, patrimônio, auditoria e configurações).
                Você pode salvá-lo no seu computador, pen drive ou servidor interno.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium text-slate-900">
                  <Server className="w-4 h-4 text-purple-600 flex-shrink-0" />
                  <span>3. Sistema Self-Hostable (Rode Localmente)</span>
                </div>
                <Badge className="bg-purple-50 text-purple-700 border border-purple-200 text-[10px]">
                  Linux + Windows
                </Badge>
              </div>
              <p className="text-slate-500 font-normal leading-relaxed">
                O sistema roda como um executável autônomo no seu servidor Linux corporativo, com
                acesso para todas as máquinas Windows da empresa pelo navegador web via IP interno.
              </p>
              <div className="pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setModalGuiaAberto(true)}
                  className="w-full text-xs font-medium border-purple-200 text-purple-700 hover:bg-purple-50 hover:text-purple-800 rounded-xl bg-white shadow-2xs h-8"
                >
                  <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                  Abrir Guia de Instalação no Servidor Linux
                </Button>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
              <div className="flex items-center gap-2 font-medium text-slate-900">
                <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>4. Privacidade e Geração no Navegador</span>
              </div>
              <p className="text-slate-500 font-normal leading-relaxed">
                Seus dados financeiros <strong>nunca são compartilhados com terceiros</strong>. As
                exportações e importações são processadas e formatadas diretamente na memória do seu
                próprio navegador web, sem passar por servidores analíticos ou serviços
                intermediários.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* BANNER DE DESTAQUE: GUIA DE INSTALAÇÃO NO SERVIDOR LINUX */}
      <Card className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white border-0 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-500/20 border border-blue-400/30 text-blue-300">
                <Terminal className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-white text-sm">
                Instalação no Servidor Linux & Acesso por Máquinas Windows
              </h3>
              <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px]">
                Rede Interna
              </Badge>
            </div>
            <p className="text-slate-300 text-xs font-normal max-w-2xl leading-relaxed">
              Consulte o passo a passo completo para leigos: pré-requisitos do servidor, execução
              com as migrações financeiras já criadas, configuração do IP interno (ex:{' '}
              <code className="text-blue-200 font-mono">http://192.168.0.10:8090</code>), rotina de
              backup noturno nativo e cadastro da Senha Mestra exclusiva no primeiro uso.{' '}
            </p>
          </div>
          <Button
            onClick={() => setModalGuiaAberto(true)}
            className="bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold h-9 px-4 rounded-xl shrink-0 shadow-xs"
          >
            <BookOpen className="w-4 h-4 mr-2 text-blue-600" />
            Visualizar Guia de Instalação
          </Button>
        </CardContent>
      </Card>

      {/* BLOCO 1: EXPORTAÇÃO COMPLETA DE BACKUP (JSON) */}
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-2xl">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <FileJson className="w-5 h-5 text-blue-600" />
                Backup Completo do Sistema (JSON)
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 font-normal mt-0.5">
                Extração unificada de todas as coleções estruturadas para guarda fria e
                portabilidade total
              </CardDescription>
            </div>
            <Button
              onClick={handleBaixarBackupCompleto}
              disabled={exportandoJson}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium h-9 px-4 shrink-0 rounded-xl shadow-xs"
            >
              {exportandoJson ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Buscando coleções...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Baixar backup completo (JSON)
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-start gap-3 text-xs text-slate-500 font-normal">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <span>
              O arquivo baixado seguirá o padrão{' '}
              <code className="text-blue-700 font-mono font-medium">
                backup-gestao-financeira-AAAA-MM-DD.json
              </code>{' '}
              e percorre todas as páginas de dados das 8 coleções estruturais (empresas, contas,
              categorias, centros de custo, lançamentos, patrimônio, auditoria e configurações).
            </span>
          </div>
        </CardContent>
      </Card>

      {/* BLOCO 2: EXPORTAÇÃO EM CSV POR COLEÇÃO */}
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
            Exportação em CSV por Coleção (Excel)
          </CardTitle>
          <CardDescription className="text-xs text-slate-500 font-normal mt-0.5">
            Planilhas individuais com cabeçalhos em português, codificação UTF-8 com BOM e separador
            compatível direto com Microsoft Excel e Google Planilhas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Card CSV 1: Lançamentos */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between space-y-3 shadow-2xs">
              <div>
                <p className="font-medium text-slate-900 text-xs flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-indigo-600" />
                  Lançamentos Financeiros
                </p>
                <p className="text-[11px] text-slate-500 mt-1 leading-normal font-normal">
                  Todas as receitas, despesas, estornos, datas e valores da empresa.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportarCsvLancamentos}
                disabled={exportandoCsvLanc}
                className="w-full text-xs border-slate-200 bg-white hover:bg-slate-100 text-slate-700 rounded-xl font-normal"
              >
                {exportandoCsvLanc ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                )}
                Exportar Lançamentos
              </Button>
            </div>

            {/* Card CSV 2: Contas a Receber / Pagar */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between space-y-3 shadow-2xs">
              <div>
                <p className="font-medium text-slate-900 text-xs flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
                  Contas a Pagar / Receber
                </p>
                <p className="text-[11px] text-slate-500 mt-1 leading-normal font-normal">
                  Visão operacional com status (aberto, liquidado, estornado) e vencimentos.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportarCsvContasReceberPagar}
                disabled={exportandoCsvContas}
                className="w-full text-xs border-slate-200 bg-white hover:bg-slate-100 text-slate-700 rounded-xl font-normal"
              >
                {exportandoCsvContas ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                )}
                Exportar Pagar / Receber
              </Button>
            </div>

            {/* Card CSV 3: Categorias e Centros de Custo */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between space-y-3 shadow-2xs">
              <div>
                <p className="font-medium text-slate-900 text-xs flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-purple-600" />
                  Categorias & Centros de Custo
                </p>
                <p className="text-[11px] text-slate-500 mt-1 leading-normal font-normal">
                  Plano de contas gerencial completo unificado em uma planilha.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportarCsvCategoriasCentros}
                disabled={exportandoCsvCats}
                className="w-full text-xs border-slate-200 bg-white hover:bg-slate-100 text-slate-700 rounded-xl font-normal"
              >
                {exportandoCsvCats ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5 mr-1.5 text-purple-600" />
                )}
                Exportar Categorias / CC
              </Button>
            </div>

            {/* Card CSV 4: Auditoria */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between space-y-3 shadow-2xs">
              <div>
                <p className="font-medium text-slate-900 text-xs flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  Trilha de Auditoria
                </p>
                <p className="text-[11px] text-slate-500 mt-1 leading-normal font-normal">
                  Histórico de ações do sistema com carimbo de tempo para compliance.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportarCsvAuditoria}
                disabled={exportandoCsvAudit}
                className="w-full text-xs border-slate-200 bg-white hover:bg-slate-100 text-slate-700 rounded-xl font-normal"
              >
                {exportandoCsvAudit ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
                )}
                Exportar Auditoria
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* BLOCO 3: IMPORTAÇÃO E RESTAURAÇÃO DE BACKUP */}
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-2xl">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-600" />
                Restaurar Backup (JSON)
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 font-normal mt-0.5">
                Restaure dados a partir de um arquivo JSON previamente exportado, com proteção
                contra duplicação
              </CardDescription>
            </div>

            <div>
              <input
                type="file"
                ref={fileInputRef}
                accept=".json,application/json"
                className="hidden"
                onChange={handleSelecionarArquivo}
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={restaurando}
                className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-medium h-9 px-4 shrink-0 rounded-xl"
              >
                <Upload className="w-4 h-4 mr-2 text-emerald-600" />
                Selecionar Arquivo JSON
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/80 text-xs text-amber-900 space-y-1">
            <div className="flex items-center gap-1.5 font-medium text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              Regras e Proteções de Restauração:
            </div>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 font-normal">
              <li>
                <strong>Edição controlada permitida com motivo obrigatório:</strong> toda alteração
                gera registro de auditoria ANTES/DEPOIS com usuário, data/hora e motivo (mínimo de 5
                caracteres). Exclusão proibida. Estorno para cancelamentos financeiros.
              </li>
              <li>
                <strong>Todas as 8 coleções cobertas:</strong> Inclui empresas, contas, categorias
                (com classificação contábil DRE), centros de custo, lançamentos (com empresa_id,
                estorno_de e liquidação vinculados), patrimônio (ativos e passivos), auditoria e
                configurações.
              </li>
              <li>
                <strong>Restauração fiel da auditoria:</strong> Preserva o autor/usuário original e
                a data/hora original de cada evento auditado, nunca substituindo pela sessão atual
                do operador.
              </li>
              <li>
                <strong>Proteção contra duplicidade:</strong> O sistema confere unicidade antes de
                salvar. Registros que já constam no banco são automaticamente pulados e preservados
                (apenas insere o que não existe).
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* MODAL DE CONFIRMAÇÃO COM PREVIEW */}
      <Dialog open={modalConfirmacaoAberto} onOpenChange={setModalConfirmacaoAberto}>
        <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-lg rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 text-base font-semibold">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Confirmar Restauração de Backup
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 font-normal">
              Arquivo:{' '}
              <span className="text-blue-600 font-mono font-medium">
                {arquivoSelecionado?.name}
              </span>
            </DialogDescription>
          </DialogHeader>

          {backupParsed && (
            <div className="space-y-4 py-2 text-xs">
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                <div className="flex justify-between text-slate-500 border-b border-slate-200/60 pb-1.5">
                  <span>Data de geração do backup:</span>
                  <span className="text-slate-800 font-mono font-medium">
                    {backupParsed.geradoEm
                      ? new Date(backupParsed.geradoEm).toLocaleString('pt-BR')
                      : 'Não informada'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500 border-b border-slate-200/60 pb-1.5">
                  <span>Versão do esquema:</span>
                  <span className="text-slate-800 font-mono font-medium">
                    {backupParsed.versao || 1}
                  </span>
                </div>

                <p className="font-medium text-slate-800 pt-1">Registros encontrados no arquivo:</p>
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <div className="flex justify-between bg-white border border-slate-200/70 p-2.5 rounded-lg">
                    <span>Empresas:</span>
                    <strong className="text-emerald-600 font-semibold">
                      {backupParsed.colecoes.empresas?.length || 0}
                    </strong>
                  </div>
                  <div className="flex justify-between bg-white border border-slate-200/70 p-2.5 rounded-lg">
                    <span>Contas:</span>
                    <strong className="text-emerald-600 font-semibold">
                      {backupParsed.colecoes.contas?.length || 0}
                    </strong>
                  </div>
                  <div className="flex justify-between bg-white border border-slate-200/70 p-2.5 rounded-lg">
                    <span>Categorias:</span>
                    <strong className="text-emerald-600 font-semibold">
                      {backupParsed.colecoes.categorias?.length || 0}
                    </strong>
                  </div>
                  <div className="flex justify-between bg-white border border-slate-200/70 p-2.5 rounded-lg">
                    <span>Centros de Custo:</span>
                    <strong className="text-emerald-600 font-semibold">
                      {backupParsed.colecoes.centros_custo?.length || 0}
                    </strong>
                  </div>
                  <div className="flex justify-between bg-white border border-slate-200/70 p-2.5 rounded-lg">
                    <span>Lançamentos:</span>
                    <strong className="text-emerald-600 font-semibold">
                      {backupParsed.colecoes.lancamentos?.length || 0}
                    </strong>
                  </div>
                  <div className="flex justify-between bg-white border border-slate-200/70 p-2.5 rounded-lg">
                    <span>Patrimônio:</span>
                    <strong className="text-emerald-600 font-semibold">
                      {backupParsed.colecoes.patrimonio?.length || 0}
                    </strong>
                  </div>
                  <div className="flex justify-between bg-white border border-slate-200/70 p-2.5 rounded-lg">
                    <span>Auditoria:</span>
                    <strong className="text-emerald-600 font-semibold">
                      {backupParsed.colecoes.auditoria?.length || 0}
                    </strong>
                  </div>
                  <div className="flex justify-between bg-white border border-slate-200/70 p-2.5 rounded-lg">
                    <span>Configurações:</span>
                    <strong className="text-emerald-600 font-semibold">
                      {backupParsed.colecoes.configuracoes?.length || 0}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-amber-800 text-xs font-normal">
                <strong className="font-medium">Atenção:</strong> Isso pode criar registros caso o
                arquivo contenha itens que não existem mais no banco de dados. Os registros
                idênticos já existentes serão mantidos sem alteração. Deseja continuar?
              </div>

              {restaurando && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs flex items-center gap-3 text-emerald-800 animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0 text-emerald-600" />
                  <span>{progressoMensagem || 'Processando restauração...'}</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setModalConfirmacaoAberto(false)
                setArquivoSelecionado(null)
                setBackupParsed(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              disabled={restaurando}
              className="text-xs border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmarRestauracao}
              disabled={restaurando}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-xl font-medium"
            >
              {restaurando ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  Restaurando...
                </>
              ) : (
                'Confirmar e Restaurar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE RESULTADO FINAL DA IMPORTAÇÃO */}
      <Dialog open={modalResultadoAberto} onOpenChange={setModalResultadoAberto}>
        <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-lg rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 text-base font-semibold">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Resultado da Importação de Backup
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 font-normal">
              Conferência detalhada dos registros inseridos versus já existentes
            </DialogDescription>
          </DialogHeader>

          {resultadoImportacao && (
            <div className="space-y-4 py-2 text-xs">
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 bg-slate-100/60 font-medium">
                      <th className="py-2 px-3">Coleção</th>
                      <th className="py-2 px-3 text-right">Novos Importados</th>
                      <th className="py-2 px-3 text-right">Já Existiam (Ignorados)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    <tr>
                      <td className="py-2 px-3 font-medium">Empresas</td>
                      <td className="py-2 px-3 text-right text-emerald-600 font-semibold">
                        +{resultadoImportacao.importados.empresas}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500">
                        {resultadoImportacao.ignoradosExistentes.empresas}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">Contas</td>
                      <td className="py-2 px-3 text-right text-emerald-600 font-semibold">
                        +{resultadoImportacao.importados.contas}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500">
                        {resultadoImportacao.ignoradosExistentes.contas}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">Categorias</td>
                      <td className="py-2 px-3 text-right text-emerald-600 font-semibold">
                        +{resultadoImportacao.importados.categorias}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500">
                        {resultadoImportacao.ignoradosExistentes.categorias}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">Centros de Custo</td>
                      <td className="py-2 px-3 text-right text-emerald-600 font-semibold">
                        +{resultadoImportacao.importados.centros_custo}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500">
                        {resultadoImportacao.ignoradosExistentes.centros_custo}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">Lançamentos</td>
                      <td className="py-2 px-3 text-right text-emerald-600 font-semibold">
                        +{resultadoImportacao.importados.lancamentos}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500">
                        {resultadoImportacao.ignoradosExistentes.lancamentos}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">Patrimônio</td>
                      <td className="py-2 px-3 text-right text-emerald-600 font-semibold">
                        +{resultadoImportacao.importados.patrimonio}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500">
                        {resultadoImportacao.ignoradosExistentes.patrimonio}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">Auditoria</td>
                      <td className="py-2 px-3 text-right text-emerald-600 font-semibold">
                        +{resultadoImportacao.importados.auditoria}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500">
                        {resultadoImportacao.ignoradosExistentes.auditoria}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">Configurações</td>
                      <td className="py-2 px-3 text-right text-emerald-600 font-semibold">
                        +{resultadoImportacao.importados.configuracoes}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500">
                        {resultadoImportacao.ignoradosExistentes.configuracoes}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {resultadoImportacao.erros.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs space-y-1 max-h-36 overflow-y-auto">
                  <div className="font-medium flex items-center gap-1.5 text-rose-800">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Ocorrências ({resultadoImportacao.erros.length}):
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                    {resultadoImportacao.erros.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              size="sm"
              onClick={() => setModalResultadoAberto(false)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs w-full sm:w-auto rounded-xl font-medium"
            >
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DO GUIA COMPLETO DE INSTALAÇÃO LOCAL */}
      <GuiaInstalacaoLocalModal open={modalGuiaAberto} onOpenChange={setModalGuiaAberto} />
    </div>
  )
}
