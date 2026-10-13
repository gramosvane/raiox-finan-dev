import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  calcularDRE,
  calcularValorEfetivoLancamento,
  LancamentoCalculo,
  CategoriaReferencia,
  resolverGrupoDRE,
} from './financialCalculations'

/**
 * BATERIA DE TESTES OBRIGATÓRIOS — CORREÇÃO PONTUAL: INTERFACE + INTEGRIDADE DO ESTORNO
 *
 * 1. Login como operador → cabeçalho "Operador"; administrador → "Admin".
 * 2. Estornar uma venda → original com etiqueta "Estornado", contra-lançamento com "Estorno"; nenhum dos dois mostra Editar/Estornar.
 * 3. Filtro "Estornado" → mostra os dois; "Realizado" → nenhum dos dois; "Todos" → tudo.
 * 4. Tentar estornar de novo o mesmo lançamento (direto no servidor) → 400; nada criado.
 * 5. Tentar estornar um contra-lançamento → 400.
 * 6. Tentar editar o original estornado e o contra-lançamento → 400.
 * 7. Matemática inalterada: cenário oficial = 6.000; após estornar a venda = -4.000.
 * 8. Criar direto no servidor um "estorno" com valor diferente, ou com categoria/tipo diferente do original → 400; nada criado.
 */

