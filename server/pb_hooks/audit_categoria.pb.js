// Hook para validação e auditoria no ciclo de vida de Categorias (Fase 1B)
// Intercepta exclusão e atualização no servidor:
// 1. Exclusão física:
//    - Se a categoria tiver pelo menos 1 lançamento associado (via categoria_id ou categoria): recusar com 400.
//    - Se sem uso: permitir exclusão física e registrar auditoria "exclusao_categoria".
// 2. Atualização:
//    - Se categoria em uso: impedir alteração de tipo (tipo original != novo tipo), recusar e registrar auditoria "tentativa_alteracao_tipo_recusada".
//    - Se categoria sem uso: permitir alteração de tipo e registrar auditoria "alteracao_categoria".
//    - Inativação (ativa: true -> false): permitir e registrar auditoria "inativacao_categoria".
//    - Reativação (ativa: false -> true): permitir e registrar auditoria "reativacao_categoria".
//    - Renomeação ou edição permitida: registrar auditoria "alteracao_categoria".

onRecordCreateRequest((e) => {
  // UX-PERM-02 — Somente o Administrador cria categoria
  // Fail-closed: consultar papel no banco no momento da requisição, não confiar apenas no token
  const isSuperuser = Boolean(e.hasSuperuserAuth && e.hasSuperuserAuth())
  let userRole = ''

  if (!isSuperuser) {
    if (!e.auth) {
      throw new ForbiddenError('Somente o Administrador pode cadastrar categorias.')
    }

    try {
      const userRec = $app.findRecordById('users', e.auth.id)
      userRole = userRec.getString('role') || ''
    } catch (_) {
      throw new ForbiddenError('Somente o Administrador pode cadastrar categorias.')
    }

    if (userRole !== 'administrador') {
      throw new ForbiddenError('Somente o Administrador pode cadastrar categorias.')
    }
  }

  // UX-PERM-01 — Mensagem clara de categoria duplicada para o mesmo tipo
  // Unicidade pelo índice de expressão: LOWER(TRIM(nome)), tipo
  const nomeNovo = (e.record.getString('nome') || '').trim().toLowerCase()
  const tipoNovo = e.record.getString('tipo') || ''
  if (tipoNovo !== 'receita' && tipoNovo !== 'despesa') {
    throw new BadRequestError('Tipo inválido: use receita ou despesa.')
  }

  if (nomeNovo && tipoNovo) {
    let todasCats = []
    try {
      todasCats =
        $app.findRecordsByFilter('categorias', 'tipo = {:tipo}', '', 0, 0, { tipo: tipoNovo }) || []
    } catch (_) {
      todasCats = []
    }

    const jaExiste = todasCats.some((c) => {
      const cNome = (c.getString('nome') || '').trim().toLowerCase()
      return cNome === nomeNovo
    })

    if (jaExiste) {
      throw new BadRequestError('Categoria já cadastrada.')
    }
  }

  // Correção Fase 1B: Categoria criada sem enviar o campo "ativa" nasce com ativa = true
  const reqInfo = e.requestInfo()
  const body = reqInfo ? reqInfo.body || {} : {}

  if (body.ativa === undefined || body.ativa === null) {
    e.record.set('ativa', true)
  }

  e.next()
}, 'categorias')

onRecordDeleteRequest((e) => {
  const cat = e.record
  const catId = cat.id
  const catNome = cat.getString('nome') || ''
  const catTipo = cat.getString('tipo') || ''

  // Verificar se existem lançamentos associados (por categoria_id ou por nome legado)
  let totalUsos = 0
  try {
    const filterId = `categoria_id = '${catId}'`
    const porId = $app.findRecordsByFilter('lancamentos', filterId, '', 1, 0) || []
    totalUsos += porId.length
  } catch (_) {}

  if (totalUsos === 0 && catNome) {
    try {
      const filterNome = 'categoria = {:nome} && tipo = {:tipo}'
      const porNome =
        $app.findRecordsByFilter('lancamentos', filterNome, '', 1, 0, {
          nome: catNome,
          tipo: catTipo,
        }) || []
      totalUsos += porNome.length
    } catch (_) {}
  }

  if (totalUsos > 0) {
    throw new BadRequestError(
      'Operação negada: a categoria "' +
        catNome +
        '" já possui lançamentos vinculados e não pode ser excluída. Inative a categoria para que ela não seja mais utilizada em novos lançamentos.',
    )
  }

  // Categoria sem uso: prossegue com exclusão e grava auditoria
  e.next()

  try {
    const auditCol = $app.findCollectionByNameOrId('auditoria')
    const auditRecord = new Record(auditCol)
    const authId = e.auth ? e.auth.id : cat.getString('usuario_id') || ''
    auditRecord.set('usuario_id', authId)
    auditRecord.set('acao', 'exclusao_categoria')
    auditRecord.set('descricao', 'Categoria excluída: "' + catNome + '" (' + catTipo + ')')
    auditRecord.set('referencia_id', catId)
    auditRecord.set('detalhes', {
      categoria_id: catId,
      nome: catNome,
      tipo: catTipo,
      grupo_dre: cat.getString('grupo_dre'),
      usuario_id: authId,
      timestamp: new Date().toISOString(),
    })
    $app.save(auditRecord)
  } catch (err) {
    console.log('[audit_categoria] Falha ao registrar auditoria de exclusão:', err)
  }
}, 'categorias')

