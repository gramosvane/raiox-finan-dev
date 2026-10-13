import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import os from 'node:os'

describe('Item 6 - Geração e Verificação de Conteúdo do ZIP de Distribuição', () => {
  const rootDir = process.cwd()

  it('executa o gerador de ZIP e comprova a inclusão de todos os arquivos cruciais', () => {
    // 1. Executar o script de geração do ZIP
    const scriptPath = path.join(rootDir, 'scripts', 'generate-dist-zip.js')
    expect(fs.existsSync(scriptPath)).toBe(true)

    execSync(`node "${scriptPath}"`, { cwd: rootDir, stdio: 'pipe' })

    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'))
    const zipFilename = `gestao-financeira-dist-v${pkg.version}.zip`
    const zipPath = path.join(rootDir, zipFilename)

    expect(fs.existsSync(zipPath), `Arquivo ${zipFilename} deve ter sido gerado`).toBe(true)

    // 2. Inspecionar o conteúdo do ZIP descompactando em pasta temporária isolada
    const tempInspectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inspect_dist_zip_'))
    try {
      execSync(`unzip -q "${zipPath}" -d "${tempInspectDir}"`)

      // A) Deve conter package-lock.json
      const lockInZip = path.join(tempInspectDir, 'package-lock.json')
      expect(fs.existsSync(lockInZip), 'ZIP deve conter package-lock.json').toBe(true)

      // B) Deve conter src/lib/pocketbase/client.ts
      const clientInZip = path.join(tempInspectDir, 'src', 'lib', 'pocketbase', 'client.ts')
      expect(fs.existsSync(clientInZip), 'ZIP deve conter src/lib/pocketbase/client.ts').toBe(true)

      // C) Deve conter server/pb_hooks
      const hooksInZip = path.join(tempInspectDir, 'server', 'pb_hooks')
      expect(fs.existsSync(hooksInZip), 'ZIP deve conter server/pb_hooks').toBe(true)
      const hookFiles = fs.readdirSync(hooksInZip).filter((f) => f.endsWith('.pb.js'))
      expect(hookFiles.length).toBeGreaterThan(0)
      expect(hookFiles).toContain('users_role_create.pb.js')

      // D) Deve conter server/pb_migrations
      const migrationsInZip = path.join(tempInspectDir, 'server', 'pb_migrations')
      expect(fs.existsSync(migrationsInZip), 'ZIP deve conter server/pb_migrations').toBe(true)
      const migrationFiles = fs.readdirSync(migrationsInZip).filter((f) => f.endsWith('.js'))
      expect(migrationFiles.length).toBeGreaterThan(0)
      expect(migrationFiles).toContain('0009_fase2_seguranca_papeis_empresa.js')

      // E) Deve conter scripts de setup e backup
      expect(fs.existsSync(path.join(tempInspectDir, 'scripts', 'setup-local.sh'))).toBe(true)
      expect(fs.existsSync(path.join(tempInspectDir, 'scripts', 'backup-financeiro.sh'))).toBe(true)

      // F) NÃO deve conter diretórios proibidos ou sensíveis
      expect(fs.existsSync(path.join(tempInspectDir, 'pb_data'))).toBe(false)
      expect(fs.existsSync(path.join(tempInspectDir, 'node_modules'))).toBe(false)
      expect(fs.existsSync(path.join(tempInspectDir, 'pocketbase'))).toBe(false)
      expect(fs.existsSync(path.join(tempInspectDir, '.git'))).toBe(false)
      expect(fs.existsSync(path.join(tempInspectDir, '.env'))).toBe(false)
    } finally {
      fs.rmSync(tempInspectDir, { recursive: true, force: true })
      // Remover o arquivo ZIP gerado na raiz para manter o repo limpo conforme .gitignore (*.zip)
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath)
      }
    }
  })
})
