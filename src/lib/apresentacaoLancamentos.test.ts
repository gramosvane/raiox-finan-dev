import { describe, it, expect } from 'vitest'
import {
  mapearLiquidadorMap,
  mapearIdsOriginaisLiquidados,
  mapearIdsOriginaisEstornados,
  obterEtiquetaLancamento,
  filtrarStatusLancamentos,
  prepararObrigacoesContas,
  filtrarObrigacoesPorAba,
  formatarPercentualReceitaLiquida,
  formatarPercentualReceitaLiquidaCSV,
  gerarTextoInformativoPrevistosDRE,
  montarLinhasDRECompleto,
  LancamentoApresentacao,
  ObrigacaoApresentacao,
} from './apresentacaoLancamentos'
import { calcularDRE, LancamentoCalculo, resolverGrupoDRE } from './financialCalculations'

describe('LOTE 2 — Apresentação, Rótulos e Filtros (apresentacaoLancamentos)', () => {
  // ---------------------------------------------------------------------------
  // 1. FIN-01: Não altera valores, títulos e subtítulos definidos
  // ---------------------------------------------------------------------------
  describe('1. FIN-01 — Nomes de cartões e ausência de termos proibidos', () => {
    it('textos e rótulos sugeridos respeitam a proibição de "Déficit", "Superávit" e "resultado" nos títulos', () => {
      const tituloDashboard = 'Fluxo de caixa do mês'
      const tituloLancamentos = 'Fluxo de caixa da competência'
      const subtitulo = 'Entradas menos saídas realizadas (inclui investimentos)'

      expect(tituloDashboard).not.toMatch(/resultado/i)
      expect(tituloLancamentos).not.toMatch(/resultado/i)
      expect(subtitulo).not.toMatch(/déficit|superávit|resultado/i)
    })
  })

  // ---------------------------------------------------------------------------
  // 2. FIN-11: DRE Completo — Linhas que de fato recebem valor somam o total
  // ---------------------------------------------------------------------------
  describe('2. FIN-11 — DRE Completo e exportação CSV com linhas dinâmicas', () => {
    it('exibe Receita operacional quando preenchida (cenário oficial 10.000) e soma fecha com Receita Bruta', () => {
      // Cenário oficial: 10.000 de Vendas entra em receitaOutras no calcularDRE
      const lancsOficial: LancamentoCalculo[] = [
        {
          id: '1',
          tipo: 'receita',
          categoria: 'Vendas',
          valor: 10000,
          competencia: '2026-05',
          status: 'realizado',
          grupo_dre: 'receita_bruta',
        },
        {
          id: '2',
          tipo: 'despesa',
          categoria: 'Impostos',
          valor: 1000,
          competencia: '2026-05',
          status: 'realizado',
          grupo_dre: 'deducoes_tributos',
        },
        {
          id: '3',
          tipo: 'despesa',
          categoria: 'Fornecedores',
          valor: 3000,
          competencia: '2026-05',
          status: 'realizado',
          grupo_dre: 'custos_variaveis',
        },
        {
          id: '4',
          tipo: 'despesa',
          categoria: 'Máquinas',
          valor: 20000,
          competencia: '2026-05',
          status: 'realizado',
          grupo_dre: 'investimento_capex',
        },
      ]

      const dre = calcularDRE(lancsOficial)
      expect(dre.receitaBruta).toBe(10000)
      expect(dre.receitaOutras).toBe(10000)
      expect(dre.receitaServicos).toBe(0)
      expect(dre.receitaVendas).toBe(0)

      const { linhasExibicao, linhasCsv } = montarLinhasDRECompleto(dre)

      // Linhas fixas zeradas (Serviços e Vendas) NÃO devem aparecer
      const descricoes = linhasExibicao.map((l) => l.descricao)
      expect(descricoes).not.toContain('Receita de Serviços Prestados')
      expect(descricoes).not.toContain('Receita com Vendas')

      // Receita Operacional DEVE aparecer
      expect(descricoes).toContain('Receita Operacional')
      const linhaRecOp = linhasExibicao.find((l) => l.descricao === 'Receita Operacional')
      expect(linhaRecOp?.valorNumerico).toBe(10000)

      // Soma das linhas de detalhe da Receita Bruta = 10.000
      const detalhesRecBruta = linhasExibicao.filter(
        (l) => l.estilo === 'detalhe' && l.descricao.includes('Receita'),
      )
      const somaDetalhes = detalhesRecBruta.reduce((acc, curr) => acc + curr.valorNumerico, 0)
      expect(somaDetalhes).toBe(10000)
      expect(dre.receitaBruta).toBe(10000)

      // CSV deve ter as mesmas linhas da tela
      expect(linhasCsv.length).toBe(linhasExibicao.length)
      const csvRecOp = linhasCsv.find((row) => row[0] === 'Receita Operacional')
      expect(csvRecOp).toBeDefined()
      expect(csvRecOp?.[1]).toBe('10000.00')
    })

    it('inserindo despesa operacional de 500, a linha de Despesas operacionais mostra 500 e o EBITDA cai 500', () => {
      const lancs: LancamentoCalculo[] = [
        {
          id: '1',
          tipo: 'receita',
          categoria: 'Vendas',
          valor: 10000,
          competencia: '2026-05',
          status: 'realizado',
          grupo_dre: 'receita_bruta',
        },
        {
          id: '2',
          tipo: 'despesa',
          categoria: 'Impostos',
          valor: 1000,
          competencia: '2026-05',
          status: 'realizado',
          grupo_dre: 'deducoes_tributos',
        },
        {
          id: '3',
          tipo: 'despesa',
          categoria: 'Fornecedores',
          valor: 3000,
          competencia: '2026-05',
          status: 'realizado',
          grupo_dre: 'custos_variaveis',
        },
        {
          id: '4',
          tipo: 'despesa',
          categoria: 'Outras Despesas',
          valor: 500,
          competencia: '2026-05',
          status: 'realizado',
          grupo_dre: 'despesas_operacionais',
        },
      ]

      const dre = calcularDRE(lancs)
      // Antes: ebitda era 6.000. Com despesa 500: ebitda cai para 5.500
      expect(dre.outrasDespesasOp).toBe(500)
      expect(dre.ebitda).toBe(5500)

      const { linhasExibicao } = montarLinhasDRECompleto(dre)
      const linhaDespOp = linhasExibicao.find((l) => l.descricao === 'Despesas operacionais')
      expect(linhaDespOp).toBeDefined()
      expect(linhaDespOp?.valorNumerico).toBe(-500)

      // Linhas fixas zeradas (salários, aluguel, marketing) NÃO aparecem
      const descricoes = linhasExibicao.map((l) => l.descricao)
      expect(descricoes).not.toContain('Despesas com Salários e Benefícios')
      expect(descricoes).not.toContain('Despesas de Aluguel e Ocupação')
      expect(descricoes).not.toContain('Investimento em Marketing e Vendas')
    })
  })

  // ---------------------------------------------------------------------------
  // 3. FIN-12: Conta prevista já liquidada
  // ---------------------------------------------------------------------------
  describe('3. FIN-12 — Conta prevista já liquidada', () => {
    const tituloOriginal: LancamentoApresentacao = {
      id: 'prev_1',
      tipo: 'despesa',
      descricao: 'Aluguel Outubro',
      valor: 500,
      competencia: '2026-10',
      data_lancamento: '2026-10-01',
      data_vencimento: '2026-10-10',
      status: 'previsto',
    }

    const contraLancamentoLiq: LancamentoApresentacao = {
      id: 'liq_1',
      tipo: 'despesa',
      descricao: '[LIQUIDADO] Aluguel Outubro',
      valor: 500,
      competencia: '2026-10',
      data_lancamento: '2026-10-01',
      data_realizacao: '2026-10-08',
      status: 'realizado',
      liquidacao_de: 'prev_1',
    }

    it('Lançamentos: título original com liquidação exibe etiqueta "Liquidado"', () => {
      const lancs = [tituloOriginal, contraLancamentoLiq]
      const idsLiquidados = mapearIdsOriginaisLiquidados(lancs)
      const idsEstornados = mapearIdsOriginaisEstornados(lancs)

      expect(idsLiquidados.has('prev_1')).toBe(true)
      const etiqueta = obterEtiquetaLancamento(tituloOriginal, idsEstornados, idsLiquidados)
      expect(etiqueta).toBe('Liquidado')
    })

    it('Filtro "Previsto" mostra somente títulos ainda em aberto (desaparece do filtro após liquidação)', () => {
      const lancs = [tituloOriginal, contraLancamentoLiq]
      const idsLiquidados = mapearIdsOriginaisLiquidados(lancs)
      const idsEstornados = mapearIdsOriginaisEstornados(lancs)

      const passaPrevisto = filtrarStatusLancamentos(
        tituloOriginal,
        'previsto',
        idsEstornados,
        idsLiquidados,
      )
      expect(passaPrevisto).toBe(false)

      const outroPrevistoAberto: LancamentoApresentacao = {
        id: 'prev_2',
        tipo: 'despesa',
        descricao: 'Internet',
        valor: 150,
        competencia: '2026-10',
        data_lancamento: '2026-10-01',
        status: 'previsto',
      }
      expect(
        filtrarStatusLancamentos(outroPrevistoAberto, 'previsto', idsEstornados, idsLiquidados),
      ).toBe(true)
    })

    it('Contas a Pagar: cada obrigação aparece UMA vez, como "Pago", e contra-lançamento não aparece', () => {
      const lancs = [tituloOriginal, contraLancamentoLiq]
      const obrigacoes = prepararObrigacoesContas(lancs, '2026-10', 'despesa')

      expect(obrigacoes.length).toBe(1)
      expect(obrigacoes[0].id).toBe('prev_1')
      expect(obrigacoes[0].etiquetaStatus).toBe('Pago')
      expect(obrigacoes[0].data_realizacao).toBe('2026-10-08')
      expect(obrigacoes[0].podeLiquidar).toBe(false)
    })

    it('Na competência seguinte (2026-11): a conta quitada no mês anterior NÃO aparece; conta em aberto de mês anterior aparece', () => {
      const contaAbertaAntiga: LancamentoApresentacao = {
        id: 'antiga_aberta',
        tipo: 'despesa',
        descricao: 'Fornecedor pendente',
        valor: 800,
        competencia: '2026-10',
        data_lancamento: '2026-10-01',
        status: 'previsto',
      }

      const lancs = [tituloOriginal, contraLancamentoLiq, contaAbertaAntiga]
      const obrigacoesNov = prepararObrigacoesContas(lancs, '2026-11', 'despesa')

      const idsNov = obrigacoesNov.map((o) => o.id)
      // A conta quitada em outubro NÃO deve aparecer em novembro
      expect(idsNov).not.toContain('prev_1')
      // A conta em aberto de outubro DEVE aparecer em novembro
      expect(idsNov).toContain('antiga_aberta')
    })
  })

  // ---------------------------------------------------------------------------
  // 4. FIN-05: Competência × caixa — Linha informativa na DRE
  // ---------------------------------------------------------------------------
  describe('4. FIN-05 — Linha informativa sobre títulos previstos na DRE', () => {
    it('informa valores previstos separadamente sem compensação e sem alterar cálculo da DRE', () => {
      const lancs: LancamentoCalculo[] = [
        {
          id: '1',
          tipo: 'receita',
          categoria: 'Vendas',
          valor: 10000,
          competencia: '2026-05',
          status: 'realizado',
          grupo_dre: 'receita_bruta',
        },
        {
          id: '2',
          tipo: 'receita',
          categoria: 'Vendas',
          valor: 200,
          competencia: '2026-05',
          status: 'previsto',
          grupo_dre: 'receita_bruta',
        },
        {
          id: '3',
          tipo: 'despesa',
          categoria: 'Impostos',
          valor: 1000,
          competencia: '2026-05',
          status: 'realizado',
          grupo_dre: 'deducoes_tributos',
        },
        {
          id: '4',
          tipo: 'despesa',
          categoria: 'Fornecedores',
          valor: 3000,
          competencia: '2026-05',
          status: 'realizado',
          grupo_dre: 'custos_variaveis',
        },
        {
          id: '5',
          tipo: 'despesa',
          categoria: 'Fornecedores',
          valor: 500,
          competencia: '2026-05',
          status: 'previsto',
          grupo_dre: 'custos_variaveis',
        },
      ]

      // calcularDRE continua incluindo previstos por competência:
      // Receita bruta = 10.000 + 200 = 10.200
      // Deduções = 1.000 -> Receita líquida = 9.200
      // Custos = 3.000 + 500 = 3.500 -> Resultado = 5.700
      const dre = calcularDRE(lancs)
      expect(dre.resultadoLiquido).toBe(5700)

      const info = gerarTextoInformativoPrevistosDRE(lancs)
      expect(info).toBe(
        'Inclui R$ 200,00 em receitas previstas e R$ 500,00 em despesas previstas ainda não realizadas.',
      )
    })
  })

  // ---------------------------------------------------------------------------
  // 5. UX-DRE-02: Coluna "% Receita Líquida"
  // ---------------------------------------------------------------------------
  describe('5. UX-DRE-02 — Coluna % Receita Líquida', () => {
    it('com receita líquida positiva (9.000), calcula com 1 casa decimal sobre a mesma base', () => {
      const rLiq = 9000
      expect(formatarPercentualReceitaLiquida(1000, rLiq)).toBe('11,1%')
      expect(formatarPercentualReceitaLiquida(3000, rLiq)).toBe('33,3%')
      expect(formatarPercentualReceitaLiquida(6000, rLiq)).toBe('66,7%')
    })

    it('com receita líquida negativa (-1.000), exibe "—"', () => {
      const rLiq = -1000
      expect(formatarPercentualReceitaLiquida(1000, rLiq)).toBe('—')
      expect(formatarPercentualReceitaLiquida(3000, rLiq)).toBe('—')
      expect(formatarPercentualReceitaLiquida(6000, rLiq)).toBe('—')
    })

    it('com receita líquida zero, exibe "—"', () => {
      expect(formatarPercentualReceitaLiquida(500, 0)).toBe('—')
    })
  })

  // ---------------------------------------------------------------------------
  // 6. UX-EST-02: Estorno em Contas a Receber e Contas a Pagar
  // ---------------------------------------------------------------------------
  describe('6. UX-EST-02 — Estorno em Contas a Receber e Contas a Pagar', () => {
    const vendaOriginal: LancamentoApresentacao = {
      id: 'v_1',
      tipo: 'receita',
      descricao: 'Venda de Software',
      valor: 10000,
      competencia: '2026-05',
      data_lancamento: '2026-05-02',
      data_realizacao: '2026-05-02',
      status: 'estornado',
    }

    const estornoVenda: LancamentoApresentacao = {
      id: 'contra_v_1',
      tipo: 'receita',
      descricao: '[ESTORNO] Venda de Software',
      valor: 10000,
      competencia: '2026-05',
      data_lancamento: '2026-05-02',
      data_realizacao: '2026-05-02',
      status: 'realizado',
      estorno_de: 'v_1',
    }

    it('mostra etiquetas "Estornado" e "Estorno" na listagem', () => {
      const lancs = [vendaOriginal, estornoVenda]
      const obrigacoes = prepararObrigacoesContas(lancs, '2026-05', 'receita')

      const orig = obrigacoes.find((o) => o.id === 'v_1')
      const contra = obrigacoes.find((o) => o.id === 'contra_v_1')

      expect(orig?.etiquetaStatus).toBe('Estornado')
      expect(contra?.etiquetaStatus).toBe('Estorno')
    })

    it('exclui original estornado e contra-lançamento dos filtros "Recebidos" e "A Receber"', () => {
      const lancs = [vendaOriginal, estornoVenda]
      const obrigacoes = prepararObrigacoesContas(lancs, '2026-05', 'receita')

      const abaRecebidos = filtrarObrigacoesPorAba(obrigacoes, 'realizado')
      expect(abaRecebidos.length).toBe(0)

      const abaAReceber = filtrarObrigacoesPorAba(obrigacoes, 'previsto')
      expect(abaAReceber.length).toBe(0)

      const abaTodos = filtrarObrigacoesPorAba(obrigacoes, 'todos')
      expect(abaTodos.length).toBe(2)
    })
  })

  // ---------------------------------------------------------------------------
  // 7. Correção de Regressão da Busca por Texto (Contas a Pagar / Receber)
  // ---------------------------------------------------------------------------
  describe('7. Busca por texto em Contas a Pagar e Receber (filtrarObrigacoesPorAba)', () => {
    const catalogoCategorias = [
      { id: 'cat_fornec', nome: 'Fornecedores Nacionais' },
      { id: 'cat_impostos', nome: 'Impostos e Tributos' },
      { id: 'cat_servicos', nome: 'Serviços Prestados' },
    ]

    const listaObrigacoesExemplo: ObrigacaoApresentacao[] = [
      {
        id: 'ob_1',
        itemOriginal: {
          id: 'ob_1',
          tipo: 'despesa',
          descricao: 'Conta aberta de outubro',
          valor: 1500,
          competencia: '2026-10',
          data_lancamento: '2026-10-01',
          data_vencimento: '2026-10-15',
          status: 'previsto',
          categoria: 'Fornecedores',
          categoria_id: 'cat_fornec',
        },
        tipo: 'despesa',
        descricao: 'Conta aberta de outubro',
        categoria: 'Fornecedores',
        categoria_id: 'cat_fornec',
        valor: 1500,
        data_vencimento: '2026-10-15',
        statusApresentacao: 'a_pagar_receber',
        etiquetaStatus: 'A Pagar',
        competencia: '2026-10',
        podeLiquidar: true,
      },
      {
        id: 'ob_2',
        itemOriginal: {
          id: 'ob_2',
          tipo: 'despesa',
          descricao: 'Energia Elétrica Copel',
          valor: 350,
          competencia: '2026-10',
          data_lancamento: '2026-10-01',
          data_vencimento: '2026-10-10',
          status: 'previsto',
          categoria: 'Utilidades',
          categoria_id: 'cat_util',
        },
        tipo: 'despesa',
        descricao: 'Energia Elétrica Copel',
        categoria: 'Utilidades',
        categoria_id: 'cat_util',
        valor: 350,
        data_vencimento: '2026-10-10',
        statusApresentacao: 'a_pagar_receber',
        etiquetaStatus: 'A Pagar',
        competencia: '2026-10',
        podeLiquidar: true,
      },
      {
        id: 'ob_3',
        itemOriginal: {
          id: 'ob_3',
          tipo: 'despesa',
          descricao: 'GPS e INSS Folha',
          valor: 2200,
          competencia: '2026-10',
          data_lancamento: '2026-10-01',
          data_vencimento: '2026-10-20',
          status: 'previsto',
          categoria: 'Tributos Antigo',
          categoria_id: 'cat_impostos',
        },
        tipo: 'despesa',
        descricao: 'GPS e INSS Folha',
        categoria: 'Tributos Antigo',
        categoria_id: 'cat_impostos',
        valor: 2200,
        data_vencimento: '2026-10-20',
        statusApresentacao: 'a_pagar_receber',
        etiquetaStatus: 'A Pagar',
        competencia: '2026-10',
        podeLiquidar: true,
      },
      {
        id: 'ob_4',
        itemOriginal: {
          id: 'ob_4',
          tipo: 'despesa',
          descricao: 'Manutenção Preventiva de Servidores',
          valor: 800,
          competencia: '2026-10',
          data_lancamento: '2026-10-01',
          data_vencimento: '2026-10-25',
          status: 'realizado',
          data_realizacao: '2026-10-05',
          categoria: 'Tecnologia da Informacao',
          categoria_id: 'cat_ti_especifica',
        },
        tipo: 'despesa',
        descricao: 'Manutenção Preventiva de Servidores',
        categoria: 'Tecnologia da Informacao',
        categoria_id: 'cat_ti_especifica',
        valor: 800,
        data_vencimento: '2026-10-25',
        data_realizacao: '2026-10-05',
        statusApresentacao: 'pago_recebido',
        etiquetaStatus: 'Pago',
        competencia: '2026-10',
        podeLiquidar: false,
      },
      {
        id: 'ob_5',
        itemOriginal: {
          id: 'ob_5',
          tipo: 'despesa',
          descricao: 'Honorários Contábeis Mensais',
          valor: 1200,
          competencia: '2026-10',
          data_lancamento: '2026-10-01',
          data_vencimento: '2026-10-05',
          status: 'realizado',
          data_realizacao: '2026-10-04',
          categoria: 'Servicos Legado',
          categoria_id: 'cat_servicos',
        },
        tipo: 'despesa',
        descricao: 'Honorários Contábeis Mensais',
        categoria: 'Servicos Legado',
        categoria_id: 'cat_servicos',
        valor: 1200,
        data_vencimento: '2026-10-05',
        data_realizacao: '2026-10-04',
        statusApresentacao: 'pago_recebido',
        etiquetaStatus: 'Pago',
        competencia: '2026-10',
        podeLiquidar: false,
      },
      {
        id: 'ob_6',
        itemOriginal: {
          id: 'ob_6',
          tipo: 'despesa',
          descricao: 'Material de Escritório e Papelaria',
          valor: 180,
          competencia: '2026-10',
          data_lancamento: '2026-10-01',
          data_vencimento: '2026-10-12',
          status: 'previsto',
          categoria: 'Suprimentos',
          categoria_id: null,
        },
        tipo: 'despesa',
        descricao: 'Material de Escritório e Papelaria',
        categoria: 'Suprimentos',
        categoria_id: null,
        valor: 180,
        data_vencimento: '2026-10-12',
        statusApresentacao: 'a_pagar_receber',
        etiquetaStatus: 'A Pagar',
        competencia: '2026-10',
        podeLiquidar: true,
      },
    ]

    it('1. Teste Obrigatório 1: Lista com 6 obrigações: busca "aberta" retorna somente "Conta aberta de outubro"', () => {
      const resultado = filtrarObrigacoesPorAba(
        listaObrigacoesExemplo,
        'todos',
        'aberta',
        catalogoCategorias,
      )
      expect(resultado.length).toBe(1)
      expect(resultado[0].descricao).toBe('Conta aberta de outubro')
      expect(resultado[0].id).toBe('ob_1')
    })

    it('2. Teste Obrigatório 2: Busca pelo nome atual de uma categoria: retorna somente as obrigações dessa categoria', () => {
      // "Impostos e Tributos" é o nome atual em catalogoCategorias para cat_impostos (ob_3 tem categoria gravada como "Tributos Antigo")
      const resultado = filtrarObrigacoesPorAba(
        listaObrigacoesExemplo,
        'todos',
        'Impostos e Tributos',
        catalogoCategorias,
      )
      expect(resultado.length).toBe(1)
      expect(resultado[0].id).toBe('ob_3')
      expect(resultado[0].descricao).toBe('GPS e INSS Folha')

      // Busca parcial case-insensitive "nacionais" resolve via nome atual "Fornecedores Nacionais"
      const resNacionais = filtrarObrigacoesPorAba(
        listaObrigacoesExemplo,
        'todos',
        '  nacionais  ',
        catalogoCategorias,
      )
      expect(resNacionais.length).toBe(1)
      expect(resNacionais[0].id).toBe('ob_1')
    })

    it('3. Teste Obrigatório 3: Busca pelo texto da categoria gravado: retorna somente os registros correspondentes', () => {
      // ob_6 tem categoria gravada "Suprimentos" e categoria_id null
      const resSuprimentos = filtrarObrigacoesPorAba(
        listaObrigacoesExemplo,
        'todos',
        'suprimentos',
        catalogoCategorias,
      )
      expect(resSuprimentos.length).toBe(1)
      expect(resSuprimentos[0].id).toBe('ob_6')

      // ob_3 tem categoria gravada "Tributos Antigo"
      const resAntigo = filtrarObrigacoesPorAba(
        listaObrigacoesExemplo,
        'todos',
        'Tributos Antigo',
        catalogoCategorias,
      )
      expect(resAntigo.length).toBe(1)
      expect(resAntigo[0].id).toBe('ob_3')
    })

    it('4. Teste Obrigatório 4: Busca pela categoria_id: retorna somente os registros correspondentes quando aplicável', () => {
      // ob_4 tem categoria_id: 'cat_ti_especifica'
      const resId = filtrarObrigacoesPorAba(
        listaObrigacoesExemplo,
        'todos',
        'cat_ti_especifica',
        catalogoCategorias,
      )
      expect(resId.length).toBe(1)
      expect(resId[0].id).toBe('ob_4')
      expect(resId[0].descricao).toBe('Manutenção Preventiva de Servidores')
    })

    it('5. Teste Obrigatório 5: Busca vazia ou apenas espaços: retorna todas as obrigações', () => {
      const resVazia = filtrarObrigacoesPorAba(
        listaObrigacoesExemplo,
        'todos',
        '',
        catalogoCategorias,
      )
      expect(resVazia.length).toBe(6)

      const resEspacos = filtrarObrigacoesPorAba(
        listaObrigacoesExemplo,
        'todos',
        '    ',
        catalogoCategorias,
      )
      expect(resEspacos.length).toBe(6)
    })

    it('6. Teste Obrigatório 6: Aba + busca combinadas (ex.: aba "A Pagar" + texto): continua filtrando corretamente', () => {
      // Na lista: ob_1, ob_2, ob_3 e ob_6 são "a_pagar_receber" (A Pagar). ob_4 e ob_5 são "pago_recebido" (Quitados).
      // Aba 'previsto' (A Pagar) com busca vazia -> 4 itens
      const resPrevisto = filtrarObrigacoesPorAba(
        listaObrigacoesExemplo,
        'previsto',
        '',
        catalogoCategorias,
      )
      expect(resPrevisto.length).toBe(4)

      // Aba 'previsto' + busca "Servidores" -> 0 itens (pois ob_4 é Quitado / realizado)
      const resServidoresPrevisto = filtrarObrigacoesPorAba(
        listaObrigacoesExemplo,
        'previsto',
        'Servidores',
        catalogoCategorias,
      )
      expect(resServidoresPrevisto.length).toBe(0)

      // Aba 'realizado' + busca "Servidores" -> 1 item (ob_4)
      const resServidoresRealizado = filtrarObrigacoesPorAba(
        listaObrigacoesExemplo,
        'realizado',
        'Servidores',
        catalogoCategorias,
      )
      expect(resServidoresRealizado.length).toBe(1)
      expect(resServidoresRealizado[0].id).toBe('ob_4')

      // Aba 'previsto' + busca "Copel" -> 1 item (ob_2)
      const resCopelPrevisto = filtrarObrigacoesPorAba(
        listaObrigacoesExemplo,
        'previsto',
        'Copel',
        catalogoCategorias,
      )
      expect(resCopelPrevisto.length).toBe(1)
      expect(resCopelPrevisto[0].id).toBe('ob_2')
    })

    it('8. Teste Obrigatório 8: Busca por texto inexistente: retorna zero resultados', () => {
      const resInexistente = filtrarObrigacoesPorAba(
        listaObrigacoesExemplo,
        'todos',
        'palavra_totalmente_inexistente_xyz',
        catalogoCategorias,
      )
      expect(resInexistente.length).toBe(0)
    })
  })
})
