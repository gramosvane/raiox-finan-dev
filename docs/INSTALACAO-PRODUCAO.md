> **Versão 0.0.120:** o manual oficial de instalação e operação está em **docs/operacao/** (instalador `deploy/instalar-producao.sh`, preparação do servidor `deploy/preparar-host.sh`, go-live, backup externo, atualização e recuperação). Este guia fica como referência detalhada dos passos.

# Raio-X Financeiro - Instalação de Produção

Guia para instalar o sistema num servidor dedicado, com acesso externo seguro.

Arquitetura:

- Ubuntu Server 24.04 LTS, dedicado ao sistema.
- PocketBase como serviço automático (`raiox`), respondendo só dentro do servidor (`127.0.0.1:8090`).
- Acesso de fora pelo Cloudflare Tunnel + Cloudflare Access: nenhuma porta aberta no roteador; antes da tela de login, a pessoa confirma a identidade por código enviado a um e-mail autorizado.
- Firewall fechado; SSH só pela rede local, com chave.
- Backup manual em pen drive, com conferência SHA-256 e teste de restauração.

Nunca colocar no repositório: `pb_data`, `.env.production`, senhas, chaves, tokens do Cloudflare ou backups.

## 1. Sistema operacional

1. Instale o Ubuntu Server 24.04 LTS (marque "Install OpenSSH server" durante a instalação).
2. No roteador, reserve um IP fixo para o servidor (reserva DHCP pelo endereço MAC).
3. Atualize e instale as ferramentas:

```
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y curl unzip git python3 ufw gnupg
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

## 2. SSH com chave e firewall

No computador do administrador (Windows PowerShell):

```
ssh-keygen -t ed25519
type $HOME\.ssh\id_ed25519.pub | ssh USUARIO@IP_DO_SERVIDOR "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"
```

Confirme que entra sem senha (`ssh USUARIO@IP_DO_SERVIDOR`). Só então, no servidor:

```
echo -e "PasswordAuthentication no\nPermitRootLogin no" | sudo tee /etc/ssh/sshd_config.d/01-raiox.conf
sudo systemctl restart ssh
```

Firewall (troque pela faixa da sua rede local):

```
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.15.0/24 to any port 22 proto tcp
sudo ufw enable
sudo ufw status verbose
```

Nenhuma outra porta é liberada: o Cloudflare Tunnel usa só conexões de saída.

## 3. Usuário do sistema e instalação

```
sudo useradd --system --create-home --home-dir /opt/raiox --shell /usr/sbin/nologin raiox
sudo -u raiox -H git clone URL_DO_REPOSITORIO /opt/raiox/app
cd /opt/raiox/app
echo "VITE_POCKETBASE_URL=/" | sudo -u raiox tee .env.production
```

`VITE_POCKETBASE_URL=/` faz o sistema usar o mesmo endereço pelo qual foi aberto; assim a instalação não depende do domínio.

O lockfile homologado (`package-lock.json`, sha256 `27036301a05e00fc651848241b6dc52adce07bd215a6a4359de360ce57d2102a`) já faz parte do repositório; nada precisa ser copiado. Confira o hash antes do setup (instalação reproduzível com `npm ci`):

```
sha256sum /opt/raiox/app/package-lock.json
```

Prepare o código para produção (SEC-02). A plataforma de desenvolvimento exige um script externo (goskip) no `index.html`; o script abaixo o remove de forma controlada e cancela tudo se encontrar qualquer coisa fora do esperado (outra alteração, estrutura diferente, outro script externo):

```
cd /opt/raiox/app
sudo -u raiox bash deploy/preparar-producao.sh
```

Deve terminar com `[OK] index.html preparado`. Se terminar com `[ERRO]`, não continue: a versão precisa ser revisada. A alteração local aparece em `git status` como `index.html` modificado; é esperada.

Rode a instalação como o usuário `raiox`:

```
sudo -u raiox -H bash scripts/setup-local.sh
sudo -u raiox bash deploy/preparar-producao.sh --conferir-build
sudo -u raiox mkdir -p /opt/raiox/app/pb_data
sudo chmod 700 /opt/raiox/app/pb_data
sudo chmod 600 /opt/raiox/app/.env.production
```

## 4. Serviço automático

```
sudo cp /opt/raiox/app/deploy/raiox.service /etc/systemd/system/raiox.service
sudo systemctl daemon-reload
sudo systemctl enable --now raiox
sudo systemctl status raiox --no-pager
curl -s http://127.0.0.1:8090/api/health
```

O serviço volta sozinho depois de reiniciar o servidor. Comandos úteis: `sudo systemctl restart raiox`, `sudo journalctl -u raiox -n 50`.

## 5. Configuração administrativa do PocketBase

O painel `/_/` nunca é aberto pela internet. Crie o superusuário pela linha de comando:

```
cd /opt/raiox/app
sudo -u raiox ./pocketbase superuser upsert EMAIL_ADMIN SENHA_FORTE
```

Para abrir o painel, use um túnel SSH a partir do computador do administrador:

```
ssh -L 8090:127.0.0.1:8090 USUARIO@IP_DO_SERVIDOR
```

e acesse `http://localhost:8090/_/` nesse computador. No painel:

- Settings > Rate limits: ativar.
- Settings > Application > User IP proxy headers: informar `CF-Connecting-IP`.
- Collections > users > Options: reduzir a duração do token de autenticação (ex.: 8 horas).
- Depois de criar os usuários reais: fechar o cadastro público (SRV-02).

## 6. Acesso externo: Cloudflare Tunnel + Access

Pré-requisitos: um domínio próprio administrado no Cloudflare e uma conta Cloudflare Zero Trust (plano gratuito).

1. Zero Trust > Networks > Tunnels > Create a tunnel (tipo Cloudflared). Escolha Debian/64-bit e execute no servidor o comando de instalação mostrado (contém o token; não guarde esse comando em arquivos nem no repositório).
2. No túnel, adicione um Public Hostname: `sistema.SEU-DOMINIO` apontando para `http://127.0.0.1:8090`.
3. Zero Trust > Access > Applications > Add > Self-hosted: domínio `sistema.SEU-DOMINIO`; política Allow com a lista de e-mails autorizados; método de login: código por e-mail (One-time PIN) ou o provedor escolhido.
4. Security > WAF > Custom rules: bloquear quando "URI Path" começa com `/_/` ou contém `/api/collections/_superusers` (painel e login de superusuário nunca pela internet).
5. Teste: em outra rede (ex.: celular sem Wi-Fi), abra `https://sistema.SEU-DOMINIO`. Deve pedir o código por e-mail e depois mostrar a tela de login do sistema. `https://sistema.SEU-DOMINIO/_/` deve ser bloqueado.

## 7. Backup manual em pen drive

Conecte o pen drive e descubra o nome do dispositivo:

```
lsblk -o NAME,SIZE,LABEL,MOUNTPOINT
sudo mkdir -p /mnt/usb
sudo mount /dev/sdX1 /mnt/usb
```

(troque `sdX1` pelo nome mostrado). Faça o backup e desmonte:

```
sudo bash /opt/raiox/app/deploy/backup-usb.sh /mnt/usb
sudo umount /mnt/usb
```

O sistema fica fora do ar por poucos segundos durante a cópia. Se ele não voltar a responder, o script termina com ERRO e mostra o que verificar. O script pede a **senha do backup** (digitada duas vezes, mínimo de 12 caracteres) e cifra o pacote. No pen drive ficam dois arquivos: `.tar.gz.gpg` (cifrado) e `.tar.gz.gpg.sha256` (só confere se a cópia não corrompeu; não substitui a senha).

A senha do backup nunca é gravada no servidor nem no pen drive. Guarde-a em um gerenciador de senhas fora do servidor (com autenticação em duas etapas) e mantenha uma cópia impressa em local separado do pen drive. **Sem a senha o backup não abre e não há como recuperá-lo.**

## 8. Restauração

Teste (não toca no sistema em uso; usado no GATE-05):

```
sudo bash /opt/raiox/app/deploy/restaurar.sh /mnt/usb/ARQUIVO.tar.gz.gpg --teste /opt/raiox/teste-restauracao
```

O script confere o SHA-256 da cópia, pede a senha do backup e abre o pacote cifrado (senha errada ou arquivo adulterado: cancela sem alterar nada), restaura numa pasta separada, confere cada arquivo do banco byte a byte (SHA-256) e compara registros, somas e relações com o manifesto. O GATE-05 só é aprovado depois de abrir a cópia e conferir os números na tela. Para ver a cópia funcionando, ele mostra o comando que abre a cópia na porta 8091 (só dentro do servidor; use túnel SSH com `-L 8091:127.0.0.1:8091`).

Restauração real (substitui os dados e o `.env.production` atuais; exige digitar RESTAURAR; os dados atuais ficam guardados em `pb_data.antes-restauracao-DATA`; se a conferência falhar ou o sistema não voltar a responder, a restauração é desfeita e os dados anteriores voltam):

```
sudo bash /opt/raiox/app/deploy/restaurar.sh /mnt/usb/ARQUIVO.tar.gz.gpg
```

Para comparar dois bancos a qualquer momento:

```
sudo python3 /opt/raiox/app/deploy/raiox_verificar.py comparar BANCO_A/data.db BANCO_B/data.db
```

## 9. Atualizações

- Sistema operacional: o Ubuntu Server instala as atualizações de segurança automaticamente (unattended-upgrades). Atualizações maiores e de firmware: fazer depois de um backup, em horário planejado.
- Sistema Raio-X: só instalar um commit já homologado. Fazer backup; como `raiox`: `git checkout -- index.html`, `git pull`, `bash deploy/preparar-producao.sh`, `bash scripts/setup-local.sh` e `bash deploy/preparar-producao.sh --conferir-build`; depois `sudo systemctl restart raiox`. Qualquer `[ERRO]` interrompe a atualização.
- Nunca executar `npm audit fix --force`.
