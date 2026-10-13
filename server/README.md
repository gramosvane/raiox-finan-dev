# Server Hooks & Migrations (PocketBase)

Este diretório contém os artefatos de backend para implantação local e em produção do PocketBase.

## Estrutura

- `server/pb_hooks/`:
  - `audit_lancamento.js`: Intercepta rotas e operações financeiras, impondo integridade e auditoria automática.
  - `audit_login.js`: Registra eventos de autenticação de usuários na coleção `auditoria`.
  - `audit_registros.js`: Endpoint protegido (`GET /backend/v1/audit/registros`) para listagem segura de auditoria com `x-audit-token`.
  - `audit_restaurar_registro.js`: Endpoint protegido (`POST /backend/v1/audit/restaurar-registro`) para restauração fiel de registros históricos com autor e data originais.
  - `audit_read.js`: Módulo unificado que engloba leitura e restauração protegida da trilha de auditoria via token `x-audit-token`.
  - `lancamento_editar.js`: Endpoint para edição controlada (`POST /backend/v1/lancamentos/{id}/editar`) com motivo obrigatório (≥ 5 caracteres) e gravação de histórico ANTES/DEPOIS.
  - `set_master_password.js`: Endpoint para cadastro e alteração da Senha Mestra (`POST /backend/v1/audit/set-master-password`).
  - `status_master_password.js`: Endpoint para verificar status da Senha Mestra (`GET /backend/v1/audit/status-master-password`).
  - `verify_master_password.js`: Verificação da Senha Mestra com KDF + Salt SHA-512 e emissão de `x-audit-token` com proteção anti-brute-force.

- `server/pb_migrations/`:
  - `updated_users.js`: Regras de RLS da coleção `users`.
  - `0001_create_financial_collections.js`: Criação das coleções `contas`, `categorias`, `centros_custo`, `configuracoes`, `lancamentos` e `auditoria` com índices e regras de blindagem.
  - `0002_seed_initial_data.js`: Carga inicial e estrutura de dados de exemplo.
  - `0003_seed_initial_data.js` / `0004_sanitize_credentials.js`: Sanitização de credenciais e remoção de senhas mestras de fábrica hardcoded.
  - `0005_liquidacao_patrimonio_empresas.js`: Criação de `empresas`, `patrimonio` e campos `empresa_id` e `liquidacao_de`.
  - `0006_grupo_dre_e_blindagem_auditoria.js`: Adição do campo `grupo_dre` e blindagem da coleção `auditoria`.
  - `0007_blindagem_seguranca_e_papeis.js`: Adição do campo `role` em `users` e bloqueio estrito de delete/update direto em `lancamentos` e `auditoria`.
  - `0008_departamentos_e_senha_admin.js`: Criação da coleção `departamentos`, migração de dados de `centros_custo` e adição de `departamento` em `lancamentos`.
