import pb from '@/lib/pocketbase/client'
import { hojeBrasil } from '@/lib/dataCivil'
import { calcularEfeitoCaixaApresentacao } from '@/lib/apresentacaoLancamentos'
import { neutralizarCelulaCsv } from '@/lib/csvSeguro'
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

export interface BackupData {
  geradoEm: string
  versao: number
  colecoes: {
    empresas?: Empresa[]
    contas: Conta[]
    categorias: Categoria[]
    departamentos?: Departamento[]
    centros_custo?: CentroCusto[]
    lancamentos: Lancamento[]
    patrimonio?: ItemPatrimonio[]
    auditoria: AuditoriaRegistro[]
    configuracoes: Configuracao[]
  }
}

export interface BackupCounts {
  empresas: number
  contas: number
  categorias: number
  departamentos: number
  centros_custo?: number
  lancamentos: number
  patrimonio: number
  auditoria: number
  configuracoes: number
}

export interface ImportResult {
  importados: BackupCounts
  ignoradosExistentes: BackupCounts
  erros: string[]
}

// Helper para buscar todos os registros de uma coleção com paginação segura via SDK
async function fetchAllRecords<T>(collectionName: string, batchSize = 200): Promise<T[]> {
  const all: T[] = []
  let page = 1
  let totalPages = 1

  do {
    const res = await pb.collection(collectionName).getList<T>(page, batchSize, {
      sort: '-created',
      requestKey: null, // evita cancelamento de requisições concorrentes
    })
    all.push(...res.items)
    totalPages = res.totalPages
    page += 1
  } while (page <= totalPages)

  return all
}

// 1. Gera o backup JSON completo
export async function gerarBackupCompleto(tokenAuditoria?: string): Promise<{
  backup: BackupData
  counts: BackupCounts
  fileName: string
}> {
  // Regra 2.6: Backup inclui TODOS os registros de auditoria (via query all=true no endpoint protegido)
  let auditoriaRecords: AuditoriaRegistro[] = []
  if (tokenAuditoria) {
    const res = await pb.send<{ success: boolean; items: AuditoriaRegistro[] }>(
      '/backend/v1/audit/registros?all=true',
      {
        method: 'GET',
        headers: { 'x-audit-token': tokenAuditoria },
      },
    )
    auditoriaRecords = res.items || []
  } else {
    throw new Error(
      'Geração de backup abortada: é necessária a validação da Senha Mestra para incluir os registros de auditoria protegidos.',
    )
  }

  // Regra 2.6: Departamentos é a coleção oficial. Se falhar, relata erro claramente.
  const [empresas, contas, categorias, departamentos, lancamentos, patrimonio, configuracoesRaw] =
    await Promise.all([
      fetchAllRecords<Empresa>('empresas'),
      fetchAllRecords<Conta>('contas'),
      fetchAllRecords<Categoria>('categorias'),
      fetchAllRecords<Departamento>('departamentos'),
      fetchAllRecords<Lancamento>('lancamentos'),
      fetchAllRecords<ItemPatrimonio>('patrimonio'),
      fetchAllRecords<Configuracao>('configuracoes'),
    ])

  // Regra 2.3b: O exportador de backup NUNCA deve exportar segredos nem chaves que comecem com "_" (ex.: "_master*")
  const configuracoesFiltradas = configuracoesRaw.filter(
    (cfg) =>
      cfg && cfg.chave && !cfg.chave.startsWith('_') && !cfg.chave.toLowerCase().includes('secret'),
  )

  const listaDepartamentos = departamentos

  const agora = new Date()
  const dataIso = agora.toISOString()
  const dataFormatada = dataIso.slice(0, 10) // AAAA-MM-DD
  const fileName = `backup-gestao-financeira-${dataFormatada}.json`

  const backup: BackupData = {
    geradoEm: dataIso,
    versao: 3,
    colecoes: {
      empresas,
      contas,
      categorias,
      departamentos: listaDepartamentos,
      centros_custo: listaDepartamentos, // compatibilidade com versões anteriores
      lancamentos,
      patrimonio,
      auditoria: auditoriaRecords,
      configuracoes: configuracoesFiltradas,
    },
  }

  const counts: BackupCounts = {
    empresas: empresas.length,
    contas: contas.length,
    categorias: categorias.length,
    departamentos: listaDepartamentos.length,
    centros_custo: listaDepartamentos.length,
    lancamentos: lancamentos.length,
    patrimonio: patrimonio.length,
    auditoria: auditoriaRecords.length,
    configuracoes: configuracoesFiltradas.length,
  }

  return { backup, counts, fileName }
}

