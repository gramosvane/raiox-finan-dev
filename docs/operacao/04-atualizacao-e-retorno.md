# 04 · Atualização e retorno

Só se atualiza para uma **tag de produção** revisada (`vX.Y.Z`). Nunca `git pull`, nunca a `main`, nunca editar código no servidor.

## Antes (todos obrigatórios; qualquer falha = não atualizar)
1. Backup **concluído e conferido** (03), com cópia externa verificada **hoje**.
2. Procedimento de volta conhecido: versão atual anotada (tag + commit) e a restauração testada recentemente.
3. Janela combinada (ninguém lançando).
4. Notas da versão nova lidas; migrações do banco irreversíveis? (se sim, só com plano de retorno aprovado).

## Atualizar
```bash
cd /opt/raiox/app
sudo systemctl stop raiox
sudo -u raiox git fetch --tags origin
sudo -u raiox git checkout vNOVA          # a tag, nunca um branch
sudo bash deploy/instalar-producao.sh      # confere tag/lockfile/repositório e recompila
sudo systemctl start raiox
curl -s http://127.0.0.1:8090/api/health
```
Registrar: versão de origem e destino, hash do commit, data/hora, resultado.

## Retorno (se algo falhar)
1. `sudo systemctl stop raiox`
2. Voltar o código: `sudo -u raiox git checkout vANTERIOR` e `sudo bash deploy/instalar-producao.sh`.
3. Se os **dados** foram afetados: restaurar o backup do passo 1 (`restaurar.sh` com `RAIOX_APP_DIR`/`RAIOX_SERVICO`; o script guarda o estado atual em `pb_data.antes-restauracao-*` e desfaz sozinho se o sistema não responder em 15 s).
4. Não apagar `pb_data.antes-restauracao-*` até saber qual estado cada pasta contém.

Restaurar o backup recupera os dados, mas **não** torna uma migração reversível: por isso o item 4 acima.
