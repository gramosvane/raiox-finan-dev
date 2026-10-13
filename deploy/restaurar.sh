#!/bin/bash
# ----------------------------------------------------------
# Raio-X Financeiro - Restauração de backup
#
# Teste (não toca no sistema em uso; usado no GATE-05):
#   sudo bash /opt/raiox/app/deploy/restaurar.sh ARQUIVO.tar.gz.gpg --teste /opt/raiox/teste-restauracao
#
# Restauração real (substitui os dados atuais):
#   sudo bash /opt/raiox/app/deploy/restaurar.sh ARQUIVO.tar.gz.gpg
#
# Em ambos os modos: confere o SHA-256 da cópia, pede a SENHA do backup e abre o pacote cifrado
# (senha errada ou arquivo adulterado: cancela sem alterar nada), mostra o manifesto e, depois de
# restaurar, confere cada arquivo do banco byte a byte (SHA-256) e os registros,
# somas e relações. No modo real, se a conferência falhar ou o sistema não voltar
# a responder, a restauração é desfeita e os dados anteriores voltam.
# O .env.production do backup também é restaurado. No modo real, exige digitar RESTAURAR,
# guarda os dados atuais em pb_data.antes-restauracao-DATA e só então restaura.
# Só são aceitos backups cifrados (.tar.gz.gpg), feitos por backup-usb.sh.
#
# Variáveis opcionais: RAIOX_APP_DIR (padrão /opt/raiox/app),
#                      RAIOX_SERVICO (padrão raiox).
# ----------------------------------------------------------
set -euo pipefail
umask 077

APP_DIR="${RAIOX_APP_DIR:-/opt/raiox/app}"
SERVICO="${RAIOX_SERVICO:-raiox}"
ARQUIVO="${1:-}"
MODO="real"
PASTA_TESTE=""
if [ "${2:-}" = "--teste" ]; then
    MODO="teste"
    PASTA_TESTE="${3:-}"
fi
DATA="$(date +%Y-%m-%d_%H-%M-%S)"
DIR_SCRIPT="$(cd "$(dirname "$0")" && pwd)"

falha() { echo "[ERRO] $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || falha "Execute com sudo."
[ -n "$ARQUIVO" ] || falha "Informe o arquivo de backup (.tar.gz.gpg)."
[ -f "$ARQUIVO" ] || falha "Arquivo não encontrado: $ARQUIVO"
case "$ARQUIVO" in
    *.tar.gz.gpg) ;;
    *) falha "Só são aceitos backups cifrados (.tar.gz.gpg), feitos por backup-usb.sh." ;;
esac
[ -f "$ARQUIVO.sha256" ] || falha "Arquivo de conferência não encontrado: $ARQUIVO.sha256"
command -v gpg >/dev/null 2>&1 || falha "O programa gpg não está instalado. Instale com: sudo apt install -y gnupg"
[ -t 0 ] || falha "Execute em um terminal: a senha do backup é digitada no teclado."
if [ "$MODO" = "teste" ]; then
    [ -n "$PASTA_TESTE" ] || falha "Informe a pasta do teste depois de --teste."
    if [ -e "$PASTA_TESTE" ] && [ -n "$(ls -A "$PASTA_TESTE" 2>/dev/null)" ]; then
        falha "A pasta de teste já existe e não está vazia: $PASTA_TESTE"
    fi
fi

echo "[1/5] Conferindo a cópia (SHA-256) e abrindo o backup com a senha..."
( cd "$(dirname "$ARQUIVO")" && sha256sum -c "$(basename "$ARQUIVO").sha256" ) || falha "A cópia do backup está corrompida (SHA-256 não confere). Restauração cancelada."
read -r -s -p "Senha do backup: " SENHA; echo

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
if ! printf '%s' "$SENHA" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 --decrypt -o "$TMP/pacote.tar.gz" "$ARQUIVO" 2>/dev/null; then
    unset SENHA
    falha "Não foi possível abrir o backup: senha incorreta ou arquivo adulterado. Nada foi alterado."
