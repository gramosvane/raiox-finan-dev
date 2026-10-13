#!/bin/bash
# ----------------------------------------------------------
# Raio-X Financeiro - instalador do APLICATIVO.
#
# NAO prepara o servidor (SSH, firewall, usuario, Node): para isso use deploy/preparar-host.sh.
# NAO cria superusuario, administrador nem senha mestra (sao segredos do Owner; veja docs/operacao).
# NUNCA sobrescreve segredos, banco de dados nem unit diferente da esperada, e PARA em qualquer divergencia.
#
# Uso (como root, dentro do clone, com a TAG de producao em checkout):
#   sudo bash deploy/instalar-producao.sh --verificar        # so confere; nada e alterado
#   sudo bash deploy/instalar-producao.sh                    # prepara e compila; NAO liga servico algum
#   sudo bash deploy/instalar-producao.sh --ativar           # PRODUCAO: pb_data vazio, unit raiox, porta 8090 (go-live VAZIO)
#   RAIOX_NOME_SERVICO=raiox-prova RAIOX_PORTA=18090 \
#   sudo -E bash deploy/instalar-producao.sh --ativar-teste  # PROVA ISOLADA: outra pasta, outra unit, outra porta
# Pode ser executado de novo sem efeito destrutivo (idempotente).
# ----------------------------------------------------------
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# Sempre trabalhar a partir da pasta do aplicativo: os scripts filhos (setup-local.sh) usam caminhos
# relativos e rodam como o usuario de servico, que nao pode gravar na pasta de onde o instalador foi chamado.
cd "$APP_DIR"
USUARIO="${RAIOX_USUARIO:-raiox}"
LOCK_SHA256_ESPERADO="27036301a05e00fc651848241b6dc52adce07bd215a6a4359de360ce57d2102a"
NODE_MAJOR_ESPERADO="24"
PROD_DIR="/opt/raiox/app"
MODO="instalar"
case "${1:-}" in
    "") MODO="instalar" ;;
    --verificar) MODO="verificar" ;;
    --ativar) MODO="ativar" ;;
    --ativar-teste) MODO="ativar-teste" ;;
    *) echo "Uso: $0 [--verificar | --ativar | --ativar-teste]" >&2; exit 2 ;;
esac

ok()    { echo "[OK]    $*"; }
info()  { echo "[INFO]  $*"; }
falha() { echo "[ERRO]  $*" >&2; echo "[ERRO]  Instalação INTERROMPIDA. Corrija a causa e rode de novo (nada foi apagado)." >&2; exit 1; }
G() { git -c safe.directory="$APP_DIR" -C "$APP_DIR" "$@"; }
U() { sudo -u "$USUARIO" -H "$@"; }

echo "== Raio-X Financeiro: instalador ($MODO) =="
echo "Pasta: $APP_DIR"

# ---------- 1. pre-condicoes (nunca alteram nada) ----------
[ "$(id -u)" -eq 0 ] || falha "Execute com sudo."
for c in git node npm curl unzip python3 gpg sha256sum sudo ss systemctl systemd-analyze; do
    command -v "$c" >/dev/null 2>&1 || falha "Programa ausente: $c. Rode antes: sudo bash deploy/preparar-host.sh --aplicar"
done
id "$USUARIO" >/dev/null 2>&1 || falha "Usuário de serviço '$USUARIO' não existe. Rode antes: sudo bash deploy/preparar-host.sh --aplicar"
G rev-parse --is-inside-work-tree >/dev/null 2>&1 || falha "$APP_DIR não é um clone git."

VERSAO="$(grep -m1 '"version"' "$APP_DIR/package.json" | sed 's/[^0-9.]//g')"
TAG_ESPERADA="${RAIOX_TAG_ESPERADA:-v$VERSAO}"
TAG_ATUAL="$(G describe --tags --exact-match 2>/dev/null || true)"
[ -n "$TAG_ATUAL" ] || falha "O código não está numa tag. Use: git checkout $TAG_ESPERADA"
[ "$TAG_ATUAL" = "$TAG_ESPERADA" ] || falha "Tag em checkout: $TAG_ATUAL; esperada: $TAG_ESPERADA (versão do package.json: $VERSAO)."
ok "Tag $TAG_ATUAL no commit $(G rev-parse --short HEAD) (árvore $(G rev-parse 'HEAD^{tree}'))"

