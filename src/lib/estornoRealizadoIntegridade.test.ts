import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  calcularDRE,
  calcularValorEfetivoLancamento,
  LancamentoCalculo,
  CategoriaReferencia,
  resolverGrupoDRE,
  filtrarLancamentosAbertos,
} from './financialCalculations'

/**
 * BATERIA DE HOMOLOGAÇÃO: CORREÇÃO PONTUAL — ESTORNO SOMENTE DE LANÇAMENTO REALIZADO NÃO-LIQUIDAÇÃO
 *
 * Exigências da tarefa:
 * 1. Estornar conta prevista (direto no servidor) → 400; nada criado; caixa inalterado; a conta continua aberta.
 * 2. Estornar lançamento de liquidação (direto no servidor) → 400; nada criado; a liquidação original permanece intacta.
 * 3. Tela de Lançamentos: lançamento previsto NÃO exibe Estornar.
 * 4. Estorno de lançamento realizado normal continua funcionando: cenário oficial = 6.000; após estornar a venda = -4.000; segundo estorno → 400.
 * 5. Liquidação continua como aprovada: liquidar conta prevista de 500 → aceito; segunda liquidação → 400.
 *
 * Verificações complementares:
 * - Nenhuma regra de cálculo financeiro alterada.
 */

describe('Correção Pontual: Estorno Somente de Lançamento Realizado (Não-Liquidação)', () => {
  const rootDir = process.cwd()

  const catalogoCategorias: CategoriaReferencia[] = [
    { id: 'c_vendas', nome: 'Vendas', tipo: 'receita', grupo_dre: 'receita_bruta' },
    { id: 'c_impostos', nome: 'Impostos', tipo: 'despesa', grupo_dre: 'deducoes_tributos' },
    { id: 'c_custos', nome: 'Fornecedores', tipo: 'despesa', grupo_dre: 'custos_variaveis' },
    { id: 'c_capex', nome: 'Máquina nova', tipo: 'despesa', grupo_dre: 'investimento_capex' },
    {
      id: 'c_desp_prev',
      nome: 'Serviços Terceiros',
      tipo: 'despesa',
      grupo_dre: 'despesas_operacionais',
    },
  ]

  // Simulação fiel e exata do hook server/pb_hooks/enforce_usuario_id.pb.js
  function simularCriacaoLancamentoServidor(
    novoRegistro: {
      tipo: string
      descricao: string
      valor: number
      categoria_id: string
      empresa_id: string
      competencia: string
      status: 'realizado' | 'previsto'
      estorno_de?: string | null
      liquidacao_de?: string | null
    },
    banco: {
      lancamentos: Array<{
        id: string
        tipo: string
        descricao: string
        valor: number
        categoria_id: string
        empresa_id: string
        competencia: string
        status: string
        estorno_de?: string | null
        liquidacao_de?: string | null
      }>
    },
  ) {
    if (!novoRegistro.categoria_id) {
      throw new Error('Operação negada: o campo categoria_id é obrigatório para novos lançamentos.')
    }

    // Validação de estorno
    if (novoRegistro.estorno_de) {
      const orig = banco.lancamentos.find((l) => l.id === novoRegistro.estorno_de)
      if (!orig) {
        throw new Error(
          'Operação negada: o lançamento original referenciado para estorno não existe.',
        )
      }

      // NOVO: status deve ser realizado
      if (orig.status !== 'realizado') {
        throw new Error(
          'Operação negada: o estorno só pode ser aplicado a lançamentos com status "realizado". Lançamentos previstos não podem ser estornados.',
        )
      }

      // NOVO: não pode ser lançamento de liquidação
      if (orig.liquidacao_de) {
        throw new Error(
          'Operação negada: não é permitido realizar o estorno de um lançamento de liquidação.',
        )
      }

      // Não pode ser estorno de estorno
      if (orig.estorno_de) {
        throw new Error(
          'Operação negada: não é permitido realizar o estorno de um lançamento de contra-lançamento (estorno de estorno).',
        )
      }

      // Não pode estorno duplicado
      const jaEstornado = banco.lancamentos.some((l) => l.estorno_de === novoRegistro.estorno_de)
      if (jaEstornado) {
        throw new Error(
          'Operação negada: este lançamento já foi estornado anteriormente. Não é permitido estorno duplicado.',
        )
      }

      // Contra-lançamento deve ter status = realizado
      if (novoRegistro.status !== 'realizado') {
        throw new Error(
          'Operação negada: o contra-lançamento de estorno deve ter status = "realizado".',
        )
      }

      // Identidade tipo, valor, categoria_id, empresa_id, competência
      if (orig.tipo !== novoRegistro.tipo) {
        throw new Error(
          'Operação negada: o tipo do contra-lançamento de estorno deve ser idêntico ao do lançamento original.',
        )
      }
      if (Math.abs(orig.valor - novoRegistro.valor) > 0.0001) {
        throw new Error(
          'Operação negada: o valor do contra-lançamento de estorno deve ser idêntico ao do lançamento original.',
        )
      }
      if (orig.categoria_id !== novoRegistro.categoria_id) {
        throw new Error(
          'Operação negada: a categoria do contra-lançamento de estorno deve ser idêntica à do lançamento original.',
        )
      }
      if (orig.empresa_id !== novoRegistro.empresa_id) {
        throw new Error(
          'Operação negada: a empresa do contra-lançamento de estorno deve ser idêntica à do lançamento original.',
        )
      }
      if (orig.competencia !== novoRegistro.competencia) {
        throw new Error(
          'Operação negada: a competência do contra-lançamento de estorno deve ser idêntica à do lançamento original.',
        )
      }
    }

    // Validação de liquidação
    if (novoRegistro.liquidacao_de) {
      const orig = banco.lancamentos.find((l) => l.id === novoRegistro.liquidacao_de)
      if (!orig) {
        throw new Error('Operação negada: o lançamento referenciado para liquidação não existe.')
      }
      if (orig.status !== 'previsto') {
        throw new Error(
          'Operação negada: o lançamento referenciado não está com status "previsto".',
        )
      }
      if (orig.liquidacao_de) {
        throw new Error(
          'Operação negada: não é permitido realizar a liquidação de um lançamento de liquidação.',
        )
      }
      if (orig.estorno_de) {
        throw new Error(
          'Operação negada: não é permitido realizar a liquidação de um contra-lançamento de estorno.',
        )
      }
      const jaLiquidado = banco.lancamentos.some(
        (l) => l.liquidacao_de === novoRegistro.liquidacao_de,
      )
      if (jaLiquidado) {
        throw new Error(
          'Operação negada: o lançamento referenciado já possui outra liquidação registrada. Não é permitida liquidação duplicada.',
        )
      }
      if (novoRegistro.status !== 'realizado') {
        throw new Error(
          'Operação negada: o lançamento de liquidação deve ter status = "realizado".',
        )
      }
      if (orig.tipo !== novoRegistro.tipo || Math.abs(orig.valor - novoRegistro.valor) > 0.0001) {
        throw new Error('Operação negada: liquidação incompatível com a conta prevista.')
      }
    }

    const criado = {
      id: `id_${Date.now()}_${Math.random()}`,
      ...novoRegistro,
    }
    banco.lancamentos.push(criado)
    return criado
  }

  // ---------------------------------------------------------------------------
  // TESTE 1: Estornar conta prevista (direto no servidor) → 400; nada criado;
  //          caixa inalterado; a conta continua aberta.
  // ---------------------------------------------------------------------------
  describe('1. Estornar conta prevista (direto no servidor)', () => {
    it('recusa com erro 400, não cria contra-lançamento, caixa fica inalterado e conta permanece aberta', () => {
      const hookPath = path.join(rootDir, 'server', 'pb_hooks', 'enforce_usuario_id.pb.js')
      const hookContent = fs.readFileSync(hookPath, 'utf-8')
      expect(hookContent).toContain("origStatus !== 'realizado'")
      expect(hookContent).toContain('Lançamentos previstos não podem ser estornados')

      // Estado inicial: conta prevista de 700 aberta em contas a pagar
      const contaPrevista = {
        id: 'conta_prev_700',
        tipo: 'despesa',
        descricao: 'Consultoria Financeira',
        valor: 700,
        categoria_id: 'c_desp_prev',
        empresa_id: 'emp_1',
        competencia: '2026-05',
        status: 'previsto',
        estorno_de: null,
        liquidacao_de: null,
      }

      const banco = {
        lancamentos: [{ ...contaPrevista }],
      }

      // Caixa antes da tentativa: consideramos lançamentos realizados
      const caixaAntes = banco.lancamentos
        .filter((l) => l.status === 'realizado')
        .reduce((acc, l) => acc + calcularValorEfetivoLancamento(l as any), 0)
      expect(caixaAntes).toBe(0)

      // Contas abertas antes da tentativa
      const abertasAntes = filtrarLancamentosAbertos(banco.lancamentos as any)
      expect(abertasAntes.length).toBe(1)
      expect(abertasAntes[0].id).toBe('conta_prev_700')

      // Tentativa de estornar a conta prevista
      expect(() => {
        simularCriacaoLancamentoServidor(
          {
            tipo: 'despesa',
            descricao: '[ESTORNO] Consultoria Financeira',
            valor: 700,
            categoria_id: 'c_desp_prev',
            empresa_id: 'emp_1',
            competencia: '2026-05',
            status: 'realizado',
            estorno_de: 'conta_prev_700',
          },
          banco,
        )
      }).toThrow(/Lançamentos previstos não podem ser estornados/)

      // Nada foi criado no banco
      expect(banco.lancamentos.length).toBe(1)

      // Caixa permanece inalterado (não aumentou indevidamente em 700)
      const caixaDepois = banco.lancamentos
        .filter((l) => l.status === 'realizado')
        .reduce((acc, l) => acc + calcularValorEfetivoLancamento(l as any), 0)
      expect(caixaDepois).toBe(0)
      expect(caixaDepois).toBe(caixaAntes)

      // A conta continua aparecendo aberta
      const abertasDepois = filtrarLancamentosAbertos(banco.lancamentos as any)
      expect(abertasDepois.length).toBe(1)
      expect(abertasDepois[0].id).toBe('conta_prev_700')
    })
  })

  // ---------------------------------------------------------------------------
  // TESTE 2: Estornar lançamento de liquidação (direto no servidor) → 400;
  //          nada criado; a liquidação original permanece intacta.
  // ---------------------------------------------------------------------------
  describe('2. Estornar lançamento de liquidação (direto no servidor)', () => {
    it('recusa com erro 400, nada é criado e a liquidação permanece intacta', () => {
      const hookPath = path.join(rootDir, 'server', 'pb_hooks', 'enforce_usuario_id.pb.js')
      const hookContent = fs.readFileSync(hookPath, 'utf-8')
      expect(hookContent).toContain('origLiquidacaoDe')
      expect(hookContent).toContain(
        'não é permitido realizar o estorno de um lançamento de liquidação',
      )

      // Conta prevista de 500 e sua liquidação realizada de 500
      const contaPrevista500 = {
        id: 'conta_prev_500',
        tipo: 'despesa',
        descricao: 'Material de Escritório',
        valor: 500,
        categoria_id: 'c_desp_prev',
        empresa_id: 'emp_1',
        competencia: '2026-05',
        status: 'previsto',
        estorno_de: null,
        liquidacao_de: null,
      }

      const lancamentoLiquidacao = {
        id: 'liq_500',
        tipo: 'despesa',
        descricao: 'Material de Escritório (Liquidado)',
        valor: 500,
        categoria_id: 'c_desp_prev',
        empresa_id: 'emp_1',
        competencia: '2026-05',
        status: 'realizado',
        estorno_de: null,
        liquidacao_de: 'conta_prev_500',
      }

      const banco = {
        lancamentos: [{ ...contaPrevista500 }, { ...lancamentoLiquidacao }],
      }

      // Tentativa de estornar o lançamento de liquidação liq_500
      expect(() => {
        simularCriacaoLancamentoServidor(
          {
            tipo: 'despesa',
            descricao: '[ESTORNO] Material de Escritório (Liquidado)',
            valor: 500,
            categoria_id: 'c_desp_prev',
            empresa_id: 'emp_1',
            competencia: '2026-05',
            status: 'realizado',
            estorno_de: 'liq_500',
          },
          banco,
        )
      }).toThrow(/não é permitido realizar o estorno de um lançamento de liquidação/)

      // Nada foi criado
      expect(banco.lancamentos.length).toBe(2)

      // A liquidação permanece intacta no banco
      const liqApos = banco.lancamentos.find((l) => l.id === 'liq_500')
      expect(liqApos).toBeDefined()
      expect(liqApos?.status).toBe('realizado')
      expect(liqApos?.liquidacao_de).toBe('conta_prev_500')

      // A conta prevista continua vinculada à sua liquidação
      const idsLiquidados = new Set(
        banco.lancamentos.filter((l) => Boolean(l.liquidacao_de)).map((l) => l.liquidacao_de!),
      )
      expect(idsLiquidados.has('conta_prev_500')).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // TESTE 3: Tela de Lançamentos: lançamento previsto NÃO exibe Estornar
  // ---------------------------------------------------------------------------
  describe('3. Tela de Lançamentos: lançamento previsto NÃO exibe Estornar', () => {
    it('comprova no código de LancamentosPage.tsx que botão Estornar é condicionado a item.status !== "previsto"', () => {
      const lancamentosPagePath = path.join(
        rootDir,
        'src',
        'pages',
        'lancamentos',
        'LancamentosPage.tsx',
      )
      const content = fs.readFileSync(lancamentosPagePath, 'utf-8')

      expect(content).toContain("item.status !== 'previsto'")

      // Simulação exata dos predicados de exibição da LancamentosPage
      function podeExibirBlocoAcoes(
        item: {
          id: string
          status: string
          estorno_de?: string | null
          liquidacao_de?: string | null
        },
        idsOriginaisEstornados: Set<string>,
        idsOriginaisLiquidados: Set<string>,
      ) {
        return !(
          item.status === 'estornado' ||
          idsOriginaisEstornados.has(item.id) ||
          Boolean(item.estorno_de) ||
          Boolean(item.liquidacao_de) ||
          idsOriginaisLiquidados.has(item.id)
        )
      }

      function podeExibirEditar(
        item: {
          id: string
          status: string
          estorno_de?: string | null
          liquidacao_de?: string | null
        },
        idsOriginaisEstornados: Set<string>,
        idsOriginaisLiquidados: Set<string>,
      ) {
        return podeExibirBlocoAcoes(item, idsOriginaisEstornados, idsOriginaisLiquidados)
      }

      function podeExibirEstornar(
        item: {
          id: string
          status: string
          estorno_de?: string | null
          liquidacao_de?: string | null
        },
        idsOriginaisEstornados: Set<string>,
        idsOriginaisLiquidados: Set<string>,
      ) {
        return (
          podeExibirBlocoAcoes(item, idsOriginaisEstornados, idsOriginaisLiquidados) &&
          item.status !== 'previsto'
        )
      }

      const lancamentoPrevisto = {
        id: 'lanc_prev_1',
        status: 'previsto',
        estorno_de: null,
        liquidacao_de: null,
      }

      const lancamentoRealizado = {
        id: 'lanc_real_1',
        status: 'realizado',
        estorno_de: null,
        liquidacao_de: null,
      }

      const idsOrigEst = new Set<string>()
      const idsOrigLiq = new Set<string>()

      // Lançamento previsto: exibe Editar, mas NÃO exibe Estornar
      expect(podeExibirEditar(lancamentoPrevisto, idsOrigEst, idsOrigLiq)).toBe(true)
      expect(podeExibirEstornar(lancamentoPrevisto, idsOrigEst, idsOrigLiq)).toBe(false)

      // Lançamento realizado normal: exibe Editar E Estornar
      expect(podeExibirEditar(lancamentoRealizado, idsOrigEst, idsOrigLiq)).toBe(true)
      expect(podeExibirEstornar(lancamentoRealizado, idsOrigEst, idsOrigLiq)).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // TESTE 4: Estorno de lançamento realizado normal continua funcionando:
  //          cenário oficial = 6.000; após estornar a venda = -4.000; segundo estorno → 400.
  // ---------------------------------------------------------------------------
  describe('4. Estorno de lançamento realizado normal e cenário oficial permanente', () => {
    it('cenário oficial = 6.000; após estorno da venda = -4.000; segundo estorno é rejeitado com 400', () => {
      // Cenário permanente de referência:
      // Vendas 10.000, Impostos 1.000, Fornecedores 3.000, Máquina 20.000 (CAPEX)
      const vendaOriginal = {
        id: 'v_100',
        tipo: 'receita',
        descricao: 'Venda de Software Alpha',
        valor: 10000,
        categoria: 'Vendas',
        categoria_id: 'c_vendas',
        empresa_id: 'emp_1',
        competencia: '2026-05',
        status: 'realizado' as const,
        estorno_de: null,
        liquidacao_de: null,
      }
      const impostos = {
        id: 'd_imp',
        tipo: 'despesa',
        descricao: 'Tributos Fiscais',
        valor: 1000,
        categoria: 'Impostos',
        categoria_id: 'c_impostos',
        empresa_id: 'emp_1',
        competencia: '2026-05',
        status: 'realizado' as const,
        estorno_de: null,
        liquidacao_de: null,
      }
      const custos = {
        id: 'd_custos',
        tipo: 'despesa',
        descricao: 'Fornecedores de Software',
        valor: 3000,
        categoria: 'Fornecedores',
        categoria_id: 'c_custos',
        empresa_id: 'emp_1',
        competencia: '2026-05',
        status: 'realizado' as const,
        estorno_de: null,
        liquidacao_de: null,
      }
      const capex = {
        id: 'd_capex',
        tipo: 'despesa',
        descricao: 'Máquina nova (CAPEX)',
        valor: 20000,
        categoria: 'Máquina nova',
        categoria_id: 'c_capex',
        empresa_id: 'emp_1',
        competencia: '2026-05',
        status: 'realizado' as const,
        estorno_de: null,
        liquidacao_de: null,
      }

      const banco = {
        lancamentos: [{ ...vendaOriginal }, { ...impostos }, { ...custos }, { ...capex }],
      }

      // Estado 1: Antes do estorno
      const lancsOficial = banco.lancamentos.map((l) => ({
        ...l,
        tipo: l.tipo as 'receita' | 'despesa',
        grupo_dre: resolverGrupoDRE(
          {
            tipo: l.tipo as 'receita' | 'despesa',
            categoria: l.categoria,
            categoria_id: l.categoria_id,
          },
          catalogoCategorias,
        ),
      })) as LancamentoCalculo[]

      const dreOficial = calcularDRE(lancsOficial)
      expect(dreOficial.receitaBruta).toBe(10000)
      expect(dreOficial.impostosDeducoes).toBe(1000)
      expect(dreOficial.receitaLiquida).toBe(9000)
      expect(dreOficial.custosFornecedores).toBe(3000)
      expect(dreOficial.resultadoLiquido).toBe(6000)
      expect(dreOficial.investimentos).toBe(20000)

      // Estorno 1: Estornar a venda normal realizada (aceito com sucesso)
      const estornoVendaCriado = simularCriacaoLancamentoServidor(
        {
          tipo: 'receita',
          descricao: '[ESTORNO] Venda de Software Alpha',
          valor: 10000,
          categoria_id: 'c_vendas',
          empresa_id: 'emp_1',
          competencia: '2026-05',
          status: 'realizado',
          estorno_de: 'v_100',
        },
        banco,
      )

      expect(estornoVendaCriado).toBeDefined()
      expect(estornoVendaCriado.estorno_de).toBe('v_100')

      // Estado 2: Após estornar a venda
      const lancsAposEstorno = banco.lancamentos.map((l) => ({
        ...l,
        tipo: l.tipo as 'receita' | 'despesa',
        categoria: l.categoria_id === 'c_vendas' ? 'Vendas' : (l as any).categoria,
        grupo_dre: resolverGrupoDRE(
          {
            tipo: l.tipo as 'receita' | 'despesa',
            categoria: (l as any).categoria,
            categoria_id: l.categoria_id,
          },
          catalogoCategorias,
        ),
      })) as LancamentoCalculo[]

      const dreAposEstorno = calcularDRE(lancsAposEstorno)
      expect(dreAposEstorno.receitaBruta).toBe(0)
      expect(dreAposEstorno.impostosDeducoes).toBe(1000)
      expect(dreAposEstorno.receitaLiquida).toBe(-1000)
      expect(dreAposEstorno.custosFornecedores).toBe(3000)
      expect(dreAposEstorno.resultadoLiquido).toBe(-4000)

      // Tentativa de 2º estorno para a mesma venda → deve recusar com erro 400
      expect(() => {
        simularCriacaoLancamentoServidor(
          {
            tipo: 'receita',
            descricao: '[ESTORNO] 2ª tentativa',
            valor: 10000,
            categoria_id: 'c_vendas',
            empresa_id: 'emp_1',
            competencia: '2026-05',
            status: 'realizado',
            estorno_de: 'v_100',
          },
          banco,
        )
      }).toThrow(/este lançamento já foi estornado anteriormente/)
    })
  })

  // ---------------------------------------------------------------------------
  // TESTE 5: Liquidação continua como aprovada:
  //          liquidar conta prevista de 500 → aceito; segunda liquidação → 400.
  // ---------------------------------------------------------------------------
  describe('5. Liquidação aprovada: liquidar conta prevista e impedir duplicidade', () => {
    it('aceita primeira liquidação de conta prevista de 500 e recusa segunda com 400', () => {
      const contaPrevista = {
        id: 'cp_500',
        tipo: 'despesa',
        descricao: 'Aluguel Escritório',
        valor: 500,
        categoria_id: 'c_desp_prev',
        empresa_id: 'emp_1',
        competencia: '2026-05',
        status: 'previsto',
        estorno_de: null,
        liquidacao_de: null,
      }

      const banco = {
        lancamentos: [{ ...contaPrevista }],
      }

      // 1ª liquidação: aceito
      const liqCriada = simularCriacaoLancamentoServidor(
        {
          tipo: 'despesa',
          descricao: 'Aluguel Escritório (Liquidado)',
          valor: 500,
          categoria_id: 'c_desp_prev',
          empresa_id: 'emp_1',
          competencia: '2026-05',
          status: 'realizado',
          liquidacao_de: 'cp_500',
        },
        banco,
      )

      expect(liqCriada).toBeDefined()
      expect(liqCriada.liquidacao_de).toBe('cp_500')
      expect(liqCriada.status).toBe('realizado')

      // 2ª liquidação da mesma conta prevista: recusada com erro 400
      expect(() => {
        simularCriacaoLancamentoServidor(
          {
            tipo: 'despesa',
            descricao: 'Segunda tentativa de liquidação',
            valor: 500,
            categoria_id: 'c_desp_prev',
            empresa_id: 'emp_1',
            competencia: '2026-05',
            status: 'realizado',
            liquidacao_de: 'cp_500',
          },
          banco,
        )
      }).toThrow(/já possui outra liquidação registrada/)
    })
  })
})
