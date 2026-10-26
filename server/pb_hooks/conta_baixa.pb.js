// Todo lançamento REALIZADO (baixa ou lançamento direto) exige a conta por onde o dinheiro entrou ou saiu.
// - A conta precisa EXISTIR (cadastro em Configurações) na empresa do usuário. A comparação ignora maiúsculas,
//   acentos, espaços repetidos e caracteres invisíveis, e o nome gravado é sempre o do cadastro (canônico).
// - Receita não pode entrar em conta do tipo cartão (cartão corporativo é dívida, não saldo).
// - Estornos herdam a conta do original e não são verificados aqui; previstos não têm conta até a baixa.
// - Sem conta padrão silenciosa: sem conta, o lançamento realizado é recusado.
// - RESTAURAÇÃO DE BACKUP: o histórico antigo tem baixas sem conta. A exigência só é dispensada quando a requisição
//   traz o cabeçalho X-Restauracao-Backup: 1 E o papel do usuário (lido do banco) é administrador.
// - Trocar a conta de um lançamento realizado (edição) também só aceita conta existente.
// Arquivo separado de propósito: os hooks aprovados de lançamento (enforce_usuario_id, lancamento_editar) ficam intactos.
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
  const ehBaixa = !!e.record.getString('liquidacao_de')
  const ehEstorno = !!e.record.getString('estorno_de')
  if (ehEstorno) return e.next()
  if (!ehBaixa && e.record.getString('status') !== 'realizado') return e.next()

  // nos hooks de registro os cabeçalhos vêm em e.requestInfo().headers (chaves em minúsculas, '-' vira '_')
  const cabecalhos = (e.requestInfo() && e.requestInfo().headers) || {}
  if (String(cabecalhos['x_restauracao_backup'] || '') === '1') {
    let papel = ''
    try {
      papel = $app.findRecordById('users', e.auth.id).getString('role')
    } catch (_) {}
    if (papel === 'administrador') return e.next()
  }

  const informada = normaliza(e.record.get('conta'))
  if (!informada) {
    throw new BadRequestError('Operação negada: informe a conta (caixa ou banco) por onde o dinheiro entrou ou saiu.')
  }

  const empresaId = e.auth.getString('empresa_id') || ''
  let contas = []
  try {
    contas = $app.findRecordsByFilter('contas', "empresa_id = {:e} || empresa_id = ''", '', 500, 0, { e: empresaId }) || []
  } catch (_) {
    throw new BadRequestError('Não foi possível verificar a conta. Tente novamente.')
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

// Troca de conta em lançamento realizado (vale também para a edição controlada, que grava pelo servidor).
onRecordUpdate((e) => {
  const normaliza = (s) => {
    let t = String(s || '').replace(/[​-‍﻿]/g, '')
    try {
      t = t.normalize('NFD').replace(/[̀-ͯ]/g, '')
    } catch (_) {}
    return t.trim().replace(/\s+/g, ' ').toLowerCase()
  }
  const antiga = String(e.record.original().get('conta') || '')
  const nova = String(e.record.get('conta') || '')
  if (antiga === nova) return e.next()
  if (e.record.getString('status') !== 'realizado') return e.next()
  if (!normaliza(nova)) {
    throw new BadRequestError('Operação negada: um lançamento realizado precisa ter conta (caixa ou banco).')
  }
  const app = e.app || $app
  const empresaId = e.record.getString('empresa_id') || ''
  let contas = []
  try {
    contas = app.findRecordsByFilter('contas', "empresa_id = {:e} || empresa_id = ''", '', 500, 0, { e: empresaId }) || []
  } catch (_) {
    throw new BadRequestError('Não foi possível verificar a conta. Tente novamente.')
  }
  let achada = null
  for (const c of contas) {
    if (normaliza(c.getString('nome')) === normaliza(nova)) {
      achada = c
      break
    }
  }
  if (!achada) {
    throw new BadRequestError('Operação negada: a conta informada não existe. Cadastre-a em Configurações.')
  }
  if (achada.getString('tipo') === 'cartao' && e.record.getString('tipo') === 'receita') {
    throw new BadRequestError('Operação negada: uma receita não pode entrar em conta do tipo cartão.')
  }
  e.record.set('conta', achada.getString('nome'))
  return e.next()
}, 'lancamentos')
