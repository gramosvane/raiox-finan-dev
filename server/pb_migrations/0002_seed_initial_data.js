migrate(
  (app) => {
    // Migração 0002: Nenhuma criação de usuário padrão, senhas no código ou seed de dados fictícios.
    // As coleções empresas, contas, categorias, lançamentos, patrimônio e auditoria permanecem vazias
    // após a instalação limpa. O primeiro usuário administrador é criado via prompt interativo do PocketBase
    // ou pela tela de cadastro do sistema.
  },
  (app) => {
    // down logic
  },
)