SUJO="$(G status --porcelain --untracked-files=no || true)"
[ -z "$SUJO" ] || falha "Há arquivos do repositório alterados: $SUJO"
ok "Repositório limpo (nenhum arquivo rastreado alterado)"

LOCK_ATUAL="$(sha256sum "$APP_DIR/package-lock.json" | cut -d' ' -f1)"
[ "$LOCK_ATUAL" = "$LOCK_SHA256_ESPERADO" ] || falha "package-lock.json diferente do homologado (obtido $LOCK_ATUAL)."
ok "Lockfile homologado conferido (sha256 ${LOCK_ATUAL:0:16}...)"

NODE_MAJOR="$(node -v | sed 's/^v//; s/\..*//')"
[ "$NODE_MAJOR" = "$NODE_MAJOR_ESPERADO" ] || falha "Node major $NODE_MAJOR; o sistema foi provado em Node $NODE_MAJOR_ESPERADO."
ok "Node $(node -v), npm $(npm -v)"

DONO="$(stat -c '%U' "$APP_DIR")"
[ "$DONO" = "$USUARIO" ] || falha "$APP_DIR pertence a '$DONO'; deveria ser '$USUARIO'. (chown -R $USUARIO:$USUARIO $APP_DIR)"
ok "Pasta pertence a $USUARIO"

ENV_ARQ="$APP_DIR/.env.production"
ENV_ESPERADO='VITE_POCKETBASE_URL=/'
if [ -f "$ENV_ARQ" ]; then
    [ "$(tr -d '\r\n' < "$ENV_ARQ")" = "$ENV_ESPERADO" ] || falha ".env.production existe e é diferente do esperado ($ENV_ESPERADO). Não vou sobrescrever; revise manualmente."
    ok ".env.production presente e correto"
else
    info ".env.production ausente (será criado com $ENV_ESPERADO, modo 600)"
fi
if [ -e "$APP_DIR/pb_data" ]; then
    info "pb_data JÁ EXISTE: este instalador nunca o recria nem o altera."
else
    info "pb_data ainda não existe (esperado antes do go-live)."
fi

# ---------- validacoes especificas de cada modo (ainda sem alterar nada) ----------
NOME_SERVICO="raiox"; PORTA="8090"
if [ "$MODO" = "ativar" ]; then
    [ "$APP_DIR" = "$PROD_DIR" ] || falha "--ativar é só para a produção em $PROD_DIR (atual: $APP_DIR). Para prova isolada use --ativar-teste."
elif [ "$MODO" = "ativar-teste" ]; then
    NOME_SERVICO="${RAIOX_NOME_SERVICO:-}"; PORTA="${RAIOX_PORTA:-18090}"
    echo "$NOME_SERVICO" | grep -qE '^raiox-[a-z0-9-]{2,30}$' || falha "RAIOX_NOME_SERVICO inválido (use raiox-<nome>, ex.: raiox-prova)."
    case "$NOME_SERVICO" in raiox|raiox-ensaio) falha "Nome de serviço reservado: $NOME_SERVICO." ;; esac
    echo "$PORTA" | grep -qE '^[0-9]{4,5}$' && [ "$PORTA" -ge 1024 ] && [ "$PORTA" -le 65535 ] || falha "RAIOX_PORTA inválida: $PORTA."
    case "$PORTA" in 8090|8091|8093) falha "Porta reservada: $PORTA." ;; esac
    [ "$APP_DIR" != "$PROD_DIR" ] || falha "--ativar-teste não pode usar a pasta de produção ($PROD_DIR)."
fi

if [ "$MODO" = "verificar" ]; then
    ok "Verificação concluída; nada foi alterado."
    exit 0
fi

