# 07 · Limitações conhecidas (versão 0.0.120)

1. **Backup externo no PC não é mídia desconectada.** Pen drive físico guardado em outro lugar continua sendo a proteção recomendada (GATE-05 formal pendente até ser feito com mídia física).
2. **Acesso da equipe** depende do Cloudflare Tunnel + Access (domínio do Owner). Até lá, só por túnel SSH.
3. **`npm test`** tem falhas preexistentes (dívida de testes: ~39, estáveis entre versões); as provas funcionais e de segurança vêm das suítes de regressão do projeto, não do `npm test`.
4. **CSV**: valores monetários saem com ponto decimal e aparecem como texto no Excel em português (melhoria planejada). Descrições que começam com `=`, `+`, `-`, `@` saem com apóstrofo (proteção contra fórmula).
5. **Senha mestra**: o bloqueio por tentativas é global (incômodo operacional documentado).
6. **Atualizações** de dependências exigem nova homologação; o lockfile é fixo e não deve ser regerado no servidor.
7. **`README-INSTALACAO.md`** é histórico (Caddy, NSSM, Windows); não use para instalar. O manual oficial é esta pasta.
8. **Não use a tag `v0.0.119`**: nela o `preparar-host.sh --endurecer-ssh` recusava a configuração correta por um erro de leitura da configuração efetiva (falhava fechado e restaurava o estado anterior, mas impedia o endurecimento). Corrigido na `v0.0.120`.
9. **Desfazer depósito da maquineta não existe** (e-Audit, Fase 2): a baixa não se desfaz por regra, então um depósito registrado com título a mais ou a menos só se resolve com orientação do contador (ver `09-depositos-e-correcoes.md`, item b). A conta errada também depende da função de transferência entre contas, ainda não entregue (item c).
10. **Saldo por conta, transferência entre contas (Cofre para banco, retirada de sócio) e conferência do saldo com o extrato ainda não existem** (e-Audit, próximas etapas): o "Caixa" do Painel é a soma de todas as contas. Até lá, anote em papel as transferências e retiradas; não lance transferência à mão.
11. **O PIX do fechamento ainda nasce "a receber"** (sem conta) e precisa ser baixado uma vez por dia pelo depósito conferido; enquanto isso aparece como atrasado no dia seguinte. Rotina provisória em `09-depositos-e-correcoes.md`. O PIX direto no banco é uma etapa seguinte.
12. **O exportador/restaurador de dados do aplicativo não inclui fechamentos nem depósitos**, e um lançamento restaurado perde o vínculo com o fechamento que o gerou. O backup oficial é a cópia do banco do servidor (`backup-usb.sh`).
