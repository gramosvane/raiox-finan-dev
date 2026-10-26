# e-Audit · Histórico de versões

Cada versão é uma **tag** no GitHub. A coluna "Situação" diz o que foi realmente provado; só uma versão
**aprovada** deve ser tomada como ponto de retorno.

| Versão | Situação | O que traz |
|---|---|---|
| `v0.2.0-rc.7` | Candidato (baterias de servidor 0 falhas; aguardando teste do Owner) | **Fase 1 de Bancos e Caixa:** conta obrigatória em toda baixa e em todo lançamento realizado (tela e servidor); nome de conta único (sem acento/maiúscula), conta com movimento não renomeia, não troca de tipo nem exclui; conta do caixa (ex.: Cofre) no fechamento; prazos da Rede (PIX 0, débito 1, crédito 31 dias); restauração de backup só por administrador; taxa de maquineta no plano como despesa financeira (5.7); testes de servidor dentro do repositório (`scripts/testes-servidor`). Migração 0025 (aditiva). Inclui rc.6. |
| `v0.2.0-rc.6` | Candidato (testes automatizados 0 falhas) | Textos do fechamento (Valor total, Dinheiro); página sempre atualizada após uma atualização (`Cache-Control: no-cache`). Inclui rc.5. |
| `v0.2.0-rc.5` | Instalada no servidor do Owner; fechamento testado por ele na tela (aprovou o resultado) | Fechamento de caixa gera os lançamentos por caixa e fita; estorno de fechamento só do administrador; categorias inativas recusadas. Inclui rc.3 e rc.4. Migrações 0023 e 0024 (aditivas). |
| `v0.2.0-rc.4` | Substituída pela rc.5 (nunca instalada) | Fechamento de caixa que gera lançamentos (dinheiro, PIX, débito, crédito e despesas do caixa). |
| `v0.2.0-rc.3` | Substituída (nunca instalada) | Total da fita no fechamento; o primeiro acesso passa a pedir o nome da empresa. |
| `v0.2.0-rc.2` | **Aprovada e instalada** no servidor do Owner (atualização rc.1 → rc.2 provada) | Nome e-Audit no login, primeiro acesso, cabeçalho e aba; campo "Usuário" no login. |
| `v0.2.0-rc.1` | **Aprovada**: instalação limpa provada no servidor do Owner | Instalação em um comando (`install.sh`), código de ativação no primeiro acesso, superusuário técnico automático, painel só de dentro do servidor, limites de tentativas. |
| `v0.1.15` | **Aprovada** (última da linha Raio-X em produção) | Ajustes visuais (liquidez, filtros da Inadimplência). |
| `v0.1.14` | Aprovada | Tela Inadimplência. |
| `v0.1.13` | Aprovada | Telas Receita e Custo da operação. |
| `v0.1.12` | Aprovada | Correções de segurança (Claude Security F1 a F6), regressão financeira de outubro/2026. |

Convenções:
- `vN.N.N` = versão final aprovada. `vN.N.N-rc.N` = candidato em teste.
- A branch `main` só avança para uma versão **aprovada e instalada**. Hoje a `main` está na `v0.1.15`.
- As migrações do banco são **só aditivas** (nunca apagam nem alteram dados), por isso um banco migrado por uma
  versão nova continua abrindo com a versão anterior (veja `docs/operacao/08-versoes-e-retorno.md`).
