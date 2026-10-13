# 05 · Recuperação após perda ou formatação do servidor

## O que existe fora do servidor (e deve existir antes de precisar)
- **Código:** este repositório, na tag de produção.
- **Backups do banco:** cópias cifradas no PC (dois discos) e/ou pen drive, com `REGISTRO.txt`.
- **Senha do backup:** em papel, com custódia do Owner e de uma segunda pessoa.
- **Chave de acesso do administrador** e acesso ao GitHub.

## Ordem
1. Instalar o Ubuntu Server 24.04 LTS (como em 01, seção 1) e preparar o host (`preparar-host.sh`).
2. Gerar a nova chave de deploy e cadastrá-la no GitHub (a antiga pode ser revogada).
3. Baixar a **mesma tag de produção** que estava em uso e rodar `instalar-producao.sh` **sem** `--ativar`.
4. Restaurar o **backup mais recente verificado** (cópia do PC): primeiro `--teste` em pasta separada e conferir totais; depois a restauração real conforme `restaurar.sh` (cria `pb_data`, preserva o estado anterior).
5. Ligar o serviço (`--ativar` com `RAIOX_ACEITA_PB_DATA_EXISTENTE=1`, somente após a restauração conferida).
6. Conferir: login, painel, auditoria (senha mestra), totais iguais ao manifesto, cadastro fechado.
7. Refazer o backup e a cópia externa e registrar.

Tudo o que foi lançado depois do último backup se perde: por isso a rotina diária (03).
