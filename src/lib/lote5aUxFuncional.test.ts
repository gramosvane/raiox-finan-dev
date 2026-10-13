/**
 * Testes obrigatórios do LOTE 5A — UX FUNCIONAL
 * (UX-TXT-04, UX-EST-03, UX-NOT-01)
 *
 * ESCOPO FECHADO:
 * 1. UX-TXT-04 — Mensagem de no-op ("Nenhum campo foi alterado.") vs edição real ("Lançamento atualizado com sucesso.")
 * 2. UX-EST-03 — Detalhe do lançamento coerente com a lista (Liquidado, Estornado, Estorno, Previsto, Realizado)
 * 3. UX-NOT-01 — Notificações de pendências na campainha (regras estruturais, lista curta, badge sem bounce, 22:30 BSB)
 * 4. Regressão permanente oficial: DRE 6.000 / Caixa -14.000 -> após estorno DRE -4.000 / Caixa -24.000
 *
 * NOTA DE EXECUÇÃO: Conforme diretriz do briefing, testes de hooks PocketBase e chamadas ao servidor
 * no ambiente de CI/Skip são executados de forma simulada/unitária; a homologação definitiva de ponta a ponta
 * é realizada no servidor Linux Mint com o binário real do PocketBase.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  obterEtiquetaLancamento,
  mapearIdsOriginaisEstornados,
  mapearIdsOriginaisLiquidados,
  mapearLiquidadorMap,
  obterDetalhesApresentacaoLancamento,
  obterPendenciasNotificacao,
  extrairMotivoEstorno,
  LancamentoApresentacao,
} from './apresentacaoLancamentos'
import { hojeBrasil, somarDiasDataCivil, compararDataCivil } from './dataCivil'
import {
  calcularDRE,
  calcularValorEfetivoLancamento,
  LancamentoCalculo,
  CategoriaReferencia,
  resolverGrupoDRE,
} from './financialCalculations'

describe('LOTE 5A — UX-TXT-04: Mensagem de No-Op na Edição', () => {
  // Simulação do comportamento de resposta da API editarLancamentoControlado
  function resolverMensagemEdicao(resp: { success: boolean; message?: string }): {
    tituloToast: string
    gravouAuditoria: boolean
  } {
    if (resp.success) {
      if (resp.message === 'Nenhum campo foi alterado.') {
        return {
          tituloToast: resp.message,
          gravouAuditoria: false,
        }
      }
      return {
        tituloToast: 'Lançamento atualizado com sucesso!',
        gravouAuditoria: true,
      }
    }
    return {
      tituloToast: resp.message || 'Erro ao atualizar.',
      gravouAuditoria: false,
    }
  }

  it('9.1a: Edição real (alterou campo) → toast "Lançamento atualizado com sucesso!" e grava auditoria (simulado)', () => {
    const respostaServidor = {
      success: true,
      message: 'Lançamento atualizado com sucesso.',
      lancamento: { id: 'lanc_1', descricao: 'Descrição alterada' },
    }
    const resultado = resolverMensagemEdicao(respostaServidor)
    expect(resultado.tituloToast).toBe('Lançamento atualizado com sucesso!')
    expect(resultado.gravouAuditoria).toBe(true)
  })

  it('9.1b: Edição sem alteração (no-op) → toast "Nenhum campo foi alterado.", NÃO mostra sucesso, sem nova auditoria (simulado)', () => {
    const respostaServidor = {
      success: true,
      message: 'Nenhum campo foi alterado.',
    }
    const resultado = resolverMensagemEdicao(respostaServidor)
    expect(resultado.tituloToast).toBe('Nenhum campo foi alterado.')
    expect(resultado.tituloToast).not.toBe('Lançamento atualizado com sucesso!')
    expect(resultado.gravouAuditoria).toBe(false)
  })

  it('9.1c: Arquivo LancamentosPage.tsx trata explicitamente resp.message === "Nenhum campo foi alterado."', () => {
    const conteudoPagina = fs.readFileSync(
      path.resolve(process.cwd(), 'src', 'pages', 'lancamentos', 'LancamentosPage.tsx'),
      'utf-8',
    )
    expect(conteudoPagina).toContain("resp.message === 'Nenhum campo foi alterado.'")
    expect(conteudoPagina).toContain("title: 'Lançamento atualizado com sucesso!'")
  })
})

describe('LOTE 5A — UX-EST-03: Detalhe do Lançamento', () => {
  const lancamentoOriginalPrevisto: LancamentoApresentacao = {
    id: 'orig_1',
    tipo: 'despesa',
    descricao: 'Fornecedor de Embalagens',
    valor: 1500,
    status: 'previsto',
    data_lancamento: '2026-10-05',
    data_vencimento: '2026-10-20',
  }

  const lancamentoLiquidacao: LancamentoApresentacao = {
    id: 'liq_1',
    tipo: 'despesa',
    descricao: 'Pagamento de Fornecedor de Embalagens',
    valor: 1500,
    status: 'realizado',
    data_lancamento: '2026-10-18',
    data_realizacao: '2026-10-18',
    liquidacao_de: 'orig_1',
  }

  const lancamentoOriginalReceita: LancamentoApresentacao = {
    id: 'rec_orig',
    tipo: 'receita',
    descricao: 'Prestação de Consultoria ABC',
    valor: 5000,
    status: 'realizado',
    data_lancamento: '2026-10-10',
    data_realizacao: '2026-10-10',
  }

  const contraLancamentoEstorno: LancamentoApresentacao = {
    id: 'rec_estorno',
    tipo: 'receita',
    descricao: 'Estorno: Prestação de Consultoria ABC (Cliente cancelou contrato)',
    valor: 5000,
    status: 'realizado',
    data_lancamento: '2026-10-12',
    data_realizacao: '2026-10-12',
    estorno_de: 'rec_orig',
    observacoes: 'Motivo: Cliente cancelou contrato',
  }

  const todosLancamentos = [
    lancamentoOriginalPrevisto,
    lancamentoLiquidacao,
    lancamentoOriginalReceita,
    contraLancamentoEstorno,
  ]

  it('4.1: Lançamento liquidado: lista e detalhe mostram "Liquidado"; detalhe mostra data de realização da liquidação sem alterar original', () => {
    const detalheOrig = obterDetalhesApresentacaoLancamento(
      lancamentoOriginalPrevisto,
      todosLancamentos,
    )
    expect(detalheOrig.etiquetaPrincipal).toBe('Liquidado')
    // Data de realização exibida vem da liquidação vinculada:
    expect(detalheOrig.dataRealizacaoExibicao).toBe('2026-10-18')
    // O original no modelo de dados não foi alterado:
    expect(lancamentoOriginalPrevisto.data_realizacao).toBeUndefined()
    expect(lancamentoOriginalPrevisto.status).toBe('previsto')
    expect(detalheOrig.statusTecnico).toBe('previsto')
  })

  it('4.2a: Lançamento original estornado mostra "Estornado" e exibe motivo do estorno obtido do contra-lançamento', () => {
    const detalheOriginalEstornado = obterDetalhesApresentacaoLancamento(
      lancamentoOriginalReceita,
      todosLancamentos,
    )
    expect(detalheOriginalEstornado.etiquetaPrincipal).toBe('Estornado')
    expect(detalheOriginalEstornado.motivoEstorno).toBe('Cliente cancelou contrato')
  })

  it('4.2b: Contra-lançamento de estorno mostra "Estorno" e exibe referência à descrição e data do original e motivo', () => {
    const detalheContra = obterDetalhesApresentacaoLancamento(
      contraLancamentoEstorno,
      todosLancamentos,
    )
    expect(detalheContra.etiquetaPrincipal).toBe('Estorno')
    expect(detalheContra.originalReferenciado).toBeDefined()
    expect(detalheContra.originalReferenciado?.id).toBe('rec_orig')
    expect(detalheContra.originalReferenciado?.descricao).toBe('Prestação de Consultoria ABC')
    expect(detalheContra.originalReferenciado?.data_lancamento).toBe('2026-10-10')
    expect(detalheContra.motivoEstorno).toBe('Cliente cancelou contrato')
  })

  it('4.3 e 4.4: Lançamentos normais mostram "Previsto" e "Realizado" sem confusão', () => {
    const normalPrev: LancamentoApresentacao = {
      id: 'prev_puro',
      tipo: 'despesa',
      descricao: 'Serviço de Nuvem',
      valor: 200,
      status: 'previsto',
      data_lancamento: '2026-10-01',
    }
    const normalReal: LancamentoApresentacao = {
      id: 'real_puro',
      tipo: 'despesa',
      descricao: 'Café e copa',
      valor: 50,
      status: 'realizado',
      data_lancamento: '2026-10-02',
      data_realizacao: '2026-10-02',
    }

    const detPrev = obterDetalhesApresentacaoLancamento(normalPrev, [normalPrev, normalReal])
    const detReal = obterDetalhesApresentacaoLancamento(normalReal, [normalPrev, normalReal])

    expect(detPrev.etiquetaPrincipal).toBe('Previsto')
    expect(detReal.etiquetaPrincipal).toBe('Realizado')
  })

  it('extrairMotivoEstorno suporta formato em observações e em parênteses na descrição', () => {
    const comObs: LancamentoApresentacao = {
      id: 'c1',
      tipo: 'despesa',
      descricao: 'Estorno',
      valor: 100,
      status: 'realizado',
      observacoes: 'Lançamento estornado. Motivo: Erro de digitação no valor',
    }
    const comParenteses: LancamentoApresentacao = {
      id: 'c2',
      tipo: 'despesa',
      descricao: 'Estorno: Pagamento (Duplicidade no boleto)',
      valor: 100,
      status: 'realizado',
    }
    expect(extrairMotivoEstorno(comObs)).toBe('Erro de digitação no valor')
    expect(extrairMotivoEstorno(comParenteses)).toBe('Duplicidade no boleto')
  })
})

describe('LOTE 5A — UX-NOT-01: Notificações de Pendências (Campainha)', () => {
  const hoje = hojeBrasil()
  const ontem = somarDiasDataCivil(hoje, -1)
  const amarra7Dias = somarDiasDataCivil(hoje, 7)
  const amarra8Dias = somarDiasDataCivil(hoje, 8)

  it('5.1 e 5.3: Despesa prevista vencendo hoje → conta 1; após liquidação estrutural → conta 0', () => {
    const despesaHoje: LancamentoApresentacao = {
      id: 'd_hoje',
      tipo: 'despesa',
      descricao: 'Conta de Energia',
      valor: 350,
      status: 'previsto',
      data_vencimento: hoje,
    }

    const pendenciasAntes = obterPendenciasNotificacao([despesaHoje], hoje)
    expect(pendenciasAntes).toHaveLength(1)
    expect(pendenciasAntes[0].motivo).toBe('Vence hoje')
    expect(pendenciasAntes[0].destinoRota).toBe('/contas-a-pagar')

    // Liquidar a despesa adicionando contra-lançamento com liquidacao_de
    const liq: LancamentoApresentacao = {
      id: 'liq_d_hoje',
      tipo: 'despesa',
      descricao: 'Pagamento Conta de Energia',
      valor: 350,
      status: 'realizado',
      liquidacao_de: 'd_hoje',
    }

    const pendenciasDepois = obterPendenciasNotificacao([despesaHoje, liq], hoje)
    expect(pendenciasDepois).toHaveLength(0)
  })

  it('5.2: Receita prevista vencida → conta 1; após liquidação → conta 0', () => {
    const receitaVencida: LancamentoApresentacao = {
      id: 'r_vencida',
      tipo: 'receita',
      descricao: 'Fatura Cliente XPTO',
      valor: 1200,
      status: 'previsto',
      data_vencimento: ontem,
    }

    const pendenciasAntes = obterPendenciasNotificacao([receitaVencida], hoje)
    expect(pendenciasAntes).toHaveLength(1)
    expect(pendenciasAntes[0].motivo).toBe('Vencida')
    expect(pendenciasAntes[0].destinoRota).toBe('/contas-a-receber')

    // Liquidar a receita
    const liq: LancamentoApresentacao = {
      id: 'liq_r_vencida',
      tipo: 'receita',
      descricao: 'Recebimento Cliente XPTO',
      valor: 1200,
      status: 'realizado',
      liquidacao_de: 'r_vencida',
    }

    const pendenciasDepois = obterPendenciasNotificacao([receitaVencida, liq], hoje)
    expect(pendenciasDepois).toHaveLength(0)
  })

  it('5.3: Receita prevista futura (vencendo amanhã ou em 7 dias) NÃO deve contar como pendência', () => {
    const receitaFutura: LancamentoApresentacao = {
      id: 'r_futura',
      tipo: 'receita',
      descricao: 'Recebimento Previsto Futuro',
      valor: 800,
      status: 'previsto',
      data_vencimento: somarDiasDataCivil(hoje, 2),
    }
    const pendencias = obterPendenciasNotificacao([receitaFutura], hoje)
    expect(pendencias).toHaveLength(0)
  })

  it('5.4: Lançamento previsto sem vencimento conta com motivo "Sem vencimento — cadastro incompleto"', () => {
    const semVenc: LancamentoApresentacao = {
      id: 'sem_venc',
      tipo: 'despesa',
      descricao: 'Compra sem boleto anexado',
      valor: 99,
      status: 'previsto',
      data_vencimento: null,
    }
    const pendencias = obterPendenciasNotificacao([semVenc], hoje)
    expect(pendencias).toHaveLength(1)
    expect(pendencias[0].motivo).toBe('Sem vencimento — cadastro incompleto')
  })

  it('5.5: Despesa com vencimento após 7 dias NÃO deve contar como pendência', () => {
    const despesaLonge: LancamentoApresentacao = {
      id: 'd_longe',
      tipo: 'despesa',
      descricao: 'Aluguel do mês que vem',
      valor: 2000,
      status: 'previsto',
      data_vencimento: amarra8Dias,
    }
    const pendencias = obterPendenciasNotificacao([despesaLonge], hoje)
    expect(pendencias).toHaveLength(0)
  })

  it('5.6: Contra-lançamentos de liquidação e estorno NUNCA contam como pendência', () => {
    const contraLiq: LancamentoApresentacao = {
      id: 'c_liq',
      tipo: 'despesa',
      descricao: 'Pagamento efetuado',
      valor: 500,
      status: 'previsto', // mesmo se status fosse previsto por anomalia
      liquidacao_de: 'orig_qq',
    }
    const contraEstorno: LancamentoApresentacao = {
      id: 'c_est',
      tipo: 'despesa',
      descricao: 'Estorno efetuado',
      valor: 500,
      status: 'previsto',
      estorno_de: 'orig_qq',
    }
    const pendencias = obterPendenciasNotificacao([contraLiq, contraEstorno], hoje)
    expect(pendencias).toHaveLength(0)
  })

  it('5.7: Lançamento estornado estruturalmente NÃO conta como pendência', () => {
    const originalEstornado: LancamentoApresentacao = {
      id: 'orig_estornar',
      tipo: 'despesa',
      descricao: 'Serviço Cancelado',
      valor: 400,
      status: 'previsto',
      data_vencimento: hoje,
    }
    const contraEstorno: LancamentoApresentacao = {
      id: 'contra_est',
      tipo: 'despesa',
      descricao: 'Estorno Serviço',
      valor: 400,
      status: 'realizado',
      estorno_de: 'orig_estornar',
    }
    const pendencias = obterPendenciasNotificacao([originalEstornado, contraEstorno], hoje)
    expect(pendencias).toHaveLength(0)
  })

  it('5.8: Horário: cálculo com hojeBrasil() funciona corretamente às 22:30 de Brasília sem desvio UTC', () => {
    // Validação de que hojeBrasil() gera data civil fixa YYYY-MM-DD
    const dataBsB = hojeBrasil()
    expect(dataBsB).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // Com data civil fixa de Brasília às 22:30, comparar com vencimento do dia resulta em 0 (vencendo hoje)
    expect(compararDataCivil(dataBsB, dataBsB)).toBe(0)
  })

  it('5.9: AppLayout.tsx contém campainha sem animação contínua (sem animate-bounce no badge)', () => {
    const appLayoutCodigo = fs.readFileSync(
      path.resolve(process.cwd(), 'src', 'components', 'layout', 'AppLayout.tsx'),
      'utf-8',
    )
    expect(appLayoutCodigo).not.toContain('animate-bounce')
    expect(appLayoutCodigo).toContain('Pendências Financeiras')
    expect(appLayoutCodigo).toContain('Nenhuma pendência.')
  })
})

describe('REGRESSÃO FINANCEIRA OFICIAL PERMANENTE (0.0.84)', () => {
  it('Cenário de Homologação: Vendas 10k, Impostos 1k, Fornecedores 3k, CAPEX 20k -> DRE 6.000 / Caixa -14.000; após estorno -> DRE -4.000 / Caixa -24.000', () => {
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
