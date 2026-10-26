# Testes de servidor (regressão)

Baterias que sobem instâncias **isoladas e vazias** do PocketBase com o código do repositório e exercitam as regras de
verdade (hooks e migrações), algo que os testes do `vitest` (que leem o texto dos arquivos) não fazem.

| Bateria | O que prova |
|---|---|
| `t_contas.py` | conta obrigatória em toda baixa e em todo lançamento realizado; nome de conta único (sem acento/maiúscula); conta com movimento não renomeia, não troca de tipo e não exclui; restauração de backup só por administrador; conta do caixa no fechamento; prazos da Rede; outra empresa. |
| `t_gerar.py` | fechamento por caixa e fita: lançamentos gerados e atômicos, validações que não gravam nada, duplicidade, prazos, estorno do fechamento (só administrador), corrida de pedidos simultâneos, cargos, outra empresa, auditoria. |
| `homolog_oficial.py` | cargos, isolamento entre empresas e segurança herdados dos lotes anteriores (50 verificações). |

## Como rodar
Na raiz do repositório, com o código instalado (`scripts/setup-local.sh` já rodado) e `python3`:

```
bash scripts/testes-servidor/rodar.sh
```

Termina com `[OK] Todas as baterias de servidor passaram.` ou lista as falhas. Nenhum banco real é tocado: as pastas
temporárias são apagadas no fim.

**Regra:** uma versão só é promovida a "aprovada" (ver `CHANGELOG.md`) com estas baterias passando, mais lint, `tsc`,
`build` e a comparação do `vitest` com a linha de base (40 falhas antigas, nenhuma nova).
