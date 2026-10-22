import pb from '@/lib/pocketbase/client'
import { hojeBrasil, formatarDataCivil } from '@/lib/dataCivil'
import {
  Lancamento,
  Conta,
  Categoria,
  Departamento,
  CentroCusto,
  AuditoriaRegistro,
  Configuracao,
  Empresa,
  ItemPatrimonio,
} from '@/types/financial'

export async function getLancamentos(
  filter?: string,
  sort = '-data_lancamento',
): Promise<Lancamento[]> {
  return await pb.collection('lancamentos').getFullList<Lancamento>({
    filter,
    sort,
    expand: 'usuario_id,categoria_id,estorno_de,liquidacao_de,empresa_id',
  })
}

export async function getLancamentoById(id: string): Promise<Lancamento> {
  return await pb.collection('lancamentos').getOne<Lancamento>(id, {
    expand: 'usuario_id,categoria_id,estorno_de,liquidacao_de,empresa_id',
  })
}

export async function createLancamento(
  data: Omit<Lancamento, 'id' | 'created' | 'updated'>,
): Promise<Lancamento> {
  const currentUserId = pb.authStore.model?.id
  const payload = {
    ...data,
    usuario_id: currentUserId,
  }
  return await pb.collection('lancamentos').create<Lancamento>(payload)
}

// Helper interno para obter ou resolver categoria_id do lançamento original
async function resolverCategoriaIdParaOperacao(original: Lancamento): Promise<{
  categoria_id: string
  categoriaTexto: string
}> {
  // Se o original já possui categoria_id, copia diretamente
  if (original.categoria_id) {
    let catNome = original.categoria
    try {
      const catRec = await pb.collection('categorias').getOne<Categoria>(original.categoria_id)
      if (catRec && catRec.nome) catNome = catRec.nome
    } catch {
      /* intentionally ignored */
    }
    return { categoria_id: original.categoria_id, categoriaTexto: catNome }
  }

  // Original legado sem categoria_id: resolver pela regra oficial de resolução por nome
  // trim + case-insensitive + mesmo tipo + aceitar apenas se exatamente uma
  const nomeOriginal = (original.categoria || '').trim().toLowerCase()
  if (!nomeOriginal) {
    throw new Error(
      `Operação bloqueada: o lançamento original ID ${original.id} não possui categoria vinculada.`,
    )
  }

  const todasCats = await pb.collection('categorias').getFullList<Categoria>()
  const compativeis = todasCats.filter((c) => {
    return (c.nome || '').trim().toLowerCase() === nomeOriginal && c.tipo === original.tipo
  })

  if (compativeis.length === 1) {
    return {
      categoria_id: compativeis[0].id,
      categoriaTexto: compativeis[0].nome,
    }
  }

  if (compativeis.length === 0) {
    throw new Error(
      `Operação bloqueada: não foi encontrada nenhuma categoria ativa do tipo "${original.tipo}" com o nome "${original.categoria}". Cadastre a categoria antes de prosseguir.`,
    )
  }

  throw new Error(
    `Operação bloqueada: existem múltiplas categorias (${compativeis.length}) compatíveis com o nome "${original.categoria}" do tipo "${original.tipo}". Não é permitida resolução por aproximação.`,
  )
}