# Idempotencia: servico ja ativo => apenas confere e sai ANTES de reconstruir sob um servico em execucao.
if { [ "$MODO" = "ativar" ] || [ "$MODO" = "ativar-teste" ]; } && systemctl is-active --quiet "$NOME_SERVICO" 2>/dev/null; then
    ok "Serviço $NOME_SERVICO JÁ está ativo; nada a fazer."
    curl -fsS -m 5 "http://127.0.0.1:$PORTA/api/health" >/dev/null && ok "/api/health respondeu" || falha "Serviço ativo, mas /api/health não respondeu."
    # Um hook com erro NAO derruba o PocketBase nem o /api/health: confere o log desde que o serviço subiu.
    DESDE_ATIVO="$(systemctl show "$NOME_SERVICO" -p ActiveEnterTimestamp --value 2>/dev/null || true)"
    # Sem um inicio de subida valido nao ha como afirmar que o log esta limpo: FALHA FECHADO (nada e alterado).
    # (RAIOX_TESTE_TIMESTAMP_VAZIO=1 existe so para a prova automatizada deste caminho.)
    [ "${RAIOX_TESTE_TIMESTAMP_VAZIO:-0}" != "1" ] || DESDE_ATIVO=""
    case "$DESDE_ATIVO" in
        ""|"n/a") falha "Não consegui obter o horário de início do serviço $NOME_SERVICO (ActiveEnterTimestamp vazio): não posso conferir os hooks. Nada foi alterado." ;;
    esac
    journalctl -u "$NOME_SERVICO" --no-pager --since "$DESDE_ATIVO" >/dev/null 2>&1 \
        || falha "Não consegui ler o log do serviço $NOME_SERVICO desde '$DESDE_ATIVO': não posso conferir os hooks. Nada foi alterado."
    FALHAS_HOOK="$(journalctl -u "$NOME_SERVICO" --no-pager --since "$DESDE_ATIVO" 2>/dev/null | grep -c 'Failed to execute' || true)"
    [ "${FALHAS_HOOK:-0}" = "0" ] || falha "O log do serviço contém 'Failed to execute' ($FALHAS_HOOK ocorrência(s)): hook com erro. NÃO use esta instância (journalctl -u $NOME_SERVICO | grep 'Failed to execute')."
    ok "Log desde a subida ($DESDE_ATIVO) sem 'Failed to execute'"
    exit 0
fi

# Falha CEDO (antes de reconstruir qualquer coisa): politica de pb_data e porta.
if [ "$MODO" = "ativar" ] || [ "$MODO" = "ativar-teste" ]; then
    if [ -e "$APP_DIR/pb_data" ] && [ "${RAIOX_ACEITA_PB_DATA_EXISTENTE:-0}" != "1" ]; then
        falha "pb_data já existe e o serviço está parado. Não vou subir sobre um banco existente sem confirmação explícita (RAIOX_ACEITA_PB_DATA_EXISTENTE=1)."
    fi
    if ss -tln | awk '{print $4}' | grep -E "[:.]$PORTA\$" >/dev/null; then
        falha "A porta $PORTA já está em uso por outro processo."
    fi
fi

# ---------- 2. preparar e compilar (nunca toca em pb_data) ----------
if [ ! -f "$ENV_ARQ" ]; then
    printf '%s\n' "$ENV_ESPERADO" | U tee "$ENV_ARQ" >/dev/null
    chmod 600 "$ENV_ARQ"; chown "$USUARIO:$USUARIO" "$ENV_ARQ"
    ok ".env.production criado"
fi
info "preparar-producao.sh"
U bash "$APP_DIR/deploy/preparar-producao.sh" || falha "preparar-producao.sh falhou."
info "setup-local.sh (npm ci + PocketBase com checksum + build)"
LOG="/tmp/raiox-setup.$$.log"
U bash "$APP_DIR/scripts/setup-local.sh" > "$LOG" 2>&1 || { tail -20 "$LOG" >&2; falha "setup-local.sh falhou (log completo em $LOG)."; }
ok "Dependências instaladas e frontend compilado"
U bash "$APP_DIR/deploy/preparar-producao.sh" --conferir-build || falha "Conferência do build falhou."
SUJO="$(G status --porcelain --untracked-files=no || true)"
[ -z "$SUJO" ] || falha "A instalação alterou arquivos rastreados: $SUJO"
ok "Build conferido; repositório continua limpo"
# Sem "| head -1": com pipefail o SIGPIPE pode derrubar o script de forma intermitente (codigo 141).
PB_VER_COMPLETO="$(U "$APP_DIR/pocketbase" --version 2>&1 || true)"
PB_VER="${PB_VER_COMPLETO%%$'\n'*}"
ok "$PB_VER (sha256 $(sha256sum "$APP_DIR/pocketbase" | cut -c1-16)...)"

