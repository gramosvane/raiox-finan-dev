#!/usr/bin/env node
/**
 * Gerador de ZIP de Distribuição do Sistema de Gestão Financeira Empresarial
 * Inclui estritamente os arquivos essenciais para instalação local / offline:
 * - package.json e package-lock.json
 * - client.ts (src/lib/pocketbase/client.ts)
 * - server/pb_hooks e server/pb_migrations
 * - scripts/ (scripts de setup e backup)
 * - documentação (README-INSTALACAO.md, README.md, env.example)
 * - src/ (código fonte completo)
 * - arquivos de configuração (tsconfig*, vite*, tailwind*, postcss*, index.html)
 *
 * NUNCA inclui: pb_data, binário pocketbase, node_modules, .git, .env
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const rootDir = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'))
const version = pkg.version || '0.0.35'
const zipFilename = `gestao-financeira-dist-v${version}.zip`
const zipPath = path.join(rootDir, zipFilename)

console.log(`[ZIP DISTRIBUIÇÃO] Gerando ${zipFilename}...`)

// Remover zip antigo caso exista
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath)
}

// Lista de arquivos e diretórios essenciais
const includes = [
  'package.json',
  'package-lock.json',
  'README-INSTALACAO.md',
  'README.md',
  'env.example',
  'index.html',
  'components.json',
  'postcss.config.js',
  'tailwind.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'vite-plugin-react-uid.js',
  'scripts',
  'server',
  'src',
  'public',
]

// Validar que todos os itens essenciais existem antes de empacotar
for (const item of includes) {
  const p = path.join(rootDir, item)
  if (!fs.existsSync(p)) {
    console.error(`[ERRO CRÍTICO] Item obrigatório para o ZIP não existe: ${item}`)
    process.exit(1)
  }
}

// Prova de presença de itens cruciais citados pelo usuário:
const clientTsPath = path.join(rootDir, 'src', 'lib', 'pocketbase', 'client.ts')
if (!fs.existsSync(clientTsPath)) {
  console.error('[ERRO CRÍTICO] src/lib/pocketbase/client.ts não encontrado!')
  process.exit(1)
}

const hooksPath = path.join(rootDir, 'server', 'pb_hooks')
const migrationsPath = path.join(rootDir, 'server', 'pb_migrations')
if (!fs.existsSync(hooksPath) || !fs.existsSync(migrationsPath)) {
  console.error('[ERRO CRÍTICO] server/pb_hooks ou server/pb_migrations não encontrado!')
  process.exit(1)
}

// Executar zip com exclusões de segurança
const excludeArgs = [
  '-x',
  '*.git*',
  'node_modules/*',
  'pb_data/*',
  'pb_public/*',
  'pocketbase',
  'pocketbase.exe',
  '*.db*',
  '*.zip',
  '.env',
  '.env.*',
  'dist/*',
]

try {
  const zipCmd = `zip -r -q "${zipPath}" ${includes.join(' ')} ${excludeArgs.join(' ')}`
  execSync(zipCmd, { cwd: rootDir, stdio: 'inherit' })
  console.log(`[SUCESSO] ZIP de distribuição gerado em: ${zipPath}`)
  const stat = fs.statSync(zipPath)
  console.log(`Tamanho: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`)
} catch (err) {
  console.error('[FALHA] Falha ao criar zip com comando nativo:', err)
  process.exit(1)
}
