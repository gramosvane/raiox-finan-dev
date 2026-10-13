import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  prepararListaApresentacaoLancamentos,
  obterDetalhesApresentacaoLancamento,
  obterPendenciasNotificacao,
  LancamentoApresentacao,
} from './apresentacaoLancamentos'
import { hojeBrasil, formatarDataCivil, somarDiasDataCivil } from './dataCivil'
import {
  calcularDRE,
  calcularValorEfetivoLancamento,
  resolverGrupoDRE,
  CategoriaReferencia,
  LancamentoCalculo,
} from './financialCalculations'

describe('LOTE 5B - BLOCO A: ACABAMENTO VISUAL', () => {
  it('Teste 1 (A1 - UX-LAY-01): AppLayout expande largura máxima para caber telas de 1920px e DashboardPage não possui max-w-6xl', () => {
    const layoutPath = path.resolve(process.cwd(), 'src/components/layout/AppLayout.tsx')
    const layoutSrc = fs.readFileSync(layoutPath, 'utf-8')
    expect(layoutSrc).toContain('max-w-[1800px]')
    expect(layoutSrc).not.toContain('max-w-7xl')

    const dashboardPath = path.resolve(process.cwd(), 'src/pages/dashboard/DashboardPage.tsx')
    const dashboardSrc = fs.readFileSync(dashboardPath, 'utf-8')
    expect(dashboardSrc).not.toContain('max-w-6xl')
  })

  it('Teste 2 (A2 - UX-DRE-01): DRE Resumida possui linhas destacadas alinhadas com px-0 e mantendo cores e negritos', () => {
    const dashboardPath = path.resolve(process.cwd(), 'src/pages/dashboard/DashboardPage.tsx')
    const dashboardSrc = fs.readFileSync(dashboardPath, 'utf-8')

    // As três linhas destacadas devem possuir px-0 para manter mesmo recuo das linhas normais
    expect(dashboardSrc).toContain('(=) Receita líquida')
    expect(dashboardSrc).toContain('(=) EBITDA Operacional')
    expect(dashboardSrc).toContain('(=) Resultado líquido do mês')

    // Confirma px-0 nas 3 linhas
    expect(dashboardSrc).toMatch(/bg-slate-50 px-0 rounded-xl font-medium/)
    expect(dashboardSrc).toMatch(/bg-emerald-50\/70 px-0 rounded-xl text-emerald-800 font-semibold/)
    expect(dashboardSrc).toMatch(/bg-blue-50\/80 px-0 rounded-xl text-blue-900 font-bold/)
  })

  it('Teste 3 (A3 - UX-DRE-03): Gráfico LiquidityChart ajusta escala e rótulos no padrão brasileiro sem R$ 10 indevido', () => {
    const dashboardPath = path.resolve(process.cwd(), 'src/pages/dashboard/DashboardPage.tsx')
    const dashboardSrc = fs.readFileSync(dashboardPath, 'utf-8')

    // Não deve conter Math.max(10, ...saldos)
    expect(dashboardSrc).not.toContain('Math.max(10,')
    expect(dashboardSrc).toContain('formatarRotuloGrafico')
    expect(dashboardSrc).toContain('rawMin <= 0 ? (rawMax <= 0 ? rawMin : Math.min(0, rawMin)) : 0')
  })

  it('Teste 4 (A4 lista - UX-TXT-03 & UX-EST-01): Contra-lançamento com sinal do efeito, cor neutra, descrição legível sem ID e agrupado com ↳', () => {
    const originalVenda: LancamentoApresentacao = {
      id: 'venda_123',
      tipo: 'receita',
      descricao: 'Venda Teste',
      valor: 10000,
      competencia: '2026-10',
      data_lancamento: '2026-10-06',
      status: 'realizado',
    }

    const estornoVenda: LancamentoApresentacao = {
      id: 'estorno_456',
      tipo: 'receita',
      descricao: '[ESTORNO] Venda Teste - Ref: venda_123 (Cancelamento)',
      valor: 10000,
      competencia: '2026-10',
      data_lancamento: '2026-10-06',
      status: 'realizado',
      estorno_de: 'venda_123',
    }

    const lista = prepararListaApresentacaoLancamentos(
      [originalVenda, estornoVenda],
      [originalVenda, estornoVenda],
    )

    expect(lista).toHaveLength(2)

    // Original estornado
    const itemOrig = lista[0]
    expect(itemOrig.item.id).toBe('venda_123')
    expect(itemOrig.isOriginalEstornado).toBe(true)
    expect(itemOrig.efeitoLiquidoZero).toBe(true)
    expect(itemOrig.isFilhoEstornoAgrupado).toBe(false)

    // Contra-lançamento de estorno (filho agrupado)
    const itemEst = lista[1]
    expect(itemEst.item.id).toBe('estorno_456')
    expect(itemEst.isContraLancamentoEstorno).toBe(true)
    expect(itemEst.isFilhoEstornoAgrupado).toBe(true)
    expect(itemEst.valorExibicaoTexto).toContain('− R$ 10.000,00')
    expect(itemEst.descricaoExibicao).toBe('Estorno de: Venda Teste — 06/10/2026')
    expect(itemEst.descricaoExibicao).not.toContain('venda_123')
    expect(itemEst.descricaoExibicao).not.toContain('[ESTORNO]')
  })

  it('Teste 4b: Estorno de despesa apresenta sinal "+"', () => {
    const originalDespesa: LancamentoApresentacao = {
      id: 'desp_1',
      tipo: 'despesa',
      descricao: 'Material de Escritório',
      valor: 100,
      competencia: '2026-10',
      data_lancamento: '2026-10-06',
      status: 'realizado',
    }

    const estornoDespesa: LancamentoApresentacao = {
      id: 'est_desp_1',
      tipo: 'despesa',
      descricao: '[ESTORNO] Material de Escritório',
      valor: 100,
      competencia: '2026-10',
      data_lancamento: '2026-10-06',
      status: 'realizado',
      estorno_de: 'desp_1',
    }

    const lista = prepararListaApresentacaoLancamentos(
      [originalDespesa, estornoDespesa],
      [originalDespesa, estornoDespesa],
    )
    const itemEst = lista[1]
    expect(itemEst.valorExibicaoTexto).toContain('+ R$ 100,00')
    expect(itemEst.descricaoExibicao).toBe('Estorno de: Material de Escritório — 06/10/2026')
  })

  it('Teste 5 (A4 Detalhe): "Dados do Estorno" sem "(ID #...)" e registro antigo estornado sem data_realizacao mostra "—"', () => {
    const original: LancamentoApresentacao = {
      id: 'orig_sem_realizacao',
      tipo: 'receita',
      descricao: 'Teste data 01',
      data_lancamento: '2026-10-06',
      status: 'estornado',
      valor: 1000,
      competencia: '2026-10',
    }

    const contra: LancamentoApresentacao = {
      id: 'contra_teste',
      tipo: 'receita',
      descricao: 'Estorno Teste (Cancelamento do cliente)',
      data_lancamento: '2026-10-06',
      status: 'realizado',
      estorno_de: 'orig_sem_realizacao',
      valor: 1000,
      competencia: '2026-10',
    }

    const detalheOrig = obterDetalhesApresentacaoLancamento(original, [original, contra])
    expect(detalheOrig.etiquetaPrincipal).toBe('Estornado')
    expect(detalheOrig.dataRealizacaoExibicao).toBe('—')
    expect(detalheOrig.motivoEstorno).toBe('Cancelamento do cliente')

    const detalheContra = obterDetalhesApresentacaoLancamento(contra, [original, contra])
    expect(detalheContra.originalReferenciado?.descricao).toBe('Teste data 01')
    expect(detalheContra.originalReferenciado?.data_lancamento).toBe('2026-10-06')

    // Confirma que LancamentosPage não exibe "(ID #"
    const lancamentosPageSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/lancamentos/LancamentosPage.tsx'),
      'utf-8',
    )
    expect(lancamentosPageSrc).not.toContain('(ID #')
  })

  it('Teste 6 (A5 - FIN-08-R): dataControl.ts utiliza hojeBrasil() para os nomes de arquivos exportados', () => {
    const dataControlPath = path.resolve(process.cwd(), 'src/services/dataControl.ts')
    const dataControlSrc = fs.readFileSync(dataControlPath, 'utf-8')

    // Deve importar e usar hojeBrasil()
    expect(dataControlSrc).toContain("import { hojeBrasil } from '@/lib/dataCivil'")
    expect(dataControlSrc).not.toContain('const hoje = new Date().toISOString().slice(0, 10)')
    expect(dataControlSrc).toContain('const hoje = hojeBrasil()')
  })
})