// Helper para acionar download no navegador
export function downloadJsonFile(filename: string, data: any) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Helper para acionar download CSV com UTF-8 BOM para Excel
export function exportarCSVGenerico(
  nomeArquivo: string,
  linhas: Array<string | number | null | undefined>[],
) {
  const csvContent =
    '\uFEFF' +
    linhas
      .map((row) =>
        row
          .map((cell) => {
            if (cell === null || cell === undefined) return '""'
            return `"${neutralizarCelulaCsv(String(cell)).replace(/"/g, '""')}"`
          })
          .join(';'),
      )
      .join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `${nomeArquivo}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// 2. Exportações CSV específicas
export async function exportarCsvLancamentos(filtroTipo?: 'receita' | 'despesa') {
  const lancamentos = await fetchAllRecords<Lancamento>('lancamentos')
  const filtrados = filtroTipo ? lancamentos.filter((l) => l.tipo === filtroTipo) : lancamentos

  const hoje = hojeBrasil()
  const prefixo = filtroTipo
    ? filtroTipo === 'receita'
      ? 'contas-a-receber'
      : 'contas-a-pagar'
    : 'lancamentos'
  const nomeArquivo = `${prefixo}-${hoje}`

  const cabecalho = [
    'ID',
    'Data Lançamento',
    'Tipo',
    'Descrição',
    'Valor (R$)',
    'Competência',
    'Categoria',
    'Categoria (ID)',
    'Departamento',
    'Conta',
    'Data Vencimento',
    'Data Realização',
    'Status',
    'Observações',
    'Estorno de (ID)',
    'Liquidação de (ID)',
    'Empresa (ID)',
    'Data Criação',
    'Situação',
    'Efeito no caixa (R$)',
  ]

  const linhas = [
    cabecalho,
    ...filtrados.map((l) => {
      const { situacao, efeitoCaixa } = calcularEfeitoCaixaApresentacao(l, lancamentos)
      return [
        l.id,
        l.data_lancamento ? l.data_lancamento.slice(0, 10) : '',
        l.tipo === 'receita' ? 'Receita' : 'Despesa',
        l.descricao,
        Number(l.valor || 0).toFixed(2),
        l.competencia,
        l.categoria || '',
        l.categoria_id || '',
        l.departamento || l.centro_custo || '',
        l.conta || '',
        l.data_vencimento ? l.data_vencimento.slice(0, 10) : '',
        l.data_realizacao ? l.data_realizacao.slice(0, 10) : '',
        l.status,
        l.observacoes || '',
        l.estorno_de || '',
        l.liquidacao_de || '',
        l.empresa_id || '',
        l.created,
        situacao,
        Number(efeitoCaixa || 0).toFixed(2),
      ]
    }),
  ]

  exportarCSVGenerico(nomeArquivo, linhas)
  return filtrados.length
}

export async function exportarCsvContasReceberPagar() {
  // Exporta lançamentos com foco em Contas a Receber e Contas a Pagar (toda a coleção com colunas de controle financeiro)
  const lancamentos = await fetchAllRecords<Lancamento>('lancamentos')
  const hoje = hojeBrasil()
  const nomeArquivo = `contas-receber-pagar-${hoje}`

  const cabecalho = [
    'ID',
    'Tipo (Receber / Pagar)',
    'Status',
    'Descrição',
    'Valor (R$)',
    'Competência',
    'Vencimento',
    'Data Realização',
    'Conta Financeira',
    'Categoria',
    'Departamento',
    'Observações',
  ]

  const linhas = [
    cabecalho,
    ...lancamentos.map((l) => [
      l.id,
      l.tipo === 'receita' ? 'Conta a Receber' : 'Conta a Pagar',
      l.status === 'realizado'
        ? 'Realizado / Liquidado'
        : l.status === 'previsto'
          ? 'Previsto / Aberto'
          : 'Estornado',
      l.descricao,
      Number(l.valor || 0).toFixed(2),
      l.competencia,
      l.data_vencimento ? l.data_vencimento.slice(0, 10) : '',
      l.data_realizacao ? l.data_realizacao.slice(0, 10) : '',
      l.conta || '',
      l.categoria || '',
      l.departamento || l.centro_custo || '',
      l.observacoes || '',
    ]),
  ]

  exportarCSVGenerico(nomeArquivo, linhas)
  return lancamentos.length
}

export async function exportarCsvCategoriasDepartamentos() {
  const [categorias, deps] = await Promise.all([
    fetchAllRecords<Categoria>('categorias'),
    fetchAllRecords<Departamento>('departamentos'),
  ])

  const hoje = hojeBrasil()
  const nomeArquivo = `categorias-departamentos-${hoje}`

  const cabecalho = [
    'Tipo Registro',
    'ID',
    'Nome',
    'Classificação / Tipo Movimento',
    'Status (Ativa/Inativa)',
    'Data Criação',
  ]

  const linhas = [
    cabecalho,
    ...categorias.map((c) => [
      'Categoria',
      c.id,
      c.nome,
      c.tipo === 'receita' ? 'Receita' : 'Despesa',
      c.ativa === false ? 'Inativa' : 'Ativa',
      c.created,
    ]),
    ...deps.map((d) => ['Departamento', d.id, d.nome, 'Geral / Operacional', 'Ativa', d.created]),
  ]

  exportarCSVGenerico(nomeArquivo, linhas)
  return {
    categorias: categorias.length,
    departamentos: deps.length,
    centros: deps.length, // compatibilidade com SecaoControleDados
  }
}

// Alias para compatibilidade defensiva
export const exportarCsvCategoriasCentrosCusto = exportarCsvCategoriasDepartamentos

export async function exportarCsvAuditoria(tokenAuditoria?: string) {
  let auditoria: AuditoriaRegistro[] = []
  if (!tokenAuditoria) {
    throw new Error(
      'Exportação de auditoria bloqueada: é necessária a autorização da Senha Mestra.',
    )
  }
  const res = await pb.send<{ success: boolean; items: AuditoriaRegistro[] }>(
    '/backend/v1/audit/registros',
    {
      method: 'GET',
      headers: { 'x-audit-token': tokenAuditoria },
    },
  )
  auditoria = res.items || []

  const hoje = hojeBrasil()
  const nomeArquivo = `auditoria-${hoje}`

  const cabecalho = [
    'ID',
    'Data/Hora (UTC)',
    'Ação',
    'Descrição',
    'ID Usuário',
    'ID Referência',
    'Detalhes JSON',
  ]

  const linhas = [
    cabecalho,
    ...auditoria.map((a) => [
      a.id,
      a.created,
      a.acao,
      a.descricao,
      a.usuario_id || '',
      a.referencia_id || '',
      a.detalhes ? JSON.stringify(a.detalhes) : '',
    ]),
  ]

  exportarCSVGenerico(nomeArquivo, linhas)
  return auditoria.length
}

// 3. Validação de estrutura do backup JSON
export function validarBackupJson(content: any): {
  valido: boolean
  erro?: string
  data?: BackupData
} {
  if (!content || typeof content !== 'object') {
    return { valido: false, erro: 'Arquivo JSON inválido ou vazio.' }
  }

  if (!content.colecoes || typeof content.colecoes !== 'object') {
    return {
      valido: false,
      erro: "Estrutura inválida: propriedade 'colecoes' ausente no arquivo JSON.",
    }
  }

  const { colecoes } = content
  const colecoesObrigatorias = [
    'empresas',
    'contas',
    'categorias',
    'centros_custo',
    'lancamentos',
    'patrimonio',
    'auditoria',
    'configuracoes',
  ]
  const presentes = Object.keys(colecoes)

  // Para compatibilidade com backups gerados na v1 (que não continham empresas e patrimonio),
  // aceitamos se faltarem apenas 'empresas' ou 'patrimonio', mas alertamos ou garantimos arrays vazios
  // Aceita 'departamentos' OU 'centros_custo'
  const temDeps = presentes.includes('departamentos') || presentes.includes('centros_custo')
  const faltantesEssenciais = [
    'lancamentos',
    'contas',
    'categorias',
    'auditoria',
    'configuracoes',
  ].filter((c) => !presentes.includes(c))
  if (!temDeps) {
    faltantesEssenciais.push('departamentos')
  }

  if (faltantesEssenciais.length > 0) {
    return {
      valido: false,
      erro: `Arquivo incompleto: faltam as coleções essenciais [${faltantesEssenciais.join(', ')}].`,
    }
  }

  // Garante que empresas e patrimonio sejam inicializados como arrays caso venha de backup v1
  if (!colecoes.empresas) {
    colecoes.empresas = []
  }
  if (!colecoes.patrimonio) {
    colecoes.patrimonio = []
  }

  for (const c of presentes) {
    if (colecoes[c] !== undefined && !Array.isArray(colecoes[c])) {
      return {
        valido: false,
        erro: `A coleção '${c}' deve ser uma lista (array).`,
      }
    }
  }

  return { valido: true, data: content as BackupData }
}

// 4. Importação e restauração segura com chave de unicidade
export async function restaurarBackup(
  backup: BackupData,
  optionsOrProgress?:
    | {
        tokenAuditoria?: string
        onProgress?: (mensagem: string) => void
      }
    | ((mensagem: string) => void),
): Promise<ImportResult> {
  const onProgress =
    typeof optionsOrProgress === 'function' ? optionsOrProgress : optionsOrProgress?.onProgress
  const tokenAuditoria =
    typeof optionsOrProgress === 'object' ? optionsOrProgress?.tokenAuditoria : undefined
  const currentUserId = pb.authStore.model?.id
  if (!currentUserId) {
    throw new Error('Usuário não autenticado.')
  }

  const result: ImportResult = {
    importados: {
      empresas: 0,
      contas: 0,
      categorias: 0,
      departamentos: 0,
      centros_custo: 0,
      lancamentos: 0,
      patrimonio: 0,
      auditoria: 0,
      configuracoes: 0,
    },
    ignoradosExistentes: {
      empresas: 0,
      contas: 0,
      categorias: 0,
      departamentos: 0,
      centros_custo: 0,
      lancamentos: 0,
      patrimonio: 0,
      auditoria: 0,
      configuracoes: 0,
    },
    erros: [],
  }

  // A. Buscar dados existentes atuais para checagem de unicidade em memória
  onProgress?.('Carregando dados existentes para verificação de duplicidades...')
  const fetchAuditExistentes = async (): Promise<AuditoriaRegistro[]> => {
    if (!tokenAuditoria) return []
    try {
      const res = await pb.send<{ success: boolean; items: AuditoriaRegistro[] }>(
        '/backend/v1/audit/registros?all=true',
        {
          method: 'GET',
          headers: { 'x-audit-token': tokenAuditoria },
        },
      )
      return res.items || []
    } catch (_) {
      return []
    }
  }

  const [
    existentesEmpresas,
    existentesContas,
    existentesCats,
    existentesDeps,
    existentesCC,
    existentesLanc,
    existentesPatrimonio,
    existentesAudit,
    existentesConfigs,
  ] = await Promise.all([
    fetchAllRecords<Empresa>('empresas'),
    fetchAllRecords<Conta>('contas'),
    fetchAllRecords<Categoria>('categorias'),
    fetchAllRecords<Departamento>('departamentos'),
    fetchAllRecords<CentroCusto>('centros_custo').catch(() => []),
    fetchAllRecords<Lancamento>('lancamentos'),
    fetchAllRecords<ItemPatrimonio>('patrimonio'),
    fetchAuditExistentes(),
    fetchAllRecords<Configuracao>('configuracoes'),
  ])

  // Normalizador de string
  const normalizeStr = (s?: string | null) => (s || '').trim().toLowerCase()

  // Mapas de ID antigo -> novo ID para manter integridade referencial se necessário
  const empresaIdMap = new Map<string, string>()
  const categoriaIdMap = new Map<string, string>()
  const lancamentoIdMap = new Map<string, string>()

  // 1. Restaurar Empresas (primeiro para ter IDs mapeados)
  onProgress?.('Restaurando empresas...')
  const existingEmpresaKeys = new Map<string, string>()
  for (const emp of existentesEmpresas) {
    const key = normalizeStr(emp.nome)
    existingEmpresaKeys.set(key, emp.id)
    if (emp.id) empresaIdMap.set(emp.id, emp.id)
  }

  for (const emp of backup.colecoes.empresas || []) {
    const key = normalizeStr(emp.nome)
    if (existingEmpresaKeys.has(key)) {
      result.ignoradosExistentes.empresas++
      if (emp.id) {
        empresaIdMap.set(emp.id, existingEmpresaKeys.get(key)!)
      }
      continue
    }
    try {
      const created = await pb.collection('empresas').create<Empresa>({
        nome: emp.nome,
        cnpj: emp.cnpj || '',
        padrao: Boolean(emp.padrao),
        usuario_id: currentUserId,
      })
      existingEmpresaKeys.set(key, created.id)
      if (emp.id) {
        empresaIdMap.set(emp.id, created.id)
      }
      result.importados.empresas++
    } catch (e: any) {
      result.erros.push(`Empresa "${emp.nome}": ${e.message}`)
    }
  }

  // 2. Restaurar Contas (com empresa_id mapeado se houver)
  onProgress?.('Restaurando contas...')
  const existingContaKeys = new Set(existentesContas.map((c) => normalizeStr(c.nome)))
  for (const c of backup.colecoes.contas || []) {
    const key = normalizeStr(c.nome)
    if (existingContaKeys.has(key)) {
      result.ignoradosExistentes.contas++
      continue
    }
    try {
      const novaEmpresaId = c.empresa_id ? empresaIdMap.get(c.empresa_id) || c.empresa_id : null
      await pb.collection('contas').create({
        nome: c.nome,
        tipo: c.tipo || 'banco',
        saldo_inicial: Number(c.saldo_inicial || 0),
        usuario_id: currentUserId,
        empresa_id: novaEmpresaId,
      })
      existingContaKeys.add(key)
      result.importados.contas++
    } catch (e: any) {
      result.erros.push(`Conta "${c.nome}": ${e.message}`)
    }
  }

  // 3. Restaurar Categorias (preservando grupo_dre contábil e mapeando ID antigo -> novo ID)
  onProgress?.('Restaurando categorias...')
  const existingCatKeys = new Map<string, string>()
  for (const cat of existentesCats) {
    const key = `${normalizeStr(cat.nome)}|${cat.tipo}`
    existingCatKeys.set(key, cat.id)
    if (cat.id) categoriaIdMap.set(cat.id, cat.id)
  }

  for (const cat of backup.colecoes.categorias || []) {
    const key = `${normalizeStr(cat.nome)}|${cat.tipo}`
    if (existingCatKeys.has(key)) {
      result.ignoradosExistentes.categorias++
      if (cat.id) {
        categoriaIdMap.set(cat.id, existingCatKeys.get(key)!)
      }
      continue
    }
    try {
      const created = await pb.collection('categorias').create<Categoria>({
        nome: cat.nome,
        tipo: cat.tipo,
        grupo_dre: cat.grupo_dre || null,
        ativa: cat.ativa !== undefined ? cat.ativa : true,
        usuario_id: currentUserId,
      })
      existingCatKeys.set(key, created.id)
      if (cat.id) {
        categoriaIdMap.set(cat.id, created.id)
      }
      result.importados.categorias++
    } catch (e: any) {
      result.erros.push(`Categoria "${cat.nome}": ${e.message}`)
    }
  }

  // 4. Restaurar Departamentos (com suporte a centros_custo de backups antigos)
  onProgress?.('Restaurando departamentos...')
  const listaDepsParaRestaurar =
    backup.colecoes.departamentos || backup.colecoes.centros_custo || []
  const existingDepKeys = new Set([
    ...existentesDeps.map((d) => normalizeStr(d.nome)),
    ...existentesCC.map((c) => normalizeStr(c.nome)),
  ])
  for (const dep of listaDepsParaRestaurar) {
    const key = normalizeStr(dep.nome)
    if (existingDepKeys.has(key)) {
      result.ignoradosExistentes.departamentos++
      if (result.ignoradosExistentes.centros_custo !== undefined) {
        result.ignoradosExistentes.centros_custo++
      }
      continue
    }
    try {
      // Regra 2.6: Remover fallback silencioso para centros_custo. Se departamentos falhar, mostrar erro claramente.
      await pb.collection('departamentos').create({
        nome: dep.nome,
        usuario_id: currentUserId,
      })
      existingDepKeys.add(key)
      result.importados.departamentos++
      if (result.importados.centros_custo !== undefined) {
        result.importados.centros_custo++
      }
    } catch (e: any) {
      result.erros.push(`Departamento "${dep.nome}": ${e.message}`)
    }
  }

  // 5. Restaurar Lançamentos (com categoria_id mapeado, empresa_id, liquidacao_de, estorno_de preservados)
  // Regra:
  // - Se backup traz categoria_id: mapear o ID antigo da categoria para o ID novo criado (como empresa_id) e gravar categoria_id correto.
  // - Se backup antigo sem categoria_id: aplicar regra de resolução por nome (trim + case-insensitive + mesmo tipo + exatamente 1 compatível).
  //   Se não houver exatamente 1 compatível, listar em "erros" do resultado da restauração, sem criá-lo.
  onProgress?.('Restaurando lançamentos...')
  const existingLancIds = new Set(existentesLanc.map((l) => l.id))
  for (const l of existentesLanc) {
    if (l.id) lancamentoIdMap.set(l.id, l.id)
  }

  // Buscar lista atualizada de categorias no banco para resolução de lançamentos legados
  const todasCategoriasAtuais = await fetchAllRecords<Categoria>('categorias')

  for (const l of backup.colecoes.lancamentos || []) {
    if (l.id && existingLancIds.has(l.id)) {
      result.ignoradosExistentes.lancamentos++
      lancamentoIdMap.set(l.id, l.id)
      continue
    }

    let finalCategoriaId: string | null = null
    let finalCategoriaNome = l.categoria

    if (l.categoria_id) {
      // Mapeia ID antigo -> ID novo
      finalCategoriaId = categoriaIdMap.get(l.categoria_id) || l.categoria_id
      // Se encontrou o objeto da categoria nova, mantém nome atualizado se disponível
      const catObj = todasCategoriasAtuais.find((c) => c.id === finalCategoriaId)
      if (catObj) {
        finalCategoriaNome = catObj.nome
      }
    } else {
      // Backup antigo sem categoria_id: aplicar regra de resolução por nome
      const nomeLancTrim = (l.categoria || '').trim().toLowerCase()
      const compativeis = todasCategoriasAtuais.filter((c) => {
        return (c.nome || '').trim().toLowerCase() === nomeLancTrim && c.tipo === l.tipo
      })

      if (compativeis.length === 1) {
        finalCategoriaId = compativeis[0].id
        finalCategoriaNome = compativeis[0].nome
      } else {
        result.erros.push(
          `Lançamento "${l.descricao}": categoria_id ausente no backup e não foi possível resolver categoria "${l.categoria}" do tipo "${l.tipo}" com exatidão (${compativeis.length} compatíveis encontradas). Lançamento não criado.`,
        )
        continue
      }
    }

    try {
      const novaEmpresaId = l.empresa_id ? empresaIdMap.get(l.empresa_id) || l.empresa_id : null
      const novoEstornoDe = l.estorno_de ? lancamentoIdMap.get(l.estorno_de) || l.estorno_de : null
      const novaLiquidacaoDe = l.liquidacao_de
        ? lancamentoIdMap.get(l.liquidacao_de) || l.liquidacao_de
        : null

      const created = await pb.collection('lancamentos').create({
        tipo: l.tipo,
        descricao: l.descricao,
        categoria: finalCategoriaNome,
        categoria_id: finalCategoriaId,
        departamento: l.departamento || l.centro_custo,
        centro_custo: l.departamento || l.centro_custo,
        conta: l.conta,
        valor: Number(l.valor || 0),
        competencia: l.competencia,
        data_lancamento: l.data_lancamento,
        data_vencimento: l.data_vencimento || null,
        data_realizacao: l.data_realizacao || null,
        status: l.status || 'realizado',
        observacoes: l.observacoes || '',
        usuario_id: currentUserId,
        empresa_id: novaEmpresaId,
        estorno_de: novoEstornoDe,
        liquidacao_de: novaLiquidacaoDe,
      })
      if (l.id) {
        existingLancIds.add(l.id)
        lancamentoIdMap.set(l.id, created.id)
      }
      result.importados.lancamentos++
    } catch (e: any) {
      result.erros.push(`Lançamento "${l.descricao}": ${e.message}`)
    }
  }
  // 6. Restaurar Patrimônio (Ativos e Passivos com empresa_id preservado)
  onProgress?.('Restaurando patrimônio...')
  const patrimonioKey = (tipo: string, desc: string, val: number, dataRef?: string | null) =>
    `${tipo}|${normalizeStr(desc)}|${Number(val || 0).toFixed(2)}|${(dataRef || '').slice(0, 10)}`
  const existingPatrimonioKeys = new Set(
    existentesPatrimonio.map((p) => patrimonioKey(p.tipo, p.descricao, p.valor, p.data_referencia)),
  )

  for (const p of backup.colecoes.patrimonio || []) {
    const key = patrimonioKey(p.tipo, p.descricao, p.valor, p.data_referencia)
    if (existingPatrimonioKeys.has(key)) {
      result.ignoradosExistentes.patrimonio++
      continue
    }
    try {
      const novaEmpresaId = p.empresa_id ? empresaIdMap.get(p.empresa_id) || p.empresa_id : null
      await pb.collection('patrimonio').create({
        tipo: p.tipo,
        categoria: p.categoria,
        descricao: p.descricao,
        valor: Number(p.valor || 0),
        data_referencia: p.data_referencia || null,
        empresa_id: novaEmpresaId,
        usuario_id: currentUserId,
      })
      existingPatrimonioKeys.add(key)
      result.importados.patrimonio++
    } catch (e: any) {
      result.erros.push(`Patrimônio "${p.descricao}": ${e.message}`)
    }
  }

  // 7. Restaurar Auditoria (exclusivamente via endpoint server-side com x-audit-token)
  // Sem fallback direto via SDK (pois a coleção auditoria é blindada com createRule=null)
  onProgress?.('Restaurando registros de auditoria...')
  if (!tokenAuditoria && (backup.colecoes.auditoria || []).length > 0) {
    throw new Error(
      'Restauração de auditoria requer autenticação prévia com a Senha Mestra Corporativa.',
    )
  }

  const existingAuditIds = new Set(existentesAudit.map((a) => a.id))

  for (const a of backup.colecoes.auditoria || []) {
    if (a.id && existingAuditIds.has(a.id)) {
      result.ignoradosExistentes.auditoria++
      continue
    }
    try {
      await pb.send('/backend/v1/audit/restaurar-registro', {
        method: 'POST',
        headers: { 'x-audit-token': tokenAuditoria },
        body: {
          usuario_id: a.usuario_id || currentUserId,
          acao: a.acao,
          descricao: a.descricao,
          detalhes: a.detalhes || null,
          referencia_id: a.referencia_id || null,
          created: a.created || null,
        },
      })
      if (a.id) existingAuditIds.add(a.id)
      result.importados.auditoria++
    } catch (e: any) {
      result.erros.push(`Auditoria "${a.acao}": ${e.message}`)
    }
  }

  // 8. Restaurar Configurações (apenas criar as que não existem para não sobrescrever preferências vigentes)
  onProgress?.('Restaurando configurações...')
  const existingConfigKeys = new Set(existentesConfigs.map((cfg) => cfg.chave))
  for (const cfg of backup.colecoes.configuracoes || []) {
    if (existingConfigKeys.has(cfg.chave)) {
      result.ignoradosExistentes.configuracoes++
      continue
    }
    try {
      await pb.collection('configuracoes').create({
        chave: cfg.chave,
        valor: cfg.valor,
        usuario_id: currentUserId,
      })
      existingConfigKeys.add(cfg.chave)
      result.importados.configuracoes++
    } catch (e: any) {
      result.erros.push(`Configuração "${cfg.chave}": ${e.message}`)
    }
  }

  onProgress?.('Restauração concluída!')
  return result
}
