#!/bin/bash
# ==============================================================================
# Script de Instalação e Atualização Local do Sistema Financeiro
# PocketBase v0.26.6 (SDK alinhado com pocketbase ~0.26.9) com Verificação Rígida Dinâmica de Integridade (checksums.txt SHA256)
# ==============================================================================

set -euo pipefail

echo "=== Gestão Financeira - Preparação do Ambiente Local ==="

# 0. Verificar ferramentas básicas necessárias (curl e unzip)
if ! command -v curl >/dev/null 2>&1 || ! command -v unzip >/dev/null 2>&1; then
    echo "[ERRO CRÍTICO] Ferramentas necessárias ausentes (curl e/ou unzip)." >&2
    echo "Instale com: sudo apt install -y curl unzip" >&2
    exit 1
fi

# 1. Verificar Node.js (Node.js 24 LTS recomendado)
if ! command -v node >/dev/null 2>&1; then
    echo "[ERRO CRÍTICO] Node.js não foi encontrado. Instale o Node.js v24 LTS antes de continuar." >&2
    exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 22 ]; then
    echo "[ERRO CRÍTICO] Versão do Node.js incompatível ($NODE_VER). Exige-se Node >= 22 (Node 24 LTS recomendado)." >&2
    exit 1
fi
echo "[OK] Node.js $(node -v) detectado."

# 2. Baixar e verificar checksum SHA256 do PocketBase
# Versão unificada v0.26.6
PB_VERSION="0.26.6"
PB_RELEASE_VERSION="0.26.6"
POCKETBASE_BIN="./pocketbase"

ARCH_RAW=$(uname -m)
case "$ARCH_RAW" in
    x86_64|amd64)
        PB_ARCH="linux_amd64"
        ;;
    aarch64|arm64)
        PB_ARCH="linux_arm64"
        ;;
    *)
        echo "[ERRO CRÍTICO] Arquitetura não suportada automaticamente: $ARCH_RAW" >&2
        exit 1
        ;;
esac

ZIP_NAME="pocketbase_${PB_VERSION}_${PB_ARCH}.zip"
CHECKSUMS_NAME="checksums.txt"

if [ ! -f "$POCKETBASE_BIN" ]; then
    echo "[1/5] Baixando e verificando integridade dinâmica do PocketBase v${PB_VERSION} (${PB_ARCH})..."
    
    # Tentativa de download do release 0.26.6 e respectivo checksums.txt oficial
    DOWNLOAD_SUCCESS=false
    for VER in "$PB_VERSION"; do
        CURRENT_ZIP="pocketbase_${VER}_${PB_ARCH}.zip"
        CHECKSUMS_URL="https://github.com/pocketbase/pocketbase/releases/download/v${VER}/checksums.txt"
        ZIP_URL="https://github.com/pocketbase/pocketbase/releases/download/v${VER}/${CURRENT_ZIP}"
        
        echo "Tentando obter release oficial v${VER}..."
        if curl -f -L -sS --show-error -o "$CHECKSUMS_NAME" "$CHECKSUMS_URL" 2>/dev/null; then
            if curl -f -L -sS --show-error -o "$CURRENT_ZIP" "$ZIP_URL" 2>/dev/null; then
                ZIP_NAME="$CURRENT_ZIP"
                PB_RELEASE_VERSION="$VER"
                DOWNLOAD_SUCCESS=true
                break
            fi
        fi
    done

    if [ "$DOWNLOAD_SUCCESS" != "true" ]; then
        echo "[ERRO CRÍTICO] Falha ao baixar os binários ou checksums.txt oficial do PocketBase no GitHub." >&2
        rm -f "$CHECKSUMS_NAME" "$ZIP_NAME"
        exit 1
    fi

    echo "[1/5] Verificação dinâmica: validando SHA256 de $ZIP_NAME contra o checksums.txt oficial..."
    EXPECTED_SHA256=$(grep "$ZIP_NAME" "$CHECKSUMS_NAME" | awk '{print $1}' | tr -d '\r\n')

    if [ -z "$EXPECTED_SHA256" ]; then
        echo "[ERRO CRÍTICO] Arquivo $ZIP_NAME não encontrado dentro do checksums.txt oficial!" >&2
        rm -f "$CHECKSUMS_NAME" "$ZIP_NAME"
        exit 1
    fi

    ACTUAL_SHA256=$(sha256sum "$ZIP_NAME" | awk '{print $1}' | tr -d '\r\n')
    if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
        echo "[ERRO CRÍTICO] Checksum SHA256 inválido para $ZIP_NAME!" >&2
        echo "  Esperado (checksums.txt): $EXPECTED_SHA256" >&2
        echo "  Obtido:                   $ACTUAL_SHA256" >&2
        rm -f "$CHECKSUMS_NAME" "$ZIP_NAME"
        exit 1
    fi
    echo "[OK] Checksum SHA256 dinâmico validado com sucesso: $ACTUAL_SHA256"

    if ! unzip -o -q "$ZIP_NAME" pocketbase; then
        echo "[ERRO CRÍTICO] Falha ao descompactar $ZIP_NAME" >&2
        rm -f "$CHECKSUMS_NAME" "$ZIP_NAME"
        exit 1
    fi
    rm -f "$CHECKSUMS_NAME" "$ZIP_NAME"
    chmod +x "$POCKETBASE_BIN"
    echo "[OK] PocketBase v${PB_RELEASE_VERSION} instalado com sucesso em $POCKETBASE_BIN."
