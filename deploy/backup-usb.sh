#!/bin/bash
# ----------------------------------------------------------
# Raio-X Financeiro - Backup manual para pen drive / HD externo
#
# Uso:   sudo bash /opt/raiox/app/deploy/backup-usb.sh /mnt/usb
#
# O que faz:
#   1. confere o destino (precisa ser um disco montado, com espaço livre) e pede a SENHA do
#      backup (digitada duas vezes; nunca é gravada no servidor nem no pen drive);
#   2. para o serviço do sistema por alguns segundos (cópia consistente do banco);
#   3. empacota pb_data (sem a pasta pb_data/backups) e o .env.production;
#   4. religa o serviço e confere se ele respondeu (se não responder, termina com erro);
#   5. cifra o pacote (gpg, AES-256, com a senha) e grava no destino o arquivo .tar.gz.gpg e o
#      código SHA-256 da cópia (o manifesto fica DENTRO do pacote cifrado);
#   6. abre o arquivo gravado no destino com a senha e confere que ele é legível.
#
# Variáveis opcionais: RAIOX_APP_DIR (padrão /opt/raiox/app),
#                      RAIOX_SERVICO (padrão raiox).
# ----------------------------------------------------------
set -euo pipefail
umask 077

APP_DIR="${RAIOX_APP_DIR:-/opt/raiox/app}"
SERVICO="${RAIOX_SERVICO:-raiox}"
DESTINO="${1:-}"
DATA="$(date +%Y-%m-%d_%H-%M-%S)"
NOME="raiox-backup_${DATA}"
DIR_SCRIPT="$(cd "$(dirname "$0")" && pwd)"