fi
unset SENHA
mkdir "$TMP/conteudo"
tar -xzf "$TMP/pacote.tar.gz" -C "$TMP/conteudo"
NOME="$(ls "$TMP/conteudo")"
ORIGEM="$TMP/conteudo/$NOME"
[ -f "$ORIGEM/pb_data/data.db" ] || falha "O backup não contém pb_data/data.db."
[ -f "$ORIGEM/MANIFESTO.txt" ] || falha "O backup não contém o MANIFESTO.txt."

echo "[2/5] Manifesto do backup:"
cat "$ORIGEM/MANIFESTO.txt"

conferir() {
    # 1) cada arquivo do banco restaurado é idêntico, byte a byte, ao do backup (SHA-256);
    # 2) contagens, somas e relações conferem com o retrato gravado no backup.
    local base="$1"
    grep '^sha256 ' "$ORIGEM/MANIFESTO.txt" | cut -c8- > "$TMP/arquivos.sha256"
    [ -s "$TMP/arquivos.sha256" ] || { echo "[ERRO] O manifesto não traz o SHA-256 dos arquivos." >&2; return 1; }
    if ( cd "$base" && sha256sum -c --quiet "$TMP/arquivos.sha256" ); then
        echo "[OK] Arquivos do banco idênticos, byte a byte, aos do backup (SHA-256)."
    else
        echo "[ERRO] Algum arquivo restaurado difere do backup." >&2
        return 1
    fi
    python3 -I "$DIR_SCRIPT/raiox_verificar.py" resumo "$base/pb_data/data.db" | tail -n +2 > "$TMP/depois.txt"
    sed -n '1,/^data_backup=/p' "$ORIGEM/MANIFESTO.txt" | grep -v '^data_backup=' | tail -n +2 > "$TMP/antes.txt"
    if diff -q "$TMP/antes.txt" "$TMP/depois.txt" >/dev/null; then
        echo "[OK] Registros, somas e relações conferem com o manifesto do backup."
    else
        echo "[ERRO] Registros, somas ou relações diferem do manifesto:" >&2
        diff "$TMP/antes.txt" "$TMP/depois.txt" >&2 || true
        return 1
    fi
}

if [ "$MODO" = "teste" ]; then
    echo "[3/5] Modo TESTE: restaurando em $PASTA_TESTE (o sistema em uso não é tocado)..."
    mkdir -p "$PASTA_TESTE"
    cp -a "$ORIGEM/pb_data" "$PASTA_TESTE/pb_data"
    [ -f "$ORIGEM/.env.production" ] && cp -a "$ORIGEM/.env.production" "$PASTA_TESTE/.env.production"
    cp "$ORIGEM/MANIFESTO.txt" "$PASTA_TESTE/MANIFESTO.txt"
    chmod -R go-rwx "$PASTA_TESTE"
    echo "[4/5] Conferindo o banco restaurado..."
    conferir "$PASTA_TESTE"
    echo "[5/5] Teste concluído. Para abrir esta cópia numa porta separada (8091), só no próprio servidor:"
    echo "  sudo $APP_DIR/pocketbase serve --dir=$PASTA_TESTE/pb_data --hooksDir=$APP_DIR/pb_hooks --migrationsDir=$APP_DIR/pb_migrations --publicDir=$APP_DIR/pb_public --http=127.0.0.1:8091"
    exit 0
fi

echo
echo "----------------------------------------------------------"
echo "ATENÇÃO: os dados ATUAIS do sistema serão substituídos pelos"
echo "dados deste backup. Tudo o que foi lançado depois do backup"
echo "deixará de aparecer no sistema."
echo "Os dados atuais NÃO serão apagados: ficarão guardados em"
echo "  $APP_DIR/pb_data.antes-restauracao-$DATA"
echo "----------------------------------------------------------"
read -r -p "Para continuar, digite RESTAURAR: " RESPOSTA
[ "$RESPOSTA" = "RESTAURAR" ] || falha "Confirmação não recebida. Nada foi alterado."

DONO="$(stat -c '%U:%G' "$APP_DIR/pb_data")"
ESTAVA_ATIVO=0
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "$SERVICO" 2>/dev/null; then
    ESTAVA_ATIVO=1
    echo "[3/5] Parando o serviço $SERVICO..."
    systemctl stop "$SERVICO"
