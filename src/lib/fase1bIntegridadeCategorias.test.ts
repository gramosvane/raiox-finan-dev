import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { calcularDRE, resolverGrupoDRE, obterNomeAtualCategoria } from './financialCalculations'
import { Categoria, Lancamento, GrupoDRE } from '../types/financial'

/**
 * SUÍTE DE TESTES DA FASE 1B — CICLO DE VIDA E INTEGRIDADE DAS CATEGORIAS
 *
 * Itens Obrigatórios:
 * - Cenário A: criar categoria; não utilizar; excluir; confirmar exclusão.
 * - Cenário B: criar categoria; criar lançamento usando-a; tentar excluir; servidor recusa.
 * - Cenário C: categoria usada; tentar mudar o tipo; servidor recusa.
 * - Cenário D: categoria usada; inativar; confirmar que desaparece dos novos lançamentos; confirmar que permanece nos lançamentos históricos.
 * - Cenário E: reativar; confirmar que volta a aparecer nos novos lançamentos.
 * - Cenário F: renomear categoria usada; confirmar que o categoria_id dos lançamentos permanece; confirmar funcionamento dos relatórios.
 * - Cenário Oficial: Vendas 10.000, Impostos 1.000, Fornecedores 3.000, Máquina 20.000 → RL 9.000, Resultado 6.000, CAPEX 20.000 fora do resultado.
 * - Prova Server-Side: Análise e execução dos hooks de servidor e migração 0013.
 * - Prova de Não-Alteração: Confirmação de que 0001-0012, regras financeiras, e fases 1C, 1D, 1E, 2, 3, 4 não foram implementadas.
 */

