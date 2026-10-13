#!/bin/bash
# ----------------------------------------------------------
# Raio-X Financeiro - Preparação do código para produção (SEC-02)
#
# A plataforma de desenvolvimento exige o script externo goskip no index.html.
# Em produção ele é removido aqui, de forma controlada e "fail-closed":
# qualquer coisa fora do esperado cancela a preparação e devolve o arquivo original.
#
# Uso (como o usuário do sistema, na pasta do código):
#   sudo -u raiox bash deploy/preparar-producao.sh                  # antes de compilar
#   sudo -u raiox bash deploy/preparar-producao.sh --conferir-build # depois de compilar
# ----------------------------------------------------------
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"
ARQ="index.html"
LINHA_SCRIPT='<script src="https://goskip.dev/skip.js"></script>'
LINHA_COMENTARIO='<!-- @skip-protected: Do not remove. Required for app features. -->'

# Nunca descarta alteração local sem guardar antes uma cópia datada do que existia.
guarda_copia() {
    if [ -f "$ARQ" ] && ! git -c safe.directory="$APP_DIR" diff --quiet -- "$ARQ" 2>/dev/null; then
        COPIA="$ARQ.divergente-$(date +%Y%m%d-%H%M%S)"
        cp -p -- "$ARQ" "$COPIA" && echo "[AVISO] Cópia do $ARQ alterado guardada em: $COPIA" >&2
    fi
}

falha() {
    echo "[ERRO] $*" >&2
    guarda_copia
    git -c safe.directory="$APP_DIR" checkout -- "$ARQ" 2>/dev/null || true
    echo "[ERRO] Preparação cancelada; $ARQ voltou ao original. Não compile nem instale esta versão sem revisar." >&2
    exit 1
}
conta() { grep -cF -- "$1" "$ARQ" || true; }

if [ "${1:-}" = "--conferir-build" ]; then
    [ -f dist/index.html ] || falha "dist/index.html não existe. Rode o setup antes."
    if grep -rqF "skip.js" dist/; then falha "A compilação ainda contém skip.js."; fi
    if grep -rqE '<script[^>]+src="https?://' dist/index.html; then falha "A compilação contém script externo."; fi
    echo "[OK] Compilação sem skip.js e sem scripts externos."
    exit 0
fi

git -c safe.directory="$APP_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 || falha "$APP_DIR não é um clone git."
echo "Commit: $(git -c safe.directory="$APP_DIR" rev-parse --short HEAD)"

ALTERADOS="$(git -c safe.directory="$APP_DIR" status --porcelain --untracked-files=no | grep -v " $ARQ\$" || true)"
[ -z "$ALTERADOS" ] || falha "Há arquivos do repositório alterados além do $ARQ: $ALTERADOS"

PREPARADO_NO_COMMIT=0
if [ "$(conta "$LINHA_SCRIPT")" = "0" ] && [ "$(conta "$LINHA_COMENTARIO")" = "0" ]; then
    echo "[INFO] $ARQ já estava preparado; conferindo..."
    # Versão 0.0.118 em diante: o próprio commit já traz o arquivo preparado e não deve haver diferença.
    # grep -c (sem -q) le tudo: evita SIGPIPE com pipefail dando falso resultado.
    SKIP_NO_COMMIT="$(git -c safe.directory="$APP_DIR" show "HEAD:$ARQ" 2>/dev/null | grep -cF "skip.js" || true)"
    if [ "${SKIP_NO_COMMIT:-0}" = "0" ]; then PREPARADO_NO_COMMIT=1; fi
else
    guarda_copia
    git -c safe.directory="$APP_DIR" checkout -- "$ARQ"
    [ "$(conta "$LINHA_SCRIPT")" = "1" ] || falha "Esperava exatamente 1 linha do skip.js em $ARQ; a estrutura mudou."
    [ "$(conta "$LINHA_COMENTARIO")" = "1" ] || falha "Esperava exatamente 1 comentário do skip.js em $ARQ; a estrutura mudou."
    grep -vF -e "$LINHA_SCRIPT" -e "$LINHA_COMENTARIO" "$ARQ" > "$ARQ.tmp-preparo"
    cat "$ARQ.tmp-preparo" > "$ARQ"
    rm -f "$ARQ.tmp-preparo"
fi

[ "$(conta "skip.js")" = "0" ] || falha "skip.js continua em $ARQ."
[ "$(conta '<script type="module" src="/src/main.tsx"></script>')" = "1" ] || falha "Entrypoint /src/main.tsx ausente ou duplicado."
[ "$(conta '<div id="root"></div>')" = "1" ] || falha "Elemento root ausente ou duplicado."
if grep -qE '<script[^>]+src="https?://' "$ARQ"; then falha "$ARQ contém outro script externo."; fi
NUMSTAT="$(git -c safe.directory="$APP_DIR" diff --numstat -- "$ARQ")"
if [ "$PREPARADO_NO_COMMIT" = "1" ]; then
    [ -z "$NUMSTAT" ] || falha "O $ARQ preparado no commit foi alterado localmente (obtido: '$NUMSTAT')."
else
    [ "$NUMSTAT" = "0	2	$ARQ" ] || falha "A diferença no $ARQ não é só a remoção das 2 linhas (obtido: '$NUMSTAT')."
fi

if [ "$PREPARADO_NO_COMMIT" = "1" ]; then echo "[OK] $ARQ já vem preparado no commit (sem skip.js); nada foi alterado."; else echo "[OK] $ARQ preparado: só as 2 linhas do skip.js removidas; entrypoint e root preservados."; fi