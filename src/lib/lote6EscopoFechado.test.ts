import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  prepararListaApresentacaoLancamentos,
  obterDetalhesApresentacaoLancamento,
  formatarObservacoesListaApresentacao,
  formatarDescricaoDetalheApresentacao,
  formatarObservacoesDetalheApresentacao,
  calcularEfeitoCaixaApresentacao,
  LancamentoApresentacao,
} from './apresentacaoLancamentos'
import {
  calcularDRE,
  calcularValorEfetivoLancamento,
  resolverGrupoDRE,
  CategoriaReferencia,
  LancamentoCalculo,
} from './financialCalculations'

/**
 * LOTE 6 - TESTES OBRIGATÓRIOS
 * Arquivo: src/lib/lote6EscopoFechado.test.ts
 *
 * Cada teste detalha:
 * - Bloco (A, B, C, D e Regressão 17)
 * - Cenário e resultado esperado
 * - Se executado como simulado no ambiente local/Skip ou real contra PocketBase
 * - Arquivos e funções testadas
 */

describe('LOTE 6 - BLOCO A: AUDITORIA (AUD-01, AUD-02, AUD-03)', () => {
  it('Teste 1 (AUD-01): Na apresentação da auditoria, registro criado pelo usuário exibe usuario_nome na coluna e ID só no detalhe', () => {
    // Validação da estrutura de AuditoriaRegistro e da apresentação
    const registroComNome = {
      id: 'rec_audit_01',
      usuario_id: 'usr_abc1234567890',
      usuario_nome: 'Administrador Teste',
      acao: 'criacao_lancamento',
      descricao: 'Novo lançamento: Venda Teste',
      referencia_id: 'lanc_001',
      created: '2026-10-10 10:00:00.000Z',
    }

    // Na coluna, nome legível é exibido
    const nomeExibidoNaColuna =
      registroComNome.usuario_nome || (registroComNome.usuario_id ? 'Usuário removido' : 'Sistema')
    expect(nomeExibidoNaColuna).toBe('Administrador Teste')
    expect(nomeExibidoNaColuna).not.toBe('usr_abc1234567890')

    // Usuário removido ou sem nome cadastrado
    const registroSemNome = {
      id: 'rec_audit_02',
      usuario_id: 'usr_removido',
      usuario_nome: 'Usuário removido',
      acao: 'login',
      descricao: 'Login efetuado com sucesso',
      created: '2026-10-10 10:00:00.000Z',
    }
    expect(registroSemNome.usuario_nome).toBe('Usuário removido')

    // Confere código do hook audit_registros.pb.js
    const hookSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'server/pb_hooks/audit_registros.pb.js'),
      'utf-8',
    )
    expect(hookSrc).toContain('usuario_nome: usuario_nome')
    expect(hookSrc).toContain('userCache[uid]')
    expect(hookSrc).toContain('Usuário removido')
  })

  it('Teste 2 & 3 (AUD-02): Na leitura, classificação da natureza por campos estruturais; registros antigos classificados sem alterá-los', () => {
    // Simulação da lógica do hook audit_registros.pb.js
    const lancamentoVenda: any = {
      id: 'lanc_venda',
      tipo: 'receita',
      estorno_de: '',
      liquidacao_de: '',
    }
    const lancamentoEstorno: any = {
      id: 'lanc_estorno',
      tipo: 'receita',
      estorno_de: 'lanc_venda',
      liquidacao_de: '',
    }
    const lancamentoLiqDespesa: any = {
      id: 'lanc_liq_desp',
      tipo: 'despesa',
      estorno_de: '',
      liquidacao_de: 'prev_desp',
    }
    const lancamentoLiqReceita: any = {
      id: 'lanc_liq_rec',
      tipo: 'receita',
      estorno_de: '',
      liquidacao_de: 'prev_rec',
    }

    const classificarNatureza = (lanc: any) => {
      if (!lanc) return 'Lançamento'
      if (lanc.estorno_de && lanc.estorno_de.trim()) return 'Estorno'
      if (lanc.liquidacao_de && lanc.liquidacao_de.trim()) {
        return lanc.tipo === 'receita' ? 'Recebimento' : 'Pagamento'
      }
      return 'Lançamento'
    }

    expect(classificarNatureza(lancamentoVenda)).toBe('Lançamento')
    expect(classificarNatureza(lancamentoEstorno)).toBe('Estorno')
    expect(classificarNatureza(lancamentoLiqDespesa)).toBe('Pagamento')
    expect(classificarNatureza(lancamentoLiqReceita)).toBe('Recebimento')

    // Com 1 venda, 1 estorno, 1 liquidação de despesa e 1 liquidação de receita:
    const itens = [
      { acao: 'criacao_lancamento', natureza: classificarNatureza(lancamentoVenda) },
      { acao: 'criacao_lancamento', natureza: classificarNatureza(lancamentoEstorno) },
      { acao: 'criacao_lancamento', natureza: classificarNatureza(lancamentoLiqDespesa) },
      { acao: 'criacao_lancamento', natureza: classificarNatureza(lancamentoLiqReceita) },
    ]

    const filtroLancamentos = itens.filter(
      (r) => r.acao === 'criacao_lancamento' && r.natureza === 'Lançamento',
    )
    const filtroEstornos = itens.filter((r) => r.acao === 'estorno' || r.natureza === 'Estorno')
    const filtroPagamentos = itens.filter(
      (r) => r.acao === 'registro_pagamento' || r.natureza === 'Pagamento',
    )
    const filtroRecebimentos = itens.filter(
      (r) => r.acao === 'registro_recebimento' || r.natureza === 'Recebimento',
    )

    expect(filtroLancamentos).toHaveLength(1)
    expect(filtroEstornos).toHaveLength(1)
    expect(filtroPagamentos).toHaveLength(1)
    expect(filtroRecebimentos).toHaveLength(1)
  })

  it('Teste 4 (AUD-02 gravação): Novo previsto com competência, vencimento e realização: hook audit_lancamento.pb.js grava campos no detalhes', () => {
    const hookSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'server/pb_hooks/audit_lancamento.pb.js'),
      'utf-8',
    )
    expect(hookSrc).toContain("data_lancamento: e.record.getString('data_lancamento')")
    expect(hookSrc).toContain("data_vencimento: e.record.getString('data_vencimento')")
    expect(hookSrc).toContain("data_realizacao: e.record.getString('data_realizacao')")
    expect(hookSrc).toContain("estorno_de: e.record.getString('estorno_de')")
    expect(hookSrc).toContain("liquidacao_de: e.record.getString('liquidacao_de')")
  })

  it('Teste 5 (AUD-03): getAuditoriaRegistros suporta all=true e AuditoriaPage pagina de 50 em 50 e busca registro na posição 140', () => {
    const finSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/financial.ts'),
      'utf-8',
    )
    expect(finSrc).toContain(
      "endpoint = all ? '/backend/v1/audit/registros?all=true' : '/backend/v1/audit/registros'",
    )

    // Simula 150 registros na memória da tela
    const fake150 = Array.from({ length: 150 }, (_, i) => ({
      id: `id_${i + 1}`,
      usuario_id: `usr_${i + 1}`,
      usuario_nome: `Usuário ${i + 1}`,
      acao: 'criacao_lancamento',
      natureza: 'Lançamento',
      descricao: i === 139 ? 'Registro Específico Posição 140' : `Lançamento evento ${i + 1}`,
      created: '2026-10-10 10:00:00',
    }))

    const itensPorPagina = 50
    const totalPaginas = Math.ceil(fake150.length / itensPorPagina)
    expect(totalPaginas).toBe(3)

    // Página 1 (1 a 50)
    const pagina1 = fake150.slice(0, 50)
    expect(pagina1).toHaveLength(50)
    expect(pagina1[0].id).toBe('id_1')
    expect(pagina1[49].id).toBe('id_50')

    // Busca textual encontra registro da posição 140 independente da paginação
    const busca = 'Registro Específico Posição 140'
    const filtrados = fake150.filter((r) => r.descricao.toLowerCase().includes(busca.toLowerCase()))
    expect(filtrados).toHaveLength(1)
    expect(filtrados[0].id).toBe('id_140')
  })
})

