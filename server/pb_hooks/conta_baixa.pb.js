// Toda BAIXA (liquidação) exige a conta por onde o dinheiro entrou ou saiu.
// - Só a baixa (lançamento com liquidacao_de) é exigida aqui: restauração de backup e lançamentos antigos não são afetados.
// - A conta precisa EXISTIR (cadastro em Configurações) na empresa do usuário; a comparação ignora maiúsculas e
//   espaços repetidos, e o nome gravado é sempre o do cadastro (canônico).
// - Receita não pode entrar em conta do tipo cartão (cartão corporativo é dívida, não saldo).
// - Não há conta padrão silenciosa: sem conta, a baixa é recusada.
// Arquivo separado de propósito: os hooks aprovados de lançamento (enforce_usuario_id, lancamento_editar) ficam intactos.
onRecordCreateRequest((e) => {
  if (!e.auth || e.auth.collection().name !== 'users') return e.next()
  if (!e.record.getString('liquidacao_de')) return e.next()

  const normaliza = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
  const informada = normaliza(e.record.get('conta'))
  if (!informada) {
    throw new BadRequestError('Operação negada: informe a conta (caixa ou banco) da baixa.')
  }

  const empresaId = e.auth.getString('empresa_id') || ''
  let contas = []
  try {
    contas = $app.findRecordsByFilter('contas', "empresa_id = {:e} || empresa_id = ''", '', 500, 0, { e: empresaId }) || []
  } catch (_) {
    contas = []
  }
  let achada = null
  for (const c of contas) {
    if (normaliza(c.getString('nome')) === informada) {
      achada = c
      break
    }
  }
  if (!achada) {
    throw new BadRequestError(
      'Operação negada: a conta informada não existe. Cadastre-a em Configurações, Contas Bancárias / Caixa.',
    )
  }
  if (achada.getString('tipo') === 'cartao' && e.record.getString('tipo') === 'receita') {
    throw new BadRequestError('Operação negada: uma receita não pode entrar em conta do tipo cartão.')
  }
  e.record.set('conta', achada.getString('nome'))
  return e.next()
}, 'lancamentos')
