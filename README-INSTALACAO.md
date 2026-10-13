# Guia Completo de Instalação Local no Servidor Linux

> **ATENÇÃO: este manual é anterior ao kit de produção.** Para instalar em produção use **docs/INSTALACAO-PRODUCAO.md**. Neste manual **não use** o script scripts/backup-financeiro.sh nem a rotina de backup agendado da "Opção A" de backup. O backup oficial é deploy/backup-usb.sh (cifrado, com senha digitada no teclado) e a restauração é deploy/restaurar.sh. Onde este manual divergir do docs/INSTALACAO-PRODUCAO.md, vale o docs/INSTALACAO-PRODUCAO.md.

> **Manual oficial (0.0.120): docs/operacao/00-LEIA-PRIMEIRO.md.**

> **AVISO (trechos históricos):** as partes deste manual sobre Caddy, NSSM e Windows Server, o cadastro inicial por `/cadastro` e a rotina de backup em nuvem descrevem fluxos anteriores e **não** são o procedimento de instalação do Ubuntu Server atual. Para instalar, siga **docs/INSTALACAO-PRODUCAO.md**.

> **Para quem é este guia?**  
> Este manual foi escrito especialmente para gestores, empresários e administradores que desejam instalar o sistema financeiro em um **servidor Linux próprio** na rede local da empresa, permitindo que qualquer computador Windows acesse o sistema pelo navegador web, com **100% de posse e privacidade dos dados**. Não é necessário ser especialista em TI. Siga cada etapa com calma.

---