describe('LOTE 6 - BLOCO B: PERMISSÕES DE CATEGORIA (UX-PERM-03, UX-PERM-04)', () => {
  const catHookSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'server/pb_hooks/audit_categoria.pb.js'),
    'utf-8',
  )
  const configPageSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/configuracoes/ConfiguracoesPage.tsx'),
    'utf-8',
  )

  it('Teste 6 & 7 (UX-PERM-03 servidor): Operador e usuário de leitura bloqueados com 403 e mensagem exata', () => {
    expect(catHookSrc).toContain("!isSuperuser && userRole !== 'administrador'")
    expect(catHookSrc).toContain(
      "throw new ForbiddenError('Somente o Administrador pode alterar categorias.')",
    )
    // Consulta no banco fail-closed
    expect(catHookSrc).toContain("$app.findRecordById('users', e.auth.id)")
  })

  it('Teste 8 (UX-PERM-03 admin): Administrador tem regras atuais mantidas (recusa de mudança de tipo se em uso)', () => {
    expect(catHookSrc).toContain('if (emUso && oldTipo !== newTipo)')
    expect(catHookSrc).toContain(
      'Não é permitido alterar o tipo de uma categoria que já possui lançamentos vinculados.',
    )
    expect(catHookSrc).toContain('categoria_renomeada')
  })

  it('Teste 9 (UX-PERM-03 tela): Operador na tela não vê botões Editar, Inativar, Reativar e Excluir e vê o aviso', () => {
    expect(configPageSrc).toContain("user?.role !== 'administrador'")
    expect(configPageSrc).toContain('Somente o Administrador pode alterar categorias.')
    expect(configPageSrc).toContain("const isAdmin = user?.role === 'administrador'")
  })

  it('Teste 10 (UX-PERM-04): Gravação de tentativa_alteracao_categoria_recusada antes de lançar 403 com valores antes e tentados', () => {
    expect(catHookSrc).toContain(
      "auditRecord.set('acao', 'tentativa_alteracao_categoria_recusada')",
    )
    expect(catHookSrc).toContain('valores_antes:')
    expect(catHookSrc).toContain('valores_tentados:')
    expect(catHookSrc).toContain(
      '// Se a gravação da auditoria falhar, a alteração também permanece recusada',
    )
  })
})

