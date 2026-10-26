# 08 · Versões aprovadas e retorno

## Regra de ouro
Toda mudança sobe ao GitHub como **candidato** (`vN.N.N-rc.N`), é testada, e só depois vira versão **aprovada**.
O `CHANGELOG.md` diz qual é qual. Em caso de problema, volta-se para a **última versão aprovada**.

## Antes de atualizar
O script de atualização (`atualizar-producao.sh`) já faz, nesta ordem e parando se algo falhar:
1. confere o pacote (SHA-256) e a tag;
2. testa a nova versão numa **cópia** do banco;
3. guarda uma cópia do banco e do site de antes (`pb_data.antes-atualizacao-*` e `dist.antes-*`, nunca apagadas);
4. troca a versão e confere saúde e hooks;
5. **se qualquer passo falhar, volta sozinho** para a versão anterior, conferindo o banco por SHA-256.

## Voltar para uma versão anterior depois de atualizar
1. Tenha o pacote da versão antiga (`raiox-vN.N.N.bundle`, gerado com `git bundle create` a partir da tag) e o seu SHA-256.
2. Rode o mesmo script de atualização, apontando para o pacote antigo:
   `sudo env RAIOX_ALVO=producao bash atualizar-producao.sh /home/master/PACOTE_ANTIGO.bundle SHA256 TAG COMMIT_CURTO`
3. Confira a saúde (`/api/health`) e abra o sistema com Ctrl+F5.

## O que foi provado (ensaio de retorno, 26/10/2026)
Um banco migrado pela `v0.2.0-rc.5` (30 migrações, com fechamentos, lançamentos e estornos) foi aberto pelo código da
`v0.2.0-rc.2` em instância isolada: o serviço subiu, sem erro de hook, o login funcionou, todos os lançamentos e
fechamentos continuaram legíveis e um lançamento novo foi aceito. As migrações só acrescentam campos, e a versão antiga os ignora.

**Limite honesto:** o retorno pelo script de atualização com uma tag mais antiga não foi executado como administrador
(root); o que foi provado é o banco novo abrindo com o código antigo. No primeiro retorno real, use primeiro o ensaio
na cópia do banco que o próprio script faz.

## Quando o problema é o banco
Restaure o backup cifrado (`03-backup-e-copia-externa.md`). Backup e restauração de teste são obrigatórios antes de
lançar dados reais.
