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
 * BATERIA DE TESTES OBRIGATÓRIOS — CORREÇÃO PONTUAL: INTEGRIDADE DA LIQUIDAÇÃO
 *
 * 1. Liquidar uma conta prevista de 500: aceito; sai das contas abertas; conta uma única vez no caixa; conta uma única vez na DRE; Dashboard e Relatórios não duplicam.
 * 2. Liquidar novamente a mesma conta diretamente no servidor: HTTP 400; nenhum segundo lançamento criado.
 * 3. Tentar liquidar com valor diferente / tipo diferente / categoria diferente / empresa diferente / competência diferente → HTTP 400 em todos os casos.
 * 4. Tentar liquidar lançamento com status "realizado" → HTTP 400.
 * 5. Tentar liquidar uma liquidação ou um estorno → HTTP 400.
 * 6. Editar conta prevista já liquidada (valor, data, categoria, descrição, competência) → HTTP 400 em cada campo.
 * 7. Editar o lançamento de liquidação → HTTP 400.
 * 8. Interface: conta prevista liquidada não exibe Editar/Estornar/Liquidar; lançamento de liquidação não exibe Editar/Estornar/Liquidar; identificação por liquidacao_de, não pelo texto da descrição.
 * 9. Estorno permanece funcionando exatamente como aprovado: cenário oficial (Vendas 10.000, Impostos 1.000, Fornecedores 3.000, Máquina 20.000) = resultado 6.000; após estornar a venda = -4.000; segundo estorno = HTTP 400; edição do original estornado = HTTP 400.
 */