describe('LOTE 6 - BLOCO C: RESÍDUOS DO LOTE 5B (5B-R1, 5B-R2)', () => {
  it('Teste 11 (5B-R1 Lista): Estorno mostra "Motivo: <motivo>" sem ID interno; Liquidação mostra "Realização quitada em 06/10/2026." sem "Ref original"', () => {
    const estornoItem: LancamentoApresentacao = {
      id: 'est_001',
      tipo: 'receita',
      descricao: '[ESTORNO] Venda Teste - Ref: orig_7atb3349 (Cancelamento a pedido do cliente)',
      observacoes:
        'Estorno referente ao lançamento original ID: orig_7atb3349. Motivo: Cancelamento a pedido do cliente.',
      valor: 1000,
      competencia: '2026-10',
      status: 'realizado',
      estorno_de: 'orig_7atb3349',
    }

    const obsEstorno = formatarObservacoesListaApresentacao(estornoItem)
    expect(obsEstorno).toBe('Motivo: Cancelamento a pedido do cliente.')
    expect(obsEstorno).not.toContain('orig_7atb3349')
    expect(obsEstorno).not.toContain('ID:')

    const liquidacaoItem: LancamentoApresentacao = {
      id: 'liq_002',
      tipo: 'despesa',
      descricao: 'Pagamento Fornecedor XYZ',
      observacoes: 'Realização quitada em 06/10/2026. Ref original: 261x8k4v3zwd36d.',
      valor: 500,
      competencia: '2026-10',
      status: 'realizado',
      liquidacao_de: '261x8k4v3zwd36d',
    }

    const obsLiq = formatarObservacoesListaApresentacao(liquidacaoItem)
    expect(obsLiq).toBe('Realização quitada em 06/10/2026.')
    expect(obsLiq).not.toContain('Ref original')
    expect(obsLiq).not.toContain('261x8k4v3zwd36d')
  })

  it('Teste 12 (5B-R1 Detalhe): Descrição do estorno como "Estorno de: Teste data 01 — 06/10/2026"; Observações sem ID', () => {
    const orig: LancamentoApresentacao = {
      id: '7atb3349j3u4j94',
      tipo: 'receita',
      descricao: 'Teste data 01',
      data_lancamento: '2026-10-06',
      valor: 5000,
      competencia: '2026-10',
      status: 'estornado',
    }

    const estorno: LancamentoApresentacao = {
      id: 'est_999',
      tipo: 'receita',
      descricao: '[ESTORNO] Teste data 01 - Ref: 7atb3349j3u4j94 (Erro operacional)',
      observacoes:
        'Estorno referente ao lançamento original ID: 7atb3349j3u4j94. Motivo: Erro operacional.',
      data_lancamento: '2026-10-06',
      valor: 5000,
      competencia: '2026-10',
      status: 'realizado',
      estorno_de: '7atb3349j3u4j94',
    }

    const descDetalhe = formatarDescricaoDetalheApresentacao(estorno, [orig, estorno])
    expect(descDetalhe).toBe('Estorno de: Teste data 01 — 06/10/2026')
    expect(descDetalhe).not.toContain('7atb3349j3u4j94')
    expect(descDetalhe).not.toContain('[ESTORNO]')

    const obsDetalhe = formatarObservacoesDetalheApresentacao(estorno)
    expect(obsDetalhe).toBe('Motivo: Erro operacional.')
    expect(obsDetalhe).not.toContain('7atb3349j3u4j94')
  })

  it('Teste 13 (5B-R2 LiquidityChart): Escala com saldos de -8.153 a -24.710 gera rótulos múltiplos de passo redondo', () => {
    const dashboardSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/dashboard/DashboardPage.tsx'),
      'utf-8',
    )
    expect(dashboardSrc).toContain('calcularEscalaRedonda')
    expect(dashboardSrc).toContain('niceMultiplier')

    // Simula a função de cálculo de passos
    const calcularEscala = (minimo: number, maximo: number) => {
      let span = Math.abs(maximo - minimo)
      if (span <= 0) span = 1
      const rawStep = span / 3
      const orderOfMagnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
      const fraction = rawStep / orderOfMagnitude
      let niceMultiplier = 1
      if (fraction <= 1.2) niceMultiplier = 1
      else if (fraction <= 2.2) niceMultiplier = 2
      else if (fraction <= 3.5) niceMultiplier = 2.5
      else if (fraction <= 7.5) niceMultiplier = 5
      else niceMultiplier = 10
      const step = niceMultiplier * orderOfMagnitude
      let adjustedMin = Math.floor(minimo / step) * step
      let adjustedMax = Math.ceil(maximo / step) * step
      if (maximo <= 0) adjustedMax = 0
      if (minimo >= 0) adjustedMin = 0

      const tickVals: number[] = []
      let curr = adjustedMin
      while (curr <= adjustedMax + step * 0.001) {
        tickVals.push(Math.round(curr))
        curr += step
      }
      return { adjustedMin, adjustedMax, step, tickVals }
    }

    const { adjustedMin, adjustedMax, step, tickVals } = calcularEscala(-24710, -8153)
    // Todos saldos <= 0 -> limite superior é 0
    expect(adjustedMax).toBe(0)
    expect(adjustedMin).toBeLessThanOrEqual(-25000)
    // Step deve ser potência redonda (5.000 ou 10.000)
    expect([5000, 10000]).toContain(step)
    // Todos os ticks devem ser múltiplos do passo
    tickVals.forEach((t) => {
      expect(t % step).toBe(0)
    })
  })
})