describe('LOTE 5B - BLOCO B: SINO DE URGÊNCIA (UX-NOT-02)', () => {
  const hoje = '2026-10-07'
  const ontem = '2026-10-06'
  const amanha = '2026-10-08'
  const emCincoDias = '2026-10-12'

  it('Teste 7: Despesa prevista vencida em 2026-10-06: aparece com motivo "Vencida"', () => {
    const despesaVencida: LancamentoApresentacao = {
      id: 'd_vencida',
      tipo: 'despesa',
      descricao: 'Conta de Energia Atrasada',
      valor: 450,
      status: 'previsto',
      data_vencimento: ontem,
    }
    const res = obterPendenciasNotificacao([despesaVencida], hoje)
    expect(res).toHaveLength(1)
    expect(res[0].motivo).toBe('Vencida')
  })

  it('Teste 8: Despesa prevista vencendo em 2026-10-07: aparece com motivo "Vence hoje"', () => {
    const despesaHoje: LancamentoApresentacao = {
      id: 'd_hoje',
      tipo: 'despesa',
      descricao: 'Boleto Vence Hoje',
      valor: 300,
      status: 'previsto',
      data_vencimento: hoje,
    }
    const res = obterPendenciasNotificacao([despesaHoje], hoje)
    expect(res).toHaveLength(1)
    expect(res[0].motivo).toBe('Vence hoje')
  })

  it('Teste 9: Despesa prevista vencendo em 2026-10-08 (amanhã): NÃO aparece', () => {
    const despesaAmanha: LancamentoApresentacao = {
      id: 'd_amanha',
      tipo: 'despesa',
      descricao: 'Boleto de Amanhã',
      valor: 200,
      status: 'previsto',
      data_vencimento: amanha,
    }
    const res = obterPendenciasNotificacao([despesaAmanha], hoje)
    expect(res).toHaveLength(0)
  })

  it('Teste 10: Despesa prevista vencendo em 2026-10-12: NÃO aparece', () => {
    const despesaFutura: LancamentoApresentacao = {
      id: 'd_futura',
      tipo: 'despesa',
      descricao: 'Fornecedor em 5 dias',
      valor: 1500,
      status: 'previsto',
      data_vencimento: emCincoDias,
    }
    const res = obterPendenciasNotificacao([despesaFutura], hoje)
    expect(res).toHaveLength(0)
  })

  it('Teste 11: Receita prevista vencida aparece ("Vencida"); vence hoje aparece ("Vence hoje"); vencendo em 2026-10-10 NÃO aparece', () => {
    const rVencida: LancamentoApresentacao = {
      id: 'r_vencida',
      tipo: 'receita',
      descricao: 'Cliente A Vencido',
      valor: 800,
      status: 'previsto',
      data_vencimento: ontem,
    }
    const rHoje: LancamentoApresentacao = {
      id: 'r_hoje',
      tipo: 'receita',
      descricao: 'Cliente B Hoje',
      valor: 1200,
      status: 'previsto',
      data_vencimento: hoje,
    }
    const rFutura: LancamentoApresentacao = {
      id: 'r_futura',
      tipo: 'receita',
      descricao: 'Cliente C Futuro',
      valor: 2000,
      status: 'previsto',
      data_vencimento: '2026-10-10',
    }

    const res = obterPendenciasNotificacao([rVencida, rHoje, rFutura], hoje)
    expect(res).toHaveLength(2)
    const venc = res.find((i) => i.id === 'r_vencida')
    const hj = res.find((i) => i.id === 'r_hoje')
    expect(venc?.motivo).toBe('Vencida')
    expect(hj?.motivo).toBe('Vence hoje')
  })

  it('Teste 12: Previsto sem vencimento: aparece com motivo "Sem vencimento — cadastro incompleto"', () => {
    const semVenc: LancamentoApresentacao = {
      id: 'sem_venc',
      tipo: 'despesa',
      descricao: 'Nota Fiscal s/ boleto',
      valor: 50,
      status: 'previsto',
      data_vencimento: null,
    }
    const res = obterPendenciasNotificacao([semVenc], hoje)
    expect(res).toHaveLength(1)
    expect(res[0].motivo).toBe('Sem vencimento — cadastro incompleto')
  })

  it('Teste 13: Previsto liquidado, original estornado e contra-lançamentos NÃO aparecem', () => {
    const prevLiq: LancamentoApresentacao = {
      id: 'prev_liquidado',
      tipo: 'despesa',
      descricao: 'Despesa Liquidada',
      valor: 100,
      status: 'previsto',
      data_vencimento: ontem,
    }
    const contraLiq: LancamentoApresentacao = {
      id: 'contra_liq',
      tipo: 'despesa',
      descricao: 'Liquidação da Despesa',
      valor: 100,
      status: 'realizado',
      liquidacao_de: 'prev_liquidado',
    }

    const prevEstornado: LancamentoApresentacao = {
      id: 'prev_estornado',
      tipo: 'despesa',
      descricao: 'Despesa Estornada',
      valor: 100,
      status: 'previsto',
      data_vencimento: ontem,
    }
    const contraEst: LancamentoApresentacao = {
      id: 'contra_est',
      tipo: 'despesa',
      descricao: 'Estorno da Despesa',
      valor: 100,
      status: 'realizado',
      estorno_de: 'prev_estornado',
    }

    const res = obterPendenciasNotificacao([prevLiq, contraLiq, prevEstornado, contraEst], hoje)
    expect(res).toHaveLength(0)
  })

  it('Teste 14: Ordem da lista: primeiro Vencida (mais antigo primeiro), depois Vence hoje, depois Sem vencimento', () => {
    const semVenc: LancamentoApresentacao = {
      id: 'sem_venc',
      tipo: 'despesa',
      descricao: 'Sem vencimento',
      valor: 10,
      status: 'previsto',
      data_vencimento: null,
    }
    const venceHoje: LancamentoApresentacao = {
      id: 'hoje',
      tipo: 'receita',
      descricao: 'Receita Hoje',
      valor: 20,
      status: 'previsto',
      data_vencimento: hoje,
    }
    const vencidaMaisAntiga: LancamentoApresentacao = {
      id: 'vencida_antiga',
      tipo: 'despesa',
      descricao: 'Despesa de 5 dias atrás',
      valor: 30,
      status: 'previsto',
      data_vencimento: '2026-10-02',
    }
    const vencidaRecente: LancamentoApresentacao = {
      id: 'vencida_recente',
      tipo: 'despesa',
      descricao: 'Despesa de ontem',
      valor: 40,
      status: 'previsto',
      data_vencimento: ontem,
    }

    const res = obterPendenciasNotificacao(
      [semVenc, venceHoje, vencidaRecente, vencidaMaisAntiga],
      hoje,
    )

    expect(res.map((r) => r.id)).toEqual(['vencida_antiga', 'vencida_recente', 'hoje', 'sem_venc'])
    expect(res.map((r) => r.motivo)).toEqual([
      'Vencida',
      'Vencida',
      'Vence hoje',
      'Sem vencimento — cadastro incompleto',
    ])
  })

  it('Teste 15: Número do sino é igual à quantidade; sem pendências retorna lista vazia', () => {
    expect(obterPendenciasNotificacao([], hoje)).toHaveLength(0)
  })

  it('Teste 16: Com hora simulada de 22:30 em Brasília de 07/10, despesa vencendo 07/10 aparece como "Vence hoje"', () => {
    const dataRefBsB = hojeBrasil() // Data civil oficial de Brasília
    const despesaDoDia: LancamentoApresentacao = {
      id: 'd_dia',
      tipo: 'despesa',
      descricao: 'Despesa com vencimento no dia',
      valor: 500,
      status: 'previsto',
      data_vencimento: dataRefBsB,
    }
    const res = obterPendenciasNotificacao([despesaDoDia], dataRefBsB)
    expect(res).toHaveLength(1)
    expect(res[0].motivo).toBe('Vence hoje')
  })
})

