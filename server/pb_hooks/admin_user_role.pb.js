// Endpoint exclusivo de administrador para promover ou alterar papéis de usuários
// Regra 2.1: Promoção a administrador só por endpoint de administrador (hook).
// Papel vazio ou erro de consulta = acesso NEGADO (fail-closed, nunca tratado como admin).
routerAdd(
  'POST',
  '/backend/v1/admin/usuarios/{id}/role',
  (e) => {
    const targetUserId = e.request.pathValue('id')
    const reqInfo = e.requestInfo()
    const body = reqInfo ? reqInfo.body || {} : {}
    const newRole = typeof body.role === 'string' ? body.role.trim() : ''

    // Fail-closed: papel vazio ou inválido rejeita imediatamente
    if (
      !newRole ||
      (newRole !== 'administrador' && newRole !== 'operador' && newRole !== 'leitura')
    ) {
      return e.json(400, {
        success: false,
        message: 'Papel inválido. Opções permitidas: administrador, operador, leitura.',
      })
    }

    // Validação estrita do usuário chamador
    if (!e.auth) {
      return e.json(401, { success: false, message: 'Usuário não autenticado.' })
    }

    // Fail-closed: consulta papel do chamador no banco
    let callerRole = ''
    try {
      const callerRec = $app.findRecordById('users', e.auth.id)
      callerRole = callerRec.getString('role') || ''
    } catch (_) {
      return e.json(403, {
        success: false,
        message: 'Acesso negado: falha ao consultar privilégios.',
      })
    }

    if (callerRole !== 'administrador') {
      return e.json(403, {
        success: false,
        message: 'Acesso negado: apenas administradores podem alterar papéis de usuários.',
      })
    }

    // Localizar usuário alvo
    let targetUser = null
    try {
      targetUser = $app.findRecordById('users', targetUserId)
    } catch (_) {
      return e.json(404, { success: false, message: 'Usuário não encontrado.' })
    }

    const oldRole = targetUser.getString('role') || 'operador'
    targetUser.set('role', newRole)

    // Se vier empresa_id no corpo da requisição, atualiza também (a empresa precisa existir)
    if (typeof body.empresa_id === 'string') {
      if (body.empresa_id) {
        try {
          $app.findRecordById('empresas', body.empresa_id)
        } catch (_) {
          return e.json(400, { success: false, message: 'Empresa não encontrada.' })
        }
      }
      targetUser.set('empresa_id', body.empresa_id)
    }

    // Executa em transação atômica juntamente com o registro de auditoria
    try {
      $app.runInTransaction((txApp) => {
        // Reconfere o último administrador DENTRO da transação (proteção defensiva contra concorrência)
        if (newRole !== 'administrador') {
          const atual = txApp.findRecordById('users', targetUserId)
          if (atual.getString('role') === 'administrador') {
            let outros = []
            try {
              outros =
                txApp.findRecordsByFilter(
                  'users',
                  "role = 'administrador' && id != {:id}",
                  '',
                  1,
                  0,
                  {
                    id: targetUserId,
                  },
                ) || []
            } catch (_) {
              outros = []
            }
            if (outros.length === 0) {
              throw new Error('ULTIMO_ADMIN')
            }
          }
        }
        txApp.save(targetUser)

        const auditCol = txApp.findCollectionByNameOrId('auditoria')
        const auditRecord = new Record(auditCol)
        auditRecord.set('usuario_id', e.auth.id)
        auditRecord.set('acao', 'alteracao_papel_usuario')
        auditRecord.set(
          'descricao',
          `Papel do usuário ${targetUser.getString('email') || targetUserId} alterado de "${oldRole}" para "${newRole}"`,
        )
        auditRecord.set('referencia_id', targetUserId)
        auditRecord.set('detalhes', {
          alvo_usuario_id: targetUserId,
          papel_anterior: oldRole,
          papel_novo: newRole,
          administrador_id: e.auth.id,
        })
        txApp.save(auditRecord)
      })

      return e.json(200, {
        success: true,
        message: `Papel do usuário atualizado para "${newRole}" com sucesso.`,
      })
    } catch (err) {
      if (String((err && err.message) || err).indexOf('ULTIMO_ADMIN') !== -1) {
        return e.json(400, {
          success: false,
          message: 'Operação negada: este é o último administrador.',
        })
      }
      return e.json(500, {
        success: false,
        message: 'Falha ao atualizar papel do usuário: ' + err.message,
      })
    }
  },
  $apis.requireAuth(),
)