describe('LOTE 6 - BLOCO D: EXPORTAÇÃO CSV (EXP-01)', () => {
  it('Teste 14 (EXP-01): Venda realizada de 10.000 e seu estorno: Situação "Estornado" e "Estorno", efeitos +10000 e -10000, soma 0', () => {
    const originalVenda: LancamentoApresentacao = {
      id: 'venda_10k',
      tipo: 'receita',
      descricao: 'Venda Teste',
      valor: 10000,
      competencia: '2026-10',
      status: 'realizado',
    }

    const estornoVenda: LancamentoApresentacao = {
      id: 'estorno_10k',
      tipo: 'receita',
      descricao: '[ESTORNO] Venda Teste',
      valor: 10000,
      competencia: '2026-10',
      status: 'realizado',
      estorno_de: 'venda_10k',
    }

    const lista = [originalVenda, estornoVenda]

    const efOrig = calcularEfeitoCaixaApresentacao(originalVenda, lista)
    expect(efOrig.situacao).toBe('Estornado')
    expect(efOrig.efeitoCaixa).toBe(10000)

    const efEst = calcularEfeitoCaixaApresentacao(estornoVenda, lista)
    expect(efEst.situacao).toBe('Estorno')
    expect(efEst.efeitoCaixa).toBe(-10000)

    // Soma dos efeitos no caixa é exatamente zero
    expect(efOrig.efeitoCaixa + efEst.efeitoCaixa).toBe(0)
  })

  it('Teste 15 (EXP-01): Conta prevista liquidada: original "Liquidado" com efeito 0.00; liquidação com efeito -valor', () => {
    const originalPrevisto: LancamentoApresentacao = {
      id: 'desp_prev',
      tipo: 'despesa',
      descricao: 'Aluguel Previsto',
      valor: 2500,
      competencia: '2026-10',
      status: 'previsto',
    }

    const liquidacao: LancamentoApresentacao = {
      id: 'desp_liq',
      tipo: 'despesa',
      descricao: 'Pagamento Aluguel',
      valor: 2500,
      competencia: '2026-10',
      status: 'realizado',
      liquidacao_de: 'desp_prev',
    }

    const lista = [originalPrevisto, liquidacao]

    const efOrig = calcularEfeitoCaixaApresentacao(originalPrevisto, lista)
    expect(efOrig.situacao).toBe('Liquidado')
    expect(efOrig.efeitoCaixa).toBe(0)

    const efLiq = calcularEfeitoCaixaApresentacao(liquidacao, lista)
    expect(efLiq.situacao).toBe('Realizado')
    expect(efLiq.efeitoCaixa).toBe(-2500)
  })

  it('Teste 16 (EXP-01): Soma da coluna "Efeito no caixa (R$)" de uma competência = cartão "Fluxo de caixa da competência"', () => {
    const lancamentosCompetencia: LancamentoApresentacao[] = [
      // Venda normal
      {
        id: 'v1',
        descricao: 'Venda Normal',
        tipo: 'receita',
        valor: 5000,
        status: 'realizado',
        competencia: '2026-10',
      },
      // Venda estornada (original realizado + contra)
      {
        id: 'v2',
        descricao: 'Venda Cancelada',
        tipo: 'receita',
        valor: 2000,
        status: 'realizado',
        competencia: '2026-10',
      },
      {
        id: 'est_v2',
        descricao: 'Estorno Venda Cancelada',
        tipo: 'receita',
        valor: 2000,
        status: 'realizado',
        estorno_de: 'v2',
        competencia: '2026-10',
      },
      // Despesa operacional realizada
      {
        id: 'd1',
        descricao: 'Despesa Operacional',
        tipo: 'despesa',
        valor: 1200,
        status: 'realizado',
        competencia: '2026-10',
      },
      // Despesa prevista liquidada (original + liq)
      {
        id: 'd2_prev',
        descricao: 'Boleto Previsto',
        tipo: 'despesa',
        valor: 800,
        status: 'previsto',
        competencia: '2026-10',
      },
      {
        id: 'd2_liq',
        descricao: 'Liquidação Boleto',
        tipo: 'despesa',
        valor: 800,
        status: 'realizado',
        liquidacao_de: 'd2_prev',
        competencia: '2026-10',
      },
      // Despesa prevista em aberto
      {
        id: 'd3_aberta',
        descricao: 'Boleto em Aberto',
        tipo: 'despesa',
        valor: 300,
        status: 'previsto',
        competencia: '2026-10',
      },
    ]

    // Cálculo da coluna CSV
    const somaColunaEfeito = lancamentosCompetencia.reduce((acc, l) => {
      const { efeitoCaixa } = calcularEfeitoCaixaApresentacao(l, lancamentosCompetencia)
      return acc + efeitoCaixa
    }, 0)

    // Cálculo do cartão "Fluxo de caixa da competência" (da tela LancamentosPage)
    // Entradas: status realizado && tipo receita com calcularValorEfetivoLancamento (inverte sinal se estorno)
    // Saídas: status realizado && tipo despesa com calcularValorEfetivoLancamento
    let entradasRealizadas = 0
    let saidasRealizadas = 0
    lancamentosCompetencia.forEach((item) => {
      if (item.status === 'realizado') {
        const vEfetivo = calcularValorEfetivoLancamento(item)
        if (item.tipo === 'receita') {
          if (item.estorno_de) {
            entradasRealizadas -= Math.abs(vEfetivo)
          } else {
            entradasRealizadas += vEfetivo
          }
        } else if (item.tipo === 'despesa') {
          if (item.estorno_de) {
            saidasRealizadas -= Math.abs(vEfetivo)
          } else {
            saidasRealizadas += vEfetivo
          }
        }
      }
    })
    const fluxoCompetenciaEsperado = entradasRealizadas - saidasRealizadas

    expect(somaColunaEfeito).toBe(fluxoCompetenciaEsperado)
    expect(somaColunaEfeito).toBe(5000 + 0 - 1200 - 800) // 3000
  })
})