// Estorno de lançamento: cria lançamento inverso e marca auditoria
export async function estornarLancamento(
  original: Lancamento,
  motivo: string,
): Promise<Lancamento> {
  const currentUserId = pb.authStore.model?.id
  const { categoria_id, categoriaTexto } = await resolverCategoriaIdParaOperacao(original)

  // O estorno preserva o mesmo tipo original e referencia estorno_de para abater o grupo contábil de origem,
  // nunca virando despesa operacional quando se estorna uma receita.
  const estorno = await pb.collection('lancamentos').create<Lancamento>({
    tipo: original.tipo,
    descricao: `[ESTORNO] ${original.descricao} - Ref: ${original.id} (${motivo})`,
    categoria: categoriaTexto,
    categoria_id: categoria_id,
    departamento: original.departamento || original.centro_custo,
    centro_custo: original.departamento || original.centro_custo,
    conta: original.conta,
    valor: original.valor,
    competencia: original.competencia,
    data_lancamento: hojeBrasil(),
    data_vencimento: original.data_vencimento || null,
    data_realizacao: hojeBrasil(),
    status: 'realizado',
    observacoes: `Estorno referente ao lançamento original ID: ${original.id}. Motivo: ${motivo}`,
    usuario_id: currentUserId,
    estorno_de: original.id,
    empresa_id: original.empresa_id || null,
  })

  return estorno
}

// Realizar lançamento previsto: cria lançamento de liquidação separado de estorno_de
export async function registrarRealizacaoLancamento(
  original: Lancamento,
  dataRealizacao: string,
  contaEscolhida?: string,
): Promise<Lancamento> {
  const currentUserId = pb.authStore.model?.id
  const { categoria_id, categoriaTexto } = await resolverCategoriaIdParaOperacao(original)

  // Criamos o lançamento Realizado definitivo com liquidacao_de (NÃO estorno_de)
  const realizado = await pb.collection('lancamentos').create<Lancamento>({
    tipo: original.tipo,
    descricao: `[LIQUIDADO] ${original.descricao.replace(/^\[PREVISTO\]\s*/i, '')}`,
    categoria: categoriaTexto,
    categoria_id: categoria_id,
    departamento: original.departamento || original.centro_custo,
    centro_custo: original.departamento || original.centro_custo,
    conta: contaEscolhida || original.conta,
    valor: original.valor,
    competencia: original.competencia,
    data_lancamento: original.data_lancamento,
    data_vencimento: original.data_vencimento || null,
    data_realizacao: dataRealizacao,
    status: 'realizado',
    observacoes: `Realização quitada em ${formatarDataCivil(dataRealizacao)}. Ref original: ${original.id}`,
    usuario_id: currentUserId,
    liquidacao_de: original.id,
    empresa_id: original.empresa_id || null,
  })

  return realizado
}

// Contas
export async function getContas(): Promise<Conta[]> {
  return await pb.collection('contas').getFullList<Conta>({ sort: 'nome' })
}

export async function createConta(data: {
  nome: string
  tipo: 'caixa' | 'banco' | 'cartao'
  saldo_inicial: number
  empresa_id?: string | null
}): Promise<Conta> {
  const currentUserId = pb.authStore.model?.id
  return await pb.collection('contas').create<Conta>({ ...data, usuario_id: currentUserId })
}

export async function updateConta(id: string, data: Partial<Conta>): Promise<Conta> {
  return await pb.collection('contas').update<Conta>(id, data)
}

export async function deleteConta(id: string): Promise<boolean> {
  return await pb.collection('contas').delete(id)
}

// Categorias
export async function getCategorias(
  tipo?: 'receita' | 'despesa',
  somenteAtivas?: boolean,
): Promise<Categoria[]> {
  const filters: string[] = []
  if (tipo) {
    filters.push(`tipo = '${tipo}'`)
  }
  if (somenteAtivas) {
    filters.push(`(ativa = true || ativa = null)`)
  }
  const filter = filters.length > 0 ? filters.join(' && ') : undefined
  return await pb.collection('categorias').getFullList<Categoria>({ filter, sort: 'nome' })
}

export async function createCategoria(data: {
  nome: string
  tipo: 'receita' | 'despesa'
  grupo_dre?: import('../types/financial').GrupoDRE
  ativa?: boolean
}): Promise<Categoria> {
  const currentUserId = pb.authStore.model?.id
  return await pb.collection('categorias').create<Categoria>({
    ...data,
    ativa: data.ativa !== undefined ? data.ativa : true,
    usuario_id: currentUserId,
  })
}