## Sumário

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Pré-requisitos do Servidor Linux](#2-pré-requisitos-do-servidor-linux)
3. [Passo a Passo de Instalação](#3-passo-a-passo-de-instalação)
4. [Criação do Superusuário Inicial (Linha de Comando)](#4-criação-do-superusuário-inicial-linha-de-comando)
5. [Segurança de Rede: Firewall, HTTPS com Caddy e Acesso Windows](#5-segurança-de-rede-firewall-https-recomendado-caddy-e-acesso-pelas-máquinas-windows)
6. [Primeiro Acesso: Criação do Admin, Troca de Senha e Senha Mestra](#6-primeiro-acesso-criação-do-admin-troca-de-senha-e-cadastro-da-senha-mestra)
7. [Importação dos Dados da Nuvem para o Servidor Local](#7-importação-dos-dados-da-nuvem-para-o-servidor-local)
8. [Rotina Automática de Backup na Nuvem (pb_data + Google Drive/OneDrive)](#8-rotina-automática-de-backup-na-nuvem)
9. [Como Atualizar para Novas Versões e Reversão (Rollback)](#9-como-atualizar-para-novas-versões-e-reversão)
10. [Checklist Essencial de Segurança do Servidor](#10-checklist-essencial-de-segurança-do-servidor)
11. [Estudo & Guia Alternativo: Instalação no Windows Server](#11-estudo--guia-alternativo-instalação-no-windows-server)
12. [Diagnóstico e Resolução de Erros de Sincronização com o GitHub](#12-diagnóstico-e-resolução-de-erros-de-sincronização-com-o-github)
13. [Resolução de Dúvidas e Problemas Frequentes](#13-resolução-de-dúvidas-e-problemas-frequentes)

---

## 1. Visão Geral da Arquitetura

O sistema é composto por duas partes integradas de altíssimo desempenho e simplicidade:

- **PocketBase (Backend & Banco de Dados):** Um único arquivo executável em Linux que gerencia o banco de dados SQLite (`pb_data`), as regras de segurança imutáveis e serve a aplicação web.
- **Frontend Web (React + Vite):** A interface visual executiva (Dashboard, Lançamentos, Contas a Pagar/Receber, Relatórios e Auditoria) que é compilada em arquivos estáticos (`dist/`) e servida diretamente pelo PocketBase na pasta `pb_public`.
- **Clientes Windows:** Qualquer máquina Windows conectada no Wi-Fi ou cabo da empresa abre o navegador (Chrome, Edge, Firefox) e digita o IP interno do servidor (exemplo: `http://192.168.0.10:8090`). Não precisa instalar nada nas máquinas Windows!

```
+-------------------------------------------------------------+
| SERVIDOR LINUX (Local - Ex: 192.168.0.10)                   |
|                                                             |
|  +-------------------------------------------------------+  |
|  | PocketBase (Porta 8090)                               |  |
|  |  - Banco de Dados SQLite em /pb_data                  |  |
|  |  - Frontend Web compilado servido em /pb_public       |  |
|  |  - Regras de Auditoria e Imutabilidade em /pb_hooks   |  |
|  |  - Migrações das tabelas em /pb_migrations            |  |
|  +-------------------------------------------------------+  |
|                             ^                               |
+-----------------------------|-------------------------------+
                              | Rede Local (Wi-Fi / Cabo)
         +--------------------+--------------------+
         |                                         |
+------------------+                      +------------------+
| PC Windows 1     |                      | PC Windows 2     |
| (Financeiro)     |                      | (Diretoria)      |
| Abre navegador:  |                      | Abre navegador:  |
| 192.168.0.10:8090|                      | 192.168.0.10:8090|
+------------------+                      +------------------+
```

---

## 2. Pré-requisitos do Servidor Linux

### A. A Máquina Servidor

- **Sistema Operacional:** Ubuntu Server 22.04 / 24.04 LTS, Debian 11/12, ou **Linux Mint 21 (Vanessa/Vera/Victoria/Virginia - base Ubuntu 22.04) e Linux Mint 22 (Wilma - base Ubuntu 24.04)** de 64 bits.
- **Hardware mínimo recomendado:** Processador dual-core, 2 GB a 4 GB de memória RAM e 20 GB de espaço em disco SSD.
- **Funcionamento:** O computador deve ficar preferencialmente sempre ligado e conectado ao roteador por cabo de rede (Ethernet).
- **No-Break (Nobreak/UPS):** Fortemente recomendado para evitar desligamentos abruptos em caso de queda de energia na empresa.

### B. IP Fixo na Rede Local

Para que os computadores Windows sempre achem o servidor no mesmo endereço (ex: `192.168.0.10`), configure o roteador da sua empresa para fixar o IP do servidor (recurso chamado _DHCP Reservation_ ou _Fixação de IP por MAC_).

Para descobrir o IP atual do seu Linux, abra o terminal no servidor e digite:

```bash
hostname -I
```

O primeiro número exibido (exemplo: `192.168.0.10` ou `192.168.1.50`) é o IP interno do seu servidor.

### C. Programas Necessários no Servidor

Abra o terminal do servidor Linux e instale o Git, Node.js e ferramentas básicas:

```bash
# Atualize a lista de pacotes
sudo apt update && sudo apt upgrade -y

# Instale Git, curl, unzip e utilitários
sudo apt install -y git curl unzip ca-certificates build-essential

# Instale Node.js 24 LTS (recomendado)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# Verifique as versões instaladas
git --version
node -v
npm -v
```

---

## 3. Passo a Passo de Instalação

### Etapa 1: Obter o Código do Repositório Privado no GitHub (Deploy Key SSH Somente Leitura)

Por melhores práticas de segurança corporativa, **nunca** armazene senhas pessoais ou tokens com permissão de escrita no servidor de produção. Utilize uma **Deploy Key SSH somente leitura** vinculada exclusivamente ao repositório:

#### 1. Gerar o par de chaves SSH no servidor Linux:

```bash
# Gere uma chave SSH ED25519 dedicada para o servidor (pressione Enter para as perguntas padrão)
ssh-keygen -t ed25519 -C "deploy@servidor-financeiro" -f ~/.ssh/id_ed25519_deploy -N ""

# Configure o SSH para usar essa chave com o GitHub:
cat << 'EOF' >> ~/.ssh/config
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_deploy
    IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config ~/.ssh/id_ed25519_deploy

# Exiba a chave pública para cadastrar no GitHub:
cat ~/.ssh/id_ed25519_deploy.pub
```

#### 2. Cadastrar a Deploy Key no GitHub:

1. Abra o repositório no GitHub: `https://github.com/gramosvane/gest-o-financeira-rws2k17k26`.
2. Acesse **Settings > Deploy keys > Add deploy key**.
3. **Title:** `Servidor Linux Local (Somente Leitura)`.
4. **Key:** Cole o conteúdo de `cat ~/.ssh/id_ed25519_deploy.pub`.
5. **Permissão de escrita:** Deixe a caixa _"Allow write access"_ **DESMARCADA** (somente leitura para proteger o repositório).
6. Clique em **Add key**.

#### 3. Clonar o repositório via SSH:

```bash
# Crie a pasta e acesse
mkdir -p /var/www
cd /var/www

# Teste a autenticação SSH com o GitHub:
ssh -T git@github.com

# Clone o repositório privado via SSH (somente leitura):
git clone git@github.com:gramosvane/gest-o-financeira-rws2k17k26.git gestao-financeira

# Entre na pasta do projeto
cd /var/www/gestao-financeira
```

---

### Etapa 2: Baixar o PocketBase para Linux

Na pasta do projeto, baixe o executável oficial do PocketBase para Linux AMD64 (ou ARM64 se for Raspberry Pi):

```bash
cd /var/www/gestao-financeira

# Baixar a versão oficial recomendada do PocketBase (v0.26.6 alinhada ao package.json SDK ~0.26.9)
curl -L -o pocketbase.zip https://github.com/pocketbase/pocketbase/releases/download/v0.26.6/pocketbase_0.26.6_linux_amd64.zip

# Descompactar
unzip pocketbase.zip pocketbase
rm pocketbase.zip

# Dar permissão de execução
chmod +x pocketbase
```

---

### Etapa 3: Vincular as Migrações e Hooks do Projeto

O projeto traz a estrutura completa de todas as tabelas e regras em JavaScript prontas, cobrindo:

- **Coleções do Banco de Dados:** `empresas`, `contas`, `categorias` (com classificação contábil DRE), `departamentos`, `lancamentos` (com `empresa_id`, `liquidacao_de`, `estorno_de` e `departamento`), `patrimonio` (ativos e passivos), `auditoria` (blindada com regras nulas) e `configuracoes`.
- **Hooks Server-side Obrigatórios (`pb_hooks/`):**
  1. `audit_lancamento.js`: Intercepta rotas e operações financeiras, impondo edição controlada com motivo obrigatório e registrando histórico ANTES/DEPOIS;
  2. `audit_login.js`: Registra eventos de autenticação de usuários;
  3. `audit_registros.js` e `audit_restaurar_registro.js`: Controlam a listagem e restauração protegida da trilha de auditoria via token `x-audit-token` (preservando usuário original e timestamp original);
  4. `verify_master_password.js`: Implementa o cadastro e a verificação da Senha Mestra com KDF + salt criptográfico 100% server-side no primeiro acesso (não existe mais senha de fábrica nem credencial pré-semeada; o hash e o salt **nunca** são enviados ao navegador nem incluídos em backups JSON).

```bash
cd /var/www/gestao-financeira

# Crie links simbólicos ou copie as pastas para onde o executável do PocketBase procura:
# O PocketBase busca por pb_migrations e pb_hooks na mesma pasta do executável
ln -sfn ./server/pb_migrations pb_migrations
ln -sfn ./server/pb_hooks pb_hooks
```

> ⚠️ **Atenção aos Hooks Obrigatórios (`pb_hooks/` e `pb_migrations/`):** Tanto as migrações (`pb_migrations/`) quanto os hooks server-side (`pb_hooks/`) são **estritamente obrigatórios** na instalação. Eles garantem:
>
> 1. Auditoria blindada server-side (regras nulas para exclusão física em `lancamentos` e `auditoria`);
> 2. Endpoints protegidos para cadastro e verificação de Senha Mestra sem senha de fábrica;
> 3. Política de edição controlada de lançamentos com motivo obrigatório (mínimo de 5 caracteres) gerando registro ANTES/DEPOIS/USUÁRIO/DATA-HORA/MOTIVO;
> 4. Restauração fiel de auditoria com autor e data originais;
> 5. Certifique-se de que ambos os diretórios estejam vinculados (`pb_migrations` e `pb_hooks`) na raiz do executável do PocketBase com permissão de leitura para o usuário de serviço.

---

### Etapa 4: Configurar a Variável de Ambiente e Gerar o Build do Frontend

O frontend React precisa saber em qual endereço ele se comunica. Crie o arquivo `.env.production` no servidor apontando para o IP local do servidor na porta `8090` (ou deixe vazio para ele usar a mesma origem do navegador):

```bash
cd /var/www/gestao-financeira

# Crie o arquivo de variáveis de ambiente do frontend
# Se o servidor for acessado por http://192.168.0.10:8090, informe esse endereço:
echo "VITE_POCKETBASE_URL=http://192.168.0.10:8090" > .env.production
```

_(Substitua `192.168.0.10` pelo IP real do seu servidor Linux)._

Agora instale as dependências e faça o build do site:

```bash
# Se existir o arquivo package-lock.json no repositório clonado:
npm ci

# Se NÃO existir o package-lock.json:
# AVISO: package-lock.json ausente — instalação não reproduzível; versões de dependências podem variar
npm install

# Compilar a interface web para produção
npm run build
```

O comando criará a pasta `dist/` com o frontend otimizado.

---

### Etapa 5: Conectar o Frontend ao PocketBase (`pb_public`)

O PocketBase serve automaticamente qualquer site estático colocado na pasta `pb_public`. Basta criar um link simbólico:

```bash
cd /var/www/gestao-financeira

# Liga a pasta dist compilada à pasta pb_public do PocketBase
ln -sfn ./dist pb_public
```

Pronto! Agora o próprio PocketBase serve tanto o sistema web quanto a API no mesmo IP e porta!

---

### Etapa 6: Criar Usuário do Sistema e Serviço no Linux (systemd sem Root)

Por melhores práticas de segurança corporativa (princípio do menor privilégio), o serviço do PocketBase **NUNCA deve rodar como `root`**. Crie um usuário de sistema dedicado chamado `financeiro` e configure a propriedade dos arquivos:

```bash
# 1. Criar usuário de sistema sem permissão de login interativo
sudo useradd -r -s /bin/false -d /var/www/gestao-financeira financeiro || true

# 2. Ajustar permissões para o usuário financeiro
sudo chown -R financeiro:financeiro /var/www/gestao-financeira
sudo chmod -R 750 /var/www/gestao-financeira
```

Agora crie o unit file do `systemd`:

```bash
sudo nano /etc/systemd/system/gestao-financeira.service
```

Cole o conteúdo abaixo no arquivo:

```ini
[Unit]
Description=Gestao Financeira PocketBase Server (v0.26.6)
Documentation=https://github.com/gramosvane/gest-o-financeira-rws2k17k26
After=network.target

[Service]
Type=simple
User=financeiro
Group=financeiro
WorkingDirectory=/var/www/gestao-financeira
# PocketBase v0.26.6 unificado com SDK pocketbase ~0.26.9
# Se utilizar o proxy reverso Caddy com HTTPS recomendado (Capítulo 5.B),
# o PocketBase escuta apenas localmente em 127.0.0.1:8090:
ExecStart=/var/www/gestao-financeira/pocketbase serve --http=127.0.0.1:8090
# (Se não utilizar proxy reverso, substitua por: --http=0.0.0.0:8090)
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

Salve pressionando `Ctrl + O`, depois `Enter`, e saia com `Ctrl + X`.

Agora ative e inicie o serviço:

```bash
sudo systemctl daemon-reload
sudo systemctl enable gestao-financeira
sudo systemctl start gestao-financeira

# Verifique se o status está ativo ("active (running)"):
sudo systemctl status gestao-financeira
```

---

## 4. Criação do Superusuário Inicial (Linha de Comando)

> 🔐 **Importante — Segurança Absoluta de Credenciais:**  
> O PocketBase não possui usuários ou superusuários pré-configurados no repositório. O superusuário administrativo é criado **exclusivamente via terminal no momento do setup**, informando um e-mail institucional e uma senha forte escolhida por você. **A senha NUNCA deve ser gravada no repositório Git, em arquivos de configuração públicos ou em scripts versionados.**

Para criar o superusuário inicial do painel de administração (`/_/`):

```bash
cd /var/www/gestao-financeira

# Comando interativo de criação do superusuário do PocketBase:
# Substitua seu-email@empresa.com e sua SENHA_FORTE diretamente no momento da execução:
./pocketbase superuser create EMAIL SENHA
```

**Exemplo prático de execução:**

```bash
./pocketbase superuser create ti@minhaempresa.com.br MinhaSenhaForte2026!
```

> 💡 **Nota de Uso:**
>
> - Esse comando cria o acesso ao painel de administração do PocketBase (`/_/`).
> - Esse passo é executado **obrigatoriamente ANTES** de agendar rotinas de backup, criar os primeiros usuários de sistema ou importar bases legadas.
> - Se preferir não expor a senha no histórico do bash, execute apenas `./pocketbase superuser create` sem argumentos — o PocketBase solicitará e-mail e senha de forma mascarada.

---

## 5. Segurança de Rede: Firewall, HTTPS Recomendado (Caddy) e Acesso pelas Máquinas Windows

### A. Restringir o Firewall (UFW) Apenas à Sub-rede Local (com Nota Especial para Linux Mint)

> 💡 **Atenção especial para Linux Mint 21 e 22:** Por padrão, o Linux Mint vem com o firewall `ufw` **desativado**. É indispensável ativá-lo explicitamente com `sudo ufw enable` após adicionar as regras.

Para impedir que computadores de outras redes ou portas indesejadas acessem o sistema, configure o firewall `ufw` para autorizar a porta 8090 exclusivamente a partir da sua faixa de IP interna:

```bash
# 1. Habilitar SSH primeiro para evitar perda de acesso remoto
sudo ufw allow ssh

# 2. Permite tráfego na porta do PocketBase apenas da sua rede local (ex: 192.168.0.0/24 ou 10.0.0.0/24):
sudo ufw allow from 192.168.0.0/24 to any port 8090 proto tcp

# Se usar Nginx reverso na porta 80/443:
sudo ufw allow from 192.168.0.0/24 to any port 80 proto tcp
sudo ufw allow from 192.168.0.0/24 to any port 443 proto tcp

# 3. Ativar e verificar o firewall (obrigatório no Linux Mint onde vem inativo por padrão):
sudo ufw enable
sudo ufw status verbose
```

### B. HTTPS com Proxy Reverso (Caddy com `tls internal`) — CAMINHO RECOMENDADO

Acessar sistemas financeiros via HTTP puro expõe credenciais e relatórios contábeis à interceptação na rede local (sniffing de Wi-Fi/cabos). A configuração de **HTTPS automático com o Caddy** é extremamente simples e recomendada:

1. **Instale o Caddy no servidor:**

   ```bash
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update
   sudo apt install -y caddy
   ```

2. **Configure o Caddyfile:**
   Edite o arquivo `/etc/caddy/Caddyfile`:

   ```bash
   sudo nano /etc/caddy/Caddyfile
   ```

   Substitua o conteúdo por:

   ```caddy
   # Configuração para o IP do seu servidor local com certificado TLS interno automático
   192.168.0.10 {
       tls internal
       reverse_proxy 127.0.0.1:8090
   }
   ```

   _(Substitua `192.168.0.10` pelo IP real do seu servidor)._

3. **Recarregue o Caddy:**

   ```bash
   sudo systemctl restart caddy
   sudo systemctl enable caddy
   ```

4. **Acesso Criptografado pelas Máquinas Windows:**
   Nas máquinas Windows da empresa, acesse:
   ```text
   https://192.168.0.10
   ```
   Todo o tráfego de senhas, lançamentos e auditoria agora é criptografado por TLS de ponta a ponta.

### C. Acessando a partir de qualquer Máquina Windows

1. No computador Windows, conecte-se à mesma rede (Wi-Fi ou cabo da empresa).
2. Abra o navegador (Google Chrome, Microsoft Edge ou Mozilla Firefox).
3. Na barra de endereços, digite:
   ```text
   http://192.168.0.10:8090
   ```
   _(Substitua `192.168.0.10` pelo IP que você identificou no servidor)._
4. A tela de Login executiva do sistema aparecerá imediatamente.
5. **Dica:** No Windows, clique na estrela do navegador para adicionar aos **Favoritos**, ou clique com botão direito na área de trabalho > _Novo Atalho_ com esse endereço para facilitar o acesso diário dos colaboradores.

---

## 6. Primeiro Acesso: Criação do Admin, Troca de Senha e Cadastro da Senha Mestra

### Checklist do Primeiro Acesso do Usuário Final:

1. **Criar o Primeiro Administrador:** Ao inicializar a base vazia, o primeiro usuário a se registrar via `/cadastro` recebe automaticamente o papel imutável de `administrador`. Os próximos usuários criados assumirão o papel restrito de `operador`.
2. **Definição / Troca de Senha Segura:** Caso o usuário acesse pela primeira vez com credenciais provisórias ou deseje atualizar sua chave de acesso pessoal, deve ir em **Configurações > Meu Perfil** e alterar sua senha (mínimo de 8 caracteres com combinação alfanumérica).
3. **Cadastrar a Senha Mestra Corporativa Exclusiva:** Na aba **Configurações > Senha Mestra (Auditoria)**, cadastre a senha mestra da empresa (o campo de senha atual fica em branco no 1º cadastro).

---

### A. Criação do Primeiro Usuário Administrador

Por segurança corporativa e conformidade com as melhores práticas de auditoria, **o sistema NÃO vem com nenhum usuário, e-mail ou senha pré-semeados**. Não há credenciais padrão de fábrica.

1. No seu navegador, acesse o endereço do sistema (`http://192.168.0.10:8090` ou via HTTPS configurado no Caddy).
2. Acesse diretamente o endereço `/cadastro` (o botão "Criar conta" foi removido da tela de login na versão 0.0.117).
3. Preencha seu nome completo, e-mail corporativo institucional e defina uma senha forte (mínimo de 8 caracteres, combinando letras, números e símbolos).
4. O primeiro usuário cadastrado passa a ser o administrador responsável da empresa com privilégios de gestão total.

### B. Cadastro da Senha Mestra Exclusiva (Sem Senha Padrão)

O sistema possui uma camada criptográfica adicional chamada **Senha Mestra**, utilizada para autorizar acesso ao painel imutável de auditoria, desbloquear estornos e proteger operações de alta sensibilidade.

**Arquitetura Criptográfica Server-Side:**

- A verificação e o armazenamento da Senha Mestra utilizam derivação de chave criptográfica segura (**KDF + salt server-side**).
- O hash e o salt residem estritamente no backend PocketBase: **o hash nunca é exposto ao navegador nem transferido no backup JSON**.
- As requisições de autorização de auditoria utilizam tokens temporários assinados (`x-audit-token`) válidos apenas para a sessão ativa.

**Política de Edição Controlada:**

> **"Edição controlada permitida com motivo obrigatório (≥ 5 caracteres) — toda alteração gera registro de auditoria ANTES/DEPOIS/USUÁRIO/DATA-HORA/MOTIVO. Exclusão proibida. Estorno para cancelamentos financeiros."**
>
> Nenhuma movimentação financeira pode ser excluída fisicamente do banco de dados (as regras de exclusão em `lancamentos` e `auditoria` são nulas/bloqueadas no backend). Caso um lançamento tenha sido lançado incorretamente, a operação contábil padrão é o **estorno**, que cria o lançamento compensatório correlato e mantém o histórico 100% rastreável. Em caso de edição de campos permitidos, o preenchimento de um motivo explicativo com no mínimo 5 caracteres é obrigatório tanto na interface quanto validado server-side, e um registro de auditoria com os valores ANTES, os valores DEPOIS, o ID do usuário, a data/hora UTC e a justificativa é gravado perpetuamente.

**IMPORTANTE: Não existe senha mestra padrão de fábrica.** Você deve cadastrar uma senha mestra exclusiva no primeiro uso:

1. Faça login com o seu usuário administrador recém-criado.
2. No menu lateral, acesse **Configurações**.
3. Clique na aba **Senha Mestra (Auditoria)**.
4. Como é o primeiro cadastro, deixe o campo _Senha Mestra Atual_ **em branco**.
5. Nos campos _Nova Senha Mestra_ e _Confirmar Nova Senha Mestra_, digite uma senha mestre forte e exclusiva (mínimo 8 caracteres, ideal 16+ caracteres).
6. Clique em **Salvar Nova Senha Mestra**. O sistema processará o KDF com salt server-side e salvará a proteção blindada.
7. Guarde essa chave em local seguro (cofre físico ou gerenciador de senhas corporativo). A senha mestra não é enviada nem recuperada por e-mail por princípio de blindagem criptográfica.

---

## 7. Importação dos Dados da Nuvem para o Servidor Local

Se você já estava utilizando o sistema na nuvem e quer migrar todas as informações para o servidor local:

### A. Escopo Completo das Coleções no Backup JSON

O backup JSON gerado exporta e restaura **todas as 8 coleções do ecossistema financeiro**, preservando os campos de controle estrutural:

1. **`empresas`**: Cadastros de empresas, CNPJs e sinalização de empresa padrão;
2. **`contas`**: Contas bancárias, caixas e cartões, com saldo inicial e vinculação a `empresa_id`;
3. **`categorias`**: Categorias de receitas e despesas com a **classificação contábil DRE estrutural** (`receita_bruta`, `deducoes_tributos`, `custos_variaveis`, `despesas_operacionais`, `investimento_capex`, `receita_financeira`, `despesa_financeira`);
4. **`departamentos`**: Departamentos organizacionais da empresa;
5. **`lancamentos`**: Movimentações financeiras com preservação estrita de `empresa_id`, `liquidacao_de` (vínculo de liquidação de contas a pagar/receber) e `estorno_de` (rastreabilidade de estornos);
6. **`patrimonio`**: Ativos circulantes/não-circulantes e passivos da empresa (base para liquidez seca e patrimônio líquido);
7. **`auditoria`**: Trilha perpétua de eventos do sistema, com restauração fiel do autor original e timestamp original;
8. **`configuracoes`**: Parâmetros do sistema (o hash da senha mestra nunca é exportado no JSON).

### B. Restauração Fiel da Auditoria

Diferente de sistemas que sobrescrevem o autor do histórico com o usuário que está operando a importação e geram novos timestamps `created`, o processo de restauração:

- Preserva o **ID do usuário original** que executou cada ação auditada no passado;
- Preserva a **data e hora original (timestamp UTC)** do evento histórico auditado;
- Utiliza o endpoint server-side de restauração (`audit_restaurar_registro.js` com `x-audit-token`) ou metadados de histórico imutáveis, garantindo compliance total e auditoria forense válida.

### C. Procedimento de Migração

1. **Na versão Nuvem:**
   - Faça login no sistema na nuvem.
   - Vá em **Configurações > Controle de Dados**.
   - No bloco _Backup Completo do Sistema (JSON)_, clique no botão azul **Baixar backup completo (JSON)**.
   - O arquivo `backup-gestao-financeira-AAAA-MM-DD.json` será baixado no seu computador contendo as 8 coleções.

2. **No seu Servidor Local:**
   - Abra o sistema local no navegador (`http://192.168.0.10:8090` ou via HTTPS configurado no Caddy).
   - Faça login com seu usuário administrador.
   - Vá em **Configurações > Controle de Dados**.
   - No bloco _Restaurar Backup (JSON)_, clique em **Selecionar Arquivo JSON** e selecione o arquivo baixado.
   - Uma tela de confirmação com preview detalhado mostrará a contagem exata por coleção: **Empresas, Contas, Categorias, Departamentos, Lançamentos, Patrimônio, Auditoria e Configurações**.
   - Clique em **Confirmar e Restaurar**.
   - O sistema importará todos os dados com proteção automática contra duplicidade. Ao final, uma tabela detalhada exibirá os novos itens inseridos e os registros já existentes que foram mantidos intactos.

---

## 8. Rotina Automática de Backup na Nuvem

Todos os dados, cadastros, usuários e auditorias do sistema residem em **uma única pasta** no servidor Linux:

```text
/var/www/gestao-financeira/pb_data
```

Basta manter uma cópia de segurança dessa pasta para ter o sistema 100% protegido contra qualquer defeito no hardware do servidor.

### Opção A: Backup Automatizado com Rclone (Google Drive ou OneDrive)

> **OBSOLETO, NÃO EXECUTAR:** esta Opção A (copiar scripts/backup-financeiro.sh para /usr/local/bin e agendá-lo no cron) **não faz parte do procedimento homologado** e esse script passa um token de superusuário como argumento de linha de comando (visível na lista de processos do servidor). Use o procedimento oficial de backup e restauração do docs/INSTALACAO-PRODUCAO.md (deploy/backup-usb.sh e deploy/restaurar.sh).

O `rclone` é um programa gratuito e seguro para Linux que envia pastas para a sua conta corporativa do Google Drive, Microsoft OneDrive, Dropbox ou AWS S3.

1. **Instale o rclone no servidor:**

   ```bash
   sudo apt install -y rclone
   rclone config
   ```

   _(Siga o assistente interativo na tela para conectar sua conta do Google Drive ou OneDrive com o nome `meudrive`)._

2. **Utilize o script de backup nativo consistente:**

   O projeto já inclui o script seguro `scripts/backup-financeiro.sh`. Diferente de zipar a pasta `pb_data` com o banco em uso (o que causaria corrupção do SQLite por escritas concorrentes em WAL), este script utiliza o comando nativo `./pocketbase backup create`, gerando um snapshot atômico e íntegro.

   Copie o script para o diretório de utilitários do sistema:

   ```bash
   sudo cp /var/www/gestao-financeira/scripts/backup-financeiro.sh /usr/local/bin/backup-financeiro.sh
   sudo chmod +x /usr/local/bin/backup-financeiro.sh
   ```

   Conteúdo do script (`/usr/local/bin/backup-financeiro.sh`):

   ```bash
   #!/bin/bash
   set -e

   PB_DIR="/var/www/gestao-financeira"
   BACKUP_DIR="$PB_DIR/pb_data/backups"
   RCLONE_REMOTE="meudrive:Backups_Financeiro"
   DATA=$(date +%Y-%m-%d_%H-%M-%S)
   BACKUP_NAME="backup_${DATA}.zip"

   cd "$PB_DIR"

   # 1. Snapshot seguro via parada temporária ou API de backups
   # Executado de forma atômica e criptografado com AES-256 via scripts/backup-financeiro.sh

   BACKUP_FILE="$BACKUP_DIR/$BACKUP_NAME"

   # 2. Sincronização segura para a nuvem via rclone
   if command -v rclone &> /dev/null; then
       rclone copy "$BACKUP_FILE" "$RCLONE_REMOTE/"
       # 3. Retenção de 30 dias na nuvem
       rclone delete --min-age 30d "$RCLONE_REMOTE/"
   fi

   # 4. Retenção de 30 dias no disco local
   find "$BACKUP_DIR" -name "backup_*.zip" -type f -mtime +30 -delete 2>/dev/null || true
   ```

3. **Agendar para rodar toda noite às 23:00 (via crontab):**
   ```bash
   sudo crontab -e
   ```
   Adicione ao final do arquivo:
   ```cron
   0 23 * * * /usr/local/bin/backup-financeiro.sh > /dev/null 2>&1
   ```
   Pronto! Toda noite um arquivo zip novo com a base completa será enviado para o seu drive na nuvem.

### Opção B: Backup Manual Semanal via App

Como redundância, todo final de semana o responsável financeiro pode acessar o sistema no navegador, entrar em **Configurações > Controle de Dados** e clicar em **Baixar backup completo (JSON)**, guardando o arquivo em um pen drive ou computador pessoal.

---

## 9. Como Atualizar para Novas Versões e Reversão

Quando houver uma melhoria ou atualização no repositório GitHub do projeto:

### Para Atualizar (Update):

No servidor Linux, execute a sequência simples:

```bash
cd /var/www/gestao-financeira

# 1. Puxar o código mais recente do GitHub
git pull origin main

# 2. Instalar eventuais novos pacotes e reconstruir o site
# Se existir package-lock.json:
npm ci
# Se NÃO existir package-lock.json:
# AVISO: package-lock.json ausente — instalação não reproduzível; versões de dependências podem variar
npm install

npm run build

# 3. Reiniciar o serviço do PocketBase
sudo systemctl restart gestao-financeira
```

> **IMPORTANTE:** O comando `git pull` e o `npm run build` atualizam apenas os arquivos do código do sistema. A pasta do banco de dados `pb_data` **NUNCA** é tocada, sobrescrita ou apagada. Todos os seus lançamentos, saldos e históricos permanecem intactos.

### Para Reverter em Caso de Emergência (Rollback):

Se por qualquer motivo a versão nova do frontend/código apresentar algum comportamento indesejado, faça o checkout de uma **versão tagueada estável** (ou branch principal) e reinicie o serviço:

```bash
cd /var/www/gestao-financeira

# 1. Listar versões lançadas (tags oficiais)
git tag -l

# 2. Fazer checkout da versão estável desejada (exemplo: beta-0.0.117-final)
git checkout beta-0.0.117-final

# 3. Reinstalar dependências limpas e recompilar o frontend
npm ci
npm run build

# 4. Reiniciar o serviço do sistema
sudo systemctl restart gestao-financeira
```

> ⚠️ **AVISO CRÍTICO SOBRE MIGRAÇÕES DE BANCO DE DADOS:**
>
> - As migrações do PocketBase (`pb_migrations`) são **aditivas e versionadas**. O comando `git checkout HEAD~1` **NÃO DESFAZ migrações aplicadas no banco de dados SQLite** e deixa o repositório em estado "detached HEAD" inconsistente.
> - **Nunca use `git checkout HEAD~1` para desfazer alterações de banco de dados.**
> - Caso uma migração recente precise ser revertida no banco, restaure o backup nativo imediatamente anterior (`./pocketbase backup restore backup_AAAA-MM-DD.zip` com o serviço parado) ou aplique uma nova migração corretiva aditiva.

---

## 10. Checklist Essencial de Segurança do Servidor

Para garantir que suas informações financeiras estejam protegidas contra ameaças externas e falhas físicas:

- [ ] **1. Senha do Servidor Linux:** Certifique-se de que a conta `root` e o usuário do servidor Linux possuem senhas fortes e sem repetição.
- [ ] **2. Acesso Restrito à Rede Interna:** O roteador da empresa **NÃO** deve fazer redirecionamento de portas (port forwarding) da porta 8090 para a internet aberta sem VPN. O sistema deve ser acessível apenas para quem está conectado dentro da empresa.
- [ ] **3. Primeiro Usuário Criado:** A conta de administrador foi criada pelo responsável no primeiro acesso, sem senhas padrão pré-existentes.
- [ ] **4. Senha Mestra Exclusiva Cadastrada:** A senha mestra corporativa foi definida na aba Configurações > Senha Mestra e guardada em cofre seguro.
- [ ] **5. Sistema Operacional Atualizado:** Agende atualizações de segurança regulares no Linux (`sudo apt update && sudo apt upgrade -y`).
- [ ] **6. No-break (Nobreak) Conectado:** O servidor está ligado a um nobreak com bateria para evitar corrupção de arquivos por falta súbita de energia.
- [ ] **7. Rotina de Backup Ativa:** O backup automático noturno para a nuvem (Google Drive/OneDrive) ou a exportação JSON periódica está funcionando e foi testada.

---

## 11. Estudo & Guia Alternativo: Instalação no Windows Server

> 💡 **Nota Estratégica:** O sistema de gestão financeira foi concebido prioritariamente para ambientes Linux pela estabilidade e custo de licença zero. No entanto, o **PocketBase roda de forma nativa e oficial no Windows** (através do executável pré-compilado `pocketbase_windows_amd64.zip`), e o frontend é 100% estático (`dist/` servido em `pb_public`). Portanto, **o Windows Server é uma alternativa perfeitamente viável**.

Abaixo está o guia completo para operar em uma máquina dedicada com Windows Server 2016, 2019 ou 2022.

---

### A. Download do Executável Nativo do PocketBase para Windows

1. Acesse o release oficial do PocketBase (ou utilize versão equivalente do projeto):
   - Arquivo: `pocketbase_X.X.X_windows_amd64.zip`
2. Crie um diretório permanente no servidor Windows, por exemplo:
   ```text
   C:\GestaoFinanceira\
   ```
3. Extraia o executável `pocketbase.exe` nessa pasta.
4. Clone ou copie o repositório para `C:\GestaoFinanceira\app` e copie as pastas essenciais para o diretório raiz do PocketBase:
   - `pb_migrations\` (todas as migrações JavaScript do banco)
   - `pb_hooks\` (todos os gatilhos server-side de blindagem e auditoria)
   - `pb_public\` (arquivos compilados do frontend gerados pelo `npm run build`)

---

### B. Registro como Serviço do Windows (Início Automático via NSSM ou WinSW)

Para que o sistema continue rodando mesmo após reinicialização do Windows Server ou sem nenhum usuário logado na área de trabalho:

#### Opção Recomendada: NSSM (Non-Sucking Service Manager)

1. Baixe o utilitário [NSSM](https://nssm.cc/download) e coloque em `C:\GestaoFinanceira\nssm.exe`.
2. Abra o **Prompt de Comando (CMD) ou PowerShell como Administrador**.
3. Execute o comando de instalação:
   ```cmd
   C:\GestaoFinanceira\nssm.exe install GestaoFinanceira "C:\GestaoFinanceira\pocketbase.exe" "serve --http=0.0.0.0:8090"
   ```
4. Configure o diretório de trabalho:
   ```cmd
   C:\GestaoFinanceira\nssm.exe set GestaoFinanceira AppDirectory "C:\GestaoFinanceira"
   ```
5. Inicie o serviço:
   ```cmd
   net start GestaoFinanceira
   ```
6. O serviço agora iniciará automaticamente junto com o Windows Server.

---

### C. Configuração de Rede & Firewall do Windows (Windows Defender Firewall)

Para que outras máquinas da rede interna acessem o sistema financeiro na porta 8090:

1. Abra o **PowerShell como Administrador** e execute:
   ```powershell
   # Libera a porta 8090 TCP no perfil Privado (rede interna da empresa):
   New-NetFirewallRule -DisplayName "Gestao Financeira PB" -Direction Inbound -LocalPort 8090 -Protocol TCP -Action Allow -Profile Private
   ```
2. **IP Fixo:** Configure o Windows Server com IP estático no adaptador de rede (ex.: `192.168.0.10`).
3. As estações clientes poderão acessar via navegador: `http://192.168.0.10:8090`.

---

### D. Rotina de Backup Agendada no Windows Server (Task Scheduler + PowerShell)

Para garantir a mesma integridade atômica do SQLite sem corrupção de concorrência:

1. Crie o script `C:\GestaoFinanceira\backup-financeiro.ps1`:

   ```powershell
   $PB_DIR = "C:\GestaoFinanceira"
   $BACKUP_DIR = "$PB_DIR\pb_data\backups"
   $DATA = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
   $BACKUP_NAME = "backup_${DATA}.zip"

   Set-Location $PB_DIR

   # 1. Snapshot nativo atômico consistente com a CLI do PocketBase
   & .\pocketbase.exe backup create $BACKUP_NAME

   # 2. Copiar para pasta corporativa de rede ou Google Drive / OneDrive sincronizado
   $DESTINO = "D:\Backups_Financeiro"
   if (Test-Path $DESTINO) {
       Copy-Item "$BACKUP_DIR\$BACKUP_NAME" -Destination "$DESTINO\"
   }

   # 3. Limpeza de backups com mais de 30 dias
   Get-ChildItem -Path $BACKUP_DIR -Filter "backup_*.zip" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item
   ```

2. Abra o **Agendador de Tarefas do Windows (Task Scheduler)**.
3. Crie uma Tarefa Básica:
   - **Nome:** "Backup Diário Gestão Financeira"
   - **Disparador:** Diariamente às 23:00
   - **Ação:** Iniciar um programa: `powershell.exe`
   - **Argumentos:** `-ExecutionPolicy Bypass -File "C:\GestaoFinanceira\backup-financeiro.ps1"`
   - Marque a opção: _"Executar estando o usuário conectado ou não"_ e com privilégios elevados.

---

### E. Conclusão sobre Windows Server

- **Desempenho:** Idêntico ao Linux para as cargas de pequenas e médias empresas (o binário Go possui excelente compilação nativa no Windows).
- **Frontend:** O build React/Vite roda em qualquer máquina (Windows, Mac ou Linux) gerando a pasta estática `dist/` que é servida pelo PocketBase sem qualquer adaptação.
- **Vantagem para a empresa:** Permite aproveitar servidores e infraestrutura Windows Server já existentes na rede local sem custo adicional de setup.

---

## 12. Diagnóstico e Resolução de Erros de Sincronização com o GitHub

Se ao sincronizar o projeto com o GitHub você receber a mensagem genérica `fetch failed`:

### O que significa `fetch failed`?

Esse erro ocorre no lado do cliente ou do servidor de automação que tenta se comunicar com a API do GitHub via HTTP/HTTPS e não obtém resposta. As causas mais comuns são:

1. **Token de Acesso / Autorização Expirado ou Revogado:**
   - A autorização OAuth do GitHub ou o Personal Access Token da integração expirou.
   - **Solução:** No painel do GitHub (`Settings > Applications > Authorized OAuth Apps` ou `GitHub Apps`), revogue e reconecte a integração no painel da plataforma para emitir um novo token limpo.

2. **Repositório Bloqueado ou Mudança de Visibilidade / Permissão:**
   - Se o repositório foi renomeado, transferido para outra organização ou suas credenciais de permissão foram reduzidas.
   - **Solução:** Confirme que o repositório ainda existe com o mesmo nome exato e que seu usuário possui permissão de leitura e escrita (`Admin` ou `Write`).

3. **Arquivos Binários Grandes no Repositório:**
   - O Git e a API REST do GitHub (criação de blobs/commits) possuem limites rígidos de tempo de resposta (timeout) e tamanho por payload (máximo 25 MB - 50 MB por chamada de blob).
   - Pastas como `pb_data/`, `pocketbase` (executável binário de ~40MB), snapshots ZIP ou documentos pesados nunca devem entrar no repositório. O `.gitignore` do projeto foi blindado para garantir que apenas código-fonte, migrações e documentação sejam versionados.

4. **Instabilidade de Rede Temporária no GitHub:**
   - A API do GitHub (`api.github.com`) pode apresentar indisponibilidade transitória ou rate-limiting. Nesses casos, aguardar 1 a 2 minutos e clicar novamente em **Sincronizar com GitHub** resolve a conexão.

---

## 13. Resolução de Dúvidas e Problemas Frequentes

### P: Uma máquina Windows não consegue abrir a página `http://192.168.0.10:8090`. O que verificar?

1. **Rede Wi-Fi de Visitantes:** Verifique se o computador Windows não está conectado em uma rede Wi-Fi separada ("Visitantes"). Ele precisa estar na mesma rede do servidor.
2. **IP do Servidor:** Verifique se o IP do servidor não mudou. Digite `hostname -I` no Linux para conferir.
3. **Firewall do Linux:** No servidor, digite `sudo ufw status`. Se estiver ativo, confirme que a regra restringe à sua sub-rede: `sudo ufw allow from 192.168.0.0/24 to any port 8090 proto tcp`.
4. **Status do Serviço:** Digite `sudo systemctl status gestao-financeira`. O status deve estar verde e exibindo `active (running)`.

### P: Como reiniciar o sistema se o servidor travar?

Basta digitar no terminal do Linux:

```bash
sudo systemctl restart gestao-financeira
```

### P: Se o servidor queimar ou for roubado, perco meus dados?

**Não!** Se a rotina de backup (Capítulo 8) estiver ativa, basta pegar um computador novo, instalar o PocketBase e restaurar a pasta `pb_data` ou importar o arquivo `backup-gestao-financeira-*.json`. O sistema voltará exatamente como estava no último backup.
