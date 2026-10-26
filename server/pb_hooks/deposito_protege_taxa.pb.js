// Protege a DESPESA DE TAXA gerada por um depósito conferido (e as geradas por correções).
// Ela é um lançamento comum; se alguém a editasse ou estornasse à mão, o depósito imutável deixaria de bater com o
// DRE e com o caixa, e a correção ficaria travada. Por isso:
//  - EDITAR (inclusive pela edição controlada, que grava pelo servidor): recusado; use "Corrigir" no depósito;
//  - ESTORNAR à mão (contra-lançamento com estorno_de apontando para a taxa): recusado; use "Corrigir".
// A rota de correção do depósito grava o estorno pelo servidor (txApp.save) e por isso não passa por este hook de requisição.
// Arquivo separado de propósito: os hooks aprovados de lançamento (enforce_usuario_id, lancamento_editar) ficam intactos.
// (o escopo de cada manipulador é isolado no PocketBase: a verificação fica DENTRO de cada um)

onRecordUpdate((e) => {
  const app = e.app || $app
  let usos = 0
  try {
    usos =
      app.countRecords('depositos', $dbx.exp('taxa_lancamento_id = {:i}', { i: e.record.id })) +
      app.countRecords('depositos_correcoes', $dbx.exp('taxa_lancamento_id = {:i}', { i: e.record.id }))
  } catch (_) {
    throw new BadRequestError('Não foi possível verificar o lançamento. Tente novamente.')
  }
  if (usos > 0) {
    throw new BadRequestError(
      'Esta despesa é a taxa de um depósito conferido e não pode ser editada. Use "Corrigir" no depósito (Contas a Receber).',
    )
  }
  return e.next()
}, 'lancamentos')

onRecordCreateRequest((e) => {
  const alvo = e.record.getString('estorno_de')
  if (!alvo) return e.next()
  let usos = 0
  try {
    usos =
      $app.countRecords('depositos', $dbx.exp('taxa_lancamento_id = {:i}', { i: alvo })) +
      $app.countRecords('depositos_correcoes', $dbx.exp('taxa_lancamento_id = {:i}', { i: alvo }))
  } catch (_) {
    throw new BadRequestError('Não foi possível verificar o lançamento. Tente novamente.')
  }
  if (usos > 0) {
    throw new BadRequestError(
      'Esta despesa é a taxa de um depósito conferido e não pode ser estornada aqui. Use "Corrigir" no depósito (Contas a Receber).',
    )
  }
  return e.next()
}, 'lancamentos')