export async function updateCategoria(id: string, data: Partial<Categoria>): Promise<Categoria> {
  return await pb.collection('categorias').update<Categoria>(id, data)
}

export async function deleteCategoria(id: string): Promise<boolean> {
  return await pb.collection('categorias').delete(id)
}

export async function inativarCategoria(id: string): Promise<Categoria> {
  return await pb.collection('categorias').update<Categoria>(id, { ativa: false })
}

export async function reativarCategoria(id: string): Promise<Categoria> {
  return await pb.collection('categorias').update<Categoria>(id, { ativa: true })
}

// Departamentos (Regra 2.6: coleção oficial, sem fallback silencioso para centros_custo)
export async function getDepartamentos(): Promise<Departamento[]> {
  return await pb.collection('departamentos').getFullList<Departamento>({ sort: 'nome' })
}

export async function createDepartamento(data: { nome: string }): Promise<Departamento> {
  const currentUserId = pb.authStore.model?.id
  return await pb
    .collection('departamentos')
    .create<Departamento>({ ...data, usuario_id: currentUserId })
}

export async function updateDepartamento(
  id: string,
  data: Partial<Departamento>,
): Promise<Departamento> {
  return await pb.collection('departamentos').update<Departamento>(id, data)
}

export async function deleteDepartamento(id: string): Promise<boolean> {
  return await pb.collection('departamentos').delete(id)
}

// Aliases para compatibilidade defensiva
export const getCentrosCusto = getDepartamentos
export const createCentroCusto = createDepartamento
export const updateCentroCusto = updateDepartamento
export const deleteCentroCusto = deleteDepartamento

// Empresas
export async function getEmpresas(): Promise<Empresa[]> {
  return await pb.collection('empresas').getFullList<Empresa>({ sort: 'nome' })
}

export async function createEmpresa(data: {
  nome: string
  cnpj?: string
  padrao?: boolean
}): Promise<Empresa> {
  const currentUserId = pb.authStore.model?.id
  return await pb.collection('empresas').create<Empresa>({
    ...data,
    usuario_id: currentUserId,
  })
}

export async function updateEmpresa(id: string, data: Partial<Empresa>): Promise<Empresa> {
  return await pb.collection('empresas').update<Empresa>(id, data)
}

export async function deleteEmpresa(id: string): Promise<boolean> {
  return await pb.collection('empresas').delete(id)
}

// Patrimônio (Ativos e Passivos Empresariais)
export async function getPatrimonio(filter?: string): Promise<ItemPatrimonio[]> {
  return await pb.collection('patrimonio').getFullList<ItemPatrimonio>({
    filter,
    sort: '-created',
    expand: 'empresa_id',
  })
}

export async function createItemPatrimonio(data: {
  tipo: 'ativo' | 'passivo'
  categoria: string
  descricao: string
  valor: number
  data_referencia?: string | null
  empresa_id?: string | null
}): Promise<ItemPatrimonio> {
  const currentUserId = pb.authStore.model?.id
  return await pb.collection('patrimonio').create<ItemPatrimonio>({
    ...data,
    usuario_id: currentUserId,
  })
}

export async function updateItemPatrimonio(
  id: string,
  data: Partial<ItemPatrimonio>,
): Promise<ItemPatrimonio> {
  return await pb.collection('patrimonio').update<ItemPatrimonio>(id, data)
}

export async function deleteItemPatrimonio(id: string): Promise<boolean> {
  return await pb.collection('patrimonio').delete(id)
}

// Token de auditoria em memória após validação de Senha Mestra.
// Não sobrevive ao fim da sessão (logout ou inatividade) e vale 15 minutos no cliente.
const VALIDADE_TOKEN_AUDITORIA_MS = 15 * 60 * 1000
let sessionAuditToken: string | null = null
let sessionAuditTokenEm = 0