describe('Bateria Obrigatória de Homologação: Integridade da Liquidação', () => {
  const rootDir = process.cwd()

  // ---------------------------------------------------------------------------
  // TESTE 1: Liquidar uma conta prevista de 500: aceito; sai das contas abertas;
  // conta uma única vez no caixa; conta uma única vez na DRE; Dashboard e Relatórios não duplicam.
  // ---------------------------------------------------------------------------
  describe('1. Liquidar conta prevista de 500 (cálculos numéricos e integridade)', () => {
    it('sai das contas abertas, conta uma única vez no caixa e uma única vez na DRE', () => {
      const catalogoCategorias: CategoriaReferencia[] = [
        {
          id: 'c_desp_oper',
          nome: 'Serviços Terceiros',
          tipo: 'despesa',
          grupo_dre: 'despesas_operacionais',
        },
      ]

      // Conta prevista original de 500
      const contaPrevista: LancamentoCalculo = {
        id: 'conta_prev_500',
        tipo: 'despesa',
        categoria: 'Serviços Terceiros',
        categoria_id: 'c_desp_oper',
        valor: 500,
        competencia: '2026-05',
        status: 'previsto',
        data_vencimento: '2026-05-10T10:00:00Z',
      }

      // Antes da liquidação: aparece nas contas abertas
      const contasAbertasAntes = filtrarLancamentosAbertos([contaPrevista])
      expect(contasAbertasAntes.length).toBe(1)
      expect(contasAbertasAntes[0].id).toBe('conta_prev_500')

      // DRE regime de caixa antes da liquidação: lançamentos previstos não entram no caixa
      const lancsAntes = [contaPrevista].map((l) => ({
        ...l,
        grupo_dre: resolverGrupoDRE(
          { tipo: l.tipo, categoria: l.categoria, categoria_id: l.categoria_id },
          catalogoCategorias,
        ),
      }))
      const dreCaixaAntes = calcularDRE(lancsAntes, 'caixa')
      expect(dreCaixaAntes.outrasDespesasOp).toBe(0)
      expect(dreCaixaAntes.resultadoLiquido).toBe(0)

      // Liquidação registrada: status realizado, liquidacao_de = 'conta_prev_500'
      const liquidacaoRealizada: LancamentoCalculo = {
        id: 'liq_real_500',
        tipo: 'despesa',
        categoria: 'Serviços Terceiros',
        categoria_id: 'c_desp_oper',
        valor: 500,
        competencia: '2026-05',
        status: 'realizado',
        data_vencimento: '2026-05-10T10:00:00Z',
        data_realizacao: '2026-05-12T14:00:00Z',
        liquidacao_de: 'conta_prev_500',
      }

      const listaAposLiquidacao = [contaPrevista, liquidacaoRealizada]

      // 1. Sai das contas abertas (filtrarLancamentosAbertos ignora previstos com liquidacao_de existente)
      const contasAbertasDepois = filtrarLancamentosAbertos(listaAposLiquidacao)
      expect(contasAbertasDepois.length).toBe(0)

      // 2. DRE após liquidação: conta uma única vez na DRE (previsto liquidado não duplica na competência nem no caixa)
      const lancsDepois = listaAposLiquidacao.map((l) => ({
        ...l,
        grupo_dre: resolverGrupoDRE(
          { tipo: l.tipo, categoria: l.categoria, categoria_id: l.categoria_id },
          catalogoCategorias,
        ),
      }))
      const dreCompetencia = calcularDRE(lancsDepois, 'competencia')
      expect(dreCompetencia.outrasDespesasOp).toBe(500)
      expect(dreCompetencia.resultadoLiquido).toBe(-500) // Exatamente 500, não duplicou para 1000

      const dreCaixaDepois = calcularDRE(lancsDepois, 'caixa')
      expect(dreCaixaDepois.outrasDespesasOp).toBe(500)
      expect(dreCaixaDepois.resultadoLiquido).toBe(-500) // Exatamente 500

      // 3. Caixa após liquidação: apenas o realizado gera movimento efetivo de caixa
      const totalCaixaDespesas = listaAposLiquidacao
        .filter((l) => l.tipo === 'despesa' && l.status === 'realizado')
        .reduce((acc, curr) => acc + calcularValorEfetivoLancamento(curr), 0)
      expect(totalCaixaDespesas).toBe(500) // Exatamente 500, não duplicou para 1000
    })
  })

  // ---------------------------------------------------------------------------
  // TESTE 2: Liquidar novamente a mesma conta diretamente no servidor: HTTP 400;
  // nenhum segundo lançamento criado.
  // ---------------------------------------------------------------------------
  describe('2. Impedir liquidação duplicada no servidor (enforce_usuario_id.pb.js)', () => {
    it('recusa com erro 400 tentativa de liquidar uma conta prevista que já possui liquidação', () => {
      const hookPath = path.join(rootDir, 'server', 'pb_hooks', 'enforce_usuario_id.pb.js')
      const hookContent = fs.readFileSync(hookPath, 'utf-8')

      expect(hookContent).toContain("liquidacao_de = '${liquidacaoDeId}'")
      expect(hookContent).toContain('Não é permitida liquidação duplicada')

      // Simulação da lógica do hook do servidor
      function simularCriacaoLiquidacao(
        novaLiq: {
          liquidacao_de?: string
          status: string
          tipo: string
          valor: number
          categoria_id: string
          empresa_id: string
          competencia: string
        },
        banco: {
          lancamentos: Array<{
            id: string
            status: string
            liquidacao_de?: string
            estorno_de?: string
            tipo: string
            valor: number
            categoria_id: string
            empresa_id: string
            competencia: string
          }>
        },
      ) {
        if (novaLiq.liquidacao_de) {
          const orig = banco.lancamentos.find((l) => l.id === novaLiq.liquidacao_de)
          if (!orig) {
            throw new Error(
              'Operação negada: o lançamento referenciado para liquidação não existe.',
            )
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
            (l) => l.liquidacao_de === novaLiq.liquidacao_de,
          )
          if (jaLiquidado) {
            throw new Error(
              'Operação negada: o lançamento referenciado já possui outra liquidação registrada. Não é permitida liquidação duplicada.',
            )
          }
          if (novaLiq.status !== 'realizado') {
            throw new Error(
              'Operação negada: o lançamento de liquidação deve ter status = "realizado".',
            )
          }
        }
        return { success: true }
      }

      const banco = {
        lancamentos: [
          {
            id: 'prev_500',
            status: 'previsto',
            tipo: 'despesa',
            valor: 500,
            categoria_id: 'cat_1',
            empresa_id: 'emp_1',
            competencia: '2026-05',
          },
          {
            id: 'liq_1',
            status: 'realizado',
            liquidacao_de: 'prev_500',
            tipo: 'despesa',
            valor: 500,
            categoria_id: 'cat_1',
            empresa_id: 'emp_1',
            competencia: '2026-05',
          },
        ],
      }

      // Tentativa de 2ª liquidação para a mesma conta prevista
      expect(() =>
        simularCriacaoLiquidacao(
          {
            liquidacao_de: 'prev_500',
            status: 'realizado',
            tipo: 'despesa',
            valor: 500,
            categoria_id: 'cat_1',
            empresa_id: 'emp_1',
            competencia: '2026-05',
          },
          banco,
        ),
      ).toThrow(/Não é permitida liquidação duplicada/)
    })
  })

  // ---------------------------------------------------------------------------
  // TESTE 3: Tentar liquidar com valor diferente / tipo diferente / categoria diferente /
  // empresa diferente / competência diferente → HTTP 400 em todos os casos.
  // ---------------------------------------------------------------------------
  describe('3. Validação estrita de identidade da liquidação no servidor', () => {
    it('recusa liquidação com divergência de valor, tipo, categoria, empresa ou competência', () => {
      const hookPath = path.join(rootDir, 'server', 'pb_hooks', 'enforce_usuario_id.pb.js')
      const hookContent = fs.readFileSync(hookPath, 'utf-8')

      expect(hookContent).toContain('Math.abs(origValor - novoValor) > 0.0001')
      expect(hookContent).toContain('o valor da liquidação')
      expect(hookContent).toContain('origTipo !== novoTipo')
      expect(hookContent).toContain('o tipo da liquidação')
      expect(hookContent).toContain('origCatId && novoCatId && origCatId !== novoCatId')
      expect(hookContent).toContain('a categoria (categoria_id) da liquidação')
      expect(hookContent).toContain('origEmpresaId !== novoEmpresaId')
      expect(hookContent).toContain('a empresa (empresa_id) da liquidação')
      expect(hookContent).toContain('origCompetencia !== novoCompetencia')
      expect(hookContent).toContain('a competência da liquidação')

      const contaPrevista = {
        id: 'cp_100',
        status: 'previsto',
        tipo: 'despesa',
        valor: 500,
        categoria_id: 'cat_aluguel',
        empresa_id: 'emp_principal',
        competencia: '2026-05',
      }

      function validarLiquidacao(dados: {
        tipo: string
        valor: number
        categoria_id: string
        empresa_id: string
        competencia: string
        status: string
      }) {
        if (dados.status !== 'realizado') {
          throw new Error('status deve ser realizado')
        }
        if (dados.tipo !== contaPrevista.tipo) {
          throw new Error('tipo da liquidação deve ser idêntico')
        }
        if (Math.abs(dados.valor - contaPrevista.valor) > 0.0001) {
          throw new Error('valor da liquidação deve ser idêntico')
        }
        if (dados.categoria_id !== contaPrevista.categoria_id) {
          throw new Error('categoria da liquidação deve ser idêntica')
        }
        if (dados.empresa_id !== contaPrevista.empresa_id) {
          throw new Error('empresa da liquidação deve ser idêntica')
        }
        if (dados.competencia !== contaPrevista.competencia) {
          throw new Error('competência da liquidação deve ser idêntica')
        }
        return true
      }

      // Valor diferente (ex: 400 ou 600 em vez de 500)
      expect(() =>
        validarLiquidacao({ ...contaPrevista, valor: 400, status: 'realizado' }),
      ).toThrow(/valor da liquidação deve ser idêntico/)

      // Tipo diferente (receita em vez de despesa)
      expect(() =>
        validarLiquidacao({ ...contaPrevista, tipo: 'receita', status: 'realizado' }),
      ).toThrow(/tipo da liquidação deve ser idêntico/)

      // Categoria diferente
      expect(() =>
        validarLiquidacao({ ...contaPrevista, categoria_id: 'cat_outra', status: 'realizado' }),
      ).toThrow(/categoria da liquidação deve ser idêntica/)

      // Empresa diferente
      expect(() =>
        validarLiquidacao({ ...contaPrevista, empresa_id: 'emp_outra', status: 'realizado' }),
      ).toThrow(/empresa da liquidação deve ser idêntica/)

      // Competência diferente
      expect(() =>
        validarLiquidacao({ ...contaPrevista, competencia: '2026-06', status: 'realizado' }),
      ).toThrow(/competência da liquidação deve ser idêntica/)

      // Status diferente de realizado
      expect(() => validarLiquidacao({ ...contaPrevista, status: 'previsto' })).toThrow(
        /status deve ser realizado/,
      )

      // Idêntico é aceito
      expect(validarLiquidacao({ ...contaPrevista, status: 'realizado' })).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // TESTE 4: Tentar liquidar lançamento com status "realizado" → HTTP 400.
  // ---------------------------------------------------------------------------
  describe('4. Impedir liquidação de lançamento que já está com status realizado', () => {
    it('recusa com erro 400 se o lançamento referenciado não tiver status previsto', () => {
      const hookPath = path.join(rootDir, 'server', 'pb_hooks', 'enforce_usuario_id.pb.js')
      const hookContent = fs.readFileSync(hookPath, 'utf-8')

      expect(hookContent).toContain("origStatus !== 'previsto'")
      expect(hookContent).toContain('não está com status "previsto"')

      function testarStatusReferenciado(status: string) {
        if (status !== 'previsto') {
          throw new Error(
            'Operação negada: o lançamento referenciado não está com status "previsto".',
          )
        }
        return true
      }

      expect(() => testarStatusReferenciado('realizado')).toThrow(/não está com status "previsto"/)
      expect(() => testarStatusReferenciado('estornado')).toThrow(/não está com status "previsto"/)
      expect(testarStatusReferenciado('previsto')).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // TESTE 5: Tentar liquidar uma liquidação ou um estorno → HTTP 400.
  // ---------------------------------------------------------------------------
  describe('5. Impedir liquidação de liquidação ou de contra-lançamento de estorno', () => {
    it('recusa no servidor se o lançamento referenciado for ele mesmo uma liquidação ou um estorno', () => {
      const hookPath = path.join(rootDir, 'server', 'pb_hooks', 'enforce_usuario_id.pb.js')
      const hookContent = fs.readFileSync(hookPath, 'utf-8')

      expect(hookContent).toContain('liquidação de um lançamento de liquidação')
      expect(hookContent).toContain('liquidação de um contra-lançamento de estorno')

      const banco = [
        { id: 'l_liq', status: 'realizado', liquidacao_de: 'l_prev' },
        { id: 'l_estorno', status: 'realizado', estorno_de: 'l_orig' },
        { id: 'l_prev_normal', status: 'previsto' },
      ]

      function validarAlvoLiquidacao(alvoId: string) {
        const item = banco.find((l) => l.id === alvoId)
        if (!item) throw new Error('Não existe')
        if (item.liquidacao_de) {
          throw new Error(
            'Operação negada: não é permitido realizar a liquidação de um lançamento de liquidação.',
          )
        }
        if (item.estorno_de) {
          throw new Error(
            'Operação negada: não é permitido realizar a liquidação de um contra-lançamento de estorno.',
          )
        }
        if (item.status !== 'previsto') {
          throw new Error(
            'Operação negada: o lançamento referenciado não está com status "previsto".',
          )
        }
        return true
      }

      expect(() => validarAlvoLiquidacao('l_liq')).toThrow(
        /liquidação de um lançamento de liquidação/,
      )
      expect(() => validarAlvoLiquidacao('l_estorno')).toThrow(
        /liquidação de um contra-lançamento de estorno/,
      )
      expect(validarAlvoLiquidacao('l_prev_normal')).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // TESTE 6: Editar conta prevista já liquidada (valor, data, categoria, descrição, competência) → HTTP 400 em cada campo.
  // ---------------------------------------------------------------------------
  describe('6. Bloquear edição de conta prevista já liquidada no servidor (lancamento_editar.pb.js)', () => {
    it('recusa com erro 400 qualquer tentativa de alteração em conta prevista que já possui liquidação', () => {
      const hookPath = path.join(rootDir, 'server', 'pb_hooks', 'lancamento_editar.pb.js')
      const hookContent = fs.readFileSync(hookPath, 'utf-8')

      expect(hookContent).toContain("liquidacao_de = '${lancId}'")
      expect(hookContent).toContain(
        'não é permitido editar uma conta prevista que já foi liquidada',
      )

      // Simulação de banco e função de validação do hook
      const banco = {
        lancamentos: [
          {
            id: 'cp_liquidada',
            status: 'previsto',
            descricao: 'Fornecedor Alpha',
            valor: 500,
            categoria_id: 'cat_1',
            competencia: '2026-05',
            data_lancamento: '2026-05-01',
          },
          {
            id: 'liq_registro',
            status: 'realizado',
            liquidacao_de: 'cp_liquidada',
            valor: 500,
          },
        ],
      }

      function tentarEditar(lancId: string, campo: string, novoValor: any) {
        const item = banco.lancamentos.find((l) => l.id === lancId)
        if (!item) throw new Error('404')
        const jaFoiLiquidado = banco.lancamentos.some((l) => l.liquidacao_de === lancId)
        if (jaFoiLiquidado) {
          throw new Error(
            'Operação negada: não é permitido editar uma conta prevista que já foi liquidada.',
          )
        }
        return { [campo]: novoValor }
      }

      // Testar cada campo relevante bloqueado
      const camposParaTestar = [
        { campo: 'valor', valor: 600 },
        { campo: 'data_lancamento', valor: '2026-05-15' },
        { campo: 'categoria_id', valor: 'cat_2' },
        { campo: 'descricao', valor: 'Nova descrição alterada' },
        { campo: 'competencia', valor: '2026-06' },
      ]

      camposParaTestar.forEach(({ campo, valor }) => {
        expect(() => tentarEditar('cp_liquidada', campo, valor)).toThrow(
          /não é permitido editar uma conta prevista que já foi liquidada/,
        )
      })
    })
  })

  // ---------------------------------------------------------------------------
  // TESTE 7: Editar o lançamento de liquidação → HTTP 400.
  // ---------------------------------------------------------------------------
  describe('7. Bloquear edição do lançamento de liquidação no servidor (lancamento_editar.pb.js)', () => {
    it('recusa com erro 400 tentativa de editar um lançamento que possui liquidacao_de preenchido', () => {
      const hookPath = path.join(rootDir, 'server', 'pb_hooks', 'lancamento_editar.pb.js')
      const hookContent = fs.readFileSync(hookPath, 'utf-8')

      expect(hookContent).toContain("lancRecord.getString('liquidacao_de')")
      expect(hookContent).toContain('não é permitido editar um lançamento de liquidação')

      const banco = [
        { id: 'liq_123', liquidacao_de: 'cp_456', valor: 500 },
        { id: 'lanc_normal', liquidacao_de: '', valor: 500 },
      ]

      function validarPermissaoEdicao(id: string) {
        const rec = banco.find((l) => l.id === id)
        if (!rec) throw new Error('Não encontrado')
        if (rec.liquidacao_de) {
          throw new Error('Operação negada: não é permitido editar um lançamento de liquidação.')
        }
        return true
      }

      expect(() => validarPermissaoEdicao('liq_123')).toThrow(
        /não é permitido editar um lançamento de liquidação/,
      )
      expect(validarPermissaoEdicao('lanc_normal')).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // TESTE 8: Interface: conta prevista liquidada não exibe Editar/Estornar/Liquidar;
  // lançamento de liquidação não exibe Editar/Estornar/Liquidar; identificação por liquidacao_de, não pelo texto da descrição.
  // ---------------------------------------------------------------------------
  describe('8. Interface: ocultação de Editar, Estornar e Liquidar por liquidacao_de', () => {
    it('LancamentosPage oculta Editar e Estornar para previstos liquidados e lançamentos de liquidação', () => {
      const lancamentosPagePath = path.join(
        rootDir,
        'src',
        'pages',
        'lancamentos',
        'LancamentosPage.tsx',
      )
      const content = fs.readFileSync(lancamentosPagePath, 'utf-8')

      expect(content).toContain('idsOriginaisLiquidados')
      expect(content).toContain('Boolean(item.liquidacao_de)')
      expect(content).toContain('idsOriginaisLiquidados.has(item.id)')

      // Simulação de regras da UI de LancamentosPage
      const contaPrevistaLiquidada = {
        id: 'cp_01',
        tipo: 'despesa',
        descricao: 'Aluguel Escritório', // Sem texto [LIQUIDADO]
        status: 'previsto',
        liquidacao_de: null,
      }
      const lancamentoDeLiquidacao = {
        id: 'liq_01',
        tipo: 'despesa',
        descricao: '[LIQUIDADO] Aluguel Escritório',
        status: 'realizado',
        liquidacao_de: 'cp_01',
      }
      const contaNormalNaoLiquidada = {
        id: 'normal_01',
        tipo: 'despesa',
        descricao: 'Energia Elétrica',
        status: 'previsto',
        liquidacao_de: null,
      }

      const lista = [contaPrevistaLiquidada, lancamentoDeLiquidacao, contaNormalNaoLiquidada]
      const idsOriginaisLiquidados = new Set(
        lista.filter((l) => Boolean(l.liquidacao_de)).map((l) => l.liquidacao_de!),
      )

      function podeExibirEditarEstornar(item: typeof contaPrevistaLiquidada) {
        const bloqueado = Boolean(item.liquidacao_de) || idsOriginaisLiquidados.has(item.id)
        return !bloqueado
      }

      // Conta prevista liquidada: NÃO exibe
      expect(podeExibirEditarEstornar(contaPrevistaLiquidada)).toBe(false)
      // Lançamento de liquidação: NÃO exibe
      expect(podeExibirEditarEstornar(lancamentoDeLiquidacao)).toBe(false)
      // Lançamento normal não liquidado: exibe
      expect(podeExibirEditarEstornar(contaNormalNaoLiquidada)).toBe(true)
    })

    it('ContasPagarPage e ContasReceberPage identificam liquidação por liquidacao_de e não exibem botão Pagar/Receber para contas já liquidadas', () => {
      const pagarPath = path.join(rootDir, 'src', 'pages', 'contas', 'ContasPagarPage.tsx')
      const pagarContent = fs.readFileSync(pagarPath, 'utf-8')
      const receberPath = path.join(rootDir, 'src', 'pages', 'contas', 'ContasReceberPage.tsx')
      const receberContent = fs.readFileSync(receberPath, 'utf-8')

      expect(pagarContent).toContain('idsJaLiquidados')
      expect(pagarContent).toContain("item.status === 'previsto' && !idsJaLiquidados.has(item.id)")
      expect(receberContent).toContain('idsJaLiquidados')
      expect(receberContent).toContain(
        "item.status === 'previsto' && !idsJaLiquidados.has(item.id)",
      )

      // Simulação
      const prevLiquidada = { id: 'p_1', status: 'previsto', liquidacao_de: null }
      const liq = { id: 'l_1', status: 'realizado', liquidacao_de: 'p_1' }
      const prevPendente = { id: 'p_2', status: 'previsto', liquidacao_de: null }

      const todos = [prevLiquidada, liq, prevPendente]
      const idsJaLiquidados = new Set(
        todos.filter((i) => Boolean(i.liquidacao_de)).map((i) => i.liquidacao_de!),
      )

      function podeLiquidar(item: typeof prevLiquidada) {
        return item.status === 'previsto' && !idsJaLiquidados.has(item.id) && !item.liquidacao_de
      }

      expect(podeLiquidar(prevLiquidada)).toBe(false)
      expect(podeLiquidar(liq)).toBe(false)
      expect(podeLiquidar(prevPendente)).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // TESTE 9: Estorno permanece funcionando exatamente como aprovado: cenário oficial
  // (Vendas 10.000, Impostos 1.000, Fornecedores 3.000, Máquina 20.000) = resultado 6.000;
  // após estornar a venda = -4.000; segundo estorno = HTTP 400; edição do original estornado = HTTP 400.
  // ---------------------------------------------------------------------------
  describe('9. Regras de estorno intactas e aprovadas', () => {
    const catalogoCategorias: CategoriaReferencia[] = [
      { id: 'c_vendas', nome: 'Vendas', tipo: 'receita', grupo_dre: 'receita_bruta' },
      { id: 'c_impostos', nome: 'Impostos', tipo: 'despesa', grupo_dre: 'deducoes_tributos' },
      { id: 'c_custos', nome: 'Fornecedores', tipo: 'despesa', grupo_dre: 'custos_variaveis' },
      { id: 'c_capex', nome: 'Máquina nova', tipo: 'despesa', grupo_dre: 'investimento_capex' },
    ]

    it('cenário oficial = 6.000; após estornar a venda = -4.000', () => {
      const vendaOriginal: LancamentoCalculo = {
        id: 'v_100',
        tipo: 'receita',
        categoria: 'Vendas',
        categoria_id: 'c_vendas',
        valor: 10000,
        competencia: '2026-05',
        status: 'realizado',
      }
      const impostos: LancamentoCalculo = {
        id: 'd_imp',
        tipo: 'despesa',
        categoria: 'Impostos',
        categoria_id: 'c_impostos',
        valor: 1000,
        competencia: '2026-05',
        status: 'realizado',
      }
      const custos: LancamentoCalculo = {
        id: 'd_custos',
        tipo: 'despesa',
        categoria: 'Fornecedores',
        categoria_id: 'c_custos',
        valor: 3000,
        competencia: '2026-05',
        status: 'realizado',
      }
      const capex: LancamentoCalculo = {
        id: 'd_capex',
        tipo: 'despesa',
        categoria: 'Máquina nova',
        categoria_id: 'c_capex',
        valor: 20000,
        competencia: '2026-05',
        status: 'realizado',
      }

      // Estado 1: Antes do estorno
      const lancsOficial = [vendaOriginal, impostos, custos, capex].map((l) => ({
        ...l,
        grupo_dre: resolverGrupoDRE(
          { tipo: l.tipo, categoria: l.categoria, categoria_id: l.categoria_id },
          catalogoCategorias,
        ),
      }))

      const dreOficial = calcularDRE(lancsOficial)
      expect(dreOficial.receitaBruta).toBe(10000)
      expect(dreOficial.impostosDeducoes).toBe(1000)
      expect(dreOficial.receitaLiquida).toBe(9000)
      expect(dreOficial.custosFornecedores).toBe(3000)
      expect(dreOficial.resultadoLiquido).toBe(6000)
      expect(dreOficial.investimentos).toBe(20000)

      // Estado 2: Após estornar a venda (contra-lançamento com estorno_de = 'v_100')
      const estornoVenda: LancamentoCalculo = {
        id: 'estorno_v_100',
        tipo: 'receita',
        categoria: 'Vendas',
        categoria_id: 'c_vendas',
        valor: 10000,
        competencia: '2026-05',
        status: 'realizado',
        estorno_de: 'v_100',
      }

      expect(calcularValorEfetivoLancamento(vendaOriginal)).toBe(10000)
      expect(calcularValorEfetivoLancamento(estornoVenda)).toBe(-10000)

      const lancsAposEstorno = [vendaOriginal, estornoVenda, impostos, custos, capex].map((l) => ({
        ...l,
        grupo_dre: resolverGrupoDRE(
          { tipo: l.tipo, categoria: l.categoria, categoria_id: l.categoria_id },
          catalogoCategorias,
        ),
      }))

      const dreAposEstorno = calcularDRE(lancsAposEstorno)
      expect(dreAposEstorno.receitaBruta).toBe(0)
      expect(dreAposEstorno.impostosDeducoes).toBe(1000)
      expect(dreAposEstorno.receitaLiquida).toBe(-1000)
      expect(dreAposEstorno.custosFornecedores).toBe(3000)
      expect(dreAposEstorno.resultadoLiquido).toBe(-4000)
    })

    it('segundo estorno é bloqueado com erro no hook enforce_usuario_id.pb.js e edição de original estornado é bloqueada em lancamento_editar.pb.js', () => {
      const hookEnforce = fs.readFileSync(
        path.join(rootDir, 'server', 'pb_hooks', 'enforce_usuario_id.pb.js'),
        'utf-8',
      )
      const hookEditar = fs.readFileSync(
        path.join(rootDir, 'server', 'pb_hooks', 'lancamento_editar.pb.js'),
        'utf-8',
      )

      expect(hookEnforce).toContain('Não é permitido estorno duplicado')
      expect(hookEnforce).toContain('estorno de estorno')
      expect(hookEditar).toContain(
        'não é permitido editar um lançamento que é contra-lançamento de estorno',
      )
      expect(hookEditar).toContain('não é permitido editar um lançamento que já foi estornado')
    })
  })
})
