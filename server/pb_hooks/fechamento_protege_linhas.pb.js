// Protege as LINHAS geradas por um fechamento de caixa (lançamentos com fechamento_id).
// O dinheiro, o PIX, o débito, o crédito e as despesas do caixa nascem juntos, ligados à fita. Se uma dessas linhas fosse
// editada ou estornada à mão, a fita deixaria de bater com os lançamentos e o "Estornar fechamento" poderia estornar
// de novo o que já foi estornado. Por isso:
//  - EDITAR (inclusive pela edição controlada, que grava pelo servidor): recusado. A única mudança aceita é a que a
//    própria rota de estorno do fechamento faz (previsto que ainda não foi baixado passa a "estornado");
//  - ESTORNAR à mão (contra-lançamento com estorno_de apontando para uma linha de fechamento): recusado.
//    Para corrigir uma fita errada, estorne o FECHAMENTO inteiro e registre a fita de novo.
// A rota de estorno do fechamento grava pelo servidor (txApp.save) e por isso não passa pelo gancho de requisição;
// o gancho de modelo abaixo deixa passar apenas a transição previsto -> estornado, sem nenhum outro campo alterado.
// Arquivo separado de propósito: os hooks aprovados de lançamento (enforce_usuario_id, lancamento_editar) ficam intactos.
// (o escopo de cada manipulador é isolado no PocketBase: a verificação fica DENTRO de cada um)

onRecordUpdate((e) => {
  const orig = e.record.original()
  // o vínculo conta pelo valor ORIGINAL: limpar fechamento_id na mesma atualização não escapa da proteção
  const fid = orig.getString('fechamento_id') || e.record.getString('fechamento_id')
  if (!fid) return e.next()
  const campos = [
    'tipo',
    'descricao',
    'categoria',
    'categoria_id',
    'conta',
    'competencia',
    'data_lancamento',
    'data_vencimento',
    'data_realizacao',
    'empresa_id',
    'usuario_id',
    'fechamento_id',
    'estorno_de',
    'liquidacao_de',
    'observacoes',
  ]
  let outrosCampos = false
  for (const c of campos) {
    if (String(orig.getString(c) || '') !== String(e.record.getString(c) || '')) {
      outrosCampos = true
      break
    }
  }
  if (Math.abs(orig.getFloat('valor') - e.record.getFloat('valor')) > 0.0001) outrosCampos = true
  const soCancelaPrevisto =
    !outrosCampos && orig.getString('status') === 'previsto' && e.record.getString('status') === 'estornado'
  if (!soCancelaPrevisto) {
    throw new BadRequestError(
      'Esta linha foi gerada por um fechamento de caixa e não pode ser editada. Para corrigir, estorne o fechamento (tela Fechamento de caixa) e registre a fita de novo. Se algum PIX ou cartão desse fechamento já foi baixado, o fechamento não pode ser estornado: nesse caso só vale um lançamento de ajuste definido com o contador.',
    )
  }
  return e.next()
}, 'lancamentos')

// Quem chama a API de atualização (só o superusuário passa pelas regras; o lançamento tem updateRule fechada) também é barrado:
// a única mudança legítima nessas linhas é a da rota de estorno do fechamento, que grava pelo servidor.
onRecordUpdateRequest((e) => {
  if (e.record.original().getString('fechamento_id')) {
    throw new BadRequestError(
      'Esta linha foi gerada por um fechamento de caixa e não pode ser editada. Para corrigir, estorne o fechamento (tela Fechamento de caixa) e registre a fita de novo. Se algum PIX ou cartão desse fechamento já foi baixado, o fechamento não pode ser estornado: nesse caso só vale um lançamento de ajuste definido com o contador.',
    )
  }
  return e.next()
}, 'lancamentos')

onRecordCreateRequest((e) => {
  // O vínculo com um fechamento é definido SÓ pelo servidor (a rota do fechamento grava por txApp.save e não passa por aqui).
  // Sem isto, um lançamento criado à mão com um fechamento_id qualquer ficaria "blindado" para sempre ou seria arrastado
  // para o estorno de um fechamento real.
  if (e.record.getString('fechamento_id')) {
    throw new BadRequestError('O vínculo com um fechamento de caixa é definido só pelo servidor.')
  }
  const alvo = e.record.getString('estorno_de')
  if (!alvo) return e.next()
  let fid = ''
  try {
    fid = $app.findRecordById('lancamentos', alvo).getString('fechamento_id')
  } catch (_) {
    // original inexistente: o gancho aprovado de lançamento recusa com a mensagem própria
    return e.next()
  }
  if (fid) {
    throw new BadRequestError(
      'Esta linha foi gerada por um fechamento de caixa e não pode ser estornada à mão. Para desfazer, estorne o fechamento inteiro (tela Fechamento de caixa). Se algum PIX ou cartão desse fechamento já foi baixado, o fechamento não pode ser estornado: nesse caso só vale um lançamento de ajuste definido com o contador.',
    )
  }
  return e.next()
}, 'lancamentos')
