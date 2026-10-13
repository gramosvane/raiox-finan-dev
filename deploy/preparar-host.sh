#!/bin/bash
# ----------------------------------------------------------
# Raio-X Financeiro - preparacao do SERVIDOR (host) Ubuntu Server 24.04 LTS.
# Separado do instalador do aplicativo (deploy/instalar-producao.sh) de proposito: SSH e firewall podem
# cortar o seu acesso remoto se feitos errado.
#
# Uso (como root):
#   RAIOX_REDE_LOCAL=192.168.15.0/24 sudo -E bash deploy/preparar-host.sh --verificar   # so mostra o que falta
#   RAIOX_REDE_LOCAL=192.168.15.0/24 sudo -E bash deploy/preparar-host.sh --aplicar     # pacotes, Node, usuario, firewall
#   sudo bash deploy/preparar-host.sh --endurecer-ssh                                   # SSH so por chave (leia o aviso)
# Idempotente. Nada aqui cria segredos do sistema nem mexe em banco.
# ----------------------------------------------------------
set -euo pipefail

MODO="${1:---verificar}"
USUARIO="${RAIOX_USUARIO:-raiox}"
REDE="${RAIOX_REDE_LOCAL:-}"
ok()    { echo "[OK]    $*"; }
info()  { echo "[INFO]  $*"; }
falha() { echo "[ERRO]  $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || falha "Execute com sudo."
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] && [ "${VERSION_ID:-}" = "24.04" ] || falha "Esperado Ubuntu 24.04 (obtido: ${PRETTY_NAME:-desconhecido})."
ok "Sistema: $PRETTY_NAME"

case "$MODO" in
  --verificar)
    for c in curl unzip git python3 ufw gpg; do command -v "$c" >/dev/null 2>&1 && ok "$c presente" || info "$c AUSENTE"; done
    command -v node >/dev/null 2>&1 && info "node $(node -v)" || info "node AUSENTE (esperado v24)"
    id "$USUARIO" >/dev/null 2>&1 && ok "usuário $USUARIO existe" || info "usuário $USUARIO AUSENTE"
    UFW_ST="$(ufw status 2>/dev/null || true)"
    info "ufw: ${UFW_ST%%$'\n'*}"
    [ -f /etc/ssh/sshd_config.d/01-raiox.conf ] && ok "SSH endurecido (01-raiox.conf)" || info "SSH ainda aceita senha"
    [ -f "/opt/raiox/.ssh/id_ed25519.pub" ] && ok "chave de deploy existe" || info "chave de deploy AUSENTE"
    exit 0 ;;
  --aplicar)
    [ -n "$REDE" ] || falha "Informe a rede local permitida no SSH, ex.: RAIOX_REDE_LOCAL=192.168.15.0/24"
    echo "$REDE" | grep -qE '^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$' || falha "RAIOX_REDE_LOCAL inválida: $REDE"
    export DEBIAN_FRONTEND=noninteractive
    info "pacotes"
    apt-get update -y
    apt-get install -y curl unzip git python3 ufw gnupg ca-certificates
    if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/^v//; s/\..*//')" != "24" ]; then
        info "Node 24 (NodeSource)"
        curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh
        echo "[INFO]  sha256 do script da NodeSource: $(sha256sum /tmp/nodesource_setup.sh | cut -d' ' -f1)"
        bash /tmp/nodesource_setup.sh
        apt-get install -y nodejs
    fi
    ok "node $(node -v), npm $(npm -v)"
    if ! id "$USUARIO" >/dev/null 2>&1; then
        useradd --system --create-home --home-dir /opt/raiox --shell /usr/sbin/nologin "$USUARIO"
        ok "usuário $USUARIO criado"
    else ok "usuário $USUARIO já existe"; fi
    install -d -m 700 -o "$USUARIO" -g "$USUARIO" /opt/raiox/.ssh
    if [ ! -f /opt/raiox/.ssh/id_ed25519 ]; then
        sudo -u "$USUARIO" -H ssh-keygen -t ed25519 -N "" -C "raiox-producao" -f /opt/raiox/.ssh/id_ed25519 -q
        ok "chave de deploy criada"
    fi
    echo "---- CHAVE PUBLICA DE DEPLOY (cadastre no GitHub como Deploy key SOMENTE LEITURA) ----"
    cat /opt/raiox/.ssh/id_ed25519.pub
    ssh-keygen -lf /opt/raiox/.ssh/id_ed25519.pub
    echo "--------------------------------------------------------------------------------------"
    info "firewall: permite SSH só da rede $REDE (a regra entra ANTES de ligar o ufw)"
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow from "$REDE" to any port 22 proto tcp
    ufw --force enable
    ufw status verbose
    ok "host preparado. Próximo: --endurecer-ssh (depois de testar o login por chave) e instalar o aplicativo."
    exit 0 ;;
  --endurecer-ssh)
    ALVO="${SUDO_USER:-}"
    [ -n "$ALVO" ] && [ "$ALVO" != "root" ] || falha "Execute com sudo a partir do seu usuário (não como root direto)."
    AK="$(getent passwd "$ALVO" | cut -d: -f6)/.ssh/authorized_keys"
    [ -s "$AK" ] || falha "$AK não existe ou está vazio: você ficaria sem acesso. Cadastre sua chave pública antes."
    ssh-keygen -lf "$AK" >/dev/null 2>&1 || falha "$AK não contém chave válida."
    echo "ATENÇÃO: confirme que você JÁ entrou neste servidor por CHAVE (sem senha) numa sessão separada."
    echo "Chaves autorizadas para $ALVO:"; ssh-keygen -lf "$AK"
    CONF=/etc/ssh/sshd_config.d/01-raiox.conf
    BAK=""
    if [ -f "$CONF" ]; then
        BAK="$CONF.anterior-$(date +%Y%m%d-%H%M%S)"
        cp -p -- "$CONF" "$BAK"
        info "configuração anterior preservada em $BAK"
    fi
    printf 'PasswordAuthentication no\nPermitRootLogin no\nKbdInteractiveAuthentication no\n' > "$CONF"
    if ! sshd -t; then
        if [ -n "$BAK" ]; then cp -p -- "$BAK" "$CONF"; else rm -f -- "$CONF"; fi
        falha "Configuração inválida; o estado anterior foi restaurado."
    fi
    systemctl reload ssh
    # Captura primeiro: "sshd -T | grep -q" com pipefail falha por SIGPIPE (141) quando o grep sai antes de o sshd
    # terminar de escrever, e o script achava que a senha ainda era aceita mesmo com a configuracao correta.
    EFETIVO="$(sshd -T 2>/dev/null || true)"
    if ! grep -qi '^passwordauthentication no' <<<"$EFETIVO"; then
        # A configuração efetiva ainda aceita senha: restaura o estado anterior em vez de deixar o arquivo novo.
        if [ -n "$BAK" ]; then cp -p -- "$BAK" "$CONF"; else rm -f -- "$CONF"; fi
        systemctl reload ssh
        falha "A configuração efetiva ainda aceita senha (outro arquivo em sshd_config.d tem precedência?); o estado anterior foi restaurado."
    fi
    ok "SSH agora só aceita chave. ABRA UMA NOVA SESSÃO para testar ANTES de fechar esta."
    echo "Para desfazer (pelo console do servidor): sudo rm /etc/ssh/sshd_config.d/01-raiox.conf && sudo systemctl reload ssh${BAK:+ (versão anterior em $BAK)}"
    exit 0 ;;
  *) falha "Uso: $0 [--verificar | --aplicar | --endurecer-ssh]" ;;
esac