falha() { echo "[ERRO] $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || falha "Execute com sudo."
[ -n "$DESTINO" ] || falha "Informe a pasta do pen drive. Exemplo: sudo $0 /mnt/usb"
[ -d "$DESTINO" ] || falha "A pasta de destino não existe: $DESTINO"
if [ "${RAIOX_PERMITIR_DESTINO_LOCAL:-0}" != "1" ]; then
    mountpoint -q "$DESTINO" || falha "$DESTINO não é um disco montado. Monte o pen drive antes (veja o guia)."
fi
[ -d "$APP_DIR/pb_data" ] || falha "Pasta de dados não encontrada: $APP_DIR/pb_data"
[ -f "$APP_DIR/pb_data/data.db" ] || falha "Banco não encontrado: $APP_DIR/pb_data/data.db"

NECESSARIO_KB=$(du -sk --exclude=backups "$APP_DIR/pb_data" | awk '{print $1}')
LIVRE_KB=$(df -Pk "$DESTINO" | awk 'NR==2 {print $4}')
[ "$LIVRE_KB" -gt $((NECESSARIO_KB * 2)) ] || falha "Espaço insuficiente no destino (livre ${LIVRE_KB} KB, necessário cerca de $((NECESSARIO_KB * 2)) KB)."

command -v gpg >/dev/null 2>&1 || falha "O programa gpg não está instalado. Instale com: sudo apt install -y gnupg"
[ -t 0 ] || falha "Execute em um terminal: a senha do backup é digitada no teclado."
echo "A senha do backup protege os dados no pen drive. Guarde-a FORA do servidor e FORA do pen drive."
read -r -s -p "Senha do backup (mínimo 12 caracteres): " SENHA; echo
[ "${#SENHA}" -ge 12 ] || falha "Senha curta demais (mínimo 12 caracteres). Nada foi feito."
read -r -s -p "Repita a senha do backup: " SENHA2; echo
[ "$SENHA" = "$SENHA2" ] || falha "As senhas não conferem. Nada foi feito."
unset SENHA2

echo "[1/6] Destino conferido: $DESTINO (livre ${LIVRE_KB} KB)"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/$NOME"

ESTAVA_ATIVO=0
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "$SERVICO" 2>/dev/null; then
    ESTAVA_ATIVO=1
    echo "[2/6] Parando o serviço $SERVICO para a cópia..."
    systemctl stop "$SERVICO"
else
    if pgrep -f "$APP_DIR/pocketbase" >/dev/null 2>&1 || pgrep -x pocketbase >/dev/null 2>&1; then
        falha "Há um PocketBase rodando fora do serviço. Pare-o antes do backup."
    fi
    echo "[2/6] Serviço $SERVICO não está ativo; cópia com o sistema parado."
fi

religar() {
    if [ "$ESTAVA_ATIVO" -eq 1 ]; then
        systemctl start "$SERVICO" || true
    fi
}
trap 'religar; rm -rf "$TMP"' EXIT

echo "[3/6] Empacotando os dados..."
cp -a "$APP_DIR/pb_data" "$TMP/$NOME/pb_data"
rm -rf "$TMP/$NOME/pb_data/backups"
if [ -f "$APP_DIR/.env.production" ]; then
    cp -a "$APP_DIR/.env.production" "$TMP/$NOME/.env.production"
fi

religar
trap 'rm -rf "$TMP"' EXIT
SERVICO_OK=1
if [ "$ESTAVA_ATIVO" -eq 1 ]; then
    echo "[4/6] Serviço religado. Conferindo resposta..."
    SERVICO_OK=0
    for _ in $(seq 1 15); do
        if curl -fsS -o /dev/null "http://127.0.0.1:8090/api/health" 2>/dev/null; then SERVICO_OK=1; break; fi
        sleep 1
    done
    [ "$SERVICO_OK" -eq 1 ] && echo "[OK] Sistema respondendo." || echo "[ERRO] O sistema não respondeu em 15 s. O backup continua sendo gravado." >&2
else
    echo "[4/6] Serviço não estava ativo; nada a religar."
fi

# Manifesto: retrato do banco copiado (contagens, somas, relações) e SHA-256 de cada arquivo.
python3 -I "$DIR_SCRIPT/raiox_verificar.py" resumo "$TMP/$NOME/pb_data/data.db" > "$TMP/$NOME/MANIFESTO.txt"
{
    echo "data_backup=$DATA"
    echo "versao=$(grep -m1 '"version"' "$APP_DIR/package.json" 2>/dev/null | sed 's/[^0-9.]//g')"
    echo "commit=$(git -c safe.directory="$APP_DIR" -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo desconhecido)"
    echo "servidor=$(hostname)"
    ( cd "$TMP/$NOME" && find pb_data -type f | LC_ALL=C sort | xargs -d '\n' sha256sum | sed 's/^/sha256 /' )
} >> "$TMP/$NOME/MANIFESTO.txt"

echo "[5/6] Cifrando e gravando no destino..."
tar -czf "$TMP/$NOME.tar.gz" -C "$TMP" "$NOME"
printf '%s' "$SENHA" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 \
    --symmetric --cipher-algo AES256 --s2k-mode 3 --s2k-digest-algo SHA512 --s2k-count 65011712 \
    --compress-algo none -o "$TMP/$NOME.tar.gz.gpg" "$TMP/$NOME.tar.gz" || falha "Falha ao cifrar o backup."
rm -f "$TMP/$NOME.tar.gz"
( cd "$TMP" && sha256sum "$NOME.tar.gz.gpg" > "$NOME.tar.gz.gpg.sha256" )
cp "$TMP/$NOME.tar.gz.gpg" "$TMP/$NOME.tar.gz.gpg.sha256" "$DESTINO/"
sync

echo "[6/6] Conferindo a cópia gravada no destino..."
( cd "$DESTINO" && sha256sum -c "$NOME.tar.gz.gpg.sha256" ) || falha "O arquivo gravado no destino não confere com o SHA-256."
printf '%s' "$SENHA" | gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 0 --decrypt "$DESTINO/$NOME.tar.gz.gpg" 2>/dev/null | tar -tz >/dev/null || falha "O arquivo gravado no destino não abre com a senha digitada."
unset SENHA

echo "----------------------------------------------------------"
if [ "$SERVICO_OK" -eq 1 ]; then
    echo "BACKUP CONCLUÍDO (cifrado)"
else
    echo "BACKUP GRAVADO, MAS O SISTEMA NÃO VOLTOU A RESPONDER"
fi
echo "  Arquivo:    $DESTINO/$NOME.tar.gz.gpg"
echo "  SHA-256 da cópia: $(cut -d' ' -f1 "$DESTINO/$NOME.tar.gz.gpg.sha256")"
echo "  A senha NÃO foi gravada em lugar nenhum: guarde-a fora do servidor e fora do pen drive."
echo "----------------------------------------------------------"
grep -v '^sha256 ' "$TMP/$NOME/MANIFESTO.txt"
if [ "$SERVICO_OK" -ne 1 ]; then
    echo "[ERRO] Verifique agora: sudo systemctl status $SERVICO  e  sudo journalctl -u $SERVICO -n 50" >&2
    exit 1
fi
