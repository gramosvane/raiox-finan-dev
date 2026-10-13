# 07 · Limitações conhecidas (versão 0.0.120)

1. **Backup externo no PC não é mídia desconectada.** Pen drive físico guardado em outro lugar continua sendo a proteção recomendada (GATE-05 formal pendente até ser feito com mídia física).
2. **Acesso da equipe** depende do Cloudflare Tunnel + Access (domínio do Owner). Até lá, só por túnel SSH.
3. **`npm test`** tem falhas preexistentes (dívida de testes: ~39, estáveis entre versões); as provas funcionais e de segurança vêm das suítes de regressão do projeto, não do `npm test`.
4. **CSV**: valores monetários saem com ponto decimal e aparecem como texto no Excel em português (melhoria planejada). Descrições que começam com `=`, `+`, `-`, `@` saem com apóstrofo (proteção contra fórmula).
5. **Senha mestra**: o bloqueio por tentativas é global (incômodo operacional documentado).
6. **Atualizações** de dependências exigem nova homologação; o lockfile é fixo e não deve ser regerado no servidor.
7. **`README-INSTALACAO.md`** é histórico (Caddy, NSSM, Windows); não use para instalar. O manual oficial é esta pasta.
8. **Não use a tag `v0.0.119`**: nela o `preparar-host.sh --endurecer-ssh` recusava a configuração correta por um erro de leitura da configuração efetiva (falhava fechado e restaurava o estado anterior, mas impedia o endurecimento). Corrigido na `v0.0.120`.
