#!/bin/bash
# e-audit: instalador de UM comando (Ubuntu Server 24.04).
#
#   curl -fsSL https://raw.githubusercontent.com/gramosvane/raiox-finan-dev/VERSAO/install.sh | sudo bash -s -- VERSAO
#
# O que faz, nesta ordem, parando se algo falhar:
#   1. instala o que faltar (pacotes, Node 24, usuário do sistema);
#   2. liga o firewall liberando SSH e o sistema SÓ para a rede local detectada;
#   3. baixa o aplicativo da versão pedida direto do GitHub para /opt/raiox/app;
#   4. cria o código de ativação e o superusuário técnico, compila, instala e liga o serviço;
#   5. ativa os limites de tentativas e mostra o endereço e o código de ativação.
# Nada é apagado; se /opt/raiox/app já existir, não reinstala (para atualizar use o script de atualização).
set -euo pipefail

REPO="https://github.com/gramosvane/raiox-finan-dev"
TAG="${1:-${EAUDIT_VERSAO:-}}"
USUARIO="raiox"
APP="/opt/raiox/app"
PORTA="8090"
SEGREDOS="/etc/e-audit"

ok()    { echo "[OK]    $*"; }
info()  { echo "[INFO]  $*"; }
falha() { echo "[ERRO]  $*" >&2; echo "[ERRO]  Instalação INTERROMPIDA. Nada foi apagado. Corrija a causa e rode de novo." >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || falha "Execute com sudo."
[ -n "$TAG" ] || falha "Informe a versão: ... | sudo bash -s -- v0.2.0"
echo "$TAG" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+$' || falha "Versão inválida: $TAG (esperado algo como v0.2.0)."
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] && [ "${VERSION_ID:-}" = "24.04" ] || falha "Esperado Ubuntu 24.04 (obtido: ${PRETTY_NAME:-desconhecido})."
echo "== e-audit: instalação da versão $TAG =="
ok "Sistema: $PRETTY_NAME"

if [ -e "$APP" ]; then
    falha "$APP já existe: o e-audit já está instalado aqui. Para atualizar use o script de atualização; para recomeçar do zero é preciso formatar/limpar o servidor."
fi

# ---------- 1. pacotes e Node ----------
export DEBIAN_FRONTEND=noninteractive
info "Instalando pacotes necessários (pode demorar alguns minutos)..."
apt-get update -y >/dev/null
apt-get install -y curl unzip git python3 ufw gnupg ca-certificates >/dev/null
ok "Pacotes instalados"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/^v//; s/\..*//')" != "24" ]; then
    info "Instalando Node 24 (NodeSource)"
    curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh
    info "sha256 do script da NodeSource: $(sha256sum /tmp/nodesource_setup.sh | cut -d' ' -f1)"
    bash /tmp/nodesource_setup.sh >/dev/null
    apt-get install -y nodejs >/dev/null
    rm -f /tmp/nodesource_setup.sh
fi
ok "node $(node -v), npm $(npm -v)"
if ! id "$USUARIO" >/dev/null 2>&1; then
    useradd --system --create-home --home-dir /opt/raiox --shell /usr/sbin/nologin "$USUARIO"
    ok "usuário $USUARIO criado"
else
    ok "usuário $USUARIO já existe"
fi

# ---------- 2. rede e firewall ----------
DEV="$(ip -4 -o route show default | awk '{print $5; exit}')"
[ -n "$DEV" ] || falha "Não achei a placa de rede padrão."
CIDR="$(ip -4 -o addr show dev "$DEV" scope global | awk '{print $4; exit}')"
[ -n "$CIDR" ] || falha "Não achei o endereço IP da placa $DEV."
IP="${CIDR%/*}"
REDE="$(python3 -c 'import ipaddress,sys; print(ipaddress.ip_network(sys.argv[1], strict=False))' "$CIDR")"
ok "Rede local detectada: $REDE (este servidor: $IP, placa $DEV)"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow from "$REDE" to any port 22 proto tcp >/dev/null
ufw allow from "$REDE" to any port "$PORTA" proto tcp >/dev/null
# Quem está instalando por SSH de fora da rede detectada não pode ficar sem acesso ao ligar o firewall.
for peer in $(ss -Htn state established '( sport = :22 )' 2>/dev/null | awk '{print $4}' | sed 's/:[0-9]*$//; s/^\[//; s/\]$//; s/^::ffff://' | grep -E '^[0-9]+(\.[0-9]+){3}$' | sort -u || true); do
    if ! python3 -c 'import ipaddress,sys; sys.exit(0 if ipaddress.ip_address(sys.argv[1]) in ipaddress.ip_network(sys.argv[2]) else 1)' "$peer" "$REDE"; then
        ufw allow from "$peer" to any port 22 proto tcp >/dev/null
        info "SSH liberado também para $peer (sessão atual, fora da rede detectada)"
    fi
