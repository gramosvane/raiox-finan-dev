export type TipoLancamento = 'receita' | 'despesa'
export type StatusLancamento = 'realizado' | 'previsto' | 'estornado'
export type TipoConta = 'caixa' | 'banco' | 'cartao'

export interface User {
  id: string
  email: string
  name?: string
  avatar?: string
  role?: 'administrador' | 'operador' | 'leitura'
  created: string
  updated: string
}

export interface Empresa {
  id: string
  nome: string
  cnpj?: string
  padrao?: boolean
  usuario_id: string
  created: string
  updated: string
}

export type TipoPatrimonio = 'ativo' | 'passivo'

export interface ItemPatrimonio {
  id: string
  tipo: TipoPatrimonio
  categoria: string
  descricao: string
  valor: number
  data_referencia?: string | null
  empresa_id?: string | null
  usuario_id: string
  created: string
  updated: string
  expand?: {
    usuario_id?: User
    empresa_id?: Empresa
  }
}

export interface Lancamento {
  id: string
  tipo: TipoLancamento
  descricao: string
  categoria: string
  categoria_id?: string | null
  departamento?: string
  centro_custo?: string // mantido como fallback defensivo para compatibilidade
  conta?: string
  valor: number
  competencia: string // AAAA-MM
  data_lancamento: string
  data_vencimento?: string | null
  data_realizacao?: string | null
  status: StatusLancamento
  observacoes?: string
  usuario_id: string
  estorno_de?: string | null
  liquidacao_de?: string | null
  empresa_id?: string | null
  created: string
  updated: string
  expand?: {
    usuario_id?: User
    categoria_id?: Categoria
    estorno_de?: Lancamento
    liquidacao_de?: Lancamento
    empresa_id?: Empresa
  }
}

export interface Conta {
  id: string
  nome: string
  tipo: TipoConta
  saldo_inicial: number
  empresa_id?: string | null
  usuario_id: string
  created: string
  updated: string
  expand?: {
    empresa_id?: Empresa
  }
}

export type GrupoDRE =
  | 'receita_bruta'
  | 'deducoes_tributos'
  | 'custos_variaveis'
  | 'despesas_operacionais'
  | 'investimento_capex'
  | 'receita_financeira'
  | 'despesa_financeira'
  | 'fora_resultado'

export interface Categoria {
  id: string
  nome: string
  tipo: TipoLancamento
  grupo_dre?: GrupoDRE
  ativa?: boolean
  usuario_id: string
  created: string
  updated: string
}
export interface Departamento {
  id: string
  nome: string
  usuario_id: string
  created: string
  updated: string
}

// Alias para compatibilidade defensiva
export type CentroCusto = Departamento

export interface AuditoriaRegistro {
  id: string
  usuario_id: string
  usuario_nome?: string
  natureza?: 'Lançamento' | 'Estorno' | 'Recebimento' | 'Pagamento' | string | null
  acao: string
  descricao: string
  detalhes?: Record<string, any>
  referencia_id?: string
  created: string
  updated: string
  expand?: {
    usuario_id?: User
  }
}

export interface EdicaoLancamentoInput {
  descricao?: string
  valor?: number
  categoria?: string
  categoria_id?: string | null
  departamento?: string
  centro_custo?: string
  conta?: string
  competencia?: string
  data_lancamento?: string
  data_vencimento?: string | null
  data_realizacao?: string | null
  observacoes?: string
  empresa_id?: string | null
  motivo: string
}

export interface Configuracao {
  id: string
  chave: string
  valor: string
  usuario_id: string
  created: string
  updated: string
}