onRecordUpdateRequest((e) => {
  const cat = e.record
  const original = cat.original()
  const catId = cat.id
  const oldNome = original.getString('nome')
  const newNome = cat.getString('nome')
  const oldTipo = original.getString('tipo')
  const newTipo = cat.getString('tipo')
  const oldGrupo = original.getString('grupo_dre')
  const newGrupo = cat.getString('grupo_dre')
  const oldAtiva = original.getBool('ativa')
  const newAtiva = cat.getBool('ativa')

  // Verificar se há lançamentos vinculados para regras de proteção
  let totalUsos = 0
  try {
    const filterId = `categoria_id = '${catId}'`
    const porId = $app.findRecordsByFilter('lancamentos', filterId, '', 1, 0) || []
    totalUsos += porId.length
  } catch (_) {}

  if (totalUsos === 0 && oldNome) {
    try {
      const filterNome = 'categoria = {:nome} && tipo = {:tipo}'
      const porNome =
        $app.findRecordsByFilter('lancamentos', filterNome, '', 1, 0, {
          nome: oldNome,
          tipo: oldTipo,
        }) || []
      totalUsos += porNome.length
    } catch (_) {}
  }

  const emUso = totalUsos > 0

  // Identificação do chamador e papel
  // Fail-closed: consulta SEMPRE no banco no momento da requisição (findRecordById em users).
  // Se falhar ou não encontrar: tratar como NÃO administrador (não confiar no papel do token).
  const isSuperuser = Boolean(e.hasSuperuserAuth && e.hasSuperuserAuth())
  let userRole = ''
  if (!isSuperuser) {
    if (e.auth && e.auth.id) {
      try {
        const uRec = $app.findRecordById('users', e.auth.id)
        userRole = uRec.getString('role') || ''
      } catch (_) {
        userRole = '' // fail-closed
      }
    } else {
      userRole = '' // fail-closed
    }
  }

  // UX-PERM-03 e UX-PERM-04:
  // Somente papel "administrador" (ou superusuário) pode alterar categoria — renomear,
  // alterar grupo da DRE, tipo, inativar ou reativar.
  // Fail-closed com papel consultado no banco em users.
  // Qualquer outro papel: gravar auditoria "tentativa_alteracao_categoria_recusada" e HTTP 403.
  if (!isSuperuser && userRole !== 'administrador') {
    const authId = e.auth ? e.auth.id : cat.getString('usuario_id') || ''
    try {
      const auditCol = $app.findCollectionByNameOrId('auditoria')
      const auditRecord = new Record(auditCol)
      auditRecord.set('usuario_id', authId)
      auditRecord.set('acao', 'tentativa_alteracao_categoria_recusada')
      auditRecord.set(
        'descricao',
        'Tentativa não autorizada de alteração da categoria "' +
          oldNome +
          '" pelo usuário ' +
          (userRole ? '(' + userRole + ')' : '(sem papel)'),
      )
      auditRecord.set('referencia_id', catId)
      auditRecord.set('detalhes', {
        categoria_id: catId,
        papel_usuario: userRole,
        valores_antes: {
          nome: oldNome,
          tipo: oldTipo,
          grupo_dre: oldGrupo,
          ativa: oldAtiva,
        },
        valores_tentados: {
          nome: newNome,
          tipo: newTipo,
          grupo_dre: newGrupo,
          ativa: newAtiva,
        },
        usuario_id: authId,
        timestamp: new Date().toISOString(),
      })
      $app.save(auditRecord)
    } catch (auditErr) {
      console.log('[audit_categoria] Falha ao registrar tentativa recusada:', auditErr)
      // Se a gravação da auditoria falhar, a alteração também permanece recusada
      throw new ForbiddenError('Somente o Administrador pode alterar categorias.')
    }

    throw new ForbiddenError('Somente o Administrador pode alterar categorias.')
  }

  // 2. Regra JÁ EXISTENTE da Fase 1B: impedir alteração de TIPO de categoria em uso para TODOS
  // (operador, administrador e superusuário) com HTTP 400 e auditoria "tentativa_alteracao_tipo_recusada".
  if (emUso && oldTipo !== newTipo) {
    // Registrar tentativa na auditoria antes de lançar erro
    try {
      const auditCol = $app.findCollectionByNameOrId('auditoria')
      const auditRecord = new Record(auditCol)
      const authId = e.auth ? e.auth.id : cat.getString('usuario_id') || ''
      auditRecord.set('usuario_id', authId)
      auditRecord.set('acao', 'tentativa_alteracao_tipo_recusada')
      auditRecord.set(
        'descricao',
        'Tentativa recusada de alteração de tipo da categoria em uso: "' +
          oldNome +
          '" de "' +
          oldTipo +
          '" para "' +
          newTipo +
          '"',
      )
      auditRecord.set('referencia_id', catId)
      auditRecord.set('detalhes', {
        categoria_id: catId,
        nome: oldNome,
        tipo_anterior: oldTipo,
        tipo_solicitado: newTipo,
        usuario_id: authId,
        motivo_recusa: 'Categoria possui lançamentos vinculados no histórico.',
        timestamp: new Date().toISOString(),
      })
      $app.save(auditRecord)
    } catch (auditErr) {
      console.log('[audit_categoria] Erro ao registrar tentativa recusada:', auditErr)
    }

    throw new BadRequestError(
      'Operação negada: a categoria "' +
        oldNome +
        '" já possui lançamentos vinculados. Não é permitido alterar o tipo de movimento (' +
        oldTipo +
        ') de categorias em uso histórico.',
    )
  }

  // Prossegue com a atualização
  e.next()

  // Registrar auditoria pós-atualização
  try {
    const auditCol = $app.findCollectionByNameOrId('auditoria')
    const authId = e.auth ? e.auth.id : cat.getString('usuario_id') || ''

    // Caso A: Inativação (ativa mudou de true para false)
    if (oldAtiva !== false && newAtiva === false) {
      const auditRecord = new Record(auditCol)
      auditRecord.set('usuario_id', authId)
      auditRecord.set('acao', 'inativacao_categoria')
      auditRecord.set('descricao', 'Categoria inativada: "' + newNome + '" (' + newTipo + ')')
      auditRecord.set('referencia_id', catId)
      auditRecord.set('detalhes', {
        categoria_id: catId,
        nome: newNome,
        tipo: newTipo,
        grupo_dre: newGrupo,
        ativa_anterior: oldAtiva,
        ativa_novo: false,
        usuario_id: authId,
        timestamp: new Date().toISOString(),
      })
      $app.save(auditRecord)
    }
    // Caso B: Reativação (ativa mudou de false para true)
    else if (oldAtiva === false && newAtiva === true) {
      const auditRecord = new Record(auditCol)
      auditRecord.set('usuario_id', authId)
      auditRecord.set('acao', 'reativacao_categoria')
      auditRecord.set('descricao', 'Categoria reativada: "' + newNome + '" (' + newTipo + ')')
      auditRecord.set('referencia_id', catId)
      auditRecord.set('detalhes', {
        categoria_id: catId,
        nome: newNome,
        tipo: newTipo,
        grupo_dre: newGrupo,
        ativa_anterior: false,
        ativa_novo: true,
        usuario_id: authId,
        timestamp: new Date().toISOString(),
      })
      $app.save(auditRecord)
    }
    // Caso C: Outras alterações relevantes (nome, tipo, grupo_dre)
    else if (oldNome !== newNome || oldTipo !== newTipo || oldGrupo !== newGrupo) {
      const auditRecord = new Record(auditCol)
      auditRecord.set('usuario_id', authId)
      auditRecord.set('acao', 'alteracao_categoria')
      auditRecord.set('descricao', 'Categoria alterada: "' + oldNome + '" -> "' + newNome + '"')
      auditRecord.set('referencia_id', catId)
      auditRecord.set('detalhes', {
        categoria_id: catId,
        em_uso: emUso,
        nome_anterior: oldNome,
        nome_novo: newNome,
        tipo_anterior: oldTipo,
        tipo_novo: newTipo,
        grupo_dre_anterior: oldGrupo,
        grupo_dre_novo: newGrupo,
        usuario_id: authId,
        timestamp: new Date().toISOString(),
      })
      $app.save(auditRecord)
    }
  } catch (err) {
    console.log('[audit_categoria] Falha ao registrar auditoria pós-update:', err)
  }
}, 'categorias')