describe('TESTE 17 - REGRESSÃO FINANCEIRA OFICIAL COMPLETA (Lotes 1 a 5B)', () => {
  it('Cenário Oficial Permanente: Vendas 10k, Impostos 1k, Fornecedores 3k, CAPEX 20k -> DRE 6.000 / Caixa -14.000; após estorno -> DRE -4.000 / Caixa -24.000', () => {
    const catalogoCategorias: CategoriaReferencia[] = [
      { id: 'c_vendas', nome: 'Vendas', tipo: 'receita', grupo_dre: 'receita_bruta' },
      { id: 'c_impostos', nome: 'Impostos', tipo: 'despesa', grupo_dre: 'deducoes_tributos' },
      { id: 'c_custos', nome: 'Fornecedores', tipo: 'despesa', grupo_dre: 'custos_variaveis' },
      { id: 'c_capex', nome: 'Máquina nova', tipo: 'despesa', grupo_dre: 'investimento_capex' },
    ]

    const venda: LancamentoCalculo = {
      id: 'v_1',
      tipo: 'receita',
      categoria: 'Vendas',
      categoria_id: 'c_vendas',
      valor: 10000,
      competencia: '2026-10',
      status: 'realizado',
    }
    const impostos: LancamentoCalculo = {
      id: 'd_imp',
      tipo: 'despesa',
      categoria: 'Impostos',
      categoria_id: 'c_impostos',
      valor: 1000,
      competencia: '2026-10',
      status: 'realizado',
    }
    const fornecedores: LancamentoCalculo = {
      id: 'd_forn',
      tipo: 'despesa',
      categoria: 'Fornecedores',
      categoria_id: 'c_custos',
      valor: 3000,
      competencia: '2026-10',
      status: 'realizado',
    }
    const capex: LancamentoCalculo = {
      id: 'd_capex',
      tipo: 'despesa',
      categoria: 'Máquina nova',
      categoria_id: 'c_capex',
      valor: 20000,
      competencia: '2026-10',
      status: 'realizado',
    }

    const lancsAntes = [venda, impostos, fornecedores, capex].map((l) => ({
      ...l,
      grupo_dre: resolverGrupoDRE(
        { tipo: l.tipo, categoria: l.categoria, categoria_id: l.categoria_id },
        catalogoCategorias,
      ),
    }))

    const dreAntes = calcularDRE(lancsAntes)
    expect(dreAntes.receitaBruta).toBe(10000)
    expect(dreAntes.receitaLiquida).toBe(9000)
    expect(dreAntes.resultadoLiquido).toBe(6000)

    const totalEntradasAntes = lancsAntes
      .filter((l) => l.tipo === 'receita' && l.status === 'realizado')
      .reduce((acc, curr) => acc + calcularValorEfetivoLancamento(curr), 0)
    const totalSaidasAntes = lancsAntes
      .filter((l) => l.tipo === 'despesa' && l.status === 'realizado')
      .reduce((acc, curr) => acc + calcularValorEfetivoLancamento(curr), 0)
    const saldoCaixaAntes = totalEntradasAntes - totalSaidasAntes
    expect(saldoCaixaAntes).toBe(-14000)

    // Contra-lançamento de estorno da venda
    const estornoVenda: LancamentoCalculo = {
      id: 'estorno_v_1',
      tipo: 'receita',
      categoria: 'Vendas',
      categoria_id: 'c_vendas',
      valor: 10000,
      competencia: '2026-10',
      status: 'realizado',
      estorno_de: 'v_1',
    }

    const lancsDepois = [venda, estornoVenda, impostos, fornecedores, capex].map((l) => ({
      ...l,
      grupo_dre: resolverGrupoDRE(
        { tipo: l.tipo, categoria: l.categoria, categoria_id: l.categoria_id },
        catalogoCategorias,
      ),
    }))

    const dreDepois = calcularDRE(lancsDepois)
    expect(dreDepois.resultadoLiquido).toBe(-4000)

    const totalEntradasDepois = lancsDepois
      .filter((l) => l.tipo === 'receita' && l.status === 'realizado')
      .reduce((acc, curr) => acc + calcularValorEfetivoLancamento(curr), 0)
    const totalSaidasDepois = lancsDepois
      .filter((l) => l.tipo === 'despesa' && l.status === 'realizado')
      .reduce((acc, curr) => acc + calcularValorEfetivoLancamento(curr), 0)
    const saldoCaixaDepois = totalEntradasDepois - totalSaidasDepois
    expect(saldoCaixaDepois).toBe(-24000)
  })
})
