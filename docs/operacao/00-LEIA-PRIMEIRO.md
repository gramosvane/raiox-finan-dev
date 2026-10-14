# Raio-X Financeiro: manual de operação (versão 0.0.120)

Este é o manual **oficial** de instalação e operação. O que estiver em `README-INSTALACAO.md` é histórico (fluxos antigos) e **não** vale para o Ubuntu Server atual.

## Ordem para reconstruir tudo a partir de um servidor limpo

| #   | O que                                                                      | Onde está                                                              | Quem            |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------- |
| 1   | Instalar Ubuntu Server 24.04 LTS (OpenSSH marcado, sem snaps)              | docs/INSTALACAO-PRODUCAO.md, seção 1                                   | Owner           |
| 2   | Preparar o servidor (pacotes, Node 24, usuário, firewall, chave de deploy) | [01-servidor-do-zero.md](01-servidor-do-zero.md)                       | Técnico         |
| 3   | Baixar a **tag de produção** e instalar o aplicativo                       | [01-servidor-do-zero.md](01-servidor-do-zero.md)                       | Técnico         |
| 4   | Go-live vazio, controles e primeiro backup                                 | [02-go-live.md](02-go-live.md)                                         | Owner + técnico |
| 5   | Rotina diária de backup com cópia externa                                  | [03-backup-e-copia-externa.md](03-backup-e-copia-externa.md)           | Owner           |
| 6   | Atualizações e retorno                                                     | [04-atualizacao-e-retorno.md](04-atualizacao-e-retorno.md)             | Técnico         |
| 7   | Se o servidor for perdido/formatado                                        | [05-recuperacao-apos-formatacao.md](05-recuperacao-apos-formatacao.md) | Técnico + Owner |

## Regras que valem sempre

1. **Nenhum dado financeiro real** antes do go-live concluído e da autorização expressa do Owner.
2. O servidor **só instala tags de produção** (`vX.Y.Z`), nunca a `main`. **Nunca se edita código no servidor.**
3. **Backup que não foi copiado e conferido não conta como backup** (03).
4. Lançamentos e auditoria são **imutáveis**: dados de teste nunca entram no banco de produção.
5. Segredos (senhas, chaves, tokens) **nunca** vão para o repositório, para o servidor em texto, nem para o pen drive junto do backup ([06-segredos-e-configuracoes.md](06-segredos-e-configuracoes.md)).
6. Qualquer `[ERRO]` interrompe: não contorne, leia a mensagem e corrija a causa.

## Limitações conhecidas

Ver [07-limitacoes-conhecidas.md](07-limitacoes-conhecidas.md).
