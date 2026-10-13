/**
 * Controle de Sessão Segura por Inatividade (SEC-01)
 *
 * Regras:
 * - Tempo limite único: 30 minutos (TEMPO_INATIVIDADE_MINUTOS = 30)
 * - Eventos rastreados: clique, tecla, rolagem, toque, movimento do mouse
 * - Throttling na atualização de atividade para evitar sobrecarga
 * - Compartilhamento via localStorage entre abas e janelas do mesmo navegador
 * - Sincronização via BroadcastChannel e evento 'storage' para logout simultâneo
 * - Encerramento limpa pb.authStore.clear() e localStorage de atividade
 * - Mensagem padronizada: "Sessão encerrada por inatividade. Entre novamente."
 */

export const TEMPO_INATIVIDADE_MINUTOS = 30
export const TEMPO_INATIVIDADE_MS = TEMPO_INATIVIDADE_MINUTOS * 60 * 1000

export const STORAGE_KEY_ULTIMA_ATIVIDADE = 'gfe_ultima_atividade'
export const STORAGE_KEY_MOTIVO_ENCERRAMENTO = 'gfe_motivo_encerramento'
export const MENSAGEM_INATIVIDADE = 'Sessão encerrada por inatividade. Entre novamente.'

export const BROADCAST_CHANNEL_NAME = 'gfe_auth_sync'

// Tipos de mensagem de sincronização entre abas
export type AuthBroadcastMessage =
  | { type: 'LOGOUT'; reason: 'inatividade' | 'usuario' }
  | { type: 'LOGIN'; timestamp: number }
  | { type: 'ACTIVITY'; timestamp: number }

let broadcastChannelInstance: BroadcastChannel | null = null

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null
  }
  if (!broadcastChannelInstance) {
    try {
      broadcastChannelInstance = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
    } catch {
      broadcastChannelInstance = null
    }
  }
  return broadcastChannelInstance
}

/**
 * Lê o timestamp da última atividade gravada no localStorage
 */
export function obterUltimaAtividade(): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ULTIMA_ATIVIDADE)
    if (!raw) return 0
    const ts = parseInt(raw, 10)
    return isNaN(ts) ? 0 : ts
  } catch {
    return 0
  }
}

/**
 * Grava o timestamp da última atividade e propaga para outras abas
 */
export function registrarAtividade(agora: number = Date.now()): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_ULTIMA_ATIVIDADE, String(agora))
  } catch {
    // quota ou modo restrito
  }

  const channel = getBroadcastChannel()
  if (channel) {
    try {
      channel.postMessage({ type: 'ACTIVITY', timestamp: agora } satisfies AuthBroadcastMessage)
    } catch {
      // canal indisponível
    }
  }
}

/**
 * Verifica se a sessão expirou por inatividade
 * Retorna true se a última atividade foi há mais de TEMPO_INATIVIDADE_MS
 */
export function sessaoExpiradaPorInatividade(
  agora: number = Date.now(),
  limiteMs: number = TEMPO_INATIVIDADE_MS,
): boolean {
  const ultima = obterUltimaAtividade()
  if (!ultima) {
    // Sem registro anterior de atividade: não expirada por inatividade se for uma sessão nova,
    // mas se já estiver autenticado e sem timestamp, tratamos defensivamente.
    return false
  }
  return agora - ultima > limiteMs
}

/**
 * Limpa a marca de atividade do armazenamento
 */
export function limparRegistroAtividade(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY_ULTIMA_ATIVIDADE)
  } catch {
    // ignora
  }
}

/**
 * Define a mensagem/motivo de encerramento da sessão para a tela de login
 */
export function definirMotivoEncerramento(mensagem: string): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY_MOTIVO_ENCERRAMENTO, mensagem)
  } catch {
    // fallback se sessionStorage falhar
    try {
      localStorage.setItem(STORAGE_KEY_MOTIVO_ENCERRAMENTO, mensagem)
    } catch {
      /* intentionally ignored */
    }
  }
}

/**
 * Consome e limpa o motivo de encerramento armazenado
 */
export function consumirMotivoEncerramento(): string | null {
  if (typeof window === 'undefined') return null
  try {
    let msg = sessionStorage.getItem(STORAGE_KEY_MOTIVO_ENCERRAMENTO)
    if (msg) {
      sessionStorage.removeItem(STORAGE_KEY_MOTIVO_ENCERRAMENTO)
      return msg
    }
    msg = localStorage.getItem(STORAGE_KEY_MOTIVO_ENCERRAMENTO)
    if (msg) {
      localStorage.removeItem(STORAGE_KEY_MOTIVO_ENCERRAMENTO)
      return msg
    }
    return null
  } catch {
    return null
  }
}

/**
 * Emite evento de encerramento de sessão para as outras abas/janelas
 */
export function emitirEncerramentoMultiAbas(motivo: 'inatividade' | 'usuario'): void {
  const channel = getBroadcastChannel()
  if (channel) {
    try {
      channel.postMessage({ type: 'LOGOUT', reason: motivo } satisfies AuthBroadcastMessage)
    } catch {
      /* intentionally ignored */
    }
  }

  // Fallback via localStorage para navegadores que não suportam BroadcastChannel
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(
        'gfe_auth_logout_event',
        JSON.stringify({ motivo, timestamp: Date.now() }),
      )
    } catch {
      /* intentionally ignored */
    }
  }
}

/**
 * Emite evento de login bem-sucedido para sincronização
 */
export function emitirLoginMultiAbas(agora: number = Date.now()): void {
  registrarAtividade(agora)
  const channel = getBroadcastChannel()
  if (channel) {
    try {
      channel.postMessage({ type: 'LOGIN', timestamp: agora } satisfies AuthBroadcastMessage)
    } catch {
      /* intentionally ignored */
    }
  }
}
