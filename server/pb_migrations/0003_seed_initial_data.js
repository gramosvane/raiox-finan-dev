migrate(
  (app) => {
    // 0003: Higienização de senhas mestras de fábrica legadas.
    // Nenhuma credencial ou usuário é alterado aqui.
    try {
      const defaultHash = $security.sha256('SenhaMestra@2025')
      const configs = app.findRecordsByFilter(
        'configuracoes',
        `chave = 'senha_mestra_hash' && valor = '${defaultHash}'`,
        '',
        100,
        0,
      )
      for (const cfg of configs) {
        app.delete(cfg)
      }
    } catch (_) {}
  },
  (app) => {
    // reversão
  },
)