export function getSessionAuditToken(): string | null {
  if (sessionAuditToken && Date.now() - sessionAuditTokenEm > VALIDADE_TOKEN_AUDITORIA_MS) {
    sessionAuditToken = null
  }
  return sessionAuditToken
}

export function setSessionAuditToken(token: string | null) {
  sessionAuditToken = token
  sessionAuditTokenEm = token ? Date.now() : 0
}

pb.authStore?.onChange?.((novoToken: string) => {
  if (!novoToken) setSessionAuditToken(null)
})

// Auditoria com proteção server-side real via Token JWT
export async function getAuditoriaRegistros(
  token?: string,
  options?: { all?: boolean },
): Promise<AuditoriaRegistro[]> {
  const activeToken = token || getSessionAuditToken()
  if (!activeToken) {
    throw new Error(
      'Acesso à auditoria bloqueado. É necessária autorização via Senha Mestra Corporativa.',
    )
  }

  const all = options?.all !== undefined ? options.all : true
  const endpoint = all ? '/backend/v1/audit/registros?all=true' : '/backend/v1/audit/registros'

  const res = await pb.send<{
    success: boolean
    items: AuditoriaRegistro[]
    message?: string
  }>(endpoint, {
    method: 'GET',
    headers: {
      'x-audit-token': activeToken,
    },
  })

  return res.items || []
}

export async function verifyMasterPassword(
  password: string,
): Promise<{ authorized: boolean; token?: string; message?: string }> {
  try {
    const res = await pb.send<{
      success: boolean
      authorized: boolean
      auditToken?: string
      message?: string
    }>('/backend/v1/audit/verify-master-password', {
      method: 'POST',
      body: { password },
    })

    if (res.authorized && res.auditToken) {
      setSessionAuditToken(res.auditToken)
    }
    return {
      authorized: Boolean(res.authorized),
      token: res.auditToken,
      message: res.message,
    }
  } catch (err: any) {
    return {
      authorized: false,
      message: err?.data?.message || err?.message || 'Falha na validação da Senha Mestra.',
    }
  }
}

export async function setMasterPasswordServer(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; message: string }> {
  const res = await pb.send<{ success: boolean; message: string }>(
    '/backend/v1/audit/set-master-password',
    {
      method: 'POST',
      body: { currentPassword, newPassword },
    },
  )
  return res
}

export async function getMasterPasswordStatus(): Promise<{ configurada: boolean }> {
  try {
    const res = await pb.send<{ success: boolean; configurada: boolean }>(
      '/backend/v1/audit/status-master-password',
      { method: 'GET' },
    )
    return { configurada: Boolean(res.configurada) }
  } catch (_) {
    return { configurada: false }
  }
}

// Edição controlada server-side com motivo obrigatório e auditoria ANTES/DEPOIS
export async function editarLancamentoControlado(
  id: string,
  data: import('../types/financial').EdicaoLancamentoInput,
): Promise<{ success: boolean; lancamento: Lancamento; message: string }> {
  const res = await pb.send<{
    success: boolean
    lancamento: Lancamento
    message: string
  }>(`/backend/v1/lancamentos/${id}/editar`, {
    method: 'POST',
    body: data,
  })
  return res
}

// Configurações
export async function getConfiguracoes(): Promise<Record<string, string>> {
  const items = await pb.collection('configuracoes').getFullList<Configuracao>()
  const map: Record<string, string> = {}
  for (const item of items) {
    map[item.chave] = item.valor
  }
  return map
}

export async function setConfiguracao(chave: string, valor: string): Promise<void> {
  const currentUserId = pb.authStore.model?.id
  const items = await pb.collection('configuracoes').getFullList<Configuracao>({
    filter: `chave = '${chave}'`,
  })
  if (items.length > 0) {
    await pb.collection('configuracoes').update(items[0].id, { valor })
  } else {
    await pb.collection('configuracoes').create({
      chave,
      valor,
      usuario_id: currentUserId,
    })
  }
}
