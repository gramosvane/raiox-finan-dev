import { describe, it, expect, beforeEach, vi } from 'vitest'
import pb from '@/lib/pocketbase/client'
import {
  verifyMasterPassword,
  setMasterPasswordServer,
  getMasterPasswordStatus,
  getAuditoriaRegistros,
  editarLancamentoControlado,
  estornarLancamento,
  setSessionAuditToken,
} from '@/services/financial'
import { gerarBackupCompleto, validarBackupJson, restaurarBackup } from '@/services/dataControl'

describe('Suíte de Segurança, Senha Mestra, Auditoria e Controle de Dados', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setSessionAuditToken(null)
  })

  describe('Senha Mestra Corporativa (Backend & Endpoints)', () => {
    it('retorna status configurado da senha mestra', async () => {
      vi.spyOn(pb, 'send').mockResolvedValueOnce({ success: true, configurada: true })
      const status = await getMasterPasswordStatus()
      expect(status.configurada).toBe(true)
    })

    it('autoriza com senha mestra correta e gera token com expiração', async () => {
      vi.spyOn(pb, 'send').mockResolvedValueOnce({
        success: true,
        authorized: true,
        auditToken: 'mock-jwt-token-12345',
        message: 'Senha mestra validada com sucesso.',
      })

      const res = await verifyMasterPassword('MasterKey@2026')
      expect(res.authorized).toBe(true)
      expect(res.token).toBe('mock-jwt-token-12345')
    })

    it('rejeita senha mestra incorreta e registra aviso', async () => {
      vi.spyOn(pb, 'send').mockRejectedValueOnce({
        data: { message: 'Senha mestra incorreta. Tentativa 1 de 5.' },
      })

      const res = await verifyMasterPassword('SenhaErrada')
      expect(res.authorized).toBe(false)
      expect(res.message).toContain('incorreta')
    })

    it('rejeita e bloqueia após limite de tentativas excedido (brute-force lock)', async () => {
      vi.spyOn(pb, 'send').mockRejectedValueOnce({
        data: { message: 'Muitas tentativas incorretas. Bloqueio ativo por mais 15 minuto(s).' },
      })

      const res = await verifyMasterPassword('Tentativa6')
      expect(res.authorized).toBe(false)
      expect(res.message).toContain('Bloqueio ativo')
    })

    it('permite redefinir a senha mestra validando a atual', async () => {
      vi.spyOn(pb, 'send').mockResolvedValueOnce({
        success: true,
        message: 'Senha mestra corporativa definida com sucesso!',
      })

      const res = await setMasterPasswordServer('MasterKey@2026', 'NovaMasterKey@2027')
      expect(res.success).toBe(true)
    })
  })

  describe('Auditoria Blindada Server-Side e Restauração', () => {
    it('impede leitura de auditoria sem token de senha mestra', async () => {
      setSessionAuditToken(null)
      await expect(getAuditoriaRegistros()).rejects.toThrow(/Acesso à auditoria bloqueado/)
    })

    it('permite leitura de auditoria quando token válido é fornecido', async () => {
      vi.spyOn(pb, 'send').mockResolvedValueOnce({
        success: true,
        items: [
          {
            id: 'audit-1',
            usuario_id: 'user-admin',
            acao: 'criacao_lancamento',
            descricao: 'Lançamento de teste',
            created: '2026-10-05T12:00:00Z',
            updated: '2026-10-05T12:00:00Z',
          },
        ],
      })

      const itens = await getAuditoriaRegistros('token-valido')
      expect(itens.length).toBe(1)
      expect(itens[0].acao).toBe('criacao_lancamento')
    })

    it('aborta geração de backup sem token de auditoria', async () => {
      await expect(gerarBackupCompleto()).rejects.toThrow(/Geração de backup abortada/)
    })
  })

  describe('Edição Controlada de Lançamento (ANTES/DEPOIS e Motivo Obrigatório)', () => {
    it('envia motivo e dados para o endpoint de edição controlada', async () => {
      const mockRetorno = {
        success: true,
        lancamento: {
          id: 'lanc-100',
          descricao: 'Honorários Atualizados',
          valor: 5000,
        } as any,
        message: 'Lançamento atualizado e auditado com sucesso.',
      }

      vi.spyOn(pb, 'send').mockResolvedValueOnce(mockRetorno)

      const res = await editarLancamentoControlado('lanc-100', {
        descricao: 'Honorários Atualizados',
        valor: 5000,
        motivo: 'Reajuste contratual aprovado pela diretoria',
      })

      expect(res.success).toBe(true)
      expect(res.lancamento.descricao).toBe('Honorários Atualizados')
    })

    it('estorno preserva tipo original e referencia estorno_de', async () => {
      const lancOriginal = {
        id: 'orig-1',
        tipo: 'receita',
        descricao: 'Venda de Software',
        categoria: 'Vendas',
        valor: 1200,
        competencia: '2026-10',
        status: 'realizado',
      } as any

      const mockCreate = vi.fn().mockResolvedValue({
        id: 'estorno-99',
        tipo: 'receita', // Mesmo tipo para abater na DRE
        descricao: '[ESTORNO] Venda de Software - Ref: orig-1 (Cancelamento)',
        estorno_de: 'orig-1',
      })

      vi.spyOn(pb, 'collection').mockReturnValue({
        create: mockCreate,
      } as any)

      const estorno = await estornarLancamento(lancOriginal, 'Cancelamento')
      expect(estorno.tipo).toBe('receita')
      expect(estorno.estorno_de).toBe('orig-1')
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: 'receita',
          estorno_de: 'orig-1',
        }),
      )
    })

    it('estorno NÃO altera status do lançamento original para estornado (evita dupla anulação na DRE)', async () => {
      // Regra contábil crítica:
      // O lançamento original DEVE manter seu status 'realizado' (ou 'previsto')
      // porque o contra-lançamento com estorno_de já abate o valor na DRE.
      // Se o original também virasse 'estornado', a DRE o ignoraria E subtrairia o estorno,
      // gerando anulação dupla (-1000 em vez de 0).
      const mockUpdate = vi.fn()
      vi.spyOn(pb, 'collection').mockReturnValue({
        create: vi.fn().mockResolvedValue({
          id: 'estorno-10',
          tipo: 'receita',
          valor: 1000,
          estorno_de: 'orig-10',
          status: 'realizado',
        }),
        update: mockUpdate,
      } as any)

      const lancOriginal = {
        id: 'orig-10',
        tipo: 'receita',
        descricao: 'Venda de Consultoria',
        categoria: 'Vendas',
        valor: 1000,
        competencia: '2026-10',
        status: 'realizado',
      } as any

      await estornarLancamento(lancOriginal, 'Cancelamento do cliente')
      // Garante que pb.collection('lancamentos').update NÃO foi chamado para alterar o original para 'estornado'
      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })

  describe('Backup e Restauração de Dados com Identificadores Originais', () => {
    it('valida estrutura completa do backup JSON', () => {
      const backupValido = {
        versao: 2,
        geradoEm: new Date().toISOString(),
        colecoes: {
          empresas: [],
          contas: [],
          categorias: [],
          centros_custo: [],
          lancamentos: [],
          patrimonio: [],
          auditoria: [],
          configuracoes: [],
        },
      }
      const validacao = validarBackupJson(backupValido)
      expect(validacao.valido).toBe(true)
    })

    it('rejeita backup se faltarem coleções essenciais', () => {
      const backupInvalido = {
        versao: 2,
        colecoes: {
          empresas: [],
        },
      }
      const validacao = validarBackupJson(backupInvalido)
      expect(validacao.valido).toBe(false)
      expect(validacao.erro).toContain('faltam as coleções essenciais')
    })
  })
})
