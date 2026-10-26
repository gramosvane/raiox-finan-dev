#!/bin/bash
# Testes de SERVIDOR do e-Audit (regressão de qualquer versão).
# Sobe instâncias ISOLADAS e VAZIAS do PocketBase (pastas temporárias, portas 18137 a 18140), roda cada bateria e
# apaga as pastas temporárias. NÃO toca em nenhum banco real. Pré-requisito: o código instalado (node, npm ci e
# scripts/setup-local.sh já rodados: existem ./pocketbase e ./dist) e python3.
# Uso, na raiz do repositório:  bash scripts/testes-servidor/rodar.sh
set -u
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
AQUI="$RAIZ/scripts/testes-servidor"
[ -x "$RAIZ/pocketbase" ] || { echo "[ERRO] $RAIZ/pocketbase não existe: rode antes scripts/setup-local.sh"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "[ERRO] python3 não encontrado"; exit 1; }
TOTAL_FALHAS=0

rodar() { # $1=nome  $2=script  $3=porta  $4=modo (api = script recebe URL e pasta; homolog = script fixo com sed)  $5=super (cria um superusuário de teste)
    local NOME="$1" SCRIPT="$2" PORTA="$3" MODO="$4" SUPER="${5:-}"
    local D; D="$(mktemp -d)"
    mkdir -p "$D/pb_data"
    if [ "$SUPER" = "super" ]; then # superusuário descartável (mesma instância isolada), para exercitar os ganchos de modelo que as regras de API escondem
        "$RAIZ/pocketbase" superuser upsert su@teste.local SenhaSuper12345 --dir="$D/pb_data" --migrationsDir="$RAIZ/server/pb_migrations" --hooksDir="$RAIZ/server/pb_hooks" >/dev/null 2>&1 || true
    fi
    "$RAIZ/pocketbase" serve --dir="$D/pb_data" --hooksDir="$RAIZ/server/pb_hooks" --migrationsDir="$RAIZ/server/pb_migrations" \
        --publicDir="$RAIZ/dist" --http="127.0.0.1:$PORTA" > "$D/pb.log" 2>&1 &
    local PID=$!
    sleep 7
    echo "=== $NOME"
    local SAIDA
    if [ "$MODO" = "homolog" ]; then
        sed -e "s/18090/$PORTA/" -e "s#/home/master/.homolog_pw#$D/.pw#" "$AQUI/$SCRIPT" > "$D/h.py"
        SAIDA="$(python3 "$D/h.py" 2>&1)"
    else
        SAIDA="$(python3 "$AQUI/$SCRIPT" "http://127.0.0.1:$PORTA" "$D/pb_data" 2>&1)"
    fi
    echo "$SAIDA" | grep -E 'FALHA|RESUMO|Traceback|Error' || true
    local F; F="$(echo "$SAIDA" | grep -c '^FALHA')"
    local H; H="$(grep -c 'Failed to execute' "$D/pb.log" || true)"
    echo "    falhas: $F | hooks com erro de execução: $H"
    TOTAL_FALHAS=$((TOTAL_FALHAS + F + H))
    kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null
    rm -rf "$D"
}

rodar "Contas, baixas e restauração de backup" t_contas.py 18138 api
rodar "Fechamento de caixa (geração, estorno, concorrência, cargos)" t_gerar.py 18139 api
rodar "Depósito conferido (baixa pelo bruto, taxa, concorrência, correção)" t_deposito.py 18140 api super
rodar "Homologação oficial (cargos, isolamento entre empresas, segurança)" homolog_oficial.py 18137 homolog
echo
if [ "$TOTAL_FALHAS" -eq 0 ]; then echo "[OK] Todas as baterias de servidor passaram."; else echo "[ERRO] $TOTAL_FALHAS falha(s). Não promova esta versão."; exit 1; fi
