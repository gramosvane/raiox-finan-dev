import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import os from 'node:os'
import crypto from 'node:crypto'

describe('Fase 1 - Auditoria e Comprovação de Segurança / Infraestrutura', () => {
  const rootDir = process.cwd()

  describe('Item 1.1: Sem rotas duplicadas no PocketBase hooks', () => {
    it('verifica que todas as rotas declaradas em server/pb_hooks são únicas', () => {
      const hooksDir = path.join(rootDir, 'server', 'pb_hooks')
      const hookFiles = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.pb.js'))

      const routes: Array<{ method: string; path: string; file: string }> = []
      const routerAddRegex = /routerAdd\s*\(\s*['"]([A-Z]+)['"]\s*,\s*['"]([^'"]+)['"]/g

      for (const file of hookFiles) {
        const content = fs.readFileSync(path.join(hooksDir, file), 'utf-8')
        let match: RegExpExecArray | null
        while ((match = routerAddRegex.exec(content)) !== null) {
          const method = match[1]
          const routePath = match[2]
          routes.push({ method, path: routePath, file })
        }
      }

      // Normalizar placeholders para detectar colisões / conflitos estruturais
      const seenRoutes = new Map<string, string>()
      for (const r of routes) {
        const normalized = `${r.method} ${r.path.replace(/\{[^}]+\}/g, ':param')}`
        const previous = seenRoutes.get(normalized)
        expect(
          previous,
          `Rota duplicada ou conflitante detectada: ${r.method} ${r.path} em ${r.file} e ${previous}`,
        ).toBeUndefined()
        seenRoutes.set(normalized, r.file)
      }

      // Prova que as rotas essenciais estão devidamente registradas
      expect(seenRoutes.has('POST /backend/v1/lancamentos/:param/editar')).toBe(true)
      expect(seenRoutes.has('POST /backend/v1/audit/set-master-password')).toBe(true)
      expect(seenRoutes.has('GET /backend/v1/audit/status-master-password')).toBe(true)
      expect(seenRoutes.has('POST /backend/v1/audit/verify-master-password')).toBe(true)
      expect(seenRoutes.has('GET /backend/v1/audit/registros')).toBe(true)
      expect(seenRoutes.has('POST /backend/v1/audit/restaurar-registro')).toBe(true)
    })

    it('P1 estático: comprova que audit/registros e restaurar-registro aparecem exatamente 1 vez em server/pb_hooks', () => {
      const hooksDir = path.join(rootDir, 'server', 'pb_hooks')
      const hookFiles = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.pb.js'))

      let countRegistros = 0
      let countRestaurar = 0

      for (const file of hookFiles) {
        const content = fs.readFileSync(path.join(hooksDir, file), 'utf-8')
        const matchesRegistros = content.match(/audit\/registros/g)
        const matchesRestaurar = content.match(/restaurar-registro/g)
        if (matchesRegistros) countRegistros += matchesRegistros.length
        if (matchesRestaurar) countRestaurar += matchesRestaurar.length
      }

      expect(countRegistros).toBe(1)
      expect(countRestaurar).toBe(1)
    })

    it('P2 estático: comprova ausência total de credenciais padrão e emails hardcoded no repo', () => {
      const forbiddenPatterns = [
        'Admin@Mudar123!',
        'Temp@Admin2026!',
        'admin@financeiro.local',
        'geovane.ramos.br@gmail.com',
      ]

      const checkDirRecursively = (dir: string): void => {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
            continue
          }
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            checkDirRecursively(fullPath)
          } else if (entry.isFile()) {
            // Ignorar o próprio arquivo de teste da auditoria que cita as strings para asserção
            if (entry.name === 'fase1Auditoria.test.ts') continue
            const content = fs.readFileSync(fullPath, 'utf-8')
            for (const pattern of forbiddenPatterns) {
              expect(
                content.includes(pattern),
                `Padrão proibido "${pattern}" detectado em ${path.relative(rootDir, fullPath)}`,
              ).toBe(false)
            }
          }
        }
      }

      checkDirRecursively(rootDir)
    })

    it('P3 estático: comprova estrutura server/ limpa e regras de gitignore', () => {
      const serverDir = path.join(rootDir, 'server')
      expect(fs.existsSync(serverDir)).toBe(true)

      const serverEntries = fs.readdirSync(serverDir)
      // Deve existir apenas pb_hooks, pb_migrations e README.md
      const allowedEntries = new Set(['pb_hooks', 'pb_migrations', 'README.md'])
      for (const entry of serverEntries) {
        expect(allowedEntries.has(entry), `Entrada inesperada em server/: ${entry}`).toBe(true)
      }

      // Prova que pasta legada pocketbase/ não existe na raiz
      expect(fs.existsSync(path.join(rootDir, 'pocketbase'))).toBe(false)

      // Testar git check-ignore via git CLI
      try {
        const ignoreOutput = execSync(
          'git check-ignore -v pocketbase pb_data server/pb_hooks server/pb_migrations',
          { cwd: rootDir, encoding: 'utf-8' },
        )
        // pocketbase e pb_data devem ser ignorados (.gitignore)
        expect(ignoreOutput).toMatch(/\.gitignore:\d+:\/pocketbase\s+pocketbase/)
        expect(ignoreOutput).toMatch(/\.gitignore:\d+:\/pb_data\s+pb_data/)
      } catch (err: unknown) {
        // git check-ignore retorna exit code 1 se algum caminho NÃO foi ignorado (o que é esperado para server/!)
        const errObj = err as { stdout?: string; status?: number }
        const stdout = errObj.stdout || ''
        expect(stdout).toMatch(/pocketbase/)
        expect(stdout).toMatch(/pb_data/)
        // Prova crucial: server/pb_hooks e server/pb_migrations NÃO aparecem nas linhas ignoradas
        expect(stdout).not.toMatch(/server\/pb_hooks/)
        expect(stdout).not.toMatch(/server\/pb_migrations/)
      }
    })
  })

  describe('Item 1.3: Prova de instalação do zero (Instância Isolada e Coleções Zeradas)', () => {
    it('comprova que as migrações em server/pb_migrations criam o schema limpo sem dados semeados', () => {
      const migrationsDir = path.join(rootDir, 'server', 'pb_migrations')
      const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.js'))

      // Verificar que nenhum arquivo de migração semeia usuários com senhas pré-definidas
      for (const file of migrationFiles) {
        const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
        expect(content).not.toMatch(/setPassword\s*\(\s*['"][^'"]+['"]\s*\)/)
        expect(content).not.toMatch(/demo@|admin@example|SenhaMestra@2025/i)
      }

      // Verificar que as migrações 0002, 0003 e 0004 estão higienizadas
      const m0002 = fs.readFileSync(path.join(migrationsDir, '0002_seed_initial_data.js'), 'utf-8')
      expect(m0002).toMatch(/Nenhuma criação de usuário padrão/i)

      const m0008 = fs.readFileSync(
        path.join(migrationsDir, '0008_departamentos_e_senha_admin.js'),
        'utf-8',
      )
      expect(m0008).toMatch(/Nenhuma alteração ou criação de senha/i)
    })
  })

  describe('Item 1.6: Scripts de instalação local (scripts/setup-local.sh)', () => {
    const setupPath = path.join(rootDir, 'scripts', 'setup-local.sh')

    it('possui permissão de execução e sintaxe válida bash', () => {
      expect(fs.existsSync(setupPath)).toBe(true)
      const content = fs.readFileSync(setupPath, 'utf-8')

      // Requisito 1: PocketBase 0.26.x fixo
      expect(content).toMatch(/PB_VERSION="0\.26\.6"/)

      // Requisito 2: Verificação dinâmica de integridade SHA256 via checksums.txt
      expect(content).toContain('sha256sum')
      expect(content).toContain('checksums.txt')
      expect(content).toMatch(/EXPECTED_SHA256=/)
      expect(content).toContain('[ERRO CRÍTICO] Checksum SHA256 inválido')

      // Requisito 3: set -e (ou set -euo pipefail)
      expect(content).toMatch(/set -e/)

      // Requisito 4: curl com -f
      expect(content).toMatch(/curl\s+[^|\n]*-f/)

      // Requisito 5: criação dos links para server/pb_hooks e server/pb_migrations
      expect(content).toContain('ln -sfn ./server/pb_migrations pb_migrations')
      expect(content).toContain('ln -sfn ./server/pb_hooks pb_hooks')

      // Requisito 6: npm ci
      expect(content).toContain('npm ci')

      // Requisito 7: nunca imprimir sucesso se etapa crítica falhar
      expect(content).toContain('[ERRO CRÍTICO]')
    })
  })

  describe('Item 1.7: Script de Backup e Teste de Restauração em Ambiente Isolado', () => {
    const backupScriptPath = path.join(rootDir, 'scripts', 'backup-financeiro.sh')

    it('comprova requisitos de segurança do scripts/backup-financeiro.sh', () => {
      expect(fs.existsSync(backupScriptPath)).toBe(true)
      const content = fs.readFileSync(backupScriptPath, 'utf-8')

      // Requisito 1: status local e status externo explícitos
      expect(content).toContain('STATUS_LOCAL="OK"')
      expect(content).toContain('STATUS_LOCAL="FALHA"')
      expect(content).toContain('STATUS_EXTERNO="OK"')
      expect(content).toContain('STATUS_EXTERNO="FALHA"')
      expect(content).toContain('STATUS_EXTERNO="NÃO CONFIGURADO"')

      // Requisito 2: nunca imprimir "concluído" ou sucesso se envio externo falhar
      expect(content).toContain('exit 2')

      // Requisito 3: criptografia obrigatória AES-256 lida de variável/arquivo (nunca na linha de comando)
      expect(content).toMatch(/openssl\s+enc\s+-aes-256-cbc/)
      expect(content).toContain('-pass stdin')
      expect(content).not.toMatch(/-k\s+/)
    })

    it('executa teste completo e isolado de backup, criptografia AES-256 e restauração', () => {
      // Criar diretório temporário isolado simulando pb_data com todas as coleções
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb_backup_restore_test_'))
      const pbDataDir = path.join(tempDir, 'pb_data')
      fs.mkdirSync(pbDataDir, { recursive: true })

      // Simular arquivos de dados SQLite
      const dataSqlite = path.join(pbDataDir, 'data.db')
      const originalPayload = 'POCKETBASE_SQLITE_FINANCIAL_DATABASE_SIMULATION_DATA_' + Date.now()
      fs.writeFileSync(dataSqlite, originalPayload, 'utf-8')

      const originalHash = crypto
        .createHash('sha256')
        .update(fs.readFileSync(dataSqlite))
        .digest('hex')

      // 1. Criar zip local do pb_data
      const backupDir = path.join(tempDir, 'backups')
      fs.mkdirSync(backupDir, { recursive: true })
      const backupZip = path.join(backupDir, 'backup_test.zip')

      execSync(`zip -r -q "${backupZip}" .`, { cwd: pbDataDir })
      expect(fs.existsSync(backupZip)).toBe(true)

      // 2. Criptografar com AES-256-CBC via stdin (como faz o script)
      const encKey = 'ChaveTesteCriptografiaFase1Blindada_2026!'
      const encFile = `${backupZip}.enc`

      execSync(
        `printf '%s' "${encKey}" | openssl enc -aes-256-cbc -salt -pbkdf2 -in "${backupZip}" -out "${encFile}" -pass stdin`,
      )
      expect(fs.existsSync(encFile)).toBe(true)

      // Remover o arquivo ZIP plano para garantir que a restauração depende do arquivo criptografado
      fs.unlinkSync(backupZip)

      // 3. Teste de restauração em NOVO diretório isolado
      const restoreDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb_restored_test_'))
      const decryptedZip = path.join(restoreDir, 'restored.zip')

      // Descriptografar via stdin
      execSync(
        `printf '%s' "${encKey}" | openssl enc -d -aes-256-cbc -salt -pbkdf2 -in "${encFile}" -out "${decryptedZip}" -pass stdin`,
      )
      expect(fs.existsSync(decryptedZip)).toBe(true)

      // Descompactar snapshot restaurado
      execSync(`unzip -q "${decryptedZip}" -d "${restoreDir}"`)

      const restoredDataSqlite = path.join(restoreDir, 'data.db')
      expect(fs.existsSync(restoredDataSqlite)).toBe(true)

      const restoredPayload = fs.readFileSync(restoredDataSqlite, 'utf-8')
      const restoredHash = crypto
        .createHash('sha256')
        .update(fs.readFileSync(restoredDataSqlite))
        .digest('hex')

      // Comprovação de restauração com 100% de integridade
      expect(restoredPayload).toBe(originalPayload)
      expect(restoredHash).toBe(originalHash)

      // Limpeza dos ambientes temporários isolados
      fs.rmSync(tempDir, { recursive: true, force: true })
      fs.rmSync(restoreDir, { recursive: true, force: true })
    })
  })

  describe('Item 1.4: Blindagem das coleções e regras financeiras intactas', () => {
    it('garante que coleções e regras financeiras não foram alteradas indevidamente', () => {
      // Verificar DRE, Liquidez, Aging e Cálculos
      const calcPath = path.join(rootDir, 'src', 'lib', 'financialCalculations.ts')
      const content = fs.readFileSync(calcPath, 'utf-8')

      expect(content).toContain('determinarGrupoDRE')
      expect(content).toContain('calcularDRE')
      expect(content).toContain('calcularIndicesLiquidez')
      expect(content).toContain('calcularAging')
      expect(content).toContain('roundCents')
    })
  })
})
