// Estorno de um fechamento de caixa (corrigir uma fita registrada errada).
// POST /backend/v1/fechamento/estornar { id, motivo }
// Na MESMA transação: para cada lançamento gerado pelo fechamento (fechamento_id) cria o estorno, como o estorno
// manual do sistema: lançamento REALIZADO ganha um contra-lançamento (estorno_de); lançamento PREVISTO que ainda
// não foi baixado passa a 'estornado' (o DRE e o Contas a Receber já ignoram esse status). Registra a auditoria e
// marca o fechamento como estornado (a fita pode então ser registrada de novo).
// Se QUALQUER lançamento do fechamento já tiver baixa (PIX/cartão recebido), NADA é feito: estorne a baixa antes.
routerAdd('POST', '/backend/v1/fechamento/estornar', (e) => {
  if (!e.auth || e.auth.collection().name !== 'users') {
    return e.json(401, { success: false, message: 'Operação negada: usuário não autenticado.' })
  }
  const papel = e.auth.getString('role')
  if (papel === 'leitura' || papel === '') {
    return e.json(403, { success: false, message: 'Operação negada: seu cargo não pode estornar.' })
  }
  const corpo = (e.requestInfo() && e.requestInfo().body) || {}
  const id = String(corpo.id || '').trim()
  const motivo = String(corpo.motivo || '').trim().slice(0, 300)
  if (!id) return e.json(400, { success: false, message: 'Informe o fechamento.' })
  if (motivo.length < 5) return e.json(400, { success: false, message: 'Informe o motivo do estorno (mínimo 5 letras).' })

  // data de hoje no calendário de Brasília (UTC-3, sem horário de verão)
  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)

  let resumo = null
  try {
    $app.runInTransaction((txApp) => {
      let fech
      try {
        fech = txApp.findRecordById('fechamentos_caixa', id)
      } catch (_) {
        throw new BadRequestError('Fechamento não encontrado.')
      }
      const empresaUsuario = e.auth.getString('empresa_id')
      if (empresaUsuario && fech.getString('empresa_id') !== empresaUsuario) {
        throw new BadRequestError('Fechamento não encontrado.')
      }
      if (fech.getBool('estornado')) throw new BadRequestError('Este fechamento já foi estornado.')

      const colLanc = txApp.findCollectionByNameOrId('lancamentos')
      const originais =
        txApp.findRecordsByFilter('lancamentos', "fechamento_id = {:f} && estorno_de = ''", 'created', 200, 0, { f: id }) || []
      if (originais.length === 0) {
        throw new BadRequestError('Este fechamento não gerou lançamentos (é uma conferência antiga). Nada a estornar.')
      }
      for (const o of originais) {
        const baixas =
          txApp.findRecordsByFilter('lancamentos', "liquidacao_de = {:i} && status != 'estornado'", '', 1, 0, { i: o.id }) || []
        if (baixas.length > 0) {
          throw new BadRequestError(
            'Já existe baixa em "' + o.getString('descricao') + '". Estorne a baixa em Contas a Receber antes de estornar o fechamento.',
          )
        }
      }

      let estornosRealizados = 0
      let previstosCancelados = 0
      for (const o of originais) {
        if (o.getString('status') === 'realizado') {
          const x = new Record(colLanc)
          x.set('tipo', o.getString('tipo'))
          x.set('descricao', '[ESTORNO] ' + o.getString('descricao') + ' - Ref: ' + o.id + ' (' + motivo + ')')
          x.set('categoria', o.getString('categoria'))
          x.set('categoria_id', o.getString('categoria_id'))
          x.set('valor', o.getFloat('valor'))
          x.set('competencia', o.getString('competencia'))
          x.set('data_lancamento', hoje)
          x.set('data_realizacao', hoje)
          x.set('status', 'realizado')
          x.set('observacoes', 'Estorno do fechamento de caixa ' + id + '. Motivo: ' + motivo)
          x.set('empresa_id', o.getString('empresa_id'))
          x.set('usuario_id', e.auth.id)
          x.set('estorno_de', o.id)
          x.set('fechamento_id', id)
          txApp.save(x)
          estornosRealizados++
        } else if (o.getString('status') === 'previsto') {
          o.set('status', 'estornado')
          txApp.save(o)
          previstosCancelados++
        }
      }

      fech.set('estornado', true)
      fech.set('estornado_em', hoje)
      fech.set('estornado_por', e.auth.id)
      txApp.save(fech)

      const audit = new Record(txApp.findCollectionByNameOrId('auditoria'))
      audit.set('usuario_id', e.auth.id)
      audit.set('acao', 'estorno_fechamento_caixa')
      audit.set(
        'descricao',
        'Fechamento de caixa ' + fech.getString('caixa') + ' nº ' + fech.getString('numero_fita') + ' estornado. Motivo: ' + motivo,
      )
      audit.set('referencia_id', id)
      audit.set('detalhes', { motivo: motivo, estornos: estornosRealizados, previstos_cancelados: previstosCancelados })
      txApp.save(audit)
      resumo = { estornos: estornosRealizados, previstos_cancelados: previstosCancelados }
    })
  } catch (err) {
    const msg = err && err.message ? String(err.message) : ''
    const conhecida = /Fechamento|fechamento|baixa|Informe|estornad|conferência/.test(msg)
    if (!conhecida) console.error('fechamento_estorno: falha:', msg)
    return e.json(400, {
      success: false,
      message: conhecida ? msg : 'Não foi possível estornar o fechamento. Nada foi alterado.',
    })
  }
  return e.json(200, { success: true, message: 'Fechamento estornado.', ...resumo })
})
