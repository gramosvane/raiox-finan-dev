// Integridade do cadastro de contas (caixa, banco, cartão).
// O lançamento guarda a conta pelo NOME; por isso o nome precisa ser estável e único:
//  - nome único por empresa (ignora maiúsculas, acentos, espaços repetidos e caracteres invisíveis);
//  - uma conta com lançamentos ou fechamentos NÃO pode ser renomeada, trocar de tipo nem ser excluída
//    (o histórico ficaria com um nome órfão ou com as regras de tipo contornadas);
//  - a conta nova assume a empresa do usuário;
//  - FALHA FECHADA: se não for possível verificar o uso da conta, a operação é recusada.
// (o escopo de cada manipulador é isolado no PocketBase: a função auxiliar fica DENTRO de cada um)

onRecordCreateRequest((e) => {
  const normaliza = (s) => {
    let t = String(s || '').replace(/[​-‍﻿]/g, '')
    try {
      t = t.normalize('NFD').replace(/[̀-ͯ]/g, '')
    } catch (_) {}
    return t.trim().replace(/\s+/g, ' ').toLowerCase()
  }
  if (!e.auth || e.auth.collection().name !== 'users') return e.next()
  const empresaId = e.auth.getString('empresa_id') || ''
  e.record.set('empresa_id', empresaId)
  const nome = String(e.record.get('nome') || '').replace(/[​-‍﻿]/g, '').trim().replace(/\s+/g, ' ')
  e.record.set('nome', nome)
  let existentes = []
  try {
    existentes = $app.findRecordsByFilter('contas', "empresa_id = {:e} || empresa_id = ''", '', 500, 0, { e: empresaId }) || []
  } catch (_) {
    throw new BadRequestError('Não foi possível verificar os nomes das contas. Tente novamente.')
  }
  for (const c of existentes) {
    if (normaliza(c.getString('nome')) === normaliza(nome)) {
      throw new BadRequestError('Já existe uma conta com este nome (ou muito parecido). Use um nome diferente.')
    }
  }
  return e.next()
}, 'contas')

onRecordUpdateRequest((e) => {
  const normaliza = (s) => {
    let t = String(s || '').replace(/[​-‍﻿]/g, '')
    try {
      t = t.normalize('NFD').replace(/[̀-ͯ]/g, '')
    } catch (_) {}
    return t.trim().replace(/\s+/g, ' ').toLowerCase()
  }
  const antigo = e.record.original().getString('nome')
  const tipoAntigo = e.record.original().getString('tipo')
  const novo = String(e.record.get('nome') || '').replace(/[​-‍﻿]/g, '').trim().replace(/\s+/g, ' ')
  const mudouNome = antigo !== novo
  const mudouTipo = tipoAntigo !== e.record.getString('tipo')
  if (!mudouNome && !mudouTipo) return e.next()
  e.record.set('nome', novo)
  let usos = 0
  try {
    usos =
      $app.countRecords('lancamentos', $dbx.exp('conta = {:n}', { n: antigo })) +
      $app.countRecords('fechamentos_caixa', $dbx.exp('conta = {:n}', { n: antigo }))
  } catch (_) {
    throw new BadRequestError('Não foi possível verificar o uso da conta. Tente novamente.')
  }
  if (usos > 0) {
    throw new BadRequestError(
      'Esta conta já tem ' + usos + ' movimento(s) e não pode mudar de nome nem de tipo. Crie outra conta se precisar.',
    )
  }
  if (mudouNome) {
    const empresaId = e.record.getString('empresa_id') || ''
    let existentes = []
    try {
      existentes =
        $app.findRecordsByFilter('contas', "id != {:i} && (empresa_id = {:e} || empresa_id = '')", '', 500, 0, { i: e.record.id, e: empresaId }) || []
    } catch (_) {
      throw new BadRequestError('Não foi possível verificar os nomes das contas. Tente novamente.')
    }
    for (const c of existentes) {
      if (normaliza(c.getString('nome')) === normaliza(novo)) {
        throw new BadRequestError('Já existe uma conta com este nome (ou muito parecido). Use um nome diferente.')
      }
    }
  }
  return e.next()
}, 'contas')

onRecordDeleteRequest((e) => {
  const nome = e.record.getString('nome')
  let usos = 0
  try {
    usos =
      $app.countRecords('lancamentos', $dbx.exp('conta = {:n}', { n: nome })) +
      $app.countRecords('fechamentos_caixa', $dbx.exp('conta = {:n}', { n: nome }))
  } catch (_) {
    throw new BadRequestError('Não foi possível verificar o uso da conta. Tente novamente.')
  }
  if (usos > 0) {
    throw new BadRequestError(
      'Esta conta tem ' + usos + ' movimento(s) e não pode ser excluída. O histórico precisa continuar identificável.',
    )
  }
  return e.next()
}, 'contas')