if [ "$MODO" = "instalar" ]; then
    info "NADA foi ligado: nenhum serviço foi iniciado."
    echo "Para ligar (go-live VAZIO): sudo bash deploy/instalar-producao.sh --ativar"
    exit 0
fi

# ---------- 3. ativar: TUDO e validado antes de qualquer mudanca de estado ----------
UNIT_ORIGEM="$APP_DIR/deploy/raiox.service"
UNIT_DESTINO="/etc/systemd/system/$NOME_SERVICO.service"
UNIT_TMP="$(mktemp --suffix=.service)"
trap 'rm -f "$UNIT_TMP"' EXIT
if [ "$MODO" = "ativar" ]; then
    cp "$UNIT_ORIGEM" "$UNIT_TMP"
else
    # unit derivada: so troca pasta, porta e descricao (mesmas protecoes de seguranca)
    sed -e "s#/opt/raiox/app#$APP_DIR#g" -e "s#127.0.0.1:8090#127.0.0.1:$PORTA#" \
        -e "s#^Description=.*#Description=Raio-X Financeiro PROVA ISOLADA ($NOME_SERVICO)#" "$UNIT_ORIGEM" > "$UNIT_TMP"
fi
[ -x "$APP_DIR/pocketbase" ] && [ -f "$APP_DIR/dist/index.html" ] || falha "Build ausente."
systemd-analyze verify "$UNIT_TMP" >/dev/null 2>&1 || falha "systemd-analyze verify reprovou a unit ($UNIT_TMP). Nada foi alterado."
grep -q "^User=$USUARIO\$" "$UNIT_TMP" || falha "A unit não executa como $USUARIO."
grep -q "^WorkingDirectory=$APP_DIR\$" "$UNIT_TMP" || falha "WorkingDirectory da unit não é $APP_DIR."
grep -q "^ExecStart=$APP_DIR/pocketbase serve --http=127.0.0.1:$PORTA\$" "$UNIT_TMP" || falha "ExecStart da unit inesperado."
if [ -f "$UNIT_DESTINO" ] && [ ! -L "$UNIT_DESTINO" ] && ! cmp -s "$UNIT_TMP" "$UNIT_DESTINO"; then
    falha "$UNIT_DESTINO já existe e é diferente da unit esperada. Não vou sobrescrever; revise."
fi
if [ -e "$APP_DIR/pb_data" ] && [ "${RAIOX_ACEITA_PB_DATA_EXISTENTE:-0}" != "1" ]; then
    falha "pb_data já existe e o serviço está parado. Não vou subir sobre um banco existente sem confirmação explícita (RAIOX_ACEITA_PB_DATA_EXISTENTE=1)."
fi
if ss -tln | awk '{print $4}' | grep -E "[:.]$PORTA\$" >/dev/null; then falha "A porta $PORTA já está em uso por outro processo."; fi
ok "Validações da ativação concluídas (unit, caminhos, porta, banco). Agora sim vou alterar o estado."

# ---------- estado: registra o que ESTA execucao fez, para desfazer se falhar ----------
CRIOU_PBDATA=0; DESMASCAROU=0; CRIOU_UNIT=0; INICIOU=0; ATIVANDO=1
desfazer() {
    trap - ERR
    echo "[ERRO]  Falha na ativação: desfazendo apenas o que esta execução fez..." >&2
    if [ "$INICIOU" = 1 ]; then systemctl disable --now "$NOME_SERVICO" >/dev/null 2>&1 || true; fi
    if [ "$CRIOU_UNIT" = 1 ]; then rm -f -- "$UNIT_DESTINO"; fi
    if [ "$DESMASCAROU" = 1 ]; then systemctl mask "$NOME_SERVICO" >/dev/null 2>&1 || true; fi
    if [ "$CRIOU_PBDATA" = 1 ] && [ -z "$(ls -A "$APP_DIR/pb_data" 2>/dev/null)" ]; then rmdir "$APP_DIR/pb_data" || true; fi
    systemctl daemon-reload || true
    echo "[ERRO]  Estado final: pb_data $( [ -e "$APP_DIR/pb_data" ] && echo 'existe' || echo 'não existe' ); unit $NOME_SERVICO $( [ -f "$UNIT_DESTINO" ] && echo 'instalada' || echo 'não instalada' ); serviço parado." >&2
    exit 1
}
trap 'desfazer' ERR