else
    echo "[1/5] Binário PocketBase já existente em $POCKETBASE_BIN."
fi

# 3. Criar links simbólicos para migrações e hooks do servidor
echo "[2/5] Vinculando migrações e ganchos (pb_migrations / pb_hooks)..."
if [ ! -d "./server/pb_migrations" ] || [ ! -d "./server/pb_hooks" ]; then
    echo "[ERRO CRÍTICO] Pastas ./server/pb_migrations ou ./server/pb_hooks não encontradas!" >&2
    exit 1
fi

ln -sfn ./server/pb_migrations pb_migrations
ln -sfn ./server/pb_hooks pb_hooks
echo "[OK] Links simbólicos pb_migrations e pb_hooks apontados para ./server."

# 4. Instalar dependências (npm ci se houver package-lock.json, senão npm install com aviso) e compilar frontend
if [ -f "package-lock.json" ]; then
    echo "[3/5] Executando npm ci para instalação reproduzível de dependências..."
    if ! npm ci; then
        echo "[ERRO CRÍTICO] 'npm ci' falhou ao instalar dependências." >&2
        exit 1
    fi
else
    echo "================================================================================"
    echo "AVISO: package-lock.json ausente — instalação não reproduzível; versões de dependências podem variar"
    echo "================================================================================"
    echo "[3/5] Executando npm install..."
    if ! npm install; then
        echo "[ERRO CRÍTICO] 'npm install' falhou ao instalar dependências." >&2
        exit 1
    fi
fi

echo "[3/5] Compilando frontend (npm run build)..."
if ! npm run build; then
    echo "[ERRO CRÍTICO] 'npm run build' falhou na compilação do frontend." >&2
    exit 1
fi
echo "[OK] Frontend compilado em ./dist."

# 5. Vincular dist ao pb_public
echo "[4/5] Vinculando frontend compilado ao PocketBase (pb_public)..."
if [ ! -d "./dist" ]; then
    echo "[ERRO CRÍTICO] Pasta ./dist não foi gerada após build!" >&2
    exit 1
fi
ln -sfn ./dist pb_public

echo "[5/5] Instalação e preparação concluídas com 100% de sucesso!"
echo "Para iniciar o servidor local:"
echo "  ./pocketbase serve --http=0.0.0.0:8090"
echo "Ou se configurado via systemd:"
echo "  sudo systemctl restart gestao-financeira"
