# 06 · Matriz de configurações e segredos

| Item | Onde fica | No Git? | Quem guarda |
|---|---|---|---|
| Código, lockfile, scripts, unit do serviço | Repositório (tag) | **Sim** | — |
| `VITE_POCKETBASE_URL=/` (`.env.production`) | `/opt/raiox/app/.env.production` (600) | Não (é recriado pelo instalador; não é segredo) | — |
| Banco (`pb_data`) | `/opt/raiox/app/pb_data` (700) | **Nunca** | Backup cifrado |
| Senha do superusuário | Só na cabeça/gerenciador do Owner | **Nunca** | Owner |
| Senha mestra da Auditoria | Gerenciador do Owner | **Nunca** | Owner (e quem ele indicar) |
| Senha do backup | Papel fora do servidor/PC + segunda pessoa | **Nunca** | Owner |
| Chave de deploy (privada) | `/opt/raiox/.ssh/id_ed25519` (só `raiox`) | **Nunca** | Servidor |
| Chave pública de deploy | GitHub (Deploy key, somente leitura) | Não | Owner |
| Chave SSH do administrador | PC do administrador | **Nunca** | Administrador |
| SSH só por chave, firewall, usuário `raiox` | `/etc/ssh/sshd_config.d/01-raiox.conf`, `ufw`, `/etc/passwd` | Não (recriado por `preparar-host.sh`) | Técnico |
| Token do Cloudflare Tunnel | Servidor (quando existir) | **Nunca** | Owner |
| Evidências, pareceres, aceite assinado | Custódia privada do Owner | **Nunca** | Owner |

Regras: nenhum segredo em argumentos de comando visíveis em `ps`, em logs, em e-mail, em planilha de backup, em captura de tela ou no mesmo local dos backups.