if [ ! -e "$APP_DIR/pb_data" ]; then
    install -d -m 700 -o "$USUARIO" -g "$USUARIO" "$APP_DIR/pb_data"; CRIOU_PBDATA=1
    ok "pb_data criado vazio (modo 700, dono $USUARIO)"
fi
chmod 600 "$ENV_ARQ"
if [ "$(systemctl is-enabled "$NOME_SERVICO" 2>&1 || true)" = "masked" ]; then
    systemctl unmask "$NOME_SERVICO"; DESMASCAROU=1
    ok "Unit $NOME_SERVICO desmascarada"
fi
if [ ! -f "$UNIT_DESTINO" ]; then install -m 644 "$UNIT_TMP" "$UNIT_DESTINO"; CRIOU_UNIT=1; fi
systemctl daemon-reload
INICIO_TS="$(date '+%Y-%m-%d %H:%M:%S')"
systemctl enable --now "$NOME_SERVICO"; INICIOU=1
for _ in $(seq 1 20); do
    curl -fsS -m 3 "http://127.0.0.1:$PORTA/api/health" >/dev/null 2>&1 && break
    sleep 1
done
curl -fsS -m 3 "http://127.0.0.1:$PORTA/api/health" >/dev/null 2>&1 || { echo "[ERRO]  O serviço não respondeu em 20 s (veja: journalctl -u $NOME_SERVICO -n 50)." >&2; false; }
ESCUTA="$(ss -tln | awk '{print $4}' | grep -E "[:.]$PORTA\$" | sort -u | tr '\n' ' ')"
[ "$ESCUTA" = "127.0.0.1:$PORTA " ] || { echo "[ERRO]  Escuta inesperada na $PORTA: '$ESCUTA' (esperado só 127.0.0.1:$PORTA)." >&2; false; }
# Hook com erro de execucao NAO derruba o PocketBase nem o /api/health (regras do servidor deixariam de valer):
# o log desta subida precisa estar limpo, senao a ativacao e desfeita como qualquer outra falha.
sleep 2
journalctl -u "$NOME_SERVICO" --no-pager --since "$INICIO_TS" >/dev/null 2>&1 \
    || { echo "[ERRO]  Não consegui ler o log do serviço: não posso conferir os hooks. Desfazendo a ativação." >&2; false; }
FALHAS_HOOK="$(journalctl -u "$NOME_SERVICO" --no-pager --since "$INICIO_TS" 2>/dev/null | grep -c 'Failed to execute' || true)"
[ "${FALHAS_HOOK:-0}" = "0" ] || { echo "[ERRO]  O log contém 'Failed to execute' ($FALHAS_HOOK ocorrência(s)): hook com erro. Desfazendo a ativação." >&2; false; }
ok "Log da subida sem 'Failed to execute' (hooks carregados)"
trap 'rm -f "$UNIT_TMP"' EXIT
trap - ERR
ok "Serviço $NOME_SERVICO ativo, /api/health 200, escutando só em 127.0.0.1:$PORTA"
if [ "$MODO" = "ativar" ]; then
cat <<'FIM'

PRÓXIMOS PASSOS (manuais, do Owner; veja docs/operacao/02-go-live.md):
  1. Primeiro acesso do superusuário PELO NAVEGADOR (túnel SSH): o PocketBase imprime um link de instalação
     no log (journalctl -u raiox | grep pbinstal). Você digita e-mail e senha no formulário, sem linha de comando.
  2. Painel por túnel SSH: ativar limites de tentativas; criar o administrador real; definir a senha mestra.
  3. Primeiro backup + cópia externa + restauração de teste ANTES do primeiro lançamento real.
FIM
fi
