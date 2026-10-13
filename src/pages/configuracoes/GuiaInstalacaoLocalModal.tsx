import React, { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Server,
  Monitor,
  ShieldCheck,
  HardDrive,
  RefreshCw,
  Copy,
  Check,
  Terminal,
  ExternalLink,
  KeyRound,
  FileText,
  AlertTriangle,
  ArrowRight,
  Database,
  Lock,
  CloudUpload,
} from 'lucide-react'

export const GuiaInstalacaoLocalModal: React.FC<{
  open: boolean
  onOpenChange: (open: boolean) => void
}> = ({ open, onOpenChange }) => {
  const [copiado, setCopiado] = useState<string | null>(null)
  const [abaGuia, setAbaGuia] = useState<
    'passos' | 'requisitos' | 'segurança' | 'backup' | 'windows' | 'github'
  >('passos')

  const copiarComando = (texto: string, id: string) => {
    navigator.clipboard.writeText(texto)
    setCopiado(id)
    setTimeout(() => setCopiado(null), 2500)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-0 bg-white border-slate-200/90 text-slate-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Cabeçalho */}
        <DialogHeader className="p-6 pb-4 bg-slate-50/70 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 shadow-2xs">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                Guia de Instalação no Servidor Linux Local
                <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-medium">
                  Rede Interna + Windows
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 font-normal mt-0.5">
                Passo a passo simplificado para instalar o sistema no servidor Linux da sua empresa
                e liberar acesso para máquinas Windows via navegador.
              </DialogDescription>
            </div>
          </div>

          {/* Navegação de sub-abas do guia */}
          <div className="flex flex-wrap items-center gap-1.5 pt-3">
            <button
              type="button"
              onClick={() => setAbaGuia('passos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                abaGuia === 'passos'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              1. Passo a Passo de Instalação
            </button>
            <button
              type="button"
              onClick={() => setAbaGuia('requisitos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                abaGuia === 'requisitos'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              2. O Que Você Precisa no Servidor
            </button>
            <button
              type="button"
              onClick={() => setAbaGuia('segurança')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                abaGuia === 'segurança'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              3. Checklist de Segurança
            </button>
            <button
              type="button"
              onClick={() => setAbaGuia('backup')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                abaGuia === 'backup'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              4. Backup na Nuvem & Atualizações
            </button>
            <button
              type="button"
              onClick={() => setAbaGuia('windows')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                abaGuia === 'windows'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              5. Windows Server (Estudo & Guia)
            </button>
            <button
              type="button"
              onClick={() => setAbaGuia('github')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                abaGuia === 'github'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              6. GitHub & Sincronização
            </button>
          </div>
        </DialogHeader>

        {/* Corpo com rolagem */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-600">
          {/* ABA 1: PASSO A PASSO */}
          {abaGuia === 'passos' && (
            <div className="space-y-6">
              {/* Passo 1 */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 text-xs">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold">
                      1
                    </span>
                    <span>Baixar o Código do Repositório Privado no Servidor Linux</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-slate-500 font-normal">
                    Servidor Linux
                  </Badge>
                </div>
                <p className="text-slate-500 font-normal leading-relaxed">
                  No terminal do seu servidor Linux, acesse a pasta desejada (ex: `/var/www`) e
                  baixe o repositório utilizando seu Git:
                </p>
                <div className="relative bg-slate-900 text-slate-100 font-mono text-[11px] p-3 rounded-lg flex items-center justify-between">
                  <code>
                    git clone git@github.com:gramosvane/gest-o-financeira-rws2k17k26.git
                    gestao-financeira
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      copiarComando(
                        'git clone git@github.com:gramosvane/gest-o-financeira-rws2k17k26.git gestao-financeira\ncd gestao-financeira',
                        'cmd1',
                      )
                    }
                    className="h-7 px-2 text-slate-300 hover:text-white hover:bg-slate-800"
                  >
                    {copiado === 'cmd1' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Passo 2 */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 text-xs">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold">
                      2
                    </span>
                    <span>Baixar o Executável PocketBase e Vincular as Migrações</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-slate-500 font-normal">
                    Backend & Banco
                  </Badge>
                </div>
                <p className="text-slate-500 font-normal leading-relaxed">
                  O sistema já vem com todas as 8 tabelas e regras prontas (`empresas`, `contas`,
                  `categorias`, `departamentos`, `lancamentos`, `patrimonio`, `auditoria`,
                  `configuracoes`). Basta vincular as pastas de migrações (`pb_migrations`) e hooks
                  (`pb_hooks`) ao PocketBase:
                </p>
                <div className="relative bg-slate-900 text-slate-100 font-mono text-[11px] p-3 rounded-lg flex flex-col gap-1">
                  <code>
                    curl -L -o pocketbase.zip
                    https://github.com/pocketbase/pocketbase/releases/download/v0.26.9/pocketbase_0.26.9_linux_amd64.zip
                  </code>
                  <code>
                    unzip pocketbase.zip pocketbase && rm pocketbase.zip && chmod +x pocketbase
                  </code>
                  <code>ln -sfn ./server/pb_migrations pb_migrations</code>
                  <code>ln -sfn ./server/pb_hooks pb_hooks</code>
                  <code>./pocketbase superuser create EMAIL SENHA</code>
                </div>
              </div>

              {/* Passo 3 */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 text-xs">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold">
                      3
                    </span>
                    <span>Compilar o Frontend e Vincular à Pasta de Publicação</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-slate-500 font-normal">
                    Frontend Web
                  </Badge>
                </div>
                <p className="text-slate-500 font-normal leading-relaxed">
                  Compile a interface visual do sistema. O PocketBase servirá a página web
                  diretamente através da pasta `pb_public`:
                </p>
                <div className="relative bg-slate-900 text-slate-100 font-mono text-[11px] p-3 rounded-lg flex flex-col gap-1">
                  <code>npm install</code>
                  <code>npm run build</code>
                  <code>ln -sfn ./dist pb_public</code>
                </div>
              </div>

              {/* Passo 4 */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 text-xs">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold">
                      4
                    </span>
                    <span>Descobrir o IP do Servidor e Iniciar o Serviço</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-slate-500 font-normal">
                    Rede Local
                  </Badge>
                </div>
                <p className="text-slate-500 font-normal leading-relaxed">
                  Descubra o IP interno do Linux com o comando <code>hostname -I</code> (exemplo:{' '}
                  <strong>192.168.0.10</strong>). Inicie o sistema para escutar todas as máquinas da
                  rede local:
                </p>
                <div className="relative bg-slate-900 text-slate-100 font-mono text-[11px] p-3 rounded-lg">
                  <code>./pocketbase serve --http=0.0.0.0:8090</code>
                </div>
                <p className="text-[11px] text-slate-500">
                  *(Consulte o arquivo <code>README-INSTALACAO.md</code> para configurar o serviço
                  no <code>systemd</code> para iniciar automaticamente ao ligar o servidor).*
                </p>
              </div>

              {/* Passo 5 */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 text-xs">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold">
                      5
                    </span>
                    <span>Acessar das Máquinas Windows da Empresa</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-slate-500 font-normal">
                    Navegador Windows
                  </Badge>
                </div>
                <p className="text-slate-500 font-normal leading-relaxed">
                  Em qualquer computador Windows conectado ao Wi-Fi ou cabo da empresa, abra o
                  Google Chrome ou Microsoft Edge e digite na barra de endereços:
                </p>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 font-mono font-medium text-center text-xs">
                  http://192.168.0.10:8090
                </div>
                <p className="text-[11px] text-slate-500">
                  Substitua <code>192.168.0.10</code> pelo IP real do seu servidor Linux. Adicione
                  aos favoritos do navegador para acesso diário.
                </p>
              </div>

              {/* Alerta de Senha Mestra */}
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-amber-900 text-xs">
                  <KeyRound className="w-4 h-4 text-amber-600" />
                  IMPORTANTE: Primeiro Acesso — Cadastro do Admin e Senha Mestra Exclusiva
                </div>
                <p className="text-amber-800 text-[11px] leading-relaxed font-normal">
                  <strong>Não existe senha padrão de fábrica</strong>. No primeiro acesso, crie seu
                  usuário administrador pela tela de cadastro da empresa e, em seguida, acesse{' '}
                  <strong>Configurações &gt; Senha Mestra (Auditoria)</strong> para registrar sua
                  senha mestra exclusiva.
                </p>
              </div>
            </div>
          )}

          {/* ABA 2: PRÉ-REQUISITOS DO SERVIDOR */}
          {abaGuia === 'requisitos' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 text-xs">
                    <Server className="w-4 h-4 text-blue-600" />
                    1. Computador Servidor Linux
                  </div>
                  <p className="text-slate-500 font-normal text-xs leading-relaxed">
                    Ubuntu Server 22.04 / 24.04 LTS, Debian 11/12 ou Linux Mint 21/22 de 64 bits.
                    Mínimo de 2 GB de RAM e 20 GB de SSD. Conectado de preferência via cabo de rede
                    ao roteador.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 text-xs">
                    <HardDrive className="w-4 h-4 text-indigo-600" />
                    2. IP Fixo na Rede Interna
                  </div>
                  <p className="text-slate-500 font-normal text-xs leading-relaxed">
                    Configure no roteador da sua empresa uma reserva de IP (DHCP Reservation) para o
                    servidor Linux, garantindo que o endereço (ex: <code>192.168.0.10</code>) nunca
                    mude ao reiniciar.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 text-xs">
                    <Terminal className="w-4 h-4 text-emerald-600" />
                    3. Softwares Básicos no Servidor
                  </div>
                  <p className="text-slate-500 font-normal text-xs leading-relaxed">
                    Instale no Linux: Git, Node.js v24 LTS (setup_24.x), curl e unzip através de:{' '}
                    <code>sudo apt install -y git curl unzip</code> e Node 24 LTS.{' '}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 text-xs">
                    <Monitor className="w-4 h-4 text-purple-600" />
                    4. Clientes Windows (Navegador)
                  </div>
                  <p className="text-slate-500 font-normal text-xs leading-relaxed">
                    Zero instalação nos computadores das equipes. Basta abrir o Google Chrome,
                    Microsoft Edge ou Firefox e acessar o IP do servidor local.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1.5">
                <span className="font-semibold text-slate-900">
                  Dica de Arquivo de Auxílio Rápido:
                </span>
                <p className="text-slate-500 font-normal">
                  O projeto inclui o script <code>scripts/setup-local.sh</code> que automatiza a
                  criação das pastas, links de <code>pb_migrations</code> e <code>pb_hooks</code>, e
                  o build do sistema em apenas um comando.
                </p>
              </div>
            </div>
          )}

          {/* ABA 3: CHECKLIST DE SEGURANÇA */}
          {abaGuia === 'segurança' && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                <div className="flex items-center gap-2 font-semibold text-emerald-900 text-xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Boas Práticas para Blindagem do Servidor Local
                </div>
                <p className="text-emerald-800 text-[11px] leading-relaxed">
                  Como seus dados financeiros residem no servidor local, siga estas 7 verificações
                  para máxima proteção corporativa:
                </p>
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-xl bg-slate-50/50 overflow-hidden">
                <div className="p-3.5 flex items-start gap-3">
                  <Lock className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-slate-900 font-medium">
                      1. Senha do Servidor Linux:
                    </strong>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Use senhas fortes com mais de 12 caracteres para o usuário do Linux e acesso
                      SSH.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 flex items-start gap-3">
                  <ShieldCheck className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-slate-900 font-medium">
                      2. Bloquear Acesso Externo da Internet:
                    </strong>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Não libere redirecionamento de porta (port forward) no roteador para a porta
                      8090. O acesso deve ser 100% restrito à rede local ou via VPN corporativa
                      segura (ex: Tailscale ou WireGuard).
                    </p>
                  </div>
                </div>

                <div className="p-3.5 flex items-start gap-3">
                  <KeyRound className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-slate-900 font-medium">
                      3. Senha Mestra Exclusiva:
                    </strong>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Cadastre a senha mestra exclusiva em Configurações no primeiro uso. Nunca
                      compartilhe essa credencial e não use senhas fracas.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 flex items-start gap-3">
                  <HardDrive className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-slate-900 font-medium">
                      4. No-break (Nobreak/UPS) Recomendado:
                    </strong>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Ligue o servidor Linux a um no-break com bateria para evitar paradas bruscas e
                      proteger o banco de dados contra oscilações elétricas.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 flex items-start gap-3">
                  <CloudUpload className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-slate-900 font-medium">
                      5. Backup Noturno Automático:
                    </strong>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Mantenha a sincronização da pasta <code>pb_data</code> ativa com o Google
                      Drive ou OneDrive corporativo.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA 4: BACKUP E ATUALIZAÇÕES */}
          {abaGuia === 'backup' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center gap-2 font-semibold text-slate-900 text-xs">
                  <CloudUpload className="w-4 h-4 text-blue-600" />
                  Onde Ficam os Dados no Servidor Linux?
                </div>
                <p className="text-slate-500 font-normal leading-relaxed text-xs">
                  Toda a sua empresa (todas as 8 coleções de dados, auditoria e usuários) fica salva
                  em uma única pasta:
                </p>
                <div className="p-2.5 bg-slate-900 text-slate-100 font-mono text-[11px] rounded-lg">
                  /var/www/gestao-financeira/pb_data
                </div>
                <p className="text-slate-500 font-normal text-xs">
                  Basta manter essa pasta sincronizada via <strong>rclone</strong> com o Google
                  Drive ou OneDrive corporativo para ter proteção total contra qualquer dano físico
                  ao servidor.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center gap-2 font-semibold text-slate-900 text-xs">
                  <RefreshCw className="w-4 h-4 text-emerald-600" />
                  Como Atualizar para uma Nova Versão Sem Perder Dados?
                </div>
                <p className="text-slate-500 font-normal leading-relaxed text-xs">
                  Quando houver melhorias no repositório GitHub, atualize o servidor em 3 passos
                  rápidos. O banco de dados <strong>NUNCA</strong> é apagado ou afetado:
                </p>
                <div className="bg-slate-900 text-slate-100 font-mono text-[11px] p-3 rounded-lg flex flex-col gap-1">
                  <code>git pull origin main</code>
                  <code>npm run build</code>
                  <code>sudo systemctl restart gestao-financeira</code>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center gap-2 font-semibold text-slate-900 text-xs">
                  <Database className="w-4 h-4 text-indigo-600" />
                  Como Trazer os Dados da Nuvem para o Servidor Local?
                </div>
                <p className="text-slate-500 font-normal leading-relaxed text-xs">
                  1. Na versão nuvem, vá em <strong>Controle de Dados</strong> e clique em{' '}
                  <strong>Baixar backup completo (JSON)</strong> para exportar as 8 coleções.
                  <br />
                  2. No servidor local, vá na mesma tela e clique em{' '}
                  <strong>Selecionar Arquivo JSON</strong> para conferir o preview e restaurar todos
                  os dados com preservação de histórico e sem duplicidades.
                </p>
              </div>
            </div>
          )}

          {/* ABA 5: WINDOWS SERVER */}
          {abaGuia === 'windows' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-blue-900 text-xs">
                  <Monitor className="w-4 h-4 text-blue-600" />
                  Compatibilidade Oficial: O Sistema Pode Rodar no Windows Server?
                </div>
                <p className="text-blue-800 text-[11px] leading-relaxed">
                  <strong>Sim, com suporte nativo oficial!</strong> O PocketBase fornece executáveis
                  pré-compilados para Windows (<code>pocketbase_windows_amd64.zip</code>) e o
                  frontend é compilado em arquivos estáticos (HTML/CSS/JS) servidos em{' '}
                  <code>pb_public</code>. Portanto, sua empresa pode rodar em um Windows Server
                  existente.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <strong className="text-slate-900 font-semibold text-xs block">
                  1. Registro como Serviço do Windows (NSSM ou WinSW)
                </strong>
                <p className="text-slate-500 font-normal leading-relaxed text-xs">
                  Para que o PocketBase inicie automaticamente com o Windows Server sem depender de
                  usuário logado na Área de Trabalho:
                </p>
                <div className="bg-slate-900 text-slate-100 font-mono text-[11px] p-3 rounded-lg flex flex-col gap-1">
                  <code>
                    nssm.exe install GestaoFinanceira "C:\GestaoFinanceira\pocketbase.exe" "serve
                    --http=0.0.0.0:8090"
                  </code>
                  <code>net start GestaoFinanceira</code>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <strong className="text-slate-900 font-semibold text-xs block">
                  2. Regra de Firewall do Windows (Liberar Porta 8090)
                </strong>
                <p className="text-slate-500 font-normal text-xs">
                  Abra o PowerShell como Administrador e execute:
                </p>
                <div className="bg-slate-900 text-slate-100 font-mono text-[11px] p-3 rounded-lg">
                  <code>
                    New-NetFirewallRule -DisplayName "Gestao Financeira PB" -Direction Inbound
                    -LocalPort 8090 -Protocol TCP -Action Allow -Profile Private
                  </code>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <strong className="text-slate-900 font-semibold text-xs block">
                  3. Rotina de Backup via Agendador de Tarefas (Task Scheduler + PowerShell)
                </strong>
                <p className="text-slate-500 font-normal text-xs">
                  Agende a execução diária do comando de snapshot atômico para evitar corrupção:
                </p>
                <div className="bg-slate-900 text-slate-100 font-mono text-[11px] p-3 rounded-lg flex flex-col gap-1">
                  <code>
                    & .\pocketbase.exe backup create "backup_$(Get-Date -Format 'yyyy-MM-dd').zip"
                  </code>
                </div>
                <p className="text-[11px] text-slate-400">
                  O arquivo gerado em <code>pb_data/backups/</code> pode ser espelhado para outra
                  partição ou OneDrive corporativo.
                </p>
              </div>
            </div>
          )}

          {/* ABA 6: GITHUB & RESOLUÇÃO DE ERROS */}
          {abaGuia === 'github' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-blue-900 text-xs">
                  <RefreshCw className="w-4 h-4 text-blue-600" />
                  Sincronização com o GitHub (Cofre de Código)
                </div>
                <p className="text-blue-800 text-[11px] leading-relaxed">
                  O repositório no GitHub funciona como a fonte da verdade segura do seu código para
                  instalação e atualização no servidor Linux/Windows. Se ao sincronizar você receber
                  o erro genérico <code>fetch failed</code>, veja abaixo como resolver:
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <strong className="text-slate-900 font-semibold text-xs block">
                  1. Reconectar a Autorização do GitHub (Causa Mais Comum)
                </strong>
                <p className="text-slate-500 font-normal leading-relaxed text-xs">
                  O token de autorização entre o Skip e sua conta do GitHub pode expirar ou perder
                  permissão:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-slate-600 font-normal text-xs">
                  <li>
                    Acesse o GitHub em seu navegador e vá em{' '}
                    <strong>Settings &gt; Applications &gt; Authorized OAuth Apps</strong>.
                  </li>
                  <li>
                    Se necessário, revogue o acesso antigo e volte ao painel do Skip para clicar em{' '}
                    <strong>Conectar ao GitHub</strong> novamente.
                  </li>
                  <li>
                    Isso emite um novo token limpo e renova os certificados de comunicação com a
                    API.
                  </li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <strong className="text-slate-900 font-semibold text-xs block">
                  2. Repositório Limpo e Sem Binários Pesados
                </strong>
                <p className="text-slate-500 font-normal leading-relaxed text-xs">
                  O projeto já foi configurado para que <strong>nenhum arquivo pesado</strong> (como
                  executáveis do PocketBase, banco de dados <code>pb_data</code>, arquivos ZIP ou
                  documentos de teste) seja sincronizado, evitando timeouts de conexão (erro{' '}
                  <code>fetch failed</code> na criação de blobs).
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <strong className="text-slate-900 font-semibold text-xs block">
                  3. Permissões no Repositório Privado
                </strong>
                <p className="text-slate-500 font-normal leading-relaxed text-xs">
                  Certifique-se de que sua conta do GitHub possui permissão de{' '}
                  <strong>Write (Escrita)</strong> ou <strong>Admin</strong> no repositório
                  conectado e que ele não está bloqueado ou arquivado.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <strong className="text-slate-900 font-semibold text-xs block">
                  4. Instabilidade Temporária na API do GitHub
                </strong>
                <p className="text-slate-500 font-normal leading-relaxed text-xs">
                  O erro <code>fetch failed</code> é um erro de rede genérico do Node.js. Se a API
                  do GitHub estiver momentaneamente lenta ou sofrendo manutenção, basta aguardar 1
                  minuto e clicar novamente em <strong>Sincronizar</strong>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            <span>
              Manual detalhado completo disponível no arquivo <code>README-INSTALACAO.md</code>
            </span>
          </div>
          <Button
            size="sm"
            onClick={() => onOpenChange(false)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-xl font-medium"
          >
            Fechar Guia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
