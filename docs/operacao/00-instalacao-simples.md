# e-audit · Instalação simples (um comando)

Para um servidor **Ubuntu Server 24.04** novo, ligado na rede local e com internet.

## Instalar

Conecte no servidor e rode (troque `v0.2.0` pela versão desejada):

```
curl -fsSL https://raw.githubusercontent.com/gramosvane/raiox-finan-dev/v0.2.0/install.sh | sudo bash -s -- v0.2.0
```

O comando faz tudo sozinho e mostra o andamento: instala o que faltar, liga o firewall (só a sua rede local
entra), baixa o aplicativo do GitHub, instala e liga o serviço. Se algo falhar, ele para e diz o que fazer.
No fim mostra o **endereço** (`http://IP-DO-SERVIDOR:8090/`) e o **código de ativação**.

## Primeiro acesso (pelo navegador, sem terminal)

1. Abra o endereço mostrado. Crie um **atalho** para ele na área de trabalho.
2. Informe o **código de ativação** e crie o **administrador**.
3. Defina a **Senha Mestra** (protege a Auditoria).
4. Em **Usuários**, crie os usuários do dia a dia.

O código só vale uma vez. Se perdê-lo antes de usar: `sudo cat /opt/raiox/app/pb_data/ativacao.codigo`.

## Segurança

- Só a rede local acessa o sistema e o SSH. Nenhuma porta é aberta no roteador.
- O superusuário técnico do PocketBase é criado automaticamente; suas credenciais ficam em
  `/etc/e-audit/superusuario.txt` (só o administrador do servidor lê). O usuário final não precisa dele.
- O acesso é por HTTP dentro da rede local. Para acesso de fora use o Cloudflare Tunnel (HTTPS), conforme
  `docs/INSTALACAO-PRODUCAO.md`, seção 6.
- Limites de tentativas de login ficam ativados pelo instalador.

## Se a instalação parar no meio

Nada é apagado. O próprio instalador mostra o comando para guardar a tentativa
(`sudo mv /opt/raiox/app /opt/raiox/app.tentativa-...`); depois rode o comando de instalação outra vez.

## Atualizar e recuperar

Veja `04-atualizacao-e-retorno.md` e `03-backup-e-copia-externa.md`.
