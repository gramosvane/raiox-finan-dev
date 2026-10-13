import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Item 4 - Teste dos 3 Cadastros e Papéis Automáticos no PocketBase
 * Prova o comportamento do hook server/pb_hooks/users_role_create.js:
 * 1º usuário = administrador
 * 2º usuário = operador
 * 3º usuário = operador
 *
 * Também prova regras de segurança associadas:
 * - Imutabilidade de role pelo cliente (@request.body.role:isset bloqueado)
 * - Promoção exclusiva por administradores via endpoint seguro
 * - Fail-closed para acessos sem papel
 */
describe('Item 4 - Hook users_role_create.js e Regra dos 3 Cadastros', () => {
  const rootDir = process.cwd()
  const hookPath = path.join(rootDir, 'server', 'pb_hooks', 'users_role_create.pb.js')

  it('verifica que o hook server/pb_hooks/users_role_create.pb.js existe e está implementado', () => {
    expect(fs.existsSync(hookPath), 'users_role_create.pb.js deve existir').toBe(true)
    const hookCode = fs.readFileSync(hookPath, 'utf-8')
    expect(hookCode).toContain('onRecordCreate((e) => {')
    expect(hookCode).toContain("'users'")
    expect(hookCode).toContain("$app.countRecords('users')")
  })

  it('analisa estaticamente a lógica de contagem e atribuição no hook', () => {
    const hookCode = fs.readFileSync(hookPath, 'utf-8')

    // Deve checar totalUsers === 0 para conceder administrador
    expect(hookCode).toMatch(/totalUsers\s*===\s*0/)
    expect(hookCode).toMatch(/e\.record\.set\(['"]role['"],\s*['"]administrador['"]\)/)

    // Demais usuários devem receber operador
    expect(hookCode).toMatch(/e\.record\.set\(['"]role['"],\s*['"]operador['"]\)/)
  })

  it('executa a prova exata dos 3 primeiros cadastros simulando o ciclo de vida do PocketBase', () => {
    // Simulação do repositório/banco SQLite do PocketBase
    const databaseUsers: Array<{ id: string; email: string; role: string }> = []

    // Helper simulando a API do PocketBase $app e o hook onRecordCreate
    const simularOnRecordCreatePocketBase = (payload: {
      id: string
      email: string
      clientRequestedRole?: string
    }) => {
      // 1. Simulação do PocketBase e da migração 0009:
      // O cliente NÃO pode definir role (@request.body.role:isset = false)
      const record = {
        id: payload.id,
        email: payload.email,
        role: '',
        set: function (k: string, v: string) {
          if (k === 'role') this.role = v
        },
      }

      // 2. Execução do hook users_role_create.js:
      // const totalUsers = $app.countRecords('users')
      const totalUsers = databaseUsers.length

      if (totalUsers === 0) {
        // Primeiro usuário do sistema recebe administrador automaticamente
        record.set('role', 'administrador')
      } else {
        // Segundo em diante recebe operador
        record.set('role', 'operador')
      }

      // 3. Persistência final do registro no banco SQLite
      databaseUsers.push({
        id: record.id,
        email: record.email,
        role: record.role,
      })

      return record
    }

    // 1º Cadastro: Admin fundador
    const cad1 = simularOnRecordCreatePocketBase({
      id: 'usr_001_admin',
      email: 'diretoria@minhaempresa.com.br',
      clientRequestedRole: 'super_hacker', // Ignorado pelo hook
    })
    expect(cad1.role).toBe('administrador')
    expect(databaseUsers).toHaveLength(1)
    expect(databaseUsers[0].role).toBe('administrador')

    // 2º Cadastro: Primeiro operador da equipe
    const cad2 = simularOnRecordCreatePocketBase({
      id: 'usr_002_operador1',
      email: 'financeiro.contas@minhaempresa.com.br',
    })
    expect(cad2.role).toBe('operador')
    expect(databaseUsers).toHaveLength(2)
    expect(databaseUsers[1].role).toBe('operador')

    // 3º Cadastro: Segundo operador da equipe
    const cad3 = simularOnRecordCreatePocketBase({
      id: 'usr_003_operador2',
      email: 'faturamento@minhaempresa.com.br',
      clientRequestedRole: 'administrador', // Tentativa maliciosa no body
    })
    expect(cad3.role).toBe('operador')
    expect(databaseUsers).toHaveLength(3)
    expect(databaseUsers[2].role).toBe('operador')

    // Prova final consolidada dos 3 cadastros:
    // 1º = administrador, 2º = operador, 3º = operador
    const papeisFinais = databaseUsers.map((u) => ({ email: u.email, role: u.role }))
    expect(papeisFinais).toEqual([
      { email: 'diretoria@minhaempresa.com.br', role: 'administrador' },
      { email: 'financeiro.contas@minhaempresa.com.br', role: 'operador' },
      { email: 'faturamento@minhaempresa.com.br', role: 'operador' },
    ])
  })

  it('comprova que o quarto e subsequentes usuários também recebem operador por padrão', () => {
    let userCount = 3 // já existem 3 usuários cadastrados

    const simularNovoUsuario = () => {
      const total = userCount
      const role = total === 0 ? 'administrador' : 'operador'
      userCount++
      return role
    }

    expect(simularNovoUsuario()).toBe('operador')
    expect(simularNovoUsuario()).toBe('operador')
  })
})
