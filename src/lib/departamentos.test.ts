import { describe, it, expect, beforeEach, vi } from 'vitest'
import pb from '@/lib/pocketbase/client'
import {
  getDepartamentos,
  createDepartamento,
  updateDepartamento,
  deleteDepartamento,
  getCentrosCusto,
  createCentroCusto,
  updateCentroCusto,
  deleteCentroCusto,
  createLancamento,
  estornarLancamento,
  registrarRealizacaoLancamento,
  getLancamentos,
} from '@/services/financial'
import {
  validarBackupJson,
  restaurarBackup,
  gerarBackupCompleto,
  BackupData,
} from '@/services/dataControl'
import { setSessionAuditToken } from '@/services/financial'

describe('Suíte de Testes de Departamentos e Compatibilidade Legada', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setSessionAuditToken('test-token')
  })

  describe('1. CRUD e integridade dos serviços de Departamento (com fallback de Centros de Custo)', () => {
    it('getDepartamentos busca da coleção departamentos e retorna lista', async () => {
      const mockDepartamentos = [
        { id: 'dep-1', nome: 'Operacional', usuario_id: 'user-1', created: '', updated: '' },
        { id: 'dep-2', nome: 'Comercial', usuario_id: 'user-1', created: '', updated: '' },
      ]

      const getFullList = vi.fn().mockResolvedValue(mockDepartamentos)
      vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
        if (name === 'departamentos') {
          return { getFullList } as any
        }
        return {} as any
      })

      const resultado = await getDepartamentos()
      expect(resultado).toEqual(mockDepartamentos)
      expect(getFullList).toHaveBeenCalledWith({ sort: 'nome' })
    })

    it('getDepartamentos faz fallback transparente para centros_custo se departamentos falhar', async () => {
      const mockCentros = [
        { id: 'cc-1', nome: 'Operacional Legado', usuario_id: 'user-1', created: '', updated: '' },
      ]

      const getFullListDepartamentos = vi.fn().mockRejectedValue(new Error('Collection not found'))
      const getFullListCentrosCusto = vi.fn().mockResolvedValue(mockCentros)

      vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
        if (name === 'departamentos') {
          return { getFullList: getFullListDepartamentos } as any
        }
        if (name === 'centros_custo') {
          return { getFullList: getFullListCentrosCusto } as any
        }
        return {} as any
      })

      const resultado = await getDepartamentos()
      expect(resultado).toEqual(mockCentros)
      expect(getFullListDepartamentos).toHaveBeenCalled()
      expect(getFullListCentrosCusto).toHaveBeenCalledWith({ sort: 'nome' })
    })

    it('createDepartamento persiste em departamentos e espelha em centros_custo mantendo o mesmo ID', async () => {
      const depCriado = {
        id: 'dep-123',
        nome: 'TI & Tecnologia',
        usuario_id: 'user-admin',
        created: '2026-10-05T12:00:00Z',
        updated: '2026-10-05T12:00:00Z',
      }

      const createDepMock = vi.fn().mockResolvedValue(depCriado)
      const createCcMock = vi.fn().mockResolvedValue(depCriado)

      vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
        if (name === 'departamentos') {
          return { create: createDepMock } as any
        }
        if (name === 'centros_custo') {
          return { create: createCcMock } as any
        }
        return {} as any
      })

      const res = await createDepartamento({ nome: 'TI & Tecnologia' })
      expect(res).toEqual(depCriado)
      expect(createDepMock).toHaveBeenCalledWith(
        expect.objectContaining({ nome: 'TI & Tecnologia' }),
      )
      // Garante espelhamento com o mesmo ID
      expect(createCcMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'dep-123', nome: 'TI & Tecnologia' }),
      )
    })

    it('updateDepartamento atualiza departamentos e espelho centros_custo', async () => {
      const depAtualizado = {
        id: 'dep-123',
        nome: 'TI Avançada',
        usuario_id: 'user-admin',
        created: '',
        updated: '',
      }

      const updateDepMock = vi.fn().mockResolvedValue(depAtualizado)
      const updateCcMock = vi.fn().mockResolvedValue(depAtualizado)

      vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
        if (name === 'departamentos') {
          return { update: updateDepMock } as any
        }
        if (name === 'centros_custo') {
          return { update: updateCcMock } as any
        }
        return {} as any
      })

      const res = await updateDepartamento('dep-123', { nome: 'TI Avançada' })
      expect(res.nome).toBe('TI Avançada')
      expect(updateDepMock).toHaveBeenCalledWith('dep-123', { nome: 'TI Avançada' })
      expect(updateCcMock).toHaveBeenCalledWith('dep-123', { nome: 'TI Avançada' })
    })

    it('deleteDepartamento remove de departamentos e centros_custo', async () => {
      const deleteDepMock = vi.fn().mockResolvedValue(true)
      const deleteCcMock = vi.fn().mockResolvedValue(true)

      vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
        if (name === 'departamentos') {
          return { delete: deleteDepMock } as any
        }
        if (name === 'centros_custo') {
          return { delete: deleteCcMock } as any
        }
        return {} as any
      })

      const res = await deleteDepartamento('dep-123')
      expect(res).toBe(true)
      expect(deleteDepMock).toHaveBeenCalledWith('dep-123')
      expect(deleteCcMock).toHaveBeenCalledWith('dep-123')
    })

    it('aliases getCentrosCusto, createCentroCusto, etc. apontam para os métodos de departamento', () => {
      expect(getCentrosCusto).toBe(getDepartamentos)
      expect(createCentroCusto).toBe(createDepartamento)
      expect(updateCentroCusto).toBe(updateDepartamento)
      expect(deleteCentroCusto).toBe(deleteDepartamento)
    })
  })

  describe('2. Campo departamento nos Lançamentos (criação, estorno e liquidação)', () => {
    it('createLancamento preenche campo departamento e centro_custo defensivamente', async () => {
      const mockCreate = vi
        .fn()
        .mockImplementation((payload) => Promise.resolve({ id: 'lanc-1', ...payload }))
      vi.spyOn(pb, 'collection').mockReturnValue({ create: mockCreate } as any)

      await createLancamento({
        tipo: 'receita',
        descricao: 'Venda de Licença',
        categoria: 'Licenciamento',
        departamento: 'Comercial',
        centro_custo: 'Comercial',
        valor: 15000,
        competencia: '2026-10',
        data_lancamento: '2026-10-01T00:00:00Z',
        status: 'realizado',
        usuario_id: '',
      })

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          descricao: 'Venda de Licença',
          departamento: 'Comercial',
          centro_custo: 'Comercial',
        }),
      )
    })

    it('estornarLancamento propaga o departamento do lançamento original para o contra-lançamento', async () => {
      const lancOriginal = {
        id: 'orig-10',
        tipo: 'despesa',
        descricao: 'Treinamento de Equipe',
        categoria: 'Treinamento',
        departamento: 'Recursos Humanos',
        centro_custo: 'Recursos Humanos',
        valor: 4500,
        competencia: '2026-10',
        data_lancamento: '2026-10-02T10:00:00Z',
        status: 'realizado',
      } as any

      const mockCreate = vi
        .fn()
        .mockImplementation((payload) => Promise.resolve({ id: 'est-10', ...payload }))
      vi.spyOn(pb, 'collection').mockReturnValue({ create: mockCreate } as any)

      const estorno = await estornarLancamento(lancOriginal, 'Ajuste de escopo')
      expect(estorno.departamento).toBe('Recursos Humanos')
      expect(estorno.centro_custo).toBe('Recursos Humanos')
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          departamento: 'Recursos Humanos',
          estorno_de: 'orig-10',
        }),
      )
    })

    it('registrarRealizacaoLancamento preserva o departamento do lançamento previsto original', async () => {
      const lancPrevisto = {
        id: 'prev-20',
        tipo: 'despesa',
        descricao: '[PREVISTO] Manutenção de Servidores',
        categoria: 'Infraestrutura',
        departamento: 'TI & Tecnologia',
        centro_custo: 'TI & Tecnologia',
        valor: 8000,
        competencia: '2026-10',
        data_lancamento: '2026-10-01T00:00:00Z',
        status: 'previsto',
      } as any

      const mockCreate = vi
        .fn()
        .mockImplementation((payload) => Promise.resolve({ id: 'liq-20', ...payload }))
      vi.spyOn(pb, 'collection').mockReturnValue({ create: mockCreate } as any)

      const realizado = await registrarRealizacaoLancamento(
        lancPrevisto,
        '2026-10-05T12:00:00Z',
        'Banco Itaú',
      )
      expect(realizado.departamento).toBe('TI & Tecnologia')
      expect(realizado.liquidacao_de).toBe('prev-20')
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          departamento: 'TI & Tecnologia',
          liquidacao_de: 'prev-20',
        }),
      )
    })
  })

  describe('3. Backup e restauração com Departamentos e compatibilidade com backups antigos (centros_custo)', () => {
    it('valida backup que contém apenas a coleção "departamentos"', () => {
      const backupComDepartamentos = {
        versao: 2,
        geradoEm: new Date().toISOString(),
        colecoes: {
          empresas: [],
          contas: [],
          categorias: [],
          departamentos: [{ id: 'dep-1', nome: 'Operacional' }],
          lancamentos: [],
          patrimonio: [],
          auditoria: [],
          configuracoes: [],
        },
      }

      const validacao = validarBackupJson(backupComDepartamentos)
      expect(validacao.valido).toBe(true)
    })

    it('valida backup antigo que continha apenas a coleção "centros_custo"', () => {
      const backupAntigoComCentros = {
        versao: 1,
        geradoEm: new Date().toISOString(),
        colecoes: {
          empresas: [],
          contas: [],
          categorias: [],
          centros_custo: [{ id: 'cc-1', nome: 'Operacional' }],
          lancamentos: [],
          patrimonio: [],
          auditoria: [],
          configuracoes: [],
        },
      }

      const validacao = validarBackupJson(backupAntigoComCentros)
      expect(validacao.valido).toBe(true)
    })

    it('restaura backup antigo contendo "centros_custo" populando a coleção "departamentos" com os mesmos IDs', async () => {
      const backupAntigo: BackupData = {
        versao: 1,
        geradoEm: '2026-09-01T00:00:00Z',
        colecoes: {
          empresas: [],
          contas: [],
          categorias: [],
          centros_custo: [
            {
              id: '1fij3i638mljfw9',
              nome: 'Operacional',
              usuario_id: 'u1',
              created: '',
              updated: '',
            },
            {
              id: '0q3ezdpdbnd94mx',
              nome: 'Comercial',
              usuario_id: 'u1',
              created: '',
              updated: '',
            },
          ],
          lancamentos: [
            {
              id: 'lanc-1',
              tipo: 'receita',
              descricao: 'Contrato Alfa',
              categoria: 'Serviços',
              centro_custo: 'Comercial',
              valor: 1000,
              competencia: '2026-09',
              data_lancamento: '2026-09-01T00:00:00Z',
              status: 'realizado',
              usuario_id: 'u1',
              created: '',
              updated: '',
            },
          ],
          patrimonio: [],
          auditoria: [],
          configuracoes: [],
        },
      }

      const createdDeps: any[] = []
      const createdLancs: any[] = []

      vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
        return {
          getFullList: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockImplementation((payload) => {
            if (name === 'departamentos') {
              createdDeps.push(payload)
            } else if (name === 'lancamentos') {
              createdLancs.push(payload)
            }
            return Promise.resolve({ id: payload.id || 'new-id', ...payload })
          }),
        } as any
      })

      const resultado = await restaurarBackup(backupAntigo)
      expect(resultado.erros).toHaveLength(0)
      expect(resultado.importados.departamentos).toBe(2)

      // Verifica preservação exata dos IDs originais de centros_custo na coleção departamentos
      expect(createdDeps).toHaveLength(2)
      expect(createdDeps[0].id).toBe('1fij3i638mljfw9')
      expect(createdDeps[0].nome).toBe('Operacional')
      expect(createdDeps[1].id).toBe('0q3ezdpdbnd94mx')
      expect(createdDeps[1].nome).toBe('Comercial')

      // Verifica que o lançamento antigo com centro_custo foi importado e seu campo departamento foi populado
      expect(createdLancs).toHaveLength(1)
      expect(createdLancs[0].departamento).toBe('Comercial')
    })

    it('gerarBackupCompleto inclui tanto "departamentos" quanto "centros_custo" para retrocompatibilidade total', async () => {
      const mockDeps = [
        { id: 'dep-1', nome: 'Operacional', usuario_id: 'u1', created: '', updated: '' },
        { id: 'dep-2', nome: 'Comercial', usuario_id: 'u1', created: '', updated: '' },
      ]

      vi.spyOn(pb, 'send').mockResolvedValueOnce({
        success: true,
        items: [],
      })

      vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
        if (name === 'departamentos' || name === 'centros_custo') {
          return {
            getList: vi.fn().mockResolvedValue({ items: mockDeps, totalPages: 1 }),
          } as any
        }
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      })

      const resultado = await gerarBackupCompleto('test-audit-token')
      expect(resultado.backup.colecoes.departamentos).toBeDefined()
      expect(resultado.backup.colecoes.centros_custo).toBeDefined()
      expect(resultado.backup.colecoes.departamentos).toHaveLength(2)
      expect(resultado.backup.colecoes.centros_custo).toHaveLength(2)
      expect(resultado.counts.departamentos).toBe(2)
      expect(resultado.counts.centros_custo).toBe(2)
    })
  })

  describe('4. Preservação de IDs e retrocompatibilidade de dados', () => {
    it('verifica que registros migrados em lancamentos preservam id, tipo, valor e populam departamento', async () => {
      const mockLancamento = {
        id: '7mw7kdm9rh66hfg',
        tipo: 'receita',
        descricao: 'Consultoria Estratégica Cliente Alfa',
        categoria: 'Serviços',
        centro_custo: 'Comercial',
        departamento: 'Comercial',
        valor: 35000,
        competencia: '2026-09',
        data_lancamento: '2026-09-05T10:00:00Z',
        status: 'realizado',
        usuario_id: '7lsau2t1w37hmx0',
        created: '2026-10-05T13:31:04.759Z',
        updated: '2026-10-05T13:31:04.759Z',
      }

      vi.spyOn(pb, 'collection').mockReturnValue({
        getFullList: vi.fn().mockResolvedValue([mockLancamento]),
      } as any)

      const lancs = await getLancamentos("competencia = '2026-09'")
      expect(lancs).toHaveLength(1)
      expect(lancs[0].id).toBe('7mw7kdm9rh66hfg')
      expect(lancs[0].departamento).toBe('Comercial')
      expect(lancs[0].centro_custo).toBe('Comercial')
      expect(lancs[0].valor).toBe(35000)
    })
  })
})