else
    if pgrep -f "$APP_DIR/pocketbase" >/dev/null 2>&1 || pgrep -x pocketbase >/dev/null 2>&1; then
        falha "Há um PocketBase rodando fora do serviço. Pare-o antes de restaurar."
    fi
    echo "[3/5] Serviço $SERVICO não está ativo."
fi

ANTES="$APP_DIR/pb_data.antes-restauracao-$DATA"
if [ -e "$ANTES" ]; then
    if [ "$ESTAVA_ATIVO" -eq 1 ]; then systemctl start "$SERVICO" || true; fi
    falha "Já existe $ANTES. Aguarde alguns segundos e rode de novo. Nada foi alterado."
fi
mv "$APP_DIR/pb_data" "$ANTES"
[ -f "$APP_DIR/.env.production" ] && cp -a "$APP_DIR/.env.production" "$ANTES/.env.production.anterior"
cp -a "$ORIGEM/pb_data" "$APP_DIR/pb_data"
chown -R "$DONO" "$APP_DIR/pb_data"
chmod -R go-rwx "$APP_DIR/pb_data" "$ANTES"
echo "[OK] Dados atuais guardados em $ANTES"

desfazer() {
    # Volta os dados e a configuração anteriores e religa o serviço.
    rm -rf "$APP_DIR/pb_data"
    mv "$ANTES" "$APP_DIR/pb_data"
    if [ -f "$APP_DIR/pb_data/.env.production.anterior" ]; then
        mv "$APP_DIR/pb_data/.env.production.anterior" "$APP_DIR/.env.production"
        chown "$DONO" "$APP_DIR/.env.production"
        chmod 600 "$APP_DIR/.env.production"
    fi
    if [ "$ESTAVA_ATIVO" -eq 1 ]; then
        systemctl start "$SERVICO" || true
        if responde; then
            echo "[OK] Dados anteriores de volta e sistema respondendo." >&2
        else
            echo "[ERRO] Dados anteriores de volta, mas o sistema também não respondeu. Verifique: sudo systemctl status $SERVICO" >&2
        fi
    fi
}

responde() {
    local _
    for _ in $(seq 1 15); do
        if curl -fsS -o /dev/null "http://127.0.0.1:8090/api/health" 2>/dev/null; then return 0; fi
        sleep 1
    done
    return 1
}

echo "[4/5] Conferindo o banco restaurado..."
if ! conferir "$APP_DIR"; then
    echo "[ERRO] Conferência falhou. Voltando os dados anteriores..." >&2
    desfazer
    falha "Restauração desfeita; o sistema continua com os dados de antes."
fi

if [ -f "$ORIGEM/.env.production" ]; then
    if [ -f "$APP_DIR/.env.production" ] && cmp -s "$ORIGEM/.env.production" "$APP_DIR/.env.production"; then
        echo "[OK] Configuração (.env.production) igual à do backup."
    else
        cp "$ORIGEM/.env.production" "$APP_DIR/.env.production"
        chown "$DONO" "$APP_DIR/.env.production"
        chmod 600 "$APP_DIR/.env.production"
        echo "[AVISO] Configuração (.env.production) restaurada do backup e diferente da anterior."
        echo "        Para valer na tela, recompile: sudo -u ${DONO%%:*} -H bash $APP_DIR/scripts/setup-local.sh"
    fi
fi

if [ "$ESTAVA_ATIVO" -eq 1 ]; then
    systemctl start "$SERVICO" || true
    if responde; then
        echo "[5/5] Serviço religado e respondendo."
    else
        echo "[ERRO] Com os dados restaurados, o sistema não respondeu em 15 s. Voltando os dados anteriores..." >&2
        systemctl stop "$SERVICO" || true
        desfazer
        falha "Restauração desfeita. Verifique o backup e o serviço antes de tentar de novo: sudo journalctl -u $SERVICO -n 50"
    fi
else
    echo "[5/5] O serviço não estava ativo; ligue-o quando quiser."
fi
echo "RESTAURAÇÃO CONCLUÍDA a partir de $(basename "$ARQUIVO")."
