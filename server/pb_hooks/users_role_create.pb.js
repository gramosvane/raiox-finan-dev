// Hook onRecordCreate para garantir atribuição de role no servidor
// Regra (Item 6):
// - Primeiro usuário criado no sistema = 'administrador' APENAS se totalUsers === 0 antes de gravar
// - Segundo e demais usuários = 'operador' (contar antes da persistência)
// - O role NUNCA é aceito do cliente (@request.body.role bloqueado na regra de coleção)
// - Se o usuário tiver papel vazio por qualquer motivo, o acesso é negado (fail-closed)
onRecordCreate((e) => {
  try {
    // Contagem de usuários ANTES de persistir o novo registro
    const totalUsers = $app.countRecords('users')
    if (totalUsers === 0) {
      e.record.set('role', 'administrador')
    } else {
      e.record.set('role', 'operador')
    }

    // Regra (Item 7a): herança DETERMINÍSTICA da empresa para novos usuários:
    // Buscar primeiro padrao = true; se não houver, a mais antiga por created ASC.
    const currentEmp = e.record.getString('empresa_id')
    if (!currentEmp) {
      try {
        let targetEmp = null
        const padraoEmps = $app.findRecordsByFilter('empresas', 'padrao = true', '+created', 1, 0)
        if (padraoEmps && padraoEmps.length > 0) {
          targetEmp = padraoEmps[0]
        } else {
          const oldestEmps = $app.findRecordsByFilter('empresas', '', '+created', 1, 0)
          if (oldestEmps && oldestEmps.length > 0) {
            targetEmp = oldestEmps[0]
          }
        }

        if (targetEmp) {
          e.record.set('empresa_id', targetEmp.id)
        }
      } catch (_) {}
    }
  } catch (err) {
    console.error('Falha ao definir role no servidor para usuario:', err)
  }

  e.next()
}, 'users')
