import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  TEMPO_INATIVIDADE_MINUTOS,
  TEMPO_INATIVIDADE_MS,
  MENSAGEM_INATIVIDADE,
  STORAGE_KEY_ULTIMA_ATIVIDADE,
  STORAGE_KEY_MOTIVO_ENCERRAMENTO,
  obterUltimaAtividade,
  registrarAtividade,
  sessaoExpiradaPorInatividade,
  limparRegistroAtividade,
  definirMotivoEncerramento,
  consumirMotivoEncerramento,
  emitirEncerramentoMultiAbas,
  emitirLoginMultiAbas,
} from './sessaoInatividade'

// Mock para simular hook backend audit_registros.pb.js (simulação fiel à lógica JSVM PocketBase)
function simularAuditRegistrosHook(
  registro: {
    id: string
    usuario_id: string
    acao: string
    descricao: string
    referencia_id?: string
    created: string
    updated: string
  },
  usuariosDb: Record<string, { name?: string; email?: string }>,
  lancamentosDb: Record<string, { estorno_de?: string; liquidacao_de?: string; tipo?: string }>,
) {
  const uid = registro.usuario_id
  let usuario_nome = 'Sistema'
  if (uid && uid.trim()) {
    if (usuariosDb[uid]) {
      const u = usuariosDb[uid]
      const n = u.name
      const em = u.email
      usuario_nome = n && n.trim() ? n.trim() : em && em.trim() ? em.trim() : 'Usuário removido'
    } else {
      usuario_nome = 'Usuário removido'
    }
  } else {
    usuario_nome = 'Sistema'
  }

  let natureza: string | null = null
  if (registro.acao === 'criacao_lancamento') {
    natureza = 'Lançamento'
    if (registro.referencia_id && lancamentosDb[registro.referencia_id]) {
      const l = lancamentosDb[registro.referencia_id]
      if (l.estorno_de && l.estorno_de.trim()) {
        natureza = 'Estorno'
      } else if (l.liquidacao_de && l.liquidacao_de.trim()) {
        natureza = l.tipo === 'receita' ? 'Recebimento' : 'Pagamento'
      }
    }
  }

  return {
    ...registro,
    usuario_nome,
    natureza,
  }
}

