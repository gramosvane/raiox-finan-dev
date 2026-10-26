// Integridade do cadastro de contas (caixa, banco, cartão).
// O lançamento guarda a conta pelo NOME; por isso o nome precisa ser estável e único:
//  - nome único por empresa (ignorando maiúsculas e espaços repetidos);
//  - uma conta com lançamentos NÃO pode ser renomeada nem excluída (o histórico ficaria com um nome órfão);
//  - ao criar sem empresa, a conta assume a empresa do usuário.
// (o escopo de cada manipulador é isolado no PocketBase: a função auxiliar fica DENTRO de cada um)

onRecordCreateRequest((e) => {
  const normaliza = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
  if (!e.auth || e.auth.collection().name !== 'users') return e.next()
  const empresaId = e.record.getString('empresa_id') || e.auth.getString('empresa_id') || ''
  if (!e.record.getString('empresa_id') && empresaId) e.record.set('empresa_id', empresaId)
  const nome = String(e.record.get('nome') || '').trim().replace(/\s+/g, ' ')
  e.record.set('nome', nome)
  let existentes = []
  try {
    existentes = $app.findRecordsByFilter('contas', "empresa_id = {:e} || empresa_id = ''", '', 500, 0, { e: empresaId }) || []
  } catch (_) {}
  for (const c of existentes) {
    if (normaliza(c.getString('nome')) === normaliza(nome)) {
      throw new BadRequestError('Já existe uma conta com este nome. Use um nome diferente.')
    }
  }
  return e.next()
}, 'contas')

onRecordUpdateRequest((e) => {
  const normaliza = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
  const antigo = e.record.original().getString('nome')
  const novo = String(e.record.get('nome') || '').trim().replace(/\s+/g, ' ')
  if (antigo === novo) return e.next()
  e.record.set('nome', novo)
  let usos = 0
  try {
    usos = $app.countRecords('lancamentos', $dbx.exp('conta = {:n}', { n: antigo }))
  } catch (_) {}
  if (usos > 0) {
    throw new BadRequestError(
      'Esta conta já tem ' + usos + ' lançamento(s) e não pode ser renomeada. Crie outra conta se precisar.',
    )
  }
  const empresaId = e.record.getString('empresa_id') || ''
  let existentes = []
  try {
    existentes =
      $app.findRecordsByFilter('contas', "id != {:i} && (empresa_id = {:e} || empresa_id = '')", '', 500, 0, { i: e.record.id, e: empresaId }) || []
  } catch (_) {}
  for (const c of existentes) {
    if (normaliza(c.getString('nome')) === normaliza(novo)) {
      throw new BadRequestError('Já existe uma conta com este nome. Use um nome diferente.')
    }
  }
  return e.next()
}, 'contas')

onRecordDeleteRequest((e) => {
  const nome = e.record.getString('nome')
  let usos = 0
  try {
    usos = $app.countRecords('lancamentos', $dbx.exp('conta = {:n}', { n: nome }))
  } catch (_) {}
  if (usos > 0) {
    throw new BadRequestError(
      'Esta conta tem ' + usos + ' lançamento(s) e não pode ser excluída. O histórico precisa continuar identificável.',
    )
  }
  return e.next()
}, 'contas')
