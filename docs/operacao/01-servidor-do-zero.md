# 01 · Servidor do zero (host + aplicativo)

Pré-requisito: Ubuntu Server 24.04 LTS recém-instalado, com OpenSSH, acesso ao servidor por um usuário administrador (`sudo`) e IP fixo (reserva no modem pelo MAC).

## A. Preparar o servidor (separado do aplicativo, de propósito)
No servidor, como administrador (troque a rede pela sua):

```bash
git clone git@github.com:gramosvane/raiox-beta-arquivo.git /tmp/raiox-kit   # ou copie o repositório por scp
RAIOX_REDE_LOCAL=192.168.15.0/24 sudo -E bash /tmp/raiox-kit/deploy/preparar-host.sh --verificar
RAIOX_REDE_LOCAL=192.168.15.0/24 sudo -E bash /tmp/raiox-kit/deploy/preparar-host.sh --aplicar
```

O `--aplicar` instala pacotes e Node 24, cria o usuário `raiox`, gera a **chave de deploy** e liga o firewall (SSH só da sua rede). Ele imprime a **chave pública**: cadastre-a no GitHub em *Settings → Deploy keys* do repositório, **sem** acesso de escrita.

**SSH só por chave** (faça por último, depois de testar o login por chave numa sessão separada):

```bash
sudo bash /tmp/raiox-kit/deploy/preparar-host.sh --endurecer-ssh
```

Ele se recusa a rodar se você não tiver chave autorizada, valida a configuração antes de recarregar e diz como desfazer. **Abra uma nova sessão para testar antes de fechar a atual.**

## B. Baixar a tag de produção e instalar
```bash
sudo -u raiox -H ssh -T git@github.com    # confira a impressão digital do GitHub; deve dizer "successfully authenticated"
sudo -u raiox -H git clone git@github.com:gramosvane/raiox-beta-arquivo.git /opt/raiox/app
sudo -u raiox -H git -C /opt/raiox/app checkout v0.0.120
sudo bash /opt/raiox/app/deploy/instalar-producao.sh --verificar   # só confere
sudo bash /opt/raiox/app/deploy/instalar-producao.sh               # prepara e compila; NÃO liga o serviço
```

O instalador **para** se: a tag não é a esperada, o repositório está alterado, o lockfile difere, o Node não é o 24, o `.env.production` existe e é diferente, ou qualquer comando falhar. Pode ser executado de novo sem efeito destrutivo.

## B2. Prova isolada (sem tocar na produção)
Para provar a instalação num clone separado, **com outra pasta, outra unit e outra porta** (nunca a produção):

```bash
sudo -u raiox -H git clone git@github.com:gramosvane/raiox-beta-arquivo.git /opt/raiox/prova-limpa
sudo -u raiox -H git -C /opt/raiox/prova-limpa checkout v0.0.120
sudo bash /opt/raiox/prova-limpa/deploy/instalar-producao.sh --verificar
sudo bash /opt/raiox/prova-limpa/deploy/instalar-producao.sh                      # 1a execução
sudo bash /opt/raiox/prova-limpa/deploy/instalar-producao.sh                      # 2a execução (idempotência)
sudo RAIOX_NOME_SERVICO=raiox-prova RAIOX_PORTA=18090 bash /opt/raiox/prova-limpa/deploy/instalar-producao.sh --ativar-teste
```
O modo `--ativar-teste` recusa a pasta de produção, os nomes `raiox`/`raiox-ensaio` e as portas 8090/8091/8093. Ao terminar, pare e remova a unit de prova (`systemctl disable --now raiox-prova`) e **preserve** a pasta de prova até a revisão.

## C. Conferir antes de seguir
- `git -C /opt/raiox/app describe --tags --exact-match` mostra `v0.0.120`.
- `git -C /opt/raiox/app status --short` não mostra nada.
- Não existe `/opt/raiox/app/pb_data` (o banco só nasce no go-live).
- Nada escutando em 8090: `ss -tln | grep 8090` vazio.

Siga para [02-go-live.md](02-go-live.md).