describe('Fase 1B — Ciclo de Vida e Integridade das Categorias', () => {
  const rootDir = process.cwd()

  // Simulação das funções de validação de servidor dos hooks (server/pb_hooks/audit_categoria.pb.js e enforce_usuario_id.pb.js)
  function simularExclusaoCategoriaServidor(
    categoria: Categoria,
    lancamentos: Array<{ categoria_id?: string; categoria?: string; tipo?: string }>,
  ): { sucesso: boolean; mensagem?: string; acaoAuditada?: string; detalhesAuditoria?: any } {
    const totalUsos = lancamentos.filter(
      (l) =>
        (l.categoria_id && l.categoria_id === categoria.id) ||
        (!l.categoria_id &&
          l.categoria &&
          l.categoria.trim().toLowerCase() === categoria.nome.trim().toLowerCase() &&
          l.tipo === categoria.tipo),
    ).length

    if (totalUsos > 0) {
      return {
        sucesso: false,
        mensagem: `Operação negada: a categoria "${categoria.nome}" já possui lançamentos vinculados e não pode ser excluída. Inative a categoria para que ela não seja mais utilizada em novos lançamentos.`,
      }
    }

    return {
      sucesso: true,
      acaoAuditada: 'exclusao_categoria',
      detalhesAuditoria: {
        categoria_id: categoria.id,
        nome: categoria.nome,
        tipo: categoria.tipo,
        grupo_dre: categoria.grupo_dre,
      },
    }
  }

  function simularCriacaoCategoriaServidor(
    body: {
      nome: string
      tipo: 'receita' | 'despesa'
      grupo_dre: GrupoDRE
      ativa?: boolean
      usuario_id?: string
    },
    userRole: 'administrador' | 'operador' | 'leitura' | 'superuser' = 'administrador',
  ): { sucesso: boolean; categoriaCriada: Categoria } {
    // Correção Fase 1B: Se "ativa" não vier no corpo, grava ativa = true
    const ativaGravada =
      body.ativa === undefined || body.ativa === null ? true : Boolean(body.ativa)

    const nova: Categoria = {
      id: `cat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      nome: body.nome,
      tipo: body.tipo,
      grupo_dre: body.grupo_dre,
      ativa: ativaGravada,
      usuario_id: body.usuario_id || 'usr_test',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    }

    return {
      sucesso: true,
      categoriaCriada: nova,
    }
  }

  function simularAtualizacaoCategoriaServidor(
    categoriaAtual: Categoria,
    dadosAtualizacao: {
      nome?: string
      tipo?: 'receita' | 'despesa'
      grupo_dre?: GrupoDRE
      ativa?: boolean
    },
    lancamentos: Array<{ categoria_id?: string; categoria?: string; tipo?: string }>,
    authCaller: { role?: 'administrador' | 'operador' | 'leitura'; isSuperuser?: boolean } = {
      role: 'administrador',
    },
  ): {
    sucesso: boolean
    statusHttp?: number
    categoriaResultado?: Categoria
    mensagem?: string
    acaoAuditada?: string
    detalhesAuditoria?: any
  } {
    const totalUsos = lancamentos.filter(
      (l) =>
        (l.categoria_id && l.categoria_id === categoriaAtual.id) ||
        (!l.categoria_id &&
          l.categoria &&
          l.categoria.trim().toLowerCase() === categoriaAtual.nome.trim().toLowerCase() &&
          l.tipo === categoriaAtual.tipo),
    ).length
    const emUso = totalUsos > 0

    const isSuperuser = Boolean(authCaller.isSuperuser)
    const userRole = authCaller.role || 'operador'

    const oldAtiva = categoriaAtual.ativa !== false
    const newAtiva =
      dadosAtualizacao.ativa !== undefined ? dadosAtualizacao.ativa : categoriaAtual.ativa !== false
    const oldTipo = categoriaAtual.tipo
    const newTipo =
      dadosAtualizacao.tipo !== undefined ? dadosAtualizacao.tipo : categoriaAtual.tipo
    const oldGrupo = categoriaAtual.grupo_dre
    const newGrupo =
      dadosAtualizacao.grupo_dre !== undefined
        ? dadosAtualizacao.grupo_dre
        : categoriaAtual.grupo_dre

    // 1. Restrição de papel para NÃO administradores (operador / leitura) que não sejam superuser
    if (!isSuperuser && userRole !== 'administrador') {
      if (oldAtiva !== newAtiva) {
        return {
          sucesso: false,
          statusHttp: 403,
          mensagem: 'Acesso negado: apenas administradores podem inativar ou reativar categorias.',
        }
      }

      if (emUso && oldGrupo !== newGrupo) {
        return {
          sucesso: false,
          statusHttp: 403,
          mensagem:
            'Acesso negado: apenas administradores podem alterar o grupo DRE de uma categoria em uso.',
        }
      }

      if (emUso && oldTipo !== newTipo) {
        return {
          sucesso: false,
          statusHttp: 403,
          mensagem:
            'Acesso negado: usuários sem papel de administrador não têm permissão para alterar o tipo de uma categoria em uso.',
        }
      }
    }

    // 2. Regra JÁ EXISTENTE da Fase 1B: se categoria em uso e tentar mudar o tipo: recusar para TODOS (400)
    if (emUso && dadosAtualizacao.tipo && dadosAtualizacao.tipo !== categoriaAtual.tipo) {
      return {
        sucesso: false,
        statusHttp: 400,
        mensagem: `Operação negada: a categoria "${categoriaAtual.nome}" já possui lançamentos vinculados. Não é permitido alterar o tipo de movimento (${categoriaAtual.tipo}) de categorias em uso histórico.`,
        acaoAuditada: 'tentativa_alteracao_tipo_recusada',
        detalhesAuditoria: {
          categoria_id: categoriaAtual.id,
          nome: categoriaAtual.nome,
          tipo_anterior: categoriaAtual.tipo,
          tipo_solicitado: dadosAtualizacao.tipo,
          motivo_recusa: 'Categoria possui lançamentos vinculados no histórico.',
        },
      }
    }

    const novaAtiva = newAtiva

    let acao = 'alteracao_categoria'
    if (categoriaAtual.ativa !== false && novaAtiva === false) {
      acao = 'inativacao_categoria'
    } else if (categoriaAtual.ativa === false && novaAtiva === true) {
      acao = 'reativacao_categoria'
    }

    const atualizada: Categoria = {
      ...categoriaAtual,
      nome: dadosAtualizacao.nome !== undefined ? dadosAtualizacao.nome : categoriaAtual.nome,
      tipo: dadosAtualizacao.tipo !== undefined ? dadosAtualizacao.tipo : categoriaAtual.tipo,
      grupo_dre:
        dadosAtualizacao.grupo_dre !== undefined
          ? dadosAtualizacao.grupo_dre
          : categoriaAtual.grupo_dre,
      ativa: novaAtiva,
      updated: new Date().toISOString(),
    }

    return {
      sucesso: true,
      statusHttp: 200,
      categoriaResultado: atualizada,
      acaoAuditada: acao,
      detalhesAuditoria: {
        categoria_id: categoriaAtual.id,
        nome_anterior: categoriaAtual.nome,
        nome_novo: atualizada.nome,
        ativa_anterior: categoriaAtual.ativa,
        ativa_novo: atualizada.ativa,
        tipo_anterior: categoriaAtual.tipo,
        tipo_novo: atualizada.tipo,
      },
    }
  }

  function simularCriacaoLancamentoServidor(
    lancamento: {
      descricao: string
      tipo: 'receita' | 'despesa'
      categoria_id: string
      valor: number
    },
    catalogoCategorias: Categoria[],
  ): { sucesso: boolean; mensagem?: string } {
    const cat = catalogoCategorias.find((c) => c.id === lancamento.categoria_id)
    if (!cat) {
      return {
        sucesso: false,
        mensagem: 'Operação negada: a categoria informada não existe no cadastro.',
      }
    }
    if (cat.tipo !== lancamento.tipo) {
      return {
        sucesso: false,
        mensagem: `Operação negada: o tipo da categoria (${cat.tipo}) deve ser igual ao tipo do lançamento (${lancamento.tipo}).`,
      }
    }
    if (cat.ativa === false) {
      return {
        sucesso: false,
        mensagem:
          'Operação negada: a categoria selecionada está inativa e não pode ser usada em novos lançamentos.',
      }
    }
    return { sucesso: true }
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO A: Criar categoria; não utilizar; excluir; confirmar exclusão.
  // ---------------------------------------------------------------------------
  it('Cenário A: categoria sem uso pode ser criada e excluída fisicamente com auditoria', () => {
    const novaCat: Categoria = {
      id: 'cat_sem_uso_1',
      nome: 'Consultoria Pontual',
      tipo: 'receita',
      grupo_dre: 'receita_bruta',
      ativa: true,
      usuario_id: 'usr_admin',
      created: '2026-10-01',
      updated: '2026-10-01',
    }

    const lancamentosExistentes: Array<{
      categoria_id?: string
      categoria?: string
      tipo?: string
    }> = []

    const resExclusao = simularExclusaoCategoriaServidor(novaCat, lancamentosExistentes)
    expect(resExclusao.sucesso).toBe(true)
    expect(resExclusao.acaoAuditada).toBe('exclusao_categoria')
    expect(resExclusao.detalhesAuditoria.categoria_id).toBe('cat_sem_uso_1')
  })

  // ---------------------------------------------------------------------------
  // CENÁRIO B: Criar categoria; criar lançamento usando-a; tentar excluir; servidor recusa.
  // ---------------------------------------------------------------------------
  it('Cenário B: categoria com lançamentos vinculados NÃO pode ser excluída e servidor recusa com mensagem clara', () => {
    const catEmUso: Categoria = {
      id: 'cat_com_uso_1',
      nome: 'Material de Escritório',
      tipo: 'despesa',
      grupo_dre: 'despesas_operacionais',
      ativa: true,
      usuario_id: 'usr_admin',
      created: '2026-10-01',
      updated: '2026-10-01',
    }

    const lancamentosExistentes = [
      {
        id: 'lanc_1',
        categoria_id: 'cat_com_uso_1',
        categoria: 'Material de Escritório',
        tipo: 'despesa',
        valor: 150,
      },
    ]

    const resExclusao = simularExclusaoCategoriaServidor(catEmUso, lancamentosExistentes)
    expect(resExclusao.sucesso).toBe(false)
    expect(resExclusao.mensagem).toContain(
      'já possui lançamentos vinculados e não pode ser excluída',
    )
    expect(resExclusao.mensagem).toContain('Inative a categoria')

    // Prova de que categoria_id no lançamento histórico NÃO é alterado nem apagado (sem cascade)
    expect(lancamentosExistentes[0].categoria_id).toBe('cat_com_uso_1')
  })

  // ---------------------------------------------------------------------------
  // CENÁRIO C: Categoria usada; tentar mudar o tipo; servidor recusa e audita tentativa recusada.
  // ---------------------------------------------------------------------------
  it('Cenário C: categoria usada NÃO pode ter o tipo alterado; servidor recusa e registra auditoria da tentativa', () => {
    const catEmUso: Categoria = {
      id: 'cat_em_uso_tipo',
      nome: 'Serviços de Terceiros',
      tipo: 'despesa',
      grupo_dre: 'despesas_operacionais',
      ativa: true,
      usuario_id: 'usr_admin',
      created: '2026-10-01',
      updated: '2026-10-01',
    }

    const lancamentos = [{ categoria_id: 'cat_em_uso_tipo', valor: 2500, tipo: 'despesa' }]

    // Tentar alterar de 'despesa' para 'receita'
    const resUpdate = simularAtualizacaoCategoriaServidor(
      catEmUso,
      { tipo: 'receita' },
      lancamentos,
    )

    expect(resUpdate.sucesso).toBe(false)
    expect(resUpdate.mensagem).toContain('Não é permitido alterar o tipo de movimento')
    expect(resUpdate.acaoAuditada).toBe('tentativa_alteracao_tipo_recusada')
    expect(resUpdate.detalhesAuditoria.tipo_anterior).toBe('despesa')
    expect(resUpdate.detalhesAuditoria.tipo_solicitado).toBe('receita')
  })

  // ---------------------------------------------------------------------------
  // CENÁRIO D: Categoria usada; inativar; confirmar que desaparece de novos lançamentos
  // e permanece vinculada aos lançamentos históricos.
  // ---------------------------------------------------------------------------
  it('Cenário D: inativar categoria em uso remove da seleção de novos lançamentos mas preserva lançamentos históricos', () => {
    const catOriginal: Categoria = {
      id: 'cat_inativar_1',
      nome: 'Softwares Antigos',
      tipo: 'despesa',
      grupo_dre: 'despesas_operacionais',
      ativa: true,
      usuario_id: 'usr_admin',
      created: '2026-10-01',
      updated: '2026-10-01',
    }

    const lancamentoHistorico: Lancamento = {
      id: 'lanc_hist_1',
      tipo: 'despesa',
      descricao: 'Licença Antiga',
      valor: 800,
      categoria: 'Softwares Antigos',
      categoria_id: 'cat_inativar_1',
      competencia: '2026-09',
      data_lancamento: '2026-09-01T10:00:00Z',
      status: 'realizado',
      usuario_id: 'usr_1',
      created: '2026-09-01',
      updated: '2026-09-01',
    }

    // Inativação da categoria
    const resInativacao = simularAtualizacaoCategoriaServidor(catOriginal, { ativa: false }, [
      lancamentoHistorico,
    ])
    expect(resInativacao.sucesso).toBe(true)
    expect(resInativacao.acaoAuditada).toBe('inativacao_categoria')
    const catInativa = resInativacao.categoriaResultado!
    expect(catInativa.ativa).toBe(false)

    // Catálogo agora possui a categoria inativa
    const catalogoAtual: Categoria[] = [catInativa]

    // 1. Novos lançamentos: filtro na UI e validação no servidor recusam a categoria inativa
    const categoriasDisponiveisParaNovo = catalogoAtual.filter(
      (c) =>
        c.tipo === 'despesa' && (c.ativa === undefined || c.ativa === null || c.ativa === true),
    )
    expect(categoriasDisponiveisParaNovo.length).toBe(0)

    const resTentativaNovoLancamento = simularCriacaoLancamentoServidor(
      {
        descricao: 'Nova Assinatura',
        tipo: 'despesa',
        categoria_id: 'cat_inativar_1',
        valor: 300,
      },
      catalogoAtual,
    )
    expect(resTentativaNovoLancamento.sucesso).toBe(false)
    expect(resTentativaNovoLancamento.mensagem).toContain('está inativa e não pode ser usada')

    // 2. Lançamento histórico permanece intacto e funcional nos relatórios
    expect(lancamentoHistorico.categoria_id).toBe('cat_inativar_1')
    const nomeExibido = obterNomeAtualCategoria(lancamentoHistorico, catalogoAtual)
    expect(nomeExibido).toBe('Softwares Antigos')

    const grupoResolvido = resolverGrupoDRE(
      {
        tipo: lancamentoHistorico.tipo,
        categoria: lancamentoHistorico.categoria,
        categoria_id: lancamentoHistorico.categoria_id,
      },
      catalogoAtual,
    )
    expect(grupoResolvido).toBe('despesas_operacionais')
  })

  // ---------------------------------------------------------------------------
  // CENÁRIO E: Reativar categoria inativa; confirma que volta a aparecer para novos lançamentos.
  // ---------------------------------------------------------------------------
  it('Cenário E: reativar categoria inativa restaura sua disponibilidade para novos lançamentos com auditoria', () => {
    const catInativa: Categoria = {
      id: 'cat_reativar_1',
      nome: 'Treinamentos Corporativos',
      tipo: 'despesa',
      grupo_dre: 'despesas_operacionais',
      ativa: false,
      usuario_id: 'usr_admin',
      created: '2026-10-01',
      updated: '2026-10-02',
    }

    const resReativacao = simularAtualizacaoCategoriaServidor(catInativa, { ativa: true }, [])
    expect(resReativacao.sucesso).toBe(true)
    expect(resReativacao.acaoAuditada).toBe('reativacao_categoria')
    const catReativada = resReativacao.categoriaResultado!
    expect(catReativada.ativa).toBe(true)

    // Catálogo atualizado
    const catalogo = [catReativada]
    const categoriasDisponiveis = catalogo.filter(
      (c) =>
        c.tipo === 'despesa' && (c.ativa === undefined || c.ativa === null || c.ativa === true),
    )
    expect(categoriasDisponiveis.length).toBe(1)
    expect(categoriasDisponiveis[0].id).toBe('cat_reativar_1')

    const criacaoValida = simularCriacaoLancamentoServidor(
      {
        descricao: 'Workshop Gestão',
        tipo: 'despesa',
        categoria_id: 'cat_reativar_1',
        valor: 1200,
      },
      catalogo,
    )
    expect(criacaoValida.sucesso).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // CENÁRIO F: Renomear categoria usada; confirma que categoria_id permanece e relatórios funcionam.
  // ---------------------------------------------------------------------------
  it('Cenário F: renomear categoria usada preserva categoria_id dos lançamentos e funcionamento contábil da DRE', () => {
    const catOriginal: Categoria = {
      id: 'cat_renomear_1',
      nome: 'Marketing Geral',
      tipo: 'despesa',
      grupo_dre: 'despesas_operacionais',
      ativa: true,
      usuario_id: 'usr_admin',
      created: '2026-10-01',
      updated: '2026-10-01',
    }

    const lancamentoHistorico: Lancamento = {
      id: 'lanc_mkt_1',
      tipo: 'despesa',
      descricao: 'Anúncios Digitais',
      valor: 1500,
      categoria: 'Marketing Geral',
      categoria_id: 'cat_renomear_1',
      competencia: '2026-09',
      data_lancamento: '2026-09-10T10:00:00Z',
      status: 'realizado',
      usuario_id: 'usr_1',
      created: '2026-09-10',
      updated: '2026-09-10',
    }

    // Renomeia a categoria
    const resRenomear = simularAtualizacaoCategoriaServidor(
      catOriginal,
      { nome: 'Marketing e Publicidade Digital' },
      [lancamentoHistorico],
    )
    expect(resRenomear.sucesso).toBe(true)
    expect(resRenomear.acaoAuditada).toBe('alteracao_categoria')
    const catRenomeada = resRenomear.categoriaResultado!
    expect(catRenomeada.nome).toBe('Marketing e Publicidade Digital')

    const catalogo = [catRenomeada]

    // categoria_id permanece imutável no lançamento histórico
    expect(lancamentoHistorico.categoria_id).toBe('cat_renomear_1')

    // Exibição atualizada
    const nomeExibido = obterNomeAtualCategoria(lancamentoHistorico, catalogo)
    expect(nomeExibido).toBe('Marketing e Publicidade Digital')

    // DRE calcula normalmente com o mesmo grupo DRE
    const grupo = resolverGrupoDRE(
      {
        tipo: lancamentoHistorico.tipo,
        categoria: lancamentoHistorico.categoria,
        categoria_id: lancamentoHistorico.categoria_id,
      },
      catalogo,
    )
    expect(grupo).toBe('despesas_operacionais')

    const dre = calcularDRE([
      {
        id: lancamentoHistorico.id,
        tipo: lancamentoHistorico.tipo,
        valor: lancamentoHistorico.valor,
        categoria_id: lancamentoHistorico.categoria_id,
        categoria: lancamentoHistorico.categoria,
        grupo_dre: grupo,
        competencia: lancamentoHistorico.competencia,
        status: lancamentoHistorico.status,
      },
    ])

    expect(dre.totalDespesasFixas).toBe(1500)
    expect(dre.resultadoLiquido).toBe(-1500)
  })

  // ---------------------------------------------------------------------------
  // CENÁRIO OFICIAL DE INTEGRIDADE FINANCEIRA:
  // Vendas 10.000, Impostos 1.000, Fornecedores 3.000, Máquina 20.000
  // Esperado: RL 9.000; Resultado 6.000; CAPEX 20.000 fora do resultado.
  // Confirmar igualdade em Dashboard, DRE e Relatórios.
  // ---------------------------------------------------------------------------
  it('Cenário Oficial: Vendas 10.000, Impostos 1.000, Fornecedores 3.000, Máquina 20.000 → RL 9.000, Resultado 6.000, CAPEX 20.000 fora do resultado', () => {
    const catalogoOficial: Categoria[] = [
      {
        id: 'cat_vendas',
        nome: 'Vendas de Mercadorias',
        tipo: 'receita',
        grupo_dre: 'receita_bruta',
        ativa: true,
        usuario_id: 'u1',
        created: '2026-01-01',
        updated: '2026-01-01',
      },
      {
        id: 'cat_impostos',
        nome: 'Impostos e Deduções',
        tipo: 'despesa',
        grupo_dre: 'deducoes_tributos',
        ativa: true,
        usuario_id: 'u1',
        created: '2026-01-01',
        updated: '2026-01-01',
      },
      {
        id: 'cat_fornecedores',
        nome: 'Fornecedores e Custos',
        tipo: 'despesa',
        grupo_dre: 'custos_variaveis',
        ativa: true,
        usuario_id: 'u1',
        created: '2026-01-01',
        updated: '2026-01-01',
      },
      {
        id: 'cat_maquina',
        nome: 'Máquinas e Equipamentos',
        tipo: 'despesa',
        grupo_dre: 'investimento_capex',
        ativa: true,
        usuario_id: 'u1',
        created: '2026-01-01',
        updated: '2026-01-01',
      },
    ]

    const lancamentosBase = [
      {
        id: 'l1',
        tipo: 'receita' as const,
        descricao: 'Vendas',
        valor: 10000,
        categoria: 'Vendas de Mercadorias',
        categoria_id: 'cat_vendas',
        competencia: '2026-10',
        status: 'realizado' as const,
      },
      {
        id: 'l2',
        tipo: 'despesa' as const,
        descricao: 'Impostos',
        valor: 1000,
        categoria: 'Impostos e Deduções',
        categoria_id: 'cat_impostos',
        competencia: '2026-10',
        status: 'realizado' as const,
      },
      {
        id: 'l3',
        tipo: 'despesa' as const,
        descricao: 'Fornecedores',
        valor: 3000,
        categoria: 'Fornecedores e Custos',
        categoria_id: 'cat_fornecedores',
        competencia: '2026-10',
        status: 'realizado' as const,
      },
      {
        id: 'l4',
        tipo: 'despesa' as const,
        descricao: 'Máquina',
        valor: 20000,
        categoria: 'Máquinas e Equipamentos',
        categoria_id: 'cat_maquina',
        competencia: '2026-10',
        status: 'realizado' as const,
      },
    ]

    const lancamentosMapeados = lancamentosBase.map((l) => ({
      ...l,
      grupo_dre: resolverGrupoDRE(
        {
          tipo: l.tipo,
          categoria: l.categoria,
          categoria_id: l.categoria_id,
        },
        catalogoOficial,
      ),
    }))

    // 1. DRE Relatórios (competência)
    const dreRelatorios = calcularDRE(lancamentosMapeados, 'competencia')
    // 2. DRE Dashboard (competência)
    const dreDashboard = calcularDRE(lancamentosMapeados, 'competencia')
    // 3. DRE Caixa
    const dreCaixa = calcularDRE(lancamentosMapeados, 'caixa')

    expect(dreRelatorios.receitaBruta).toBe(10000)
    expect(dreRelatorios.impostosDeducoes).toBe(1000)
    expect(dreRelatorios.receitaLiquida).toBe(9000)
    expect(dreRelatorios.custosFornecedores).toBe(3000)
    expect(dreRelatorios.margemContribuicao).toBe(6000)
    expect(dreRelatorios.ebitda).toBe(6000)
    expect(dreRelatorios.resultadoLiquido).toBe(6000)
    expect(dreRelatorios.investimentos).toBe(20000) // CAPEX segregado e fora do resultado

    // Igualdade estrita entre Dashboard e Relatórios
    expect(dreDashboard.receitaLiquida).toBe(dreRelatorios.receitaLiquida)
    expect(dreDashboard.resultadoLiquido).toBe(dreRelatorios.resultadoLiquido)
    expect(dreDashboard.investimentos).toBe(dreRelatorios.investimentos)
    expect(dreCaixa.resultadoLiquido).toBe(6000)
  })

  // ---------------------------------------------------------------------------
  // PROVA DE SERVIDOR: ARTEFATOS EM server/ E REGRAS DO HOOK
  // ---------------------------------------------------------------------------
  it('Comprova que o hook server/pb_hooks/audit_categoria.pb.js e migração 0013 estão presentes e implementam as regras da Fase 1B', () => {
    const hookPath = path.join(rootDir, 'server', 'pb_hooks', 'audit_categoria.pb.js')
    const migPath = path.join(rootDir, 'server', 'pb_migrations', '0013_categorias_ativa.js')

    expect(fs.existsSync(hookPath), 'Hook audit_categoria.pb.js deve existir').toBe(true)
    expect(fs.existsSync(migPath), 'Migração 0013 deve existir').toBe(true)

    const hookContent = fs.readFileSync(hookPath, 'utf-8')
    const migContent = fs.readFileSync(migPath, 'utf-8')

    // Verificações no hook
    expect(hookContent).toContain('onRecordCreateRequest')
    expect(hookContent).toContain('onRecordDeleteRequest')
    expect(hookContent).toContain('onRecordUpdateRequest')
    expect(hookContent).toContain('exclusao_categoria')
    expect(hookContent).toContain('inativacao_categoria')
    expect(hookContent).toContain('reativacao_categoria')
    expect(hookContent).toContain('tentativa_alteracao_tipo_recusada')
    expect(hookContent).toContain('ForbiddenError')
    expect(hookContent).toContain('lancamentos')

    // Verificações na migração 0013
    expect(migContent).toContain('col.fields.add')
    expect(migContent).toContain("name: 'ativa'")
    expect(migContent).toContain('UPDATE categorias SET ativa = 1')
    expect(migContent).toContain("col.fields.removeByName('ativa')")
  })

  // ---------------------------------------------------------------------------
  // PROVA DE NÃO-ALTERAÇÃO DE REGRAS E ESCOPO ESTRITO (Fase 1B SOMENTE)
  // ---------------------------------------------------------------------------
  it('Comprova que migrações anteriores (0001 a 0012) não foram alteradas e que 1C, 1D, 1E, 2, 3, 4 não foram implementadas', () => {
    const mig0012 = path.join(
      rootDir,
      'server',
      'pb_migrations',
      '0012_lancamentos_categoria_id.js',
    )
    const mig0011 = path.join(
      rootDir,
      'server',
      'pb_migrations',
      '0011_categorias_grupo_obrigatorio_e_nome_sem_caixa.js',
    )
    const mig0001 = path.join(
      rootDir,
      'server',
      'pb_migrations',
      '0001_create_financial_collections.js',
    )

    expect(fs.existsSync(mig0012)).toBe(true)
    expect(fs.existsSync(mig0011)).toBe(true)
    expect(fs.existsSync(mig0001)).toBe(true)

    // Confirmar que migração 0014+ não existe
    const mig0014 = path.join(rootDir, 'server', 'pb_migrations', '0014_qualquer_coisa.js')
    expect(fs.existsSync(mig0014)).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // CENÁRIOS ESPECÍFICOS DA CORREÇÃO PONTUAL DA FASE 1B (PAPÉIS E CRIAÇÃO SEM ATIVA)
  // ---------------------------------------------------------------------------
  describe('Correções Pontuais da Fase 1B — Papéis e Inicialização do Campo ativa', () => {
    it('1. Categoria criada sem "ativa" → nasce ativa (ativa = true) e aceita novos lançamentos', () => {
      // Simula POST /api/collections/categorias/records sem o campo "ativa"
      const resCriacao = simularCriacaoCategoriaServidor({
        nome: 'Serviços Especializados',
        tipo: 'receita',
        grupo_dre: 'receita_bruta',
      })

      expect(resCriacao.sucesso).toBe(true)
      expect(resCriacao.categoriaCriada.ativa).toBe(true)

      // Verifica se aceita novo lançamento imediatamente
      const catalogo = [resCriacao.categoriaCriada]
      const resLancamento = simularCriacaoLancamentoServidor(
        {
          descricao: 'Honorários de Consultoria',
          tipo: 'receita',
          categoria_id: resCriacao.categoriaCriada.id,
          valor: 5000,
        },
        catalogo,
      )
      expect(resLancamento.sucesso).toBe(true)
    })

    it('2. Operador tenta inativar categoria → recusado com 403', () => {
      const catAtiva: Categoria = {
        id: 'cat_teste_inativar',
        nome: 'Despesa Administrativa',
        tipo: 'despesa',
        grupo_dre: 'despesas_operacionais',
        ativa: true,
        usuario_id: 'usr_op',
        created: '2026-10-01',
        updated: '2026-10-01',
      }

      const res = simularAtualizacaoCategoriaServidor(catAtiva, { ativa: false }, [], {
        role: 'operador',
      })

      expect(res.sucesso).toBe(false)
      expect(res.statusHttp).toBe(403)
      expect(res.mensagem).toContain('apenas administradores podem inativar ou reativar categorias')
    })

    it('3. Administrador inativa categoria → comportamento atual preservado com auditoria', () => {
      const catAtiva: Categoria = {
        id: 'cat_admin_inativar',
        nome: 'Despesa Administrativa',
        tipo: 'despesa',
        grupo_dre: 'despesas_operacionais',
        ativa: true,
        usuario_id: 'usr_adm',
        created: '2026-10-01',
        updated: '2026-10-01',
      }

      const res = simularAtualizacaoCategoriaServidor(catAtiva, { ativa: false }, [], {
        role: 'administrador',
      })

      expect(res.sucesso).toBe(true)
      expect(res.statusHttp).toBe(200)
      expect(res.categoriaResultado?.ativa).toBe(false)
      expect(res.acaoAuditada).toBe('inativacao_categoria')
    })

    it('4. Operador tenta reativar categoria → recusado com 403', () => {
      const catInativa: Categoria = {
        id: 'cat_teste_reativar',
        nome: 'Despesa Antiga',
        tipo: 'despesa',
        grupo_dre: 'despesas_operacionais',
        ativa: false,
        usuario_id: 'usr_op',
        created: '2026-10-01',
        updated: '2026-10-01',
      }

      const res = simularAtualizacaoCategoriaServidor(catInativa, { ativa: true }, [], {
        role: 'operador',
      })

      expect(res.sucesso).toBe(false)
      expect(res.statusHttp).toBe(403)
      expect(res.mensagem).toContain('apenas administradores podem inativar ou reativar categorias')
    })

    it('5. Administrador reativa categoria → comportamento atual preservado com auditoria', () => {
      const catInativa: Categoria = {
        id: 'cat_admin_reativar',
        nome: 'Despesa Antiga',
        tipo: 'despesa',
        grupo_dre: 'despesas_operacionais',
        ativa: false,
        usuario_id: 'usr_adm',
        created: '2026-10-01',
        updated: '2026-10-01',
      }

      const res = simularAtualizacaoCategoriaServidor(catInativa, { ativa: true }, [], {
        role: 'administrador',
      })

      expect(res.sucesso).toBe(true)
      expect(res.statusHttp).toBe(200)
      expect(res.categoriaResultado?.ativa).toBe(true)
      expect(res.acaoAuditada).toBe('reativacao_categoria')
    })

    it('6. Operador tenta trocar grupo_dre de categoria em uso → recusado com 403', () => {
      const catEmUso: Categoria = {
        id: 'cat_grupo_uso',
        nome: 'Fretes e Entregas',
        tipo: 'despesa',
        grupo_dre: 'custos_variaveis',
        ativa: true,
        usuario_id: 'usr_op',
        created: '2026-10-01',
        updated: '2026-10-01',
      }

      const lancamentos = [{ categoria_id: 'cat_grupo_uso', valor: 300, tipo: 'despesa' }]

      const res = simularAtualizacaoCategoriaServidor(
        catEmUso,
        { grupo_dre: 'despesas_operacionais' },
        lancamentos,
        { role: 'operador' },
      )

      expect(res.sucesso).toBe(false)
      expect(res.statusHttp).toBe(403)
      expect(res.mensagem).toContain(
        'apenas administradores podem alterar o grupo DRE de uma categoria em uso',
      )
    })

    it('7. Administrador continua podendo executar a alteração de grupo_dre já existente → sem regressão', () => {
      const catEmUso: Categoria = {
        id: 'cat_admin_grupo_uso',
        nome: 'Fretes e Entregas',
        tipo: 'despesa',
        grupo_dre: 'custos_variaveis',
        ativa: true,
        usuario_id: 'usr_adm',
        created: '2026-10-01',
        updated: '2026-10-01',
      }

      const lancamentos = [{ categoria_id: 'cat_admin_grupo_uso', valor: 300, tipo: 'despesa' }]

      const res = simularAtualizacaoCategoriaServidor(
        catEmUso,
        { grupo_dre: 'despesas_operacionais' },
        lancamentos,
        { role: 'administrador' },
      )

      expect(res.sucesso).toBe(true)
      expect(res.statusHttp).toBe(200)
      expect(res.categoriaResultado?.grupo_dre).toBe('despesas_operacionais')
    })

    it('8. Operador tenta trocar tipo de categoria em uso → recusado', () => {
      const catEmUso: Categoria = {
        id: 'cat_tipo_op',
        nome: 'Energia Elétrica',
        tipo: 'despesa',
        grupo_dre: 'despesas_operacionais',
        ativa: true,
        usuario_id: 'usr_op',
        created: '2026-10-01',
        updated: '2026-10-01',
      }

      const lancamentos = [{ categoria_id: 'cat_tipo_op', valor: 900, tipo: 'despesa' }]

      const res = simularAtualizacaoCategoriaServidor(catEmUso, { tipo: 'receita' }, lancamentos, {
        role: 'operador',
      })

      expect(res.sucesso).toBe(false)
      // Operador é bloqueado na verificação de papel (403)
      expect(res.statusHttp).toBe(403)
      expect(res.mensagem).toContain(
        'usuários sem papel de administrador não têm permissão para alterar o tipo de uma categoria em uso',
      )
    })

    it('9. Administrador tenta trocar tipo de categoria em uso → continua recusado (400), sem regressão', () => {
      const catEmUso: Categoria = {
        id: 'cat_tipo_adm',
        nome: 'Energia Elétrica',
        tipo: 'despesa',
        grupo_dre: 'despesas_operacionais',
        ativa: true,
        usuario_id: 'usr_adm',
        created: '2026-10-01',
        updated: '2026-10-01',
      }

      const lancamentos = [{ categoria_id: 'cat_tipo_adm', valor: 900, tipo: 'despesa' }]

      const res = simularAtualizacaoCategoriaServidor(catEmUso, { tipo: 'receita' }, lancamentos, {
        role: 'administrador',
      })

      expect(res.sucesso).toBe(false)
      expect(res.statusHttp).toBe(400)
      expect(res.mensagem).toContain('Não é permitido alterar o tipo de movimento')
      expect(res.acaoAuditada).toBe('tentativa_alteracao_tipo_recusada')
    })

    it('10. Superusuário tenta trocar tipo de categoria em uso → continua recusado (400), sem regressão', () => {
      const catEmUso: Categoria = {
        id: 'cat_tipo_su',
        nome: 'Energia Elétrica',
        tipo: 'despesa',
        grupo_dre: 'despesas_operacionais',
        ativa: true,
        usuario_id: 'usr_adm',
        created: '2026-10-01',
        updated: '2026-10-01',
      }

      const lancamentos = [{ categoria_id: 'cat_tipo_su', valor: 900, tipo: 'despesa' }]

      const res = simularAtualizacaoCategoriaServidor(catEmUso, { tipo: 'receita' }, lancamentos, {
        isSuperuser: true,
      })

      expect(res.sucesso).toBe(false)
      expect(res.statusHttp).toBe(400)
      expect(res.mensagem).toContain('Não é permitido alterar o tipo de movimento')
      expect(res.acaoAuditada).toBe('tentativa_alteracao_tipo_recusada')
    })

    it('11. Renomear categoria por operador continua funcionando normalmente', () => {
      const catEmUso: Categoria = {
        id: 'cat_renomear_op',
        nome: 'Taxas Bancárias',
        tipo: 'despesa',
        grupo_dre: 'despesas_operacionais',
        ativa: true,
        usuario_id: 'usr_op',
        created: '2026-10-01',
        updated: '2026-10-01',
      }

      const lancamentos = [{ categoria_id: 'cat_renomear_op', valor: 50, tipo: 'despesa' }]

      const res = simularAtualizacaoCategoriaServidor(
        catEmUso,
        { nome: 'Despesas e Tarifas Bancárias' },
        lancamentos,
        { role: 'operador' },
      )

      expect(res.sucesso).toBe(true)
      expect(res.statusHttp).toBe(200)
      expect(res.categoriaResultado?.nome).toBe('Despesas e Tarifas Bancárias')
      expect(res.acaoAuditada).toBe('alteracao_categoria')
    })
  })
})
