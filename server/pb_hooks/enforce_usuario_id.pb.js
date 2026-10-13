// No PocketBase 0.23+ o usuário logado está em e.auth (hook de requisição).
onRecordCreateRequest(
  (e) => {
    if (e.auth && e.auth.collection().name === 'users') {
      e.record.set('usuario_id', e.auth.id)
      const colName = e.record.collection().name
      if (colName === 'lancamentos' || colName === 'contas' || colName === 'patrimonio') {
        // O empresa_id pedido pelo cliente so vale se for a empresa do usuario OU uma empresa criada por ele
        const userEmpresaId = e.auth.getString('empresa_id')
        const pedida = e.record.getString('empresa_id')
        let alvo = userEmpresaId
        if (pedida && pedida !== userEmpresaId) {
          let permitida = false
          try {
            const emp = $app.findRecordById('empresas', pedida)
            permitida = emp.getString('usuario_id') === e.auth.id
          } catch (_) {}
          if (!permitida) {
            throw new BadRequestError(
              'Operação negada: a empresa informada não pertence ao usuário.',
            )
          }
          alvo = pedida
        }
        if (alvo) {
          e.record.set('empresa_id', alvo)
        } else {
          throw new BadRequestError(
            'Operação negada: o usuário não possui uma empresa vinculada. Vincule o usuário a uma empresa antes de criar ' +
              colName +
              '.',
          )
        }
      }

      // Validação de categoria_id para novos lançamentos criados por usuários (não superusuário)
      if (colName === 'lancamentos') {
        const catId = e.record.getString('categoria_id')
        if (!catId) {
          throw new BadRequestError(
            'Operação negada: o campo categoria_id é obrigatório para novos lançamentos.',
          )
        }

        let catRecord = null
        try {
          catRecord = $app.findRecordById('categorias', catId)
        } catch (_) {
          throw new BadRequestError(
            'Operação negada: a categoria informada não existe no cadastro.',
          )
        }

        const tipoLancamento = e.record.getString('tipo')
        const tipoCategoria = catRecord.getString('tipo')
        if (tipoCategoria !== tipoLancamento) {
          throw new BadRequestError(
            'Operação negada: o tipo da categoria (' +
              tipoCategoria +
              ') deve ser igual ao tipo do lançamento (' +
              tipoLancamento +
              ').',
          )
        }

        // Validação Fase 1B: novos lançamentos não podem escolher categoria inativa
        // (categorias com ativa === false são rejeitadas; ausente ou true são aceitas)
        const isAtiva = catRecord.getBool('ativa')
        if (isAtiva === false) {
          throw new BadRequestError(
            'Operação negada: a categoria selecionada está inativa e não pode ser usada em novos lançamentos.',
          )
        }

        // Validação de integridade do estorno no servidor (Problema 3)
        // O campo estorno_de é reservado para contra-lançamentos de estorno.
        const estornoDeId = e.record.getString('estorno_de')
        if (estornoDeId) {
          let origRecord = null
          try {
            origRecord = $app.findRecordById('lancamentos', estornoDeId)
          } catch (_) {
            throw new BadRequestError(
              'Operação negada: o lançamento original referenciado para estorno não existe.',
            )
          }

          // O lançamento referenciado deve ter status = "realizado"
          const origStatus = origRecord.getString('status')
          if (origStatus !== 'realizado') {
            throw new BadRequestError(
              'Operação negada: o estorno só pode ser aplicado a lançamentos com status "realizado". Lançamentos previstos não podem ser estornados.',
            )
          }

          // O lançamento referenciado não pode ser um lançamento de liquidação (liquidacao_de preenchido)
          const origLiquidacaoDe = origRecord.getString('liquidacao_de')
          if (origLiquidacaoDe) {
            throw new BadRequestError(
              'Operação negada: não é permitido realizar o estorno de um lançamento de liquidação.',
            )
          }

          // Lançamento referenciado já é ele mesmo um estorno (estorno de estorno)
          const origEstornoDe = origRecord.getString('estorno_de')
          if (origEstornoDe) {
            throw new BadRequestError(
              'Operação negada: não é permitido realizar o estorno de um lançamento de contra-lançamento (estorno de estorno).',
            )
          }

          // Verificar se já existe outro lançamento com o mesmo estorno_de (estorno duplicado)
          let duplicados = []
          try {
            duplicados =
              $app.findRecordsByFilter('lancamentos', `estorno_de = '${estornoDeId}'`, '', 1, 0) ||
              []
          } catch (_) {
            duplicados = []
          }
          if (duplicados.length > 0) {
            throw new BadRequestError(
              'Operação negada: este lançamento já foi estornado anteriormente. Não é permitido estorno duplicado.',
            )
          }

          // O contra-lançamento deve ter status = "realizado"
          const statusEstorno = e.record.getString('status')
          if (statusEstorno !== 'realizado') {
            throw new BadRequestError(
              'Operação negada: o contra-lançamento de estorno deve ter status = "realizado".',
            )
          }

          // Recusar se o contra-lançamento não for idêntico ao original em:
          // tipo; valor; categoria_id; empresa_id; competência
          const origTipo = origRecord.getString('tipo')
          const novoTipo = e.record.getString('tipo')
          if (origTipo !== novoTipo) {
            throw new BadRequestError(
              'Operação negada: o tipo do contra-lançamento de estorno (' +
                novoTipo +
                ') deve ser idêntico ao do lançamento original (' +
                origTipo +
                ').',
            )
          }

          const origValor = origRecord.getFloat('valor')
          const novoValor = e.record.getFloat('valor')
          if (Math.abs(origValor - novoValor) > 0.0001) {
            throw new BadRequestError(
              'Operação negada: o valor do contra-lançamento de estorno (' +
                novoValor +
                ') deve ser idêntico ao do lançamento original (' +
                origValor +
                ').',
            )
          }

          const origCatId = origRecord.getString('categoria_id')
          const novoCatId = e.record.getString('categoria_id')
          if (origCatId && novoCatId && origCatId !== novoCatId) {
            throw new BadRequestError(
              'Operação negada: a categoria (categoria_id) do contra-lançamento de estorno deve ser idêntica à do lançamento original.',
            )
          }

          const origEmpresaId = origRecord.getString('empresa_id')
          const novoEmpresaId = e.record.getString('empresa_id')
          if (origEmpresaId !== novoEmpresaId) {
            throw new BadRequestError(
              'Operação negada: a empresa (empresa_id) do contra-lançamento de estorno deve ser idêntica à do lançamento original.',
            )
          }

          const origCompetencia = origRecord.getString('competencia')
          const novoCompetencia = e.record.getString('competencia')
          if (origCompetencia !== novoCompetencia) {
            throw new BadRequestError(
              'Operação negada: a competência do contra-lançamento de estorno (' +
                novoCompetencia +
                ') deve ser idêntica à do lançamento original (' +
                origCompetencia +
                ').',
            )
          }
        }

        // Helper inline para data civil de Brasília (UTC-3)
        const getHojeBrasiliaStr = () => {
          const d = new Date()
          const brasiliaTime = new Date(d.getTime() - 3 * 60 * 60 * 1000)
          return brasiliaTime.toISOString().slice(0, 10)
        }
        const hojeBrasilia = getHojeBrasiliaStr()

        const statusLancamento = e.record.getString('status')
        const rawDataLanc = e.record.getString('data_lancamento') || ''
        const dataLancNorm = rawDataLanc.length >= 10 ? rawDataLanc.slice(0, 10) : ''
        const rawDataReal = e.record.getString('data_realizacao') || ''
        const dataRealNorm = rawDataReal.length >= 10 ? rawDataReal.slice(0, 10) : ''
        const liquidacaoDeIdCheck = e.record.getString('liquidacao_de')

        // FIN-13 — Regra Realizado × Previsto
        if (statusLancamento === 'realizado') {
          // a) data_realizacao obrigatória
          if (!dataRealNorm) {
            throw new BadRequestError(
              'Operação negada: a data de realização é obrigatória para lançamentos com status "Realizado".',
            )
          }
          // b) data_realizacao não pode ser posterior a hoje
          if (dataRealNorm > hojeBrasilia) {
            throw new BadRequestError(
              'Lançamento realizado não pode ter data futura. Para valores futuros, use o status Previsto.',
            )
          }
          // c) data de competência (data_lancamento) não pode ser posterior a hoje, EXCETO no lançamento de liquidação (liquidacao_de preenchido)
          if (!liquidacaoDeIdCheck && dataLancNorm > hojeBrasilia) {
            throw new BadRequestError(
              'Lançamento realizado não pode ter data futura. Para valores futuros, use o status Previsto.',
            )
          }
        } else if (statusLancamento === 'previsto') {
          // a) data de competência pode ser futura (não há restrição de ser <= hoje)
          // b) data_realizacao deve ficar vazia (a realização acontece somente pela liquidação)
          if (dataRealNorm) {
            throw new BadRequestError(
              'Operação negada: lançamento com status "Previsto" não pode ter data de realização preenchida.',
            )
          }
        }

        // Validação de integridade da liquidação no servidor
        // O campo liquidacao_de é reservado para lançamentos de liquidação.
        const liquidacaoDeId = e.record.getString('liquidacao_de')
        if (liquidacaoDeId) {
          let origRecord = null
          try {
            origRecord = $app.findRecordById('lancamentos', liquidacaoDeId)
          } catch (_) {
            throw new BadRequestError(
              'Operação negada: o lançamento referenciado para liquidação não existe.',
            )
          }

          // O lançamento referenciado deve estar com status "previsto"
          const origStatus = origRecord.getString('status')
          if (origStatus !== 'previsto') {
            throw new BadRequestError(
              'Operação negada: o lançamento referenciado não está com status "previsto".',
            )
          }

          // O lançamento referenciado não pode ser ele mesmo uma liquidação
          const origLiquidacaoDe = origRecord.getString('liquidacao_de')
          if (origLiquidacaoDe) {
            throw new BadRequestError(
              'Operação negada: não é permitido realizar a liquidação de um lançamento de liquidação.',
            )
          }

          // O lançamento referenciado não pode ser um estorno
          const origEstornoDe = origRecord.getString('estorno_de')
          if (origEstornoDe) {
            throw new BadRequestError(
              'Operação negada: não é permitido realizar a liquidação de um contra-lançamento de estorno.',
            )
          }

          // O lançamento referenciado já possui outra liquidação (qualquer lançamento com liquidacao_de = ID)
          let liquidacoesExistentes = []
          try {
            liquidacoesExistentes =
              $app.findRecordsByFilter(
                'lancamentos',
                `liquidacao_de = '${liquidacaoDeId}'`,
                '',
                1,
                0,
              ) || []
          } catch (_) {
            liquidacoesExistentes = []
          }
          if (liquidacoesExistentes.length > 0) {
            throw new BadRequestError(
              'Operação negada: o lançamento referenciado já possui outra liquidação registrada. Não é permitida liquidação duplicada.',
            )
          }

          // A liquidação deve ter status "realizado"
          const statusLiquidacao = e.record.getString('status')
          if (statusLiquidacao !== 'realizado') {
            throw new BadRequestError(
              'Operação negada: o lançamento de liquidação deve ter status = "realizado".',
            )
          }

          // A liquidação deve ser idêntica à conta prevista em:
          // tipo, valor, categoria_id, empresa_id, competência
          const origTipo = origRecord.getString('tipo')
          const novoTipo = e.record.getString('tipo')
          if (origTipo !== novoTipo) {
            throw new BadRequestError(
              'Operação negada: o tipo da liquidação (' +
                novoTipo +
                ') deve ser idêntico ao da conta prevista (' +
                origTipo +
                ').',
            )
          }

          const origValor = origRecord.getFloat('valor')
          const novoValor = e.record.getFloat('valor')
          if (Math.abs(origValor - novoValor) > 0.0001) {
            throw new BadRequestError(
              'Operação negada: o valor da liquidação (' +
                novoValor +
                ') deve ser idêntico ao da conta prevista (' +
                origValor +
                ').',
            )
          }

          const origCatId = origRecord.getString('categoria_id')
          const novoCatId = e.record.getString('categoria_id')
          if (origCatId && novoCatId && origCatId !== novoCatId) {
            throw new BadRequestError(
              'Operação negada: a categoria (categoria_id) da liquidação deve ser idêntica à da conta prevista.',
            )
          }

          const origEmpresaId = origRecord.getString('empresa_id')
          const novoEmpresaId = e.record.getString('empresa_id')
          if (origEmpresaId !== novoEmpresaId) {
            throw new BadRequestError(
              'Operação negada: a empresa (empresa_id) da liquidação deve ser idêntica à da conta prevista.',
            )
          }

          const origCompetencia = origRecord.getString('competencia')
          const novoCompetencia = e.record.getString('competencia')
          if (origCompetencia !== novoCompetencia) {
            throw new BadRequestError(
              'Operação negada: a competência da liquidação (' +
                novoCompetencia +
                ') deve ser idêntica à da conta prevista (' +
                origCompetencia +
                ').',
            )
          }
        }
      }
    }
    e.next()
  },
  'lancamentos',
  'contas',
  'categorias',
  'centros_custo',
  'configuracoes',
  'empresas',
  'patrimonio',
  'departamentos',
)
