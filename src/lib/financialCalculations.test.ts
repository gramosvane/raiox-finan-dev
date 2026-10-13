import { describe, it, expect } from 'vitest'
import {
  roundCents,
  roundPercent,
  calcularValorEfetivoLancamento,
  calcularDRE,
  calcularROI,
  calcularIndicesLiquidez,
  calcularAging,
  calcularProjecaoCaixaReal,
  calcularPatrimonioCompleto,
  filtrarLancamentosAbertos,
  LancamentoCalculo,
  ItemPatrimonioCalculo,
  obterGrupoDRECategoria,
} from './financialCalculations'

describe('Aritmética e Cálculos Financeiros em Centavos', () => {
  describe('roundCents & roundPercent', () => {
    it('evita resíduos clássicos de ponto flutuante do JavaScript (ex: 0.1 + 0.2)', () => {
      const somaFloat = 0.1 + 0.2
      expect(somaFloat).not.toBe(0.3) // IEEE 754: 0.30000000000000004
      expect(roundCents(somaFloat)).toBe(0.3)
    })

    it('arredonda centavos com exatidão em operações repetidas', () => {
      expect(roundCents(10.055)).toBe(10.06)
      expect(roundCents(10.054)).toBe(10.05)
      const total = [19.99, 5.49, 12.33, 0.01].reduce((a, b) => roundCents(a + b), 0)
      expect(total).toBe(37.82)
    })
  })

  describe('DRE: Correções Críticas (Prejuízo sem clamp, Estorno redutor, Competência)', () => {
    it('NÃO esconde prejuízo com clamp Math.max(0, ...): receita 100 com impostos 300 resulta em -200', () => {
      const lancs: LancamentoCalculo[] = [
        {
          tipo: 'receita',
          categoria: 'Vendas',
          grupo_dre: 'receita_bruta',
          valor: 100,
          status: 'realizado',
        },
        {
          tipo: 'despesa',
          categoria: 'Impostos',
          grupo_dre: 'deducoes_tributos',
          valor: 300,
          status: 'realizado',
        },
      ]

      const dre = calcularDRE(lancs, 'caixa')
      expect(dre.receitaBruta).toBe(100)
      expect(dre.impostosDeducoes).toBe(300)
      expect(dre.receitaLiquida).toBe(-200) // Sem clamp Math.max(0, ...)
    })

    it('Estorno REDUZ o item original em vez de inflar despesa operacional', () => {
      // Venda original: 1.000 receita
      // Estorno: 1.000 com estorno_de preenchido
      const lancs: LancamentoCalculo[] = [
        {
          id: 'venda-1',
          tipo: 'receita',
          categoria: 'Vendas',
          grupo_dre: 'receita_bruta',
          valor: 1000,
          status: 'realizado',
        },
        {
          id: 'estorno-1',
          tipo: 'receita',
          categoria: 'Vendas',
          grupo_dre: 'receita_bruta',
          valor: 1000,
          status: 'realizado',
          estorno_de: 'venda-1',
        },
      ]

      const dre = calcularDRE(lancs, 'caixa')
      // A receita bruta deve ser anulada para 0, e despesas operacionais devem permanecer 0
      expect(dre.receitaBruta).toBe(0)
      expect(dre.totalDespesasFixas).toBe(0)
      expect(dre.resultadoLiquido).toBe(0)
    })

    it('Proteção contra dupla anulação: se original fosse marcado como estornado juntamente com contra-lançamento, causaria distorção; preservando status o resultado é neutro (0)', () => {
      // Cenário com preservação correta (original mantido 'realizado' + contra-lançamento):
      const lancsCorretos: LancamentoCalculo[] = [
        {
          id: 'venda-500',
          tipo: 'receita',
          categoria: 'Vendas',
          grupo_dre: 'receita_bruta',
          valor: 500,
          status: 'realizado', // Mantido realizado
        },
        {
          id: 'estorno-500',
          tipo: 'receita',
          categoria: 'Vendas',
          grupo_dre: 'receita_bruta',
          valor: 500,
          status: 'realizado',
          estorno_de: 'venda-500', // Abate 500
        },
      ]
      const dreCorreta = calcularDRE(lancsCorretos, 'caixa')
      expect(dreCorreta.receitaBruta).toBe(0) // Anulação exata 500 - 500 = 0

      // Demonstração da falha caso o original sofresse mutação para 'estornado':
      const lancsIncorretosComDuplaAnulacao: LancamentoCalculo[] = [
        {
          id: 'venda-500',
          tipo: 'receita',
          categoria: 'Vendas',
          grupo_dre: 'receita_bruta',
          valor: 500,
          status: 'estornado', // Se fosse alterado indevidamente
        },
        {
          id: 'estorno-500',
          tipo: 'receita',
          categoria: 'Vendas',
          grupo_dre: 'receita_bruta',
          valor: 500,
          status: 'realizado',
          estorno_de: 'venda-500',
        },
      ]
      const dreComDuplaAnulacao = calcularDRE(lancsIncorretosComDuplaAnulacao, 'caixa')
      // O original seria ignorado e o contra-lançamento abateria gerando saldo negativo artificial
      expect(dreComDuplaAnulacao.receitaBruta).toBe(-500)
    })

    it('DRE Gerencial opera por competência (inclui títulos previstos e realizados)', () => {
      const lancs: LancamentoCalculo[] = [
        {
          id: 'prev-receber-900',
          tipo: 'receita',
          categoria: 'Serviços',
          grupo_dre: 'receita_bruta',
          valor: 900,
          status: 'previsto', // A receber
        },
        {
          id: 'prev-pagar-300',
          tipo: 'despesa',
          categoria: 'Fornecedores',
          grupo_dre: 'custos_variaveis',
          valor: 300,
          status: 'previsto', // A pagar
        },
      ]

      // Regime de competência inclui previstos
      const dreCompetencia = calcularDRE(lancs, 'competencia')
      expect(dreCompetencia.receitaBruta).toBe(900)
      expect(dreCompetencia.custosFornecedores).toBe(300)
      expect(dreCompetencia.resultadoLiquido).toBe(600)

      // Regime de caixa considera apenas realizados
      const dreCaixa = calcularDRE(lancs, 'caixa')
      expect(dreCaixa.receitaBruta).toBe(0)
      expect(dreCaixa.resultadoLiquido).toBe(0)
    })

    it('Classificação DRE respeita estritamente grupo_dre sem heurísticas de nome', () => {
      const lancs: LancamentoCalculo[] = [
        {
          tipo: 'despesa',
          categoria: 'Serviços Terceirizados Especiais',
          grupo_dre: 'custos_variaveis', // Grupo explícito
          centro_custo: 'Operacional',
          valor: 1500,
          status: 'realizado',
        },
      ]
      const dre = calcularDRE(lancs, 'caixa')
      expect(dre.custosFornecedores).toBe(1500)
    })

    it('Item 4: Compartilhamento de obterGrupoDRECategoria garante resultado idêntico de 6000 no Dashboard e nos Relatórios (receita 10000, impostos 1000, fornecedores 3000, máquina 20000 CAPEX)', () => {
      // Cenário exato especificado na solicitação:
      // receita 10000, impostos 1000 (dedução), fornecedores 3000 (custo), máquina 20000 (CAPEX) = resultado 6000 no Dashboard E nos Relatórios
      const categoriasCadastradas = [
        { nome: 'Vendas de Produtos', grupo_dre: 'receita_bruta' as const, tipo: 'receita' },
        { nome: 'Simples Nacional / ICMS', grupo_dre: 'deducao_receita' as const, tipo: 'despesa' },
        {
          nome: 'Fornecedores de Mercadoria',
          grupo_dre: 'custos_fornecedores' as const,
          tipo: 'despesa',
        },
        {
          nome: 'Máquinas e Equipamentos',
          grupo_dre: 'investimento_capex' as const,
          tipo: 'despesa',
        },
      ]

      const lancamentos = [
        {
          id: '1',
          descricao: 'Venda de Mercadorias',
          tipo: 'receita' as const,
          valor: 10000,
          categoria: 'Vendas de Produtos',
          competencia: '2025-03',
          status: 'realizado' as const,
        },
        {
          id: '2',
          descricao: 'Impostos sobre Vendas',
          tipo: 'despesa' as const,
          valor: 1000,
          categoria: 'Simples Nacional / ICMS',
          competencia: '2025-03',
          status: 'realizado' as const,
        },
        {
          id: '3',
          descricao: 'Fornecedores',
          tipo: 'despesa' as const,
          valor: 3000,
          categoria: 'Fornecedores de Mercadoria',
          competencia: '2025-03',
          status: 'realizado' as const,
        },
        {
          id: '4',
          descricao: 'Aquisição de Máquina',
          tipo: 'despesa' as const,
          valor: 20000,
          categoria: 'Máquinas e Equipamentos',
          competencia: '2025-03',
          status: 'realizado' as const,
        },
      ]

      // Ambos os módulos mapeiam através de obterGrupoDRECategoria
      const lancamentosMapeados = lancamentos.map((l) => ({
        ...l,
        grupo_dre: obterGrupoDRECategoria(l.categoria, categoriasCadastradas, l.tipo),
      }))

      // Execução Relatórios (calcularDRE padrão)
      const dreRelatorios = calcularDRE(lancamentosMapeados)

      // Execução Dashboard (calcularDRE por competência)
      const dreDashboard = calcularDRE(lancamentosMapeados, 'competencia')

      // Verificação detalhada dos blocos da DRE
      expect(dreRelatorios.receitaBruta).toBe(10000)
      expect(dreRelatorios.impostosDeducoes).toBe(1000)
      expect(dreRelatorios.receitaLiquida).toBe(9000)
      expect(dreRelatorios.custosFornecedores).toBe(3000)
      expect(dreRelatorios.margemContribuicao).toBe(6000)
      expect(dreRelatorios.ebitda).toBe(6000)
      expect(dreRelatorios.resultadoLiquido).toBe(6000)
      expect(dreRelatorios.investimentos).toBe(20000)

      // Dashboard
      expect(dreDashboard.receitaBruta).toBe(10000)
      expect(dreDashboard.impostosDeducoes).toBe(1000)
      expect(dreDashboard.receitaLiquida).toBe(9000)
      expect(dreDashboard.custosFornecedores).toBe(3000)
      expect(dreDashboard.margemContribuicao).toBe(6000)
      expect(dreDashboard.ebitda).toBe(6000)
      expect(dreDashboard.resultadoLiquido).toBe(6000)
      expect(dreDashboard.investimentos).toBe(20000)

      // Igualdade absoluta entre Dashboard e Relatórios
      expect(dreDashboard.resultadoLiquido).toBe(dreRelatorios.resultadoLiquido)
      expect(dreDashboard.ebitda).toBe(dreRelatorios.ebitda)
      expect(dreDashboard.investimentos).toBe(dreRelatorios.investimentos)
    })
  })

  describe('Índices de Liquidez (Sem divisor falso de 1 quando passivo for 0)', () => {
    it('retorna não aplicável (null / aplicavel: false) quando não há contas a pagar', () => {
      const indices = calcularIndicesLiquidez(20000, 10000, 0)
      expect(indices.aplicavel).toBe(false)
      expect(indices.liquidezCorrente).toBeNull()
      expect(indices.liquidezImediata).toBeNull()
      expect(indices.liquidezSeca).toBeNull()
    })

    it('calcula liquidez normalmente quando há passivo circulante real', () => {
      // Caixa: 50.000, A Receber: 30.000, A Pagar: 40.000
      const indices = calcularIndicesLiquidez(50000, 30000, 40000, 10000, 0.9)
      expect(indices.aplicavel).toBe(true)
      expect(indices.liquidezCorrente).toBe(2.0)
      expect(indices.liquidezImediata).toBe(1.25)
      expect(indices.liquidezSeca).toBe(1.75)
      expect(indices.liquidezAjustada).toBe(1.93)
    })
  })

  describe('Homologação: Pontos 2, 3 e 5 - Cálculos com Números Reais', () => {
    it('Ponto 2: Venda de 10.000 realizada + estorno = caixa 0 e receita efetiva 0 (estorno vale negativo)', () => {
      const vendaOriginal: LancamentoCalculo = {
        id: 'venda-1',
        tipo: 'receita',
        categoria: 'Vendas',
        valor: 10000,
        status: 'realizado',
      }

      const estornoVenda: LancamentoCalculo = {
        id: 'estorno-venda-1',
        tipo: 'receita',
        categoria: 'Vendas',
        valor: 10000,
        status: 'realizado',
        estorno_de: 'venda-1',
      }

      // 1. Validar função canônica calcularValorEfetivoLancamento
      expect(calcularValorEfetivoLancamento(vendaOriginal)).toBe(10000)
      expect(calcularValorEfetivoLancamento(estornoVenda)).toBe(-10000)

      // 2. Simular soma de receitas realizadas (como no Dashboard: receitasDoMes e caixaAtual)
      const lancamentosRealizados = [vendaOriginal, estornoVenda]
      const totalReceitas = lancamentosRealizados.reduce((acc, l) => {
        return roundCents(acc + calcularValorEfetivoLancamento(l))
      }, 0)

      // Saldo de caixa gerado pelas duas operações deve ser exatamente 0 (não 20.000)
      expect(totalReceitas).toBe(0)

      // 3. Validar no caso de despesa de 5.000 + estorno
      const despesaOriginal: LancamentoCalculo = {
        id: 'desp-1',
        tipo: 'despesa',
        categoria: 'Serviços',
        valor: 5000,
        status: 'realizado',
      }
      const estornoDespesa: LancamentoCalculo = {
        id: 'estorno-desp-1',
        tipo: 'despesa',
        categoria: 'Serviços',
        valor: 5000,
        status: 'realizado',
        estorno_de: 'desp-1',
      }
      expect(calcularValorEfetivoLancamento(despesaOriginal)).toBe(5000)
      expect(calcularValorEfetivoLancamento(estornoDespesa)).toBe(-5000)

      const totalDespesas = [despesaOriginal, estornoDespesa].reduce((acc, l) => {
        return roundCents(acc + calcularValorEfetivoLancamento(l))
      }, 0)
      expect(totalDespesas).toBe(0)

      // 4. Fluxo de caixa com saldo inicial 50.000 + venda 10.000 + estorno 10.000 = 50.000
      let saldoCaixa = 50000
      lancamentosRealizados.forEach((l) => {
        const v = calcularValorEfetivoLancamento(l)
        if (l.tipo === 'receita') saldoCaixa += v
        else saldoCaixa -= v
      })
      expect(saldoCaixa).toBe(50000)
    })

    it('Ponto 3: DRE do Dashboard respeita estritamente a empresa selecionada', () => {
      // Cria lançamentos de duas empresas distintas: Empresa A e Empresa B
      const lancsEmpresaA: LancamentoCalculo[] = [
        {
          id: 'l-a1',
          tipo: 'receita',
          categoria: 'Vendas',
          valor: 50000,
          status: 'realizado',
          empresa_id: 'emp-A',
        },
        {
          id: 'l-a2',
          tipo: 'despesa',
          categoria: 'Fornecedores',
          valor: 20000,
          status: 'realizado',
          empresa_id: 'emp-A',
        },
      ]

      const lancsEmpresaB: LancamentoCalculo[] = [
        {
          id: 'l-b1',
          tipo: 'receita',
          categoria: 'Vendas',
          valor: 800000,
          status: 'realizado',
          empresa_id: 'emp-B',
        },
      ]

      const todosLancamentos = [...lancsEmpresaA, ...lancsEmpresaB]

      // Se calcularDRE usasse todosLancamentos, a receita seria 850.000
      const dreTotalIncorreta = calcularDRE(todosLancamentos)
      expect(dreTotalIncorreta.receitaBruta).toBe(850000)

      // Com filtro por empresa selecionada (empresaSelecionadaId = 'emp-A')
      const empresaSelecionadaId = 'emp-A'
      const lancamentosFiltradosEmpresa = todosLancamentos.filter(
        (l) => l.empresa_id === empresaSelecionadaId,
      )

      const dreEmpresaA = calcularDRE(lancamentosFiltradosEmpresa)
      expect(dreEmpresaA.receitaBruta).toBe(50000)
      expect(dreEmpresaA.custosFornecedores).toBe(20000)
      expect(dreEmpresaA.resultadoLiquido).toBe(30000)
    })

    it('Ponto 5: Contas abertas de meses anteriores permanecem somadas e visíveis', () => {
      const competenciaAtual = '2026-04'

      const contasPagar: LancamentoCalculo[] = [
        // Conta aberta de janeiro/2026 (não liquidada)
        {
          id: 'cp-jan',
          tipo: 'despesa',
          categoria: 'Fornecedores',
          valor: 1500,
          competencia: '2026-01',
          status: 'previsto',
          data_vencimento: '2026-01-20',
        },
        // Conta de fevereiro/2026 já liquidada
        {
          id: 'cp-fev-pago',
          tipo: 'despesa',
          categoria: 'Aluguel',
          valor: 3000,
          competencia: '2026-02',
          status: 'realizado',
        },
        // Conta de março/2026 não liquidada
        {
          id: 'cp-mar',
          tipo: 'despesa',
          categoria: 'Energia',
          valor: 800,
          competencia: '2026-03',
          status: 'previsto',
          data_vencimento: '2026-03-10',
        },
        // Conta da competência atual (abril/2026) prevista
        {
          id: 'cp-abr-prev',
          tipo: 'despesa',
          categoria: 'Serviços',
          valor: 2000,
          competencia: '2026-04',
          status: 'previsto',
          data_vencimento: '2026-04-15',
        },
        // Conta da competência atual (abril/2026) já realizada
        {
          id: 'cp-abr-real',
          tipo: 'despesa',
          categoria: 'Internet',
          valor: 250,
          competencia: '2026-04',
          status: 'realizado',
        },
      ]

      // Simulação da query com filtro:
      // competencia = '2026-04' || (competencia < '2026-04' && (status = 'previsto' || liquidacao_de != ''))
      const carregados = contasPagar.filter(
        (l) =>
          l.tipo === 'despesa' &&
          (l.competencia === competenciaAtual ||
            (l.competencia! < competenciaAtual && (l.status === 'previsto' || !!l.liquidacao_de))),
      )

      // Deve incluir cp-jan (1500), cp-mar (800), cp-abr-prev (2000) e cp-abr-real (250)
      // Não deve incluir cp-fev-pago (passado já realizado sem liquidacao_de)
      expect(carregados.map((c) => c.id)).toEqual([
        'cp-jan',
        'cp-mar',
        'cp-abr-prev',
        'cp-abr-real',
      ])

      // Cálculo dos totais
      let totalPagar = 0
      let totalPrevistoMes = 0
      let totalPagoMes = 0

      carregados.forEach((l) => {
        const v = calcularValorEfetivoLancamento(l)
        const eCompetenciaAtual = l.competencia === competenciaAtual

        if (l.status === 'realizado' && eCompetenciaAtual) {
          totalPagoMes = roundCents(totalPagoMes + v)
        } else if (l.status === 'previsto') {
          totalPagar = roundCents(totalPagar + v)
          if (eCompetenciaAtual) {
            totalPrevistoMes = roundCents(totalPrevistoMes + v)
          }
        }
      })

      // Total a pagar pendente acumula passado + presente: 1500 + 800 + 2000 = 4300
      expect(totalPagar).toBe(4300)
      // Total previsto exclusivamente da competência do mês: 2000
      expect(totalPrevistoMes).toBe(2000)
      // Total pago da competência: 250
      expect(totalPagoMes).toBe(250)
    })

    it('Homologação v0.0.47: conta prevista em setembro e liquidada NÃO aparece como aberta em outubro', () => {
      // Simulação de banco de dados com conta original em setembro e sua liquidação
      const competenciaVisualizada = '2026-10'

      const lancamentosBanco: LancamentoCalculo[] = [
        // Conta prevista em setembro/2026
        {
          id: 'conta-set-01',
          tipo: 'despesa',
          categoria: 'Fornecedores',
          valor: 1200,
          competencia: '2026-09',
          status: 'previsto',
          data_vencimento: '2026-09-15',
        },
        // Liquidação registrada para conta-set-01 (herda competência 2026-09, status realizado, liquidacao_de preenchido)
        {
          id: 'liq-set-01',
          tipo: 'despesa',
          categoria: 'Fornecedores',
          valor: 1200,
          competencia: '2026-09',
          status: 'realizado',
          liquidacao_de: 'conta-set-01',
          data_realizacao: '2026-09-18',
        },
      ]

      // Filtro atualizado da página de Contas a Pagar:
      // (competencia = '2026-10' || (competencia < '2026-10' && (status = 'previsto' || liquidacao_de != '')))
      const carregadosPagar = lancamentosBanco.filter(
        (l) =>
          l.tipo === 'despesa' &&
          (l.competencia === competenciaVisualizada ||
            (l.competencia! < competenciaVisualizada &&
              (l.status === 'previsto' || (l.liquidacao_de && l.liquidacao_de !== '')))),
      )

      // Ambas as linhas são carregadas (o título previsto e a sua liquidação)
      expect(carregadosPagar.map((l) => l.id)).toEqual(['conta-set-01', 'liq-set-01'])

      // Mapeamento de IDs liquidados executado em Contas a Pagar / Receber
      const idsLiquidados = new Set<string>()
      carregadosPagar.forEach((l) => {
        if (l.liquidacao_de && l.status !== 'estornado') {
          idsLiquidados.add(l.liquidacao_de)
        }
      })

      // Cálculo do resumo na página Contas a Pagar
      let totalPagar = 0
      let totalPrevistoMes = 0
      let totalPagoMes = 0

      carregadosPagar.forEach((l) => {
        const v = calcularValorEfetivoLancamento(l)
        const eCompetenciaAtual = l.competencia === competenciaVisualizada

        if (l.status === 'realizado' && eCompetenciaAtual) {
          totalPagoMes = roundCents(totalPagoMes + v)
        } else if (l.status === 'previsto') {
          // Se já foi liquidado por outro lançamento, NÃO conta como pendente
          if (idsLiquidados.has(l.id!)) {
            return
          }
          totalPagar = roundCents(totalPagar + v)
          if (eCompetenciaAtual) {
            totalPrevistoMes = roundCents(totalPrevistoMes + v)
          }
        }
      })

      // Ao olhar outubro: NÃO aparece como aberto (totalPagar deve ser 0)
      expect(totalPagar).toBe(0)
      expect(totalPrevistoMes).toBe(0)
      expect(totalPagoMes).toBe(0)

      // Filtragem da tabela para exibição de itens a pagar ('previsto')
      const itensAbertosTabela = carregadosPagar.filter((l) => {
        const estaLiquidado = idsLiquidados.has(l.id!)
        return l.status === 'previsto' && !estaLiquidado
      })
      expect(itensAbertosTabela.length).toBe(0)

      // E via função central filtrarLancamentosAbertos:
      const abertosViaFuncao = filtrarLancamentosAbertos(carregadosPagar, 'despesa')
      expect(abertosViaFuncao.length).toBe(0)
    })

    it('Homologação v0.0.47: conta prevista em setembro NÃO liquidada APARECE como aberta em outubro', () => {
      const competenciaVisualizada = '2026-10'

      const lancamentosBanco: LancamentoCalculo[] = [
        // Conta prevista em setembro/2026 sem liquidação
        {
          id: 'conta-set-pendente',
          tipo: 'despesa',
          categoria: 'Fornecedores',
          valor: 850.5,
          competencia: '2026-09',
          status: 'previsto',
          data_vencimento: '2026-09-25',
        },
      ]

      const carregadosPagar = lancamentosBanco.filter(
        (l) =>
          l.tipo === 'despesa' &&
          (l.competencia === competenciaVisualizada ||
            (l.competencia! < competenciaVisualizada &&
              (l.status === 'previsto' || (l.liquidacao_de && l.liquidacao_de !== '')))),
      )

      expect(carregadosPagar.map((l) => l.id)).toEqual(['conta-set-pendente'])

      const idsLiquidados = new Set<string>()
      carregadosPagar.forEach((l) => {
        if (l.liquidacao_de && l.status !== 'estornado') {
          idsLiquidados.add(l.liquidacao_de)
        }
      })

      let totalPagar = 0
      carregadosPagar.forEach((l) => {
        const v = calcularValorEfetivoLancamento(l)
        if (l.status === 'previsto') {
          if (!idsLiquidados.has(l.id!)) {
            totalPagar = roundCents(totalPagar + v)
          }
        }
      })

      // APARECE como aberta com o valor exato
      expect(totalPagar).toBe(850.5)

      const abertosViaFuncao = filtrarLancamentosAbertos(carregadosPagar, 'despesa')
      expect(abertosViaFuncao.length).toBe(1)
      expect(abertosViaFuncao[0].id).toBe('conta-set-pendente')
    })

    it('Homologação v0.0.47: liquidez dos Relatórios e Dashboard contam os mesmos títulos abertos', () => {
      const baseLancamentos: LancamentoCalculo[] = [
        // Receita prevista de setembro em aberto
        {
          id: 'rec-set-aberta',
          tipo: 'receita',
          categoria: 'Vendas',
          valor: 5000,
          competencia: '2026-09',
          status: 'previsto',
        },
        // Receita prevista de setembro JÁ liquidada
        {
          id: 'rec-set-paga-orig',
          tipo: 'receita',
          categoria: 'Vendas',
          valor: 2000,
          competencia: '2026-09',
          status: 'previsto',
        },
        {
          id: 'rec-set-paga-liq',
          tipo: 'receita',
          categoria: 'Vendas',
          valor: 2000,
          competencia: '2026-09',
          status: 'realizado',
          liquidacao_de: 'rec-set-paga-orig',
        },
        // Despesa prevista de setembro em aberto
        {
          id: 'desp-set-aberta',
          tipo: 'despesa',
          categoria: 'Serviços',
          valor: 1500,
          competencia: '2026-09',
          status: 'previsto',
        },
        // Despesa prevista de setembro JÁ liquidada
        {
          id: 'desp-set-paga-orig',
          tipo: 'despesa',
          categoria: 'Aluguel',
          valor: 3500,
          competencia: '2026-09',
          status: 'previsto',
        },
        {
          id: 'desp-set-paga-liq',
          tipo: 'despesa',
          categoria: 'Aluguel',
          valor: 3500,
          competencia: '2026-09',
          status: 'realizado',
          liquidacao_de: 'desp-set-paga-orig',
        },
      ]

      // 1. Regra do Dashboard
      const receitasAbertasDashboard = filtrarLancamentosAbertos(baseLancamentos, 'receita')
      const despesasAbertasDashboard = filtrarLancamentosAbertos(baseLancamentos, 'despesa')

      const aReceberTotalDashboard = receitasAbertasDashboard.reduce(
        (acc, l) => roundCents(acc + calcularValorEfetivoLancamento(l)),
        0,
      )
      const dividaTotalDashboard = despesasAbertasDashboard.reduce(
        (acc, l) => roundCents(acc + calcularValorEfetivoLancamento(l)),
        0,
      )

      // 2. Regra atualizada de Relatórios (usando filtrarLancamentosAbertos)
      const receitasAbertasRelatorios = filtrarLancamentosAbertos(baseLancamentos, 'receita')
      const despesasAbertasRelatorios = filtrarLancamentosAbertos(baseLancamentos, 'despesa')

      const contasReceberPendentesRelatorios = roundCents(
        receitasAbertasRelatorios.reduce(
          (a, b) => roundCents(a + calcularValorEfetivoLancamento(b)),
          0,
        ),
      )
      const contasPagarPendentesRelatorios = roundCents(
        despesasAbertasRelatorios.reduce(
          (a, b) => roundCents(a + calcularValorEfetivoLancamento(b)),
          0,
        ),
      )

      // Devem ser absolutamente IDÊNTICOS em contagem e valor
      expect(receitasAbertasDashboard.length).toBe(receitasAbertasRelatorios.length)
      expect(despesasAbertasDashboard.length).toBe(despesasAbertasRelatorios.length)
      expect(receitasAbertasDashboard.map((l) => l.id)).toEqual(
        receitasAbertasRelatorios.map((l) => l.id),
      )
      expect(despesasAbertasDashboard.map((l) => l.id)).toEqual(
        despesasAbertasRelatorios.map((l) => l.id),
      )

      expect(aReceberTotalDashboard).toBe(5000)
      expect(contasReceberPendentesRelatorios).toBe(5000)

      expect(dividaTotalDashboard).toBe(1500)
      expect(contasPagarPendentesRelatorios).toBe(1500)

      // Verificação dos índices de liquidez calculados
      const caixa = 10000
      const indicesDashboard = calcularIndicesLiquidez(
        caixa,
        aReceberTotalDashboard,
        dividaTotalDashboard,
      )
      const indicesRelatorios = calcularIndicesLiquidez(
        caixa,
        contasReceberPendentesRelatorios,
        contasPagarPendentesRelatorios,
      )

      expect(indicesDashboard.liquidezCorrente).toBe(indicesRelatorios.liquidezCorrente)
      expect(indicesDashboard.liquidezImediata).toBe(indicesRelatorios.liquidezImediata)
      expect(indicesDashboard.liquidezSeca).toBe(indicesRelatorios.liquidezSeca)
    })
  })

  describe('ROI, Aging e Projeções Financeiras', () => {
    it('calcula percentual de ROI positivo e exato', () => {
      const roi = calcularROI(50000, 200000)
      expect(roi.roiPercentual).toBe(25.0)
      expect(roi.roiAbsoluto).toBe(50000)
    })

    it('retorna 0 de ROI percentual sem investimentos para evitar divisão por zero', () => {
      const roi = calcularROI(10000, 0)
      expect(roi.roiPercentual).toBe(0)
      expect(roi.roiAbsoluto).toBe(10000)
    })

    it('distribui títulos previstos no aging de recebimento por vencimento', () => {
      const dataBase = new Date('2025-06-15T12:00:00Z')
      const lancs: LancamentoCalculo[] = [
        {
          tipo: 'receita',
          categoria: 'Vendas',
          valor: 10000,
          status: 'previsto',
          data_vencimento: '2025-06-20T00:00:00Z', // a vencer
        },
        {
          tipo: 'receita',
          categoria: 'Serviços',
          valor: 2000,
          status: 'previsto',
          data_vencimento: '2025-06-05T00:00:00Z', // 1 a 30 dias de atraso
        },
      ]
      const aging = calcularAging(lancs, 'receita', dataBase)
      expect(aging.aVencer).toBe(10000)
      expect(aging.ate30).toBe(2000)
      expect(aging.total).toBe(12000)
    })

    it('projeta fluxo de caixa real considerando saldo inicial e vencimentos', () => {
      const dataRef = new Date('2025-06-01T00:00:00Z')
      const lancs: LancamentoCalculo[] = [
        {
          tipo: 'receita',
          categoria: 'Serviços',
          valor: 10000,
          status: 'previsto',
          data_vencimento: '2025-06-01T00:00:00Z',
        },
        {
          tipo: 'despesa',
          categoria: 'Aluguel',
          valor: 4000,
          status: 'previsto',
          data_vencimento: '2025-06-01T00:00:00Z',
        },
      ]
      const proj = calcularProjecaoCaixaReal(50000, lancs, dataRef)
      expect(proj.itens[0].saldoProjetado).toBe(56000)
    })

    it('calcula balanço patrimonial completo', () => {
      const itensPatrimonio: ItemPatrimonioCalculo[] = [
        { tipo: 'ativo', categoria: 'Imóveis', valor: 300000 },
        { tipo: 'passivo', categoria: 'Financiamentos', valor: 100000 },
      ]
      const balanco = calcularPatrimonioCompleto(20000, 10000, 5000, itensPatrimonio)
      // Ativos: 20k + 10k + 300k = 330k
      // Passivos: 5k + 100k = 105k
      // Patrimônio Líquido: 330k - 105k = 225k
      expect(balanco.patrimonioLiquidoEmpresarial).toBe(225000)
    })
  })
})