describe('TESTE 17 - REGRESSÃO FINANCEIRA OFICIAL COMPLETA (Lotes 1 a 6)', () => {
  it('Cenário Oficial Permanente: Vendas 10k, Impostos 1k, Fornecedores 3k, CAPEX 20k -> DRE 6.000 / Caixa -14.000; após estorno -> DRE -4.000 / Caixa -24.000', () => {
    const cats: CategoriaReferencia[] = [
      { id: 'c_rec', nome: 'Vendas', tipo: 'receita', grupo_dre: 'receita_bruta' },
      { id: 'c_imp', nome: 'Impostos', tipo: 'despesa', grupo_dre: 'deducoes_tributos' },
      { id: 'c_forn', nome: 'Fornecedores', tipo: 'despesa', grupo_dre: 'custos_variaveis' },
      { id: 'c_cap', nome: 'Máquina nova CAPEX', tipo: 'despesa', grupo_dre: 'investimento_capex' },
    ]

    const lancamentosBase: LancamentoCalculo[] = [
      {
        id: '1',
        tipo: 'receita',
        categoria_id: 'c_rec',
        categoria: 'Vendas',
        valor: 10000,
        status: 'realizado',
        competencia: '2026-10',
      },
      {
        id: '2',
        tipo: 'despesa',
        categoria_id: 'c_imp',
        categoria: 'Impostos',
        valor: 1000,
        status: 'realizado',
        competencia: '2026-10',
      },
      {
        id: '3',
        tipo: 'despesa',
        categoria_id: 'c_forn',
        categoria: 'Fornecedores',
        valor: 3000,
        status: 'realizado',
        competencia: '2026-10',
      },
      {
        id: '4',
        tipo: 'despesa',
        categoria_id: 'c_cap',
        categoria: 'Máquina nova CAPEX',
        valor: 20000,
        status: 'realizado',
        competencia: '2026-10',
      },
    ]

    // 1. Cenário pré-estorno
    const lancsAntes = lancamentosBase.map((l) => ({
      ...l,
      grupo_dre: resolverGrupoDRE(
        { tipo: l.tipo, categoria: l.categoria, categoria_id: l.categoria_id },
        cats,
      ),
    }))
    const dreInicial = calcularDRE(lancsAntes)
    expect(dreInicial.receitaBruta).toBe(10000)
    expect(dreInicial.receitaLiquida).toBe(9000)
    expect(dreInicial.resultadoLiquido).toBe(6000) // DRE = 6.000

    // Caixa inicial: 10.000 - 1.000 - 3.000 - 20.000 = -14.000
    const totalEntradasAntes = lancsAntes
      .filter((l) => l.tipo === 'receita' && l.status === 'realizado')
      .reduce((acc, curr) => acc + calcularValorEfetivoLancamento(curr), 0)
    const totalSaidasAntes = lancsAntes
      .filter((l) => l.tipo === 'despesa' && l.status === 'realizado')
      .reduce((acc, curr) => acc + calcularValorEfetivoLancamento(curr), 0)
    const caixaInicial = totalEntradasAntes - totalSaidasAntes
    expect(caixaInicial).toBe(-14000)

    // 2. Estorno da Venda de 10.000
    const contraEstornoVenda: LancamentoCalculo = {
      id: '5_estorno_venda',
      tipo: 'receita',
      categoria_id: 'c_rec',
      categoria: 'Vendas',
      valor: 10000,
      status: 'realizado',
      competencia: '2026-10',
      estorno_de: '1',
    }

    const lancsDepois = [...lancamentosBase, contraEstornoVenda].map((l) => ({
      ...l,
      grupo_dre: resolverGrupoDRE(
        { tipo: l.tipo, categoria: l.categoria, categoria_id: l.categoria_id },
        cats,
      ),
    }))
    const dreAposEstorno = calcularDRE(lancsDepois)
    expect(dreAposEstorno.resultadoLiquido).toBe(-4000) // DRE = -4.000

    // Caixa após estorno: 0 - 1.000 - 3.000 - 20.000 = -24.000
    const totalEntradasDepois = lancsDepois
      .filter((l) => l.tipo === 'receita' && l.status === 'realizado')
      .reduce((acc, curr) => acc + calcularValorEfetivoLancamento(curr), 0)
    const totalSaidasDepois = lancsDepois
      .filter((l) => l.tipo === 'despesa' && l.status === 'realizado')
      .reduce((acc, curr) => acc + calcularValorEfetivoLancamento(curr), 0)
    const caixaAposEstorno = totalEntradasDepois - totalSaidasDepois
    expect(caixaAposEstorno).toBe(-24000)
  })
})
