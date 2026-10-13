// Endpoint para edição controlada de lançamento com motivo obrigatório e auditoria ANTES/DEPOIS
// Regra 2.5: Execução da edição e registro de auditoria NA MESMA transação ($app.runInTransaction)
// Se a auditoria falhar, a operação é revertida e retorna erro.
// Edição aceita "departamento" (campo oficial) e mantém sincronizado.
routerAdd(
  'POST',
  '/backend/v1/lancamentos/{id}/editar',
  (e) => {
    const lancId = e.request.pathValue('id')
    const reqInfo = e.requestInfo()
    const body = reqInfo ? reqInfo.body || {} : {}

    const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : ''
    if (!motivo || motivo.length < 5) {
      return e.json(400, {
        success: false,
        message: 'O motivo da edição é obrigatório e deve ter no mínimo 5 caracteres.',
      })
    }

    // Regra: Edição não altera status (status só muda por liquidação e estorno)
    if (body.status !== undefined) {
      return e.json(400, {
        success: false,
        message:
          'O status não pode ser alterado por edição. Utilize os fluxos próprios de liquidação ou estorno.',
      })
    }

    if (!e.auth) {
      return e.json(401, { success: false, message: 'Usuário não autenticado.' })
    }

    // Fail-closed: verificar papel do usuário autenticado no banco
    let userRole = ''
    try {
      const userRec = $app.findRecordById('users', e.auth.id)
      userRole = userRec.getString('role') || ''
    } catch (_) {
      return e.json(403, {
        success: false,
        message: 'Acesso negado: falha ao consultar privilégios.',
      })
    }

    if (!userRole || userRole === 'leitura') {
      return e.json(403, {
        success: false,
        message: 'Usuários com perfil de leitura não têm permissão para editar lançamentos.',
      })
    }

    let lancRecord = null
    try {
      lancRecord = $app.findRecordById('lancamentos', lancId)
    } catch (_) {
      return e.json(404, { success: false, message: 'Lançamento não encontrado.' })
    }

    // Problema 3: Recusar com HTTP 400 e mensagem clara a edição de:
    // • lançamento que é contra-lançamento (estorno_de preenchido);
    // • lançamento que já possui contra-lançamento (original estornado).
    if (lancRecord.getString('estorno_de')) {
      return e.json(400, {
        success: false,
        message:
          'Operação negada: não é permitido editar um lançamento que é contra-lançamento de estorno.',
      })
    }

    let contraLancamentos = []
    try {
      contraLancamentos =
        $app.findRecordsByFilter('lancamentos', `estorno_de = '${lancId}'`, '', 1, 0) || []
    } catch (_) {
      contraLancamentos = []
    }
    if (contraLancamentos.length > 0) {
      return e.json(400, {
        success: false,
        message:
          'Operação negada: não é permitido editar um lançamento que já foi estornado (possui contra-lançamento).',
      })
    }

    // Regras de Integridade da Liquidação: Recusar com HTTP 400 e mensagem clara a edição de:
    // • lançamento de liquidação (liquidacao_de preenchido - não pode ser editado);
    // • conta prevista que já foi liquidada (bloquear QUALQUER alteração relevante).
    if (lancRecord.getString('liquidacao_de')) {
      return e.json(400, {
        success: false,
        message: 'Operação negada: não é permitido editar um lançamento de liquidação.',
      })
    }

    let liquidacoesDaConta = []
    try {
      liquidacoesDaConta =
        $app.findRecordsByFilter('lancamentos', `liquidacao_de = '${lancId}'`, '', 1, 0) || []
    } catch (_) {
      liquidacoesDaConta = []
    }
    if (liquidacoesDaConta.length > 0) {
      return e.json(400, {
        success: false,
        message: 'Operação negada: não é permitido editar uma conta prevista que já foi liquidada.',
      })
    }

    // Operador só pode editar lançamentos criados por ele mesmo
    if (userRole === 'operador' && lancRecord.getString('usuario_id') !== e.auth.id) {
      return e.json(403, {
        success: false,
        message: 'Operadores só podem editar lançamentos criados por eles mesmos.',
      })
    }

    // Se o usuário estiver vinculado a uma empresa e o lançamento pertencer a outra, bloqueia
    const userEmpresa = e.auth.getString('empresa_id')
    const lancEmpresa = lancRecord.getString('empresa_id')
    if (userEmpresa && lancEmpresa && userEmpresa !== lancEmpresa && userRole !== 'administrador') {
      return e.json(403, {
        success: false,
        message: 'Acesso negado: este lançamento pertence a outra empresa.',
      })
    }

    // Troca de empresa: somente para a empresa do usuário ou uma empresa criada por ele; nunca para vazio
    if (body.empresa_id !== undefined && String(body.empresa_id || '') !== lancEmpresa) {
      const novaEmp = String(body.empresa_id || '')
      let empOk = false
      if (novaEmp) {
        if (novaEmp === userEmpresa) {
          empOk = true
        } else {
          try {
            empOk = $app.findRecordById('empresas', novaEmp).getString('usuario_id') === e.auth.id
          } catch (_) {}
        }
      }
      if (!empOk) {
        return e.json(400, {
          success: false,
          message: 'Operação negada: a empresa informada não pertence ao usuário.',
        })
      }
    }

    // Validação especial quando body inclui alteração de categoria ou categoria_id
    // Regra: Atualizar categoria_id e o texto categoria juntos, validar tipo igual ao do lançamento
    let novaCatRecord = null
    if (body.categoria_id !== undefined || body.categoria !== undefined) {
      const lancTipo = lancRecord.getString('tipo')

      if (body.categoria_id) {
        try {
          novaCatRecord = $app.findRecordById('categorias', String(body.categoria_id))
        } catch (_) {
          return e.json(400, {
            success: false,
            message: 'A categoria informada (categoria_id) não foi encontrada.',
          })
        }
      } else if (body.categoria) {
        // Se enviou apenas nome textual, resolver pela regra oficial
        const nomeTrim = String(body.categoria).trim().toLowerCase()
        const todasCats = $app.findRecordsByFilter('categorias', '', 'nome', 0, 0) || []
        const compativeis = todasCats.filter((c) => {
          return (
            (c.getString('nome') || '').trim().toLowerCase() === nomeTrim &&
            c.getString('tipo') === lancTipo
          )
        })
        if (compativeis.length === 1) {
          novaCatRecord = compativeis[0]
        } else {
          return e.json(400, {
            success: false,
            message: `Não foi possível identificar com precisão a categoria textual "${body.categoria}" (${compativeis.length} compatíveis encontradas).`,
          })
        }
      }

      if (novaCatRecord) {
        const tipoCat = novaCatRecord.getString('tipo')
        if (tipoCat !== lancTipo) {
          return e.json(400, {
            success: false,
            message: `Incompatibilidade de tipo: a categoria "${novaCatRecord.getString('nome')}" é do tipo "${tipoCat}", enquanto o lançamento é "${lancTipo}".`,
          })
        }
        // Sincroniza ambos no body para a rotina de auditoria processar
        body.categoria_id = novaCatRecord.id
        body.categoria = novaCatRecord.getString('nome')
      }
    }

    // FIN-14: Normalizador de data civil para comparação estrita (10 primeiros caracteres)
    const normalizarData10 = (v) => {
      if (!v) return ''
      const s = String(v).trim()
      return s.length >= 10 ? s.slice(0, 10) : ''
    }

    // Helper inline para data civil de Brasília (UTC-3)
    const getHojeBrasiliaStr = () => {
      const d = new Date()
      const brasiliaTime = new Date(d.getTime() - 3 * 60 * 60 * 1000)
      return brasiliaTime.toISOString().slice(0, 10)
    }
    const hojeBrasilia = getHojeBrasiliaStr()

    // Captura estado ANTES e comparações com tratamento especial para datas (FIN-14)
    const camposAuditaveis = [
      'descricao',
      'valor',
      'categoria',
      'categoria_id',
      'departamento',
      'centro_custo',
      'conta',
      'competencia',
      'data_lancamento',
      'data_vencimento',
      'data_realizacao',
      'observacoes',
      'empresa_id',
    ]

    const alteracoes = []
    for (let i = 0; i < camposAuditaveis.length; i++) {
      const campo = camposAuditaveis[i]
      if (body[campo] !== undefined) {
        if (
          campo === 'data_lancamento' ||
          campo === 'data_vencimento' ||
          campo === 'data_realizacao'
        ) {
          const valAntigoRaw = lancRecord.getString(campo) || ''
          const valAntigoNorm = normalizarData10(valAntigoRaw)
          const valNovoRaw = body[campo] || ''
          const valNovoNorm = normalizarData10(valNovoRaw)

          if (valAntigoNorm !== valNovoNorm) {
            alteracoes.push({
              campo: campo,
              valor_anterior: valAntigoRaw,
              valor_novo: valNovoRaw,
            })
            // Grava o valor novo fornecido (ou vazio/null)
            lancRecord.set(campo, valNovoRaw || null)
          }
        } else if (campo === 'valor') {
          const valAntigo = lancRecord.getFloat(campo)
          const valNovo = Number(body[campo])
          if (Math.abs(valAntigo - valNovo) > 0.0001) {
            alteracoes.push({
              campo: campo,
              valor_anterior: valAntigo,
              valor_novo: valNovo,
            })
            lancRecord.set(campo, valNovo)
          }
        } else {
          const valAntigo = lancRecord.getString(campo) || ''
          const valNovo = String(body[campo] || '')
          if (valAntigo !== valNovo) {
            alteracoes.push({
              campo: campo,
              valor_anterior: valAntigo,
              valor_novo: valNovo,
            })
            lancRecord.set(campo, body[campo])
          }
        }
      }
    }

    // Se informou departamento mas não centro_custo (ou vice-versa), mantém sincronizado
    if (body.departamento !== undefined && body.centro_custo === undefined) {
      lancRecord.set('centro_custo', body.departamento)
    } else if (body.centro_custo !== undefined && body.departamento === undefined) {
      lancRecord.set('departamento', body.centro_custo)
    }

    if (alteracoes.length === 0) {
      return e.json(200, {
        success: true,
        lancamento: lancRecord,
        message: 'Nenhum campo foi alterado.',
      })
    }

    // FIN-15 — Regras aplicadas ao estado final após a edição
    const statusFinal = lancRecord.getString('status')
    const dataLancFinalNorm = normalizarData10(lancRecord.getString('data_lancamento'))
    const dataRealFinalNorm = normalizarData10(lancRecord.getString('data_realizacao'))

    if (statusFinal === 'realizado') {
      // a) data_realizacao obrigatória
      if (!dataRealFinalNorm) {
        return e.json(400, {
          success: false,
          message:
            'Operação negada: a data de realização é obrigatória para lançamentos com status "Realizado".',
        })
      }
      // b) data_realizacao não pode ser posterior a hoje
      if (dataRealFinalNorm > hojeBrasilia) {
        return e.json(400, {
          success: false,
          message:
            'Lançamento realizado não pode ter data futura. Para valores futuros, use o status Previsto.',
        })
      }
      // c) data de competência não posterior a hoje
      if (dataLancFinalNorm > hojeBrasilia) {
        return e.json(400, {
          success: false,
          message:
            'Lançamento realizado não pode ter data futura. Para valores futuros, use o status Previsto.',
        })
      }
    } else if (statusFinal === 'previsto') {
      // Lançamento previsto: data_realizacao não pode ser preenchida por edição
      // (a realização acontece somente pela liquidação); data de competência pode ser futura.
      if (dataRealFinalNorm) {
        return e.json(400, {
          success: false,
          message:
            'Operação negada: lançamento com status "Previsto" não pode ter data de realização preenchida.',
        })
      }
    }

    // Regra 2.5: Execução e Auditoria na MESMA transação atômica ($app.runInTransaction)
    try {
      $app.runInTransaction((txApp) => {
        txApp.save(lancRecord)

        const auditCol = txApp.findCollectionByNameOrId('auditoria')
        const auditRecord = new Record(auditCol)
        auditRecord.set('usuario_id', e.auth.id)
        auditRecord.set('acao', 'edicao_lancamento')
        auditRecord.set(
          'descricao',
          `Edição controlada do lançamento "${lancRecord.getString('descricao')}" (Ref: ${lancId}). Motivo: ${motivo}`,
        )
        auditRecord.set('referencia_id', lancId)
        auditRecord.set('detalhes', {
          motivo: motivo,
          alteracoes: alteracoes,
          usuario_id: e.auth.id,
          tipo_operacao: 'edicao_controlada',
          data_hora_utc: new Date().toISOString(),
        })
        txApp.save(auditRecord)
      })

      return e.json(200, {
        success: true,
        lancamento: lancRecord,
        message: 'Lançamento atualizado e auditado com sucesso.',
      })
    } catch (saveErr) {
      return e.json(500, {
        success: false,
        message: 'Falha transacional ao salvar e auditar lançamento: ' + saveErr.message,
      })
    }
  },
  $apis.requireAuth(),
)
