# 03 · Backup com cópia externa (rotina obrigatória)

O banco guarda lançamentos e auditoria **imutáveis**: é a única cópia dos dados da empresa. O código é recriável; o banco, não.

## Quando

Todo dia útil com movimento (no mínimo) e **sempre antes de qualquer atualização**.

## Os 4 passos (cada um com critério de parada)

1. **Gerar o backup no servidor** (pede a senha do `sudo` e a **senha do backup**, digitada duas vezes, mínimo 12 caracteres):
   ```bash
   ssh -t SERVIDOR "sudo RAIOX_PERMITIR_DESTINO_LOCAL=1 bash /opt/raiox/app/deploy/backup-usb.sh /var/backups/raiox-staging"
   ```
   Critério: termina com `BACKUP CONCLUÍDO (cifrado)` e mostra o SHA-256. Não pressione Ctrl+C.
   Com pen drive físico (preferível): monte-o em `/mnt/usb` e use `sudo bash /opt/raiox/app/deploy/backup-usb.sh /mnt/usb` (sem a variável).
2. **Copiar para o PC** (dois discos físicos diferentes), no PowerShell do PC, dentro da pasta do projeto:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\ferramentas\copiar-backup-externo.ps1
   ```
   Pede só a senha do `sudo` do servidor (não a do backup). Critério: termina em verde com `BACKUP EXTERNO CONCLUIDO E REGISTRADO (OK)`.
   Use sempre esta versão (0.0.120 ou posterior): a da 0.0.118 tinha um defeito de leitura do resumo e **não** deve ser usada.
   Para conferir a ferramenta antes de usar: `ferramentas\teste-copiar-backup-externo.ps1` deve terminar com `TODOS OS TESTES PASSARAM`.
3. **Conferir o SHA-256 nas três pontas**: servidor, disco 1 e disco 2. O script confere e mostra IGUAL/DIFERE.
4. **Registrar**: data/hora, arquivo, SHA-256, tamanho, quem fez, OK/FALHOU (`REGISTRO.txt` junto das cópias).

## Regra de falha

- Qualquer passo falhou ou o SHA-256 divergiu: **o backup NÃO está concluído** e o dia **não está protegido**. Repita do passo 1.
- Duas falhas seguidas: avisar o responsável técnico antes de continuar lançando.
- Nunca apague a única cópia boa. Mantenha pelo menos os **7 últimos** backups verificados em cada disco.

## Teste de restauração (mensal e após cada atualização)

Traga a **cópia do PC** de volta ao servidor e rode `restaurar.sh --teste` em pasta separada:

```bash
sudo RAIOX_APP_DIR=/opt/raiox/app RAIOX_SERVICO=raiox bash /opt/raiox/app/deploy/restaurar.sh /caminho/ARQUIVO.tar.gz.gpg --teste /opt/raiox/teste-restauracao
```

Aprovado quando: SHA-256 confere, `[OK]` byte a byte, totais conferem com o manifesto. Isso **não** toca no banco em uso.

## Custódia da senha do backup

- Nunca no servidor, em scripts, logs, e-mail ou junto dos arquivos de backup.
- Em papel, fora do servidor e do PC, com uma cópia com outra pessoa de confiança. Testar o acesso periodicamente (abrir um backup de teste).
- **Sem a senha o backup não abre e não há recuperação.**

## Limites

O PC não é mídia desconectada: falha simultânea do PC e do servidor (roubo, incêndio, ransomware que alcance os dois) não é coberta. Pen drive físico guardado em outro lugar é a proteção recomendada.