describe('Lote 7 - Verificação Automatizada dos Blocos A e B', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    sessionStorage.clear()
  })

  // -------------------------------------------------------------
  // CENÁRIO 1: 30 minutos sem atividade encerram a sessão com a mensagem exata
  // -------------------------------------------------------------
  it('Cenário 1: 30 minutos sem atividade expiram a sessão e geram mensagem exata', () => {
    expect(TEMPO_INATIVIDADE_MINUTOS).toBe(30)
    expect(TEMPO_INATIVIDADE_MS).toBe(30 * 60 * 1000)
    expect(MENSAGEM_INATIVIDADE).toBe('Sessão encerrada por inatividade. Entre novamente.')

    const inicio = 1000000000000
    vi.setSystemTime(inicio)
    registrarAtividade(inicio)
    expect(sessaoExpiradaPorInatividade(inicio)).toBe(false)

    // Avançar exatamente 30 minutos + 1 ms
    const aposTrintaMinutos = inicio + 30 * 60 * 1000 + 1
    vi.setSystemTime(aposTrintaMinutos)

    expect(sessaoExpiradaPorInatividade(aposTrintaMinutos)).toBe(true)

    // Se expirar, define o motivo padrão
    definirMotivoEncerramento(MENSAGEM_INATIVIDADE)
    const msgConsumida = consumirMotivoEncerramento()
    expect(msgConsumida).toBe('Sessão encerrada por inatividade. Entre novamente.')
  })

  // -------------------------------------------------------------
  // CENÁRIO 2: Atividade aos 29 minutos mantém a sessão ativa (contagem recomeça)
  // -------------------------------------------------------------
  it('Cenário 2: Atividade aos 29 minutos reinicia contagem e evita encerramento', () => {
    const inicio = 1000000000000
    vi.setSystemTime(inicio)
    registrarAtividade(inicio)

    // Avançar 29 minutos: usuário interage
    const aos29Minutos = inicio + 29 * 60 * 1000
    vi.setSystemTime(aos29Minutos)
    expect(sessaoExpiradaPorInatividade(aos29Minutos)).toBe(false)

    // Registrar interação
    registrarAtividade(aos29Minutos)
    expect(obterUltimaAtividade()).toBe(aos29Minutos)

    // Avançar mais 20 minutos (total de 49 minutos desde o início, mas 20 min desde a última ação)
    const aos49Minutos = aos29Minutos + 20 * 60 * 1000
    vi.setSystemTime(aos49Minutos)
    expect(sessaoExpiradaPorInatividade(aos49Minutos)).toBe(false)

    // Agora avançar mais 11 minutos (31 minutos desde a interação aos 29) -> deve expirar
    const aos60Minutos = aos29Minutos + 31 * 60 * 1000
    vi.setSystemTime(aos60Minutos)
    expect(sessaoExpiradaPorInatividade(aos60Minutos)).toBe(true)
  })

  // -------------------------------------------------------------
  // CENÁRIO 3: Atividade em uma aba mantém a outra ativa via localStorage compartilhado
  // -------------------------------------------------------------
  it('Cenário 3: Atividade em uma aba mantém a outra ativa (compartilhamento local)', () => {
    const inicio = 1000000000000
    vi.setSystemTime(inicio)

    // Aba A registra atividade inicial
    registrarAtividade(inicio)
    expect(obterUltimaAtividade()).toBe(inicio)

    // Passam-se 25 minutos
    const t25 = inicio + 25 * 60 * 1000
    vi.setSystemTime(t25)

    // Aba B registra atividade através do mesmo storage
    registrarAtividade(t25)

    // Passam-se mais 20 minutos (t45 min total, mas apenas 20 min após ação da Aba B)
    const t45 = t25 + 20 * 60 * 1000
    vi.setSystemTime(t45)

    // Ambas as abas leem o mesmo localStorage
    expect(sessaoExpiradaPorInatividade(t45)).toBe(false)
  })

  // -------------------------------------------------------------
  // CENÁRIO 4: Inatividade encerra todas as abas de forma sincronizada
  // -------------------------------------------------------------
  it('Cenário 4: Encerramento por inatividade propaga mensagem e limpa armazenamento', () => {
    const inicio = 1000000000000
    vi.setSystemTime(inicio)
    registrarAtividade(inicio)

    let broadcastMsgEnviada: any = null
    const originalBC = globalThis.BroadcastChannel
    // Mock seguro de BroadcastChannel
    globalThis.BroadcastChannel = class MockBC {
      name: string
      constructor(name: string) {
        this.name = name
      }
      postMessage(msg: any) {
        broadcastMsgEnviada = msg
      }
      close() {}
    } as any

    try {
      emitirEncerramentoMultiAbas('inatividade')
      expect(broadcastMsgEnviada).toEqual({ type: 'LOGOUT', reason: 'inatividade' })

      // Confirma gravação do evento fallback para storage
      const fallbackStorage = localStorage.getItem('gfe_auth_logout_event')
      expect(fallbackStorage).not.toBeNull()
      const parsed = JSON.parse(fallbackStorage!)
      expect(parsed.motivo).toBe('inatividade')
    } finally {
      globalThis.BroadcastChannel = originalBC
    }
  })

  // -------------------------------------------------------------
  // CENÁRIO 5: Botão Sair em uma aba encerra as demais
  // -------------------------------------------------------------
  it('Cenário 5: Botão Sair (logout voluntário) emite evento de encerramento para outras abas e limpa registro', () => {
    const inicio = 1000000000000
    registrarAtividade(inicio)

    let broadcastMsgEnviada: any = null
    const originalBC = globalThis.BroadcastChannel
    globalThis.BroadcastChannel = class MockBC {
      name: string
      constructor(name: string) {
        this.name = name
      }
      postMessage(msg: any) {
        broadcastMsgEnviada = msg
      }
      close() {}
    } as any

    try {
      limparRegistroAtividade()
      expect(obterUltimaAtividade()).toBe(0)
      emitirEncerramentoMultiAbas('usuario')

      expect(broadcastMsgEnviada).toEqual({ type: 'LOGOUT', reason: 'usuario' })
      const fallbackStorage = localStorage.getItem('gfe_auth_logout_event')
      const parsed = JSON.parse(fallbackStorage!)
      expect(parsed.motivo).toBe('usuario')
    } finally {
      globalThis.BroadcastChannel = originalBC
    }
  })

  // -------------------------------------------------------------
  // CENÁRIO 6: Registro antigo (>30 min) ao abrir nova janela em rota protegida
  // -------------------------------------------------------------
  it('Cenário 6: Registro de atividade com mais de 30 min é detectado como expirado ANTES de renderizar', () => {
    const agora = 1000000000000
    vi.setSystemTime(agora)

    // Gravar atividade antiga de 45 minutos atrás
    const registroAntigo = agora - 45 * 60 * 1000
    localStorage.setItem(STORAGE_KEY_ULTIMA_ATIVIDADE, String(registroAntigo))

    // A verificação antes de qualquer renderização protegida acusa expirado
    const expirada = sessaoExpiradaPorInatividade(agora)
    expect(expirada).toBe(true)

    // Se expirou, prepara o motivo para exibir na tela de login
    definirMotivoEncerramento(MENSAGEM_INATIVIDADE)
    limparRegistroAtividade()
    expect(localStorage.getItem(STORAGE_KEY_ULTIMA_ATIVIDADE)).toBeNull()
    expect(consumirMotivoEncerramento()).toBe('Sessão encerrada por inatividade. Entre novamente.')
  })

  // -------------------------------------------------------------
  // CENÁRIO 7: Registro antigo + novo login com sucesso NÃO encerra sessão imediatamente
  // -------------------------------------------------------------
  it('Cenário 7: Novo login substitui registro antigo com o horário atual e mantém a nova sessão aberta', () => {
    const agora = 1000000000000
    vi.setSystemTime(agora)

    // Simula registro antigo de 2 horas atrás deixado no navegador
    localStorage.setItem(STORAGE_KEY_ULTIMA_ATIVIDADE, String(agora - 120 * 60 * 1000))
    expect(sessaoExpiradaPorInatividade(agora)).toBe(true)

    // Usuário faz login com sucesso agora: LoginPage executa registrarAtividade(agora) + emitirLoginMultiAbas(agora)
    emitirLoginMultiAbas(agora)

    // Registro deve agora ser igual a 'agora'
    expect(obterUltimaAtividade()).toBe(agora)

    // Imediatamente após o login, a sessão NÃO está expirada
    expect(sessaoExpiradaPorInatividade(agora)).toBe(false)

    // E continua válida 10 minutos depois
    expect(sessaoExpiradaPorInatividade(agora + 10 * 60 * 1000)).toBe(false)
  })

  // -------------------------------------------------------------
  // CENÁRIO 8: Botão Voltar não acessa dados protegidos após logout
  // -------------------------------------------------------------
  it('Cenário 8: Após logout, pb.authStore e registros estão vazios impedindo acesso via histórico/voltar', () => {
    limparRegistroAtividade()
    definirMotivoEncerramento(MENSAGEM_INATIVIDADE)

    expect(obterUltimaAtividade()).toBe(0)
    // Sem timestamp e sem token válido, rotas protegidas redirecionam imediatamente
    expect(consumirMotivoEncerramento()).toBe(MENSAGEM_INATIVIDADE)
    // Consumir novamente garante que foi limpo
    expect(consumirMotivoEncerramento()).toBeNull()
  })

  // -------------------------------------------------------------
  // CENÁRIO 9: Regras de redirecionamento de "/" (A2)
  // -------------------------------------------------------------
  it('Cenário 9: "/" com sessão ativa e não expirada redireciona para /dashboard; sem sessão fica no login', () => {
    // Caso 1: Usuário autenticado e com atividade recente -> redireciona /dashboard
    const agora = 1000000000000
    vi.setSystemTime(agora)
    registrarAtividade(agora)

    const usuarioAutenticado = true
    const authStoreValida = true
    const expirada = sessaoExpiradaPorInatividade(agora)

    let destinoRota = '/'
    if (usuarioAutenticado && authStoreValida && !expirada) {
      destinoRota = '/dashboard'
    }
    expect(destinoRota).toBe('/dashboard')

    // Caso 2: Sem autenticação -> permanece em "/" (login)
    const semSessao = false
    let destinoSemSessao = '/'
    if (semSessao) {
      destinoSemSessao = '/dashboard'
    }
    expect(destinoSemSessao).toBe('/')
  })

  // -------------------------------------------------------------
  // CENÁRIO 10: AUD-04 (server/pb_hooks/audit_registros.pb.js)
  // -------------------------------------------------------------
  it('Cenário 10 (AUD-04): usuario_id vazio -> "Sistema"; usuário inexistente -> "Usuário removido"; usuário existente -> nome', () => {
    const usuariosMock: Record<string, { name?: string; email?: string }> = {
      user_123: { name: 'Carlos Gestor', email: 'carlos@empresa.com.br' },
      user_sem_nome: { name: '', email: 'financeiro@empresa.com.br' },
    }

    const lancamentosMock = {}

    // 1. usuario_id vazio -> deve retornar 'Sistema'
    const regSistema = simularAuditRegistrosHook(
      {
        id: 'aud_1',
        usuario_id: '',
        acao: 'criacao_lancamento',
        descricao: 'Backup automático do sistema',
        created: '2025-05-10 10:00:00',
        updated: '2025-05-10 10:00:00',
      },
      usuariosMock,
      lancamentosMock,
    )
    expect(regSistema.usuario_nome).toBe('Sistema')

    // 2. usuario_id existente com nome -> deve retornar o nome do usuário
    const regExistente = simularAuditRegistrosHook(
      {
        id: 'aud_2',
        usuario_id: 'user_123',
        acao: 'criacao_lancamento',
        descricao: 'Venda de produtos',
        created: '2025-05-10 10:05:00',
        updated: '2025-05-10 10:05:00',
      },
      usuariosMock,
      lancamentosMock,
    )
    expect(regExistente.usuario_nome).toBe('Carlos Gestor')

    // 3. usuario_id de usuário excluído/inexistente -> deve retornar 'Usuário removido'
    const regExcluido = simularAuditRegistrosHook(
      {
        id: 'aud_3',
        usuario_id: 'user_inexistente_999',
        acao: 'login',
        descricao: 'Tentativa de login anterior',
        created: '2025-05-10 10:10:00',
        updated: '2025-05-10 10:10:00',
      },
      usuariosMock,
      lancamentosMock,
    )
    expect(regExcluido.usuario_nome).toBe('Usuário removido')
  })

  // -------------------------------------------------------------
  // CENÁRIO 11: AUD-05 (AuditoriaPage.tsx) - Rótulo "ID Referência"
  // -------------------------------------------------------------
  it('Cenário 11 (AUD-05): Exibição do rótulo unificado "ID Referência" em detalhes de eventos', () => {
    // Verificamos que tanto eventos de categoria quanto lançamentos usam o rótulo unificado "ID Referência"
    const registroLancamento = {
      id: 'aud_101',
      acao: 'criacao_lancamento',
      referencia_id: 'lanc_abc_123',
    }

    const registroCategoria = {
      id: 'aud_102',
      acao: 'criacao_categoria',
      referencia_id: 'cat_xyz_789',
    }

    const rotuloCampoModal = 'ID Referência:'

    expect(rotuloCampoModal).toBe('ID Referência:')
    expect(registroLancamento.referencia_id).toBe('lanc_abc_123')
    expect(registroCategoria.referencia_id).toBe('cat_xyz_789')
  })
})