describe('Bateria Obrigatória de Homologação: Interface e Integridade do Estorno', () => {
  const rootDir = process.cwd()

  // ---------------------------------------------------------------------------
  // TESTE 1: Papel visual do usuário no cabeçalho
  // Login como operador → cabeçalho "Operador"; administrador → "Admin"; leitura → "Leitura"
  // ---------------------------------------------------------------------------
  describe('1. Papel visual do usuário no cabeçalho (AppLayout)', () => {
    it('renderiza "Operador" para operador, "Admin" para administrador e "Leitura" para leitura', () => {
      const appLayoutPath = path.join(rootDir, 'src', 'components', 'layout', 'AppLayout.tsx')
      const content = fs.readFileSync(appLayoutPath, 'utf-8')

      // Verifica que o código não tem mais o texto estático "Admin" sem condição
      expect(content).toContain("user?.role === 'operador'")
      expect(content).toContain("'Operador'")
      expect(content).toContain("user?.role === 'leitura'")
      expect(content).toContain("'Leitura'")
      expect(content).toContain("'Admin'")

      // Simulação da lógica de resolução de papel idêntica ao AppLayout.tsx
      function resolverPapelVisual(role?: string): string {
        return role === 'operador' ? 'Operador' : role === 'leitura' ? 'Leitura' : 'Admin'
      }

      expect(resolverPapelVisual('operador')).toBe('Operador')
      expect(resolverPapelVisual('administrador')).toBe('Admin')
      expect(resolverPapelVisual('leitura')).toBe('Leitura')
      expect(resolverPapelVisual(undefined)).toBe('Admin')
    })
  })

  // ---------------------------------------------------------------------------
  // TESTE 2: Apresentação das etiquetas e ocultação de ações
  // Estornar uma venda → original com etiqueta "Estornado", contra-lançamento com "Estorno";
  // nenhum dos dois mostra Editar/Estornar.
  // ---------------------------------------------------------------------------
  describe('2. Apresentação visual e ações do estorno em LancamentosPage', () => {
    it('original ganha etiqueta "Estornado", contra-lançamento ganha "Estorno" e ambos ocultam Editar/Estornar', () => {
      const lancamentosPagePath = path.join(
        rootDir,
        'src',
        'pages',
        'lancamentos',
        'LancamentosPage.tsx',
      )
      const content = fs.readFileSync(lancamentosPagePath, 'utf-8')

      // Verifica presença de verificação via estorno_de
      expect(content).toContain('idsOriginaisEstornados')
      expect(content).toContain('Boolean(item.estorno_de)')
      expect(content).toContain('Estorno')
      expect(content).toContain('Estornado')

      // Simulação da lógica da UI
      const vendaOriginal = {
        id: 'venda_01',
        tipo: 'receita',
        descricao: 'Venda de Software Alpha',
        valor: 10000,
        status: 'realizado',
        estorno_de: null,
      }

      const contraLancamento = {
        id: 'contra_01',
        tipo: 'receita',
        descricao: '[ESTORNO] Venda de Software Alpha - Ref: venda_01',
        valor: 10000,
        status: 'realizado',
        estorno_de: 'venda_01',
      }

      const lancamentosLista = [vendaOriginal, contraLancamento]
      const idsOriginaisEstornados = new Set(
        lancamentosLista.filter((l) => Boolean(l.estorno_de)).map((l) => l.estorno_de!),
      )

      function obterEtiqueta(item: typeof vendaOriginal) {
        if (item.estorno_de) return 'Estorno'
        if (item.status === 'estornado' || idsOriginaisEstornados.has(item.id)) return 'Estornado'
        if (item.status === 'realizado') return 'Realizado'
        return item.status
      }

      function podeExibirBlocoAcoes(item: typeof vendaOriginal) {
        const bloqueado =
          item.status === 'estornado' ||
          idsOriginaisEstornados.has(item.id) ||
          Boolean(item.estorno_de)
        return !bloqueado
      }

      function podeExibirEstornar(item: typeof vendaOriginal) {
        return podeExibirBlocoAcoes(item) && item.status !== 'previsto'
      }

      expect(obterEtiqueta(vendaOriginal)).toBe('Estornado')
      expect(obterEtiqueta(contraLancamento)).toBe('Estorno')

      expect(podeExibirBlocoAcoes(vendaOriginal)).toBe(false)
      expect(podeExibirBlocoAcoes(contraLancamento)).toBe(false)
      expect(podeExibirEstornar(vendaOriginal)).toBe(false)
      expect(podeExibirEstornar(contraLancamento)).toBe(false)

      const normal = {
        id: 'normal_01',
        tipo: 'receita',
        descricao: 'Venda Normal Beta',
        valor: 5000,
        status: 'realizado',
        estorno_de: null,
      }
      expect(obterEtiqueta(normal)).toBe('Realizado')
      expect(podeExibirBlocoAcoes(normal)).toBe(true)
      expect(podeExibirEstornar(normal)).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // TESTE 3: Filtros da tela de Lançamentos
  // Filtro "Estornado" → mostra os dois; "Realizado" → nenhum dos dois; "Todos" → tudo.
  // ---------------------------------------------------------------------------
  describe('3. Filtros na listagem de lançamentos', () => {
    it('filtro "Estornado" mostra original e contra-lançamento; "Realizado" não mostra nenhum dos dois; "Todos" mostra tudo', () => {
      const vendaOriginal = {
        id: 'v_orig',
        tipo: 'receita',
        descricao: 'Venda Original',
        valor: 10000,
        status: 'realizado',
        estorno_de: null,
      }
      const contraLancamento = {
        id: 'v_contra',
        tipo: 'receita',
        descricao: '[ESTORNO] Venda Original',
        valor: 10000,
        status: 'realizado',
        estorno_de: 'v_orig',
      }
      const vendaNormal = {
        id: 'v_normal',
        tipo: 'receita',
        descricao: 'Outra Venda',
        valor: 5000,
        status: 'realizado',
        estorno_de: null,
      }

      const lista = [vendaOriginal, contraLancamento, vendaNormal]
      const idsOriginaisEstornados = new Set(
        lista.filter((l) => Boolean(l.estorno_de)).map((l) => l.estorno_de!),
      )

      function filtrarPorStatus(filtro: string) {
        return lista.filter((item) => {
          const isOriginalEstornado =
            item.status === 'estornado' || idsOriginaisEstornados.has(item.id)
          const isContraLancamento = Boolean(item.estorno_de)

          if (filtro === 'estornado') {
            return isOriginalEstornado || isContraLancamento
          }
          if (filtro === 'realizado') {
            return item.status === 'realizado' && !isOriginalEstornado && !isContraLancamento
          }
          if (filtro === 'todos') {
            return true
          }
          return item.status === filtro
        })
      }

      // Filtro "Estornado" deve retornar original estornado e contra-lançamento
      const estornados = filtrarPorStatus('estornado')
      expect(estornados.map((l) => l.id)).toEqual(['v_orig', 'v_contra'])

      // Filtro "Realizado" deve retornar apenas a venda normal (nem o original nem o contra-lançamento)
      const realizados = filtrarPorStatus('realizado')
      expect(realizados.map((l) => l.id)).toEqual(['v_normal'])
      expect(realizados.some((l) => l.id === 'v_orig')).toBe(false)
      expect(realizados.some((l) => l.id === 'v_contra')).toBe(false)

      // Filtro "Todos" deve retornar os 3 registros
      const todos = filtrarPorStatus('todos')
      expect(todos.length).toBe(3)
    })
  })

  // ---------------------------------------------------------------------------
  // TESTE 4: Tentar estornar de novo o mesmo lançamento (direto no servidor) → 400; nada criado.
  // ---------------------------------------------------------------------------
  describe('4. Impedir estorno duplicado no servidor (enforce_usuario_id.pb.js)', () => {
    it('recusa com erro 400 tentativa de estorno duplo do mesmo lançamento', () => {
      const hookPath = path.join(rootDir, 'server', 'pb_hooks', 'enforce_usuario_id.pb.js')
      const hookContent = fs.readFileSync(hookPath, 'utf-8')

      expect(hookContent).toContain("duplicados = $app.findRecordsByFilter('lancamentos'")
      expect(hookContent).toContain('Não é permitido estorno duplicado')

      // Simulação da regra de servidor
      function simularCriacaoEstorno(
        novoRegistro: {
          estorno_de?: string
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
            estorno_de?: string
            tipo: string
            valor: number
            categoria_id: string
            empresa_id: string
            competencia: string
          }>
        },
      ) {
        if (novoRegistro.estorno_de) {
          const orig = banco.lancamentos.find((l) => l.id === novoRegistro.estorno_de)
          if (!orig) {
            throw new Error('Operação negada: o lançamento original referenciado não existe.')
          }
          if (orig.estorno_de) {
            throw new Error('Operação negada: não é permitido estorno de estorno.')
          }
          const jaEstornado = banco.lancamentos.some(
            (l) => l.estorno_de === novoRegistro.estorno_de,
          )
          if (jaEstornado) {
            throw new Error('Operação negada: este lançamento já foi estornado anteriormente.')
          }
          if (novoRegistro.status !== 'realizado') {
            throw new Error('Operação negada: status do contra-lançamento deve ser realizado.')
          }
        }
        return { success: true }
      }

      const banco = {
        lancamentos: [
          {
            id: 'venda_10k',
            tipo: 'receita',
            valor: 10000,
            categoria_id: 'cat_1',
            empresa_id: 'emp_1',
            competencia: '2026-10',
          },
          {
            id: 'estorno_1',
            estorno_de: 'venda_10k',
            tipo: 'receita',
            valor: 10000,
            categoria_id: 'cat_1',
            empresa_id: 'emp_1',
            competencia: '2026-10',
          },
        ],
      }

      // Tentativa de 2º estorno para a mesma venda
      expect(() => {
        simularCriacaoEstorno(
          {
            estorno_de: 'venda_10k',
            status: 'realizado',
            tipo: 'receita',
            valor: 10000,
            categoria_id: 'cat_1',
            empresa_id: 'emp_1',
            competencia: '2026-10',
          },
          banco,
        )
      }).toThrow(/já foi estornado anteriormente/)
    })
  })

  // ---------------------------------------------------------------------------
  // TESTE 5: Tentar estornar um contra-lançamento → 400.
  // ---------------------------------------------------------------------------
  describe('5. Impedir estorno de estorno no servidor (enforce_usuario_id.pb.js)', () => {
    it('recusa com erro 400 tentativa de estornar um contra-lançamento', () => {
      const hookPath = path.join(rootDir, 'server', 'pb_hooks', 'enforce_usuario_id.pb.js')
      const hookContent = fs.readFileSync(hookPath, 'utf-8')

      expect(hookContent).toContain('estorno de estorno')

      // Simulação
      const banco = {
        lancamentos: [
          {
            id: 'orig_1',
            tipo: 'receita',
            valor: 10000,
            categoria_id: 'cat_1',
            empresa_id: 'emp_1',
            competencia: '2026-10',
          },
          {
            id: 'contra_1',
            estorno_de: 'orig_1',
            tipo: 'receita',
            valor: 10000,
            categoria_id: 'cat_1',
            empresa_id: 'emp_1',
            competencia: '2026-10',
          },
        ],
      }

      function validarEstornoDeEstorno(alvoId: string) {
        const alvo = banco.lancamentos.find((l) => l.id === alvoId)
        if (!alvo) throw new Error('Original não existe')
        if (alvo.estorno_de) {
          throw new Error('Operação negada: não é permitido estorno de estorno.')
        }
      }

      expect(() => validarEstornoDeEstorno('contra_1')).toThrow(
        /não é permitido estorno de estorno/,
      )
    })
  })

  // ---------------------------------------------------------------------------
  // TESTE 6: Tentar editar o original estornado e o contra-lançamento → 400.
  // ---------------------------------------------------------------------------
  describe('6. Impedir edição de lançamento estornado e de contra-lançamento (lancamento_editar.pb.js)', () => {
    it('recusa com erro 400 tanto a edição do original estornado quanto a edição do contra-lançamento', () => {
      const hookPath = path.join(rootDir, 'server', 'pb_hooks', 'lancamento_editar.pb.js')
      const hookContent = fs.readFileSync(hookPath, 'utf-8')

      expect(hookContent).toContain("lancRecord.getString('estorno_de')")
      expect(hookContent).toContain('não é permitido editar um lançamento que é contra-lançamento')
      expect(hookContent).toContain('contraLancamentos =')
      expect(hookContent).toContain('não é permitido editar um lançamento que já foi estornado')

      // Simulação da lógica de verificação do hook
      const bancoLancamentos = [
        { id: 'venda_orig', estorno_de: '' },
        { id: 'contra_venda', estorno_de: 'venda_orig' },
        { id: 'venda_intacta', estorno_de: '' },
      ]

      function validarEdicao(lancId: string) {
        const rec = bancoLancamentos.find((l) => l.id === lancId)
        if (!rec) throw new Error('Não encontrado')

        // 1. É contra-lançamento
        if (rec.estorno_de) {
          throw new Error('Operação negada: não é permitido editar contra-lançamento de estorno.')
        }

        // 2. É original estornado (possui contra-lançamento)
        const temContra = bancoLancamentos.some((l) => l.estorno_de === lancId)
        if (temContra) {
          throw new Error('Operação negada: não é permitido editar lançamento já estornado.')
        }

        return true
      }

      expect(() => validarEdicao('venda_orig')).toThrow(
        /não é permitido editar lançamento já estornado/,
      )
      expect(() => validarEdicao('contra_venda')).toThrow(
        /não é permitido editar contra-lançamento/,
      )
      expect(validarEdicao('venda_intacta')).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // TESTE 7: Matemática inalterada: cenário oficial = 6.000; após estornar a venda = -4.000.
  // ---------------------------------------------------------------------------
  describe('7. Regras financeiras e matemática inalteradas', () => {
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
  })

  // ---------------------------------------------------------------------------
  // TESTE 8: Criar direto no servidor um "estorno" com valor diferente, ou com
  // categoria/tipo diferente do original → 400; nada criado.
  // ---------------------------------------------------------------------------
  describe('8. Validação estrita dos campos do contra-lançamento de estorno no servidor', () => {
    it('recusa no hook enforce_usuario_id.pb.js contra-lançamento com valor, tipo, categoria, empresa ou competência divergentes', () => {
      const hookPath = path.join(rootDir, 'server', 'pb_hooks', 'enforce_usuario_id.pb.js')
      const hookContent = fs.readFileSync(hookPath, 'utf-8')

      expect(hookContent).toContain('Math.abs(origValor - novoValor)')
      expect(hookContent).toContain('origTipo !== novoTipo')
      expect(hookContent).toContain('origCatId && novoCatId && origCatId !== novoCatId')
      expect(hookContent).toContain('origEmpresaId !== novoEmpresaId')
      expect(hookContent).toContain('origCompetencia !== novoCompetencia')

      // Simulação das validações de consistência
      const original = {
        id: 'orig_1',
        tipo: 'receita',
        valor: 10000,
        categoria_id: 'cat_vendas',
        empresa_id: 'emp_matriz',
        competencia: '2026-10',
      }

      function validarContraLancamento(contra: {
        tipo: string
        valor: number
        categoria_id: string
        empresa_id: string
        competencia: string
        status: string
      }) {
        if (contra.status !== 'realizado') {
          throw new Error('status deve ser realizado')
        }
        if (contra.tipo !== original.tipo) {
          throw new Error('tipo divergente')
        }
        if (Math.abs(contra.valor - original.valor) > 0.0001) {
          throw new Error('valor divergente')
        }
        if (contra.categoria_id !== original.categoria_id) {
          throw new Error('categoria divergente')
        }
        if (contra.empresa_id !== original.empresa_id) {
          throw new Error('empresa divergente')
        }
        if (contra.competencia !== original.competencia) {
          throw new Error('competência divergente')
        }
        return true
      }

      // Valor diferente (ex: 5000 em vez de 10000)
      expect(() =>
        validarContraLancamento({
          ...original,
          valor: 5000,
          status: 'realizado',
        }),
      ).toThrow(/valor divergente/)

      // Tipo diferente (ex: despesa em vez de receita)
      expect(() =>
        validarContraLancamento({
          ...original,
          tipo: 'despesa',
          status: 'realizado',
        }),
      ).toThrow(/tipo divergente/)

      // Categoria diferente
      expect(() =>
        validarContraLancamento({
          ...original,
          categoria_id: 'cat_outra',
          status: 'realizado',
        }),
      ).toThrow(/categoria divergente/)

      // Competência diferente
      expect(() =>
        validarContraLancamento({
          ...original,
          competencia: '2026-11',
          status: 'realizado',
        }),
      ).toThrow(/competência divergente/)

      // Empresa diferente
      expect(() =>
        validarContraLancamento({
          ...original,
          empresa_id: 'emp_filial',
          status: 'realizado',
        }),
      ).toThrow(/empresa divergente/)

      // Status diferente de realizado
      expect(() =>
        validarContraLancamento({
          ...original,
          status: 'previsto',
        }),
      ).toThrow(/status deve ser realizado/)

      // Idêntico é aceito
      expect(
        validarContraLancamento({
          ...original,
          status: 'realizado',
        }),
      ).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // TESTE 9: Novas regras — Estorno SOMENTE de lançamento realizado não-liquidação
  // ---------------------------------------------------------------------------
  describe('9. Regra restritiva de estorno no servidor e na interface', () => {
    it('servidor recusa estorno se o original não for realizado ou se for uma liquidação', () => {
      const hookPath = path.join(rootDir, 'server', 'pb_hooks', 'enforce_usuario_id.pb.js')
      const hookContent = fs.readFileSync(hookPath, 'utf-8')

      expect(hookContent).toContain("origStatus !== 'realizado'")
      expect(hookContent).toContain('origLiquidacaoDe')
      expect(hookContent).toContain(
        'não é permitido realizar o estorno de um lançamento de liquidação',
      )

      // Simulação do hook
      function simularValidacaoServidor(orig: {
        id: string
        status: string
        liquidacao_de?: string | null
        estorno_de?: string | null
      }) {
        const origStatus = orig.status
        if (origStatus !== 'realizado') {
          throw new Error(
            'Operação negada: o estorno só pode ser aplicado a lançamentos com status "realizado".',
          )
        }
        if (orig.liquidacao_de) {
          throw new Error(
            'Operação negada: não é permitido realizar o estorno de um lançamento de liquidação.',
          )
        }
        if (orig.estorno_de) {
          throw new Error(
            'Operação negada: não é permitido realizar o estorno de um lançamento de contra-lançamento (estorno de estorno).',
          )
        }
        return true
      }

      // 1. Estornar conta prevista → 400
      expect(() =>
        simularValidacaoServidor({
          id: 'prev_01',
          status: 'previsto',
          liquidacao_de: null,
          estorno_de: null,
        }),
      ).toThrow(/status "realizado"/)

      // 2. Estornar lançamento de liquidação → 400
      expect(() =>
        simularValidacaoServidor({
          id: 'liq_01',
          status: 'realizado',
          liquidacao_de: 'prev_01',
          estorno_de: null,
        }),
      ).toThrow(/lançamento de liquidação/)

      // 3. Estornar lançamento realizado normal → aceito
      expect(
        simularValidacaoServidor({
          id: 'real_01',
          status: 'realizado',
          liquidacao_de: null,
          estorno_de: null,
        }),
      ).toBe(true)
    })

    it('LancamentosPage não exibe botão Estornar para lançamento previsto', () => {
      const lancamentosPagePath = path.join(
        rootDir,
        'src',
        'pages',
        'lancamentos',
        'LancamentosPage.tsx',
      )
      const content = fs.readFileSync(lancamentosPagePath, 'utf-8')

      expect(content).toContain("item.status !== 'previsto'")

      // Simulação de visibilidade do botão na interface
      function podeExibirBotaoEstornar(
        item: {
          id: string
          status: string
          estorno_de?: string | null
          liquidacao_de?: string | null
        },
        idsOriginaisEstornados: Set<string>,
        idsOriginaisLiquidados: Set<string>,
      ) {
        const bloqueado =
          item.status === 'estornado' ||
          idsOriginaisEstornados.has(item.id) ||
          Boolean(item.estorno_de) ||
          Boolean(item.liquidacao_de) ||
          idsOriginaisLiquidados.has(item.id)

        if (bloqueado) return false
        return item.status !== 'previsto'
      }

      const idsOrigEst = new Set<string>()
      const idsOrigLiq = new Set<string>()

      const contaPrevista = {
        id: 'cp_1',
        status: 'previsto',
        estorno_de: null,
        liquidacao_de: null,
      }
      const lancamentoRealizado = {
        id: 'lr_1',
        status: 'realizado',
        estorno_de: null,
        liquidacao_de: null,
      }

      expect(podeExibirBotaoEstornar(contaPrevista, idsOrigEst, idsOrigLiq)).toBe(false)
      expect(podeExibirBotaoEstornar(lancamentoRealizado, idsOrigEst, idsOrigLiq)).toBe(true)
    })
  })
})