done
ufw --force enable >/dev/null
ok "Firewall ligado: SSH e e-audit liberados só para $REDE"

# ---------- 3. baixar o aplicativo direto do GitHub ----------
info "Baixando o e-audit $TAG do GitHub..."
[ -d /opt/raiox ] || falha "/opt/raiox não existe (o usuário $USUARIO deveria tê-la criado)."
sudo -u "$USUARIO" -H git clone --quiet --branch "$TAG" --depth 1 "$REPO" "$APP" 2>/dev/null \
    || falha "Não consegui baixar a versão $TAG de $REPO (a versão existe? há internet?)."
ok "Código baixado ($(git -c safe.directory="$APP" -C "$APP" rev-parse --short HEAD))"

# ---------- 4. segredos, instalação e serviço ----------
gerar() { python3 -c 'import secrets,sys; a=sys.argv[1]; n=int(sys.argv[2]); print("".join(secrets.choice(a) for _ in range(n)))' "$1" "$2"; }
CODIGO_BRUTO="$(gerar 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' 12)"
CODIGO="${CODIGO_BRUTO:0:4}-${CODIGO_BRUTO:4:4}-${CODIGO_BRUTO:8:4}"
SU_EMAIL="tecnico@e-audit.local"
SU_SENHA="$(gerar 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789' 28)"
install -d -m 700 -o root -g root "$SEGREDOS"
( umask 077; printf 'e-mail: %s\nsenha:  %s\n' "$SU_EMAIL" "$SU_SENHA" > "$SEGREDOS/superusuario.txt" )
chmod 600 "$SEGREDOS/superusuario.txt"
ok "Credenciais do superusuário técnico guardadas em $SEGREDOS/superusuario.txt (só o administrador do servidor lê)"

info "Compilando e instalando (alguns minutos)..."
RAIOX_ESCUTA_IP=0.0.0.0 RAIOX_CODIGO_ATIVACAO="$CODIGO_BRUTO" RAIOX_SUPERUSER_EMAIL="$SU_EMAIL" RAIOX_SUPERUSER_SENHA="$SU_SENHA" \
    bash "$APP/deploy/instalar-producao.sh" --ativar

# ---------- 5. limites de tentativas ----------
LIMITES_OK=0
TOKEN="$(python3 - "$SU_EMAIL" "$SU_SENHA" "$PORTA" <<'PY' 2>/dev/null || true
import json, sys, urllib.request
email, senha, porta = sys.argv[1:4]
req = urllib.request.Request(f"http://127.0.0.1:{porta}/api/collections/_superusers/auth-with-password",
    data=json.dumps({"identity": email, "password": senha}).encode(), headers={"Content-Type": "application/json"})
print(json.load(urllib.request.urlopen(req, timeout=15))["token"])
PY
)"
if [ -n "$TOKEN" ]; then
    python3 - "$TOKEN" "$PORTA" <<'PY' && LIMITES_OK=1
import json, sys, urllib.request
token, porta = sys.argv[1:3]
regras = [
    {"label": "*:auth",      "maxRequests": 10,  "duration": 3},
    {"label": "*:create",    "maxRequests": 60,  "duration": 5},
    {"label": "/api/batch",  "maxRequests": 30,  "duration": 5},
    {"label": "/backend/",   "maxRequests": 30,  "duration": 10},
    {"label": "/api/",       "maxRequests": 300, "duration": 10},
]
req = urllib.request.Request(f"http://127.0.0.1:{porta}/api/settings", method="PATCH",
    data=json.dumps({"rateLimits": {"enabled": True, "rules": regras}}).encode(),
    headers={"Content-Type": "application/json", "Authorization": token})
r = json.load(urllib.request.urlopen(req, timeout=15))
sys.exit(0 if r.get("rateLimits", {}).get("enabled") else 1)
PY
fi
if [ "$LIMITES_OK" = 1 ]; then ok "Limites de tentativas ativados"; else info "ATENÇÃO: não consegui ativar os limites de tentativas automaticamente; avise o suporte."; fi

# ---------- fim ----------
cat <<FIM

============================================================
  e-audit instalado e funcionando.

  1. No computador, abra o navegador em:   http://$IP:$PORTA/
     (crie um atalho para esse endereço na área de trabalho)

  2. Na primeira tela, informe o CÓDIGO DE ATIVAÇÃO:

         $CODIGO

     e crie o administrador e a Senha Mestra. Esse código
     só vale uma vez e só aparece aqui.

  Se perder o código antes de usar:
     sudo cat $APP/pb_data/ativacao.codigo
============================================================
FIM
