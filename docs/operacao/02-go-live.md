# 02 · Go-live (vazio) e liberação do uso

Três autorizações **distintas**. Uma não vale pela outra:

1. Subir a instância **vazia** e protegida.
2. Cadastrar empresa, administrador e usuários **reais** (isso já é dado real de cadastro) e provar os controles.
3. **Primeiro lançamento/saldo real**: só com autorização expressa do Owner, registrada com data e hora.

## Passo a passo (cada passo tem critério de parada)

1. `sudo bash /opt/raiox/app/deploy/instalar-producao.sh --ativar` → cria `pb_data` vazio (700), instala a unit e liga o serviço. **Para** se já existir banco com o serviço parado.
2. Conferir: `/api/health` 200; o instalador já falha e desfaz se o log da subida tiver `Failed to execute` (hook com erro; o health **não** mostra isso), mas confirme também com `journalctl -u raiox | grep -c 'Failed to execute'` (esperado 0); escuta **só** em `127.0.0.1:8090`; firewall inalterado; `systemctl cat raiox` com `User=raiox`.
3. **Superusuário** (segredo do Owner), **sem linha de comando**: com o serviço no ar e **nenhum** superusuário existente, o PocketBase imprime no log um link de instalação (`journalctl -u raiox | grep pbinstal`). Abra esse link **pelo navegador, através do túnel SSH** (`http://localhost:8090/_/#/pbinstal/...`) e digite e-mail e senha no formulário. A senha nunca aparece em argumentos de processo, histórico ou logs. Depois de criada, o link deixa de valer. **Não** use `superuser upsert EMAIL SENHA`: isso expõe a senha nos argumentos do processo.
4. Painel pelo túnel SSH (`ssh -L 8090:127.0.0.1:8090 usuario@servidor` e `http://localhost:8090/_/`): ativar **Rate limits**. (Não configure `CF-Connecting-IP` antes do Cloudflare.)
5. Criar o **administrador real** pelo painel de superusuário (papel `administrador`, empresa real), nunca pelo cadastro público.
6. No sistema: **Configurações → Senha Mestra (Auditoria)**: definir senha exclusiva. Provar: senha errada recusada; senha certa abre a Auditoria.
7. **Cadastro fechado**: `POST` anônimo em `users` deve dar 400/403; tela de login sem "Criar conta"; `/_/` só por túnel.
8. Criar os demais usuários e **testar permissões por sessão**: leitura não grava; operador não executa ações de administrador.
9. **Integridade inicial**: migrações completas, nenhum registro financeiro inesperado, nenhum dado de teste.
10. **Primeiro backup + cópia externa + restauração de teste** (03). **Bloqueante.** Se falhar, o sistema não entra em uso.
11. Remover qualquer `sudo` temporário e conferir que pede senha.
12. Validar plano de contas, natureza das contas, datas e saldos de abertura contra os documentos de origem **antes** de lançar.
13. Autorização expressa do Owner para o primeiro lançamento real (registrar data/hora).

## Rollback (antes do primeiro dado real)

```bash
sudo systemctl disable --now raiox && sudo systemctl mask raiox
sudo mv /opt/raiox/app/pb_data /opt/raiox/app/pb_data.golive-abortado-$(date +%Y%m%d-%H%M%S)   # NUNCA apagar
```

### Se a ativação falhar por hook com erro (ou outra falha depois de o serviço subir)

O instalador desfaz o que fez (unit, habilitação, serviço parado), mas **não apaga** um `pb_data` que já tenha arquivos: o PocketBase chega a criar alguns antes de o hook falhar, e o instalador nunca apaga banco. A rodada seguinte será recusada com a mensagem "pb_data já existe e o serviço está parado". Isso é proposital.

1. Veja a causa: `journalctl -u raiox | grep 'Failed to execute'`.
2. Em instalação **nova** (sem dado real), guarde o `pb_data` ao lado, sem apagar: `sudo mv /opt/raiox/app/pb_data /opt/raiox/app/pb_data.golive-abortado-$(date +%Y%m%d-%H%M%S)`.
3. Corrija a causa, confira a tag e rode `--ativar` de novo.
   Se já houver dado real, **não** mova nada: restaure pelo manual 03 e chame o responsável técnico.

## Acesso da equipe

Só por túnel SSH até o Cloudflare Tunnel + Access serem configurados (docs/INSTALACAO-PRODUCAO.md, seção 6) e testados de fora da rede.
