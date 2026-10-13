#!/bin/bash
# ==============================================================================
# Script de Backup Seguro e Blindado do PocketBase
# Método de Cópia Consistente de Dados + Checksum SHA256 + Criptografia AES-256
#
# Métodos suportados:
# 1. API nativa /api/backups (quando PocketBase está em execução com token de superusuário)
# 2. Snapshot consistente com serviço parado (systemctl stop/start) e cópia de pb_data
#
# Segurança de Criptografia:
# Chave lida EXCLUSIVAMENTE via variável de ambiente BACKUP_ENCRYPTION_KEY ou arquivo BACKUP_KEY_FILE
# NUNCA exposta como argumento na linha de comando (evita vazamento em ps aux).
# ==============================================================================

set -euo pipefail

PB_DIR="${PB_DIR:-/var/www/gestao-financeira}"
BACKUP_DIR="$PB_DIR/pb_data/backups"
RCLONE_REMOTE="${RCLONE_REMOTE:-meudrive:Backups_Financeiro}"
DATA=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_NAME="backup_${DATA}.zip"
BACKUP_FILE="$BACKUP_DIR/$BACKUP_NAME"
ENCRYPTED_FILE="${BACKUP_FILE}.enc"

STATUS_LOCAL="PENDENTE"
STATUS_EXTERNO="NÃO CONFIGURADO"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando rotina de backup financeiro..."

# Validação OBRIGATÓRIA da chave de criptografia
KEY_SOURCE=""
if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    KEY_SOURCE="env"
elif [ -n "${BACKUP_KEY_FILE:-}" ] && [ -f "${BACKUP_KEY_FILE}" ]; then
    KEY_SOURCE="file"
else
    echo "[ERRO CRÍTICO] Nenhuma chave de criptografia foi configurada." >&2
    echo "Defina BACKUP_ENCRYPTION_KEY no ambiente ou informe o caminho em BACKUP_KEY_FILE." >&2
    exit 1
fi

cd "$PB_DIR"
mkdir -p "$BACKUP_DIR"

# Função segura para obter a chave sem expor em argumentos CLI
get_encryption_key() {
    if [ "$KEY_SOURCE" = "file" ]; then
        cat "$BACKUP_KEY_FILE"
    else
        printf '%s' "$BACKUP_ENCRYPTION_KEY"
    fi
}

# 1. Snapshot local consistente
echo "[1/4] Gerando snapshot íntegro do banco de dados PocketBase..."

API_SUCCESS=0
if [ -n "${PB_SUPERUSER_TOKEN:-}" ]; then
    if curl -s -f -o /dev/null "http://127.0.0.1:8090/api/health" 2>/dev/null; then
        echo "[INFO] Serviço ativo detectado. Solicitando backup atômico via API PocketBase..."
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:8090/api/backups" \
            -H "Authorization: $PB_SUPERUSER_TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"name\": \"$BACKUP_NAME\"}" || true)
        if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
            API_SUCCESS=1
            echo "[OK] Backup atômico gerado com sucesso via API."
        else
            echo "[AVISO] API de backup retornou HTTP $HTTP_CODE. Tentando método por snapshot do serviço..."
        fi
    fi
fi

if [ "$API_SUCCESS" -eq 0 ] && [ ! -f "$BACKUP_FILE" ]; then
    WAS_RUNNING=0
    if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet gestao-financeira 2>/dev/null; then
        echo "[INFO] Pausando serviço systemd gestao-financeira para garantir snapshot consistente..."
        sudo systemctl stop gestao-financeira
        WAS_RUNNING=1
    fi

    if [ -d "$PB_DIR/pb_data" ]; then
        if ! zip -r -q "$BACKUP_FILE" "$PB_DIR/pb_data" -x "$PB_DIR/pb_data/backups/*"; then
            echo "[ERRO CRÍTICO] Falha ao compactar $PB_DIR/pb_data" >&2
            if [ "$WAS_RUNNING" -eq 1 ]; then
                sudo systemctl start gestao-financeira || true
            fi
            exit 1
        fi
        sha256sum "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"
        echo "[OK] Snapshot gerado e checksum SHA-256 gravado em ${BACKUP_FILE}.sha256."
    else
        echo "[ERRO CRÍTICO] Diretório $PB_DIR/pb_data não foi encontrado." >&2
        if [ "$WAS_RUNNING" -eq 1 ]; then
            sudo systemctl start gestao-financeira || true
        fi
        exit 1
    fi

    if [ "$WAS_RUNNING" -eq 1 ]; then
        echo "[INFO] Reiniciando serviço gestao-financeira..."
        sudo systemctl start gestao-financeira
    fi
fi

if [ -f "$BACKUP_FILE" ]; then
    STATUS_LOCAL="OK"
    echo "[OK] Backup local gerado com sucesso: $BACKUP_FILE"
else
    STATUS_LOCAL="FALHA"
    echo "[ERRO CRÍTICO] Falha na criação do backup local." >&2
    exit 1
fi

# 2. Criptografia obrigatória com AES-256-CBC
echo "[2/4] Criptografando backup com AES-256-CBC (chave lida via stdin seguro)..."
if ! get_encryption_key | openssl enc -aes-256-cbc -salt -pbkdf2 -in "$BACKUP_FILE" -out "$ENCRYPTED_FILE" -pass stdin; then
    echo "[ERRO CRÍTICO] Falha na criptografia OpenSSL." >&2
    exit 1
fi
echo "[OK] Arquivo criptografado gerado: $ENCRYPTED_FILE"

# 3. Envio externo com rclone (se configurado)
echo "[3/4] Verificando envio externo em nuvem..."
if command -v rclone >/dev/null 2>&1 && rclone listremotes 2>/dev/null | grep -q "^$(echo "$RCLONE_REMOTE" | cut -d: -f1):"; then
    echo "[INFO] Enviando $ENCRYPTED_FILE para $RCLONE_REMOTE..."
    if rclone copy "$ENCRYPTED_FILE" "$RCLONE_REMOTE/"; then
        STATUS_EXTERNO="OK"
        echo "[OK] Envio externo concluído com sucesso."
        rclone delete --min-age 30d "$RCLONE_REMOTE/" 2>/dev/null || true
    else
        STATUS_EXTERNO="FALHA"
        echo "[ERRO CRÍTICO] Falha no upload externo para $RCLONE_REMOTE!" >&2
        echo "Status Local: $STATUS_LOCAL | Status Externo: $STATUS_EXTERNO"
        exit 2
    fi
else
    STATUS_EXTERNO="NÃO CONFIGURADO"
    echo "[INFO] rclone não instalado ou remoto '$RCLONE_REMOTE' não configurado. Mantendo cópia criptografada local."
fi

# 4. Limpeza de backups antigos locais (>30 dias)
echo "[4/4] Limpando backups locais com mais de 30 dias..."
find "$BACKUP_DIR" -maxdepth 1 -name "backup_*.zip*" -type f -mtime +30 -delete 2>/dev/null || true

echo "=========================================================="
echo "RELATÓRIO FINAL DO BACKUP:"
echo "  Arquivo:        $BACKUP_NAME"
echo "  Status Local:   $STATUS_LOCAL"
echo "  Status Externo: $STATUS_EXTERNO"
echo "=========================================================="
