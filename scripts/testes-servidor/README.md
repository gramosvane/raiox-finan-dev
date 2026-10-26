# Testes de servidor (regressão)

Baterias que sobem instâncias **isoladas e vazias** do PocketBase com o código do repositório e exercitam as regras de
verdade (hooks e migrações), algo que os testes do `vitest` (que leem o texto dos arquivos) não fazem.

| Bateria | O que prova |
|---|---|
| `t_contas.py` | conta obrigatória em toda baixa e em todo lançamento realizado; nome de conta único (sem acento/maiúscula); conta com movimento não renomeia, não troca de tipo e não exclui; restauração de backup só por administrador; conta do caixa no fechamento; prazos da Rede; outra empresa. |
| `t_gerar.py` | fechamento por caixa e fita: lançamentos gerados e atômicos, validações que não gravam nada, duplicidade, prazos, estorno do fechamento (só administrador), corrida de pedidos simultâneos, cargos, outra empresa, auditoria. |
| `t_deposito.py` | depósito conferido da maquineta: baixa dos títulos pelo valor bruto e UMA despesa de taxa (bruto menos o que caiu); sem categoria da taxa configurada não grava nada; envio repetido e título já baixado; recusas sem gravar nada (data inexistente, bruto conferido diferente, categoria fora do grupo Despesa financeira); falha injetada na auditoria desfaz tudo; taxa nunca presumida (acima do limite exige confirmação); taxa zero; crédito parcelado; cargos; outra empresa sem vazar dados; concorrência; Corrigir (estorna a taxa vigente e lança a nova, com datas e competência conferidas, e continua valendo se a categoria antiga for inativada); despesa de taxa não editável nem estornável à mão (inclusive pelo gancho de modelo, via superusuário descartável); imutabilidade pela API. |
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
