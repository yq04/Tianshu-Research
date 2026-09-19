#!/usr/bin/env node
/**
 * Developer CLI tool for tianshu-research project management.
 * Provides manual commands: init, status, and check-config.
 * Kept strictly separate from LLM tool definitions to prevent tool-space pollution.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveWorkspaceScope, ALL_RESEARCH_CAPABILITIES } from '../scope/workspace-scope.js'

export const STANDARD_RESEARCH_CONFIG = Object.freeze({
  schemaVersion: 1,
  enabled: true,
  defaultParadigm: 'auto',
  defaultSessionMode: 'research',
  allowedCapabilities: [
    'literature',
    'data',
    'theory',
    'benchmark',
    'figure',
  ],
  persistence: 'task-explicit',
  python: {
    executable: '',
  },
  limits: {
    maxConcurrentRuns: 1,
    maxRunSeconds: 600,
    maxResultChars: 4000,
  },
})

export function runInit(targetDir = process.cwd(), options = {}) {
  const root = resolve(targetDir)
  const rivetDir = join(root, '.rivet')
  const configPath = join(rivetDir, 'research.json')

  if (!existsSync(rivetDir)) {
    mkdirSync(rivetDir, { recursive: true })
  }

  if (existsSync(configPath) && !options.force) {
    return {
      success: false,
      alreadyExists: true,
      configPath,
      message: `Configuration file already exists at ${configPath}. Use --force to overwrite.`,
    }
  }

  const content = JSON.stringify(STANDARD_RESEARCH_CONFIG, null, 2) + '\n'
  writeFileSync(configPath, content, 'utf8')

  return {
    success: true,
    alreadyExists: false,
    configPath,
    message: `Initialized research project at ${configPath}`,
  }
}

export function runStatus(targetDir = process.cwd()) {
  const root = resolve(targetDir)
  const scope = resolveWorkspaceScope({ workspace: root })
  const configPath = join(root, '.rivet', 'research.json')
  const legacyDir = join(root, '.rivet', 'research')

  return {
    root: scope.canonicalRoot,
    scopeId: scope.scopeId,
    isResearchEligible: scope.isResearchEligible,
    trust: scope.trust,
    policyRevision: scope.policyRevision,
    configuredCapabilities: scope.configuredCapabilities,
    hasManifest: existsSync(configPath),
    hasLegacyDataDir: existsSync(legacyDir),
  }
}

export function runCheckConfig(targetDir = process.cwd()) {
  const root = resolve(targetDir)
  const configPath = join(root, '.rivet', 'research.json')
  const errors = []
  const warnings = []

  if (!existsSync(configPath)) {
    return {
      valid: false,
      configPath,
      errors: [`Missing research configuration file at ${configPath}`],
      warnings: [],
    }
  }

  let parsed
  try {
    const raw = readFileSync(configPath, 'utf8')
    parsed = JSON.parse(raw)
  } catch (err) {
    return {
      valid: false,
      configPath,
      errors: [`Invalid JSON in ${configPath}: ${err.message}`],
      warnings: [],
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      valid: false,
      configPath,
      errors: ['Configuration must be a JSON object'],
      warnings: [],
    }
  }

  if (parsed.schemaVersion !== 1) {
    errors.push(`Unsupported schemaVersion: ${parsed.schemaVersion} (expected 1)`)
  }

  if (typeof parsed.enabled !== 'boolean') {
    errors.push('Property "enabled" must be a boolean')
  }

  if (!Array.isArray(parsed.allowedCapabilities)) {
    errors.push('Property "allowedCapabilities" must be an array')
  } else {
    for (const cap of parsed.allowedCapabilities) {
      if (!ALL_RESEARCH_CAPABILITIES.includes(cap)) {
        warnings.push(`Unknown capability: '${cap}' (valid: ${ALL_RESEARCH_CAPABILITIES.join(', ')})`)
      }
    }
  }

  if (parsed.python && typeof parsed.python === 'object') {
    const exe = parsed.python.executable
    if (exe && typeof exe === 'string' && !existsSync(exe)) {
      warnings.push(`Specified python executable not found on disk: ${exe}`)
    }
  }

  return {
    valid: errors.length === 0,
    configPath,
    errors,
    warnings,
    config: parsed,
  }
}

export function printHelp() {
  console.log(`
Usage: tianshu-research <command> [options]

Commands:
  init [dir]           Initialize a .rivet/research.json template in target directory
  status [dir]         Check workspace research eligibility and scope settings
  check-config [dir]   Validate existing .rivet/research.json configuration
  help                 Display this help message

Options:
  --force              Overwrite existing configuration during init
`)
}

export async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'help'
  const targetDir = argv.find((a, i) => i > 0 && !a.startsWith('-')) || process.cwd()
  const force = argv.includes('--force')

  switch (command) {
    case 'init': {
      const res = runInit(targetDir, { force })
      if (res.success) {
        console.log(`[OK] ${res.message}`)
      } else {
        console.error(`[FAIL] ${res.message}`)
        process.exitCode = 1
      }
      break
    }
    case 'status': {
      const s = runStatus(targetDir)
      console.log('=== Tianshu Research Workspace Status ===')
      console.log(`Root:         ${s.root}`)
      console.log(`Scope ID:     ${s.scopeId}`)
      console.log(`Eligible:     ${s.isResearchEligible ? 'YES (Active)' : 'NO (Dormant)'}`)
      console.log(`Trust:        ${s.trust}`)
      console.log(`Capabilities: ${s.configuredCapabilities.join(', ')}`)
      console.log(`Manifest:     ${s.hasManifest ? 'Present' : 'None'}`)
      console.log(`Legacy Dir:   ${s.hasLegacyDataDir ? 'Present' : 'None'}`)
      break
    }
    case 'check-config': {
      const res = runCheckConfig(targetDir)
      if (res.valid) {
        console.log(`[OK] Configuration valid at ${res.configPath}`)
        if (res.warnings.length > 0) {
          console.log('Warnings:')
          res.warnings.forEach((w) => console.log(`  - ${w}`))
        }
      } else {
        console.error(`[FAIL] Configuration invalid at ${res.configPath}`)
        res.errors.forEach((e) => console.error(`  - ${e}`))
        process.exitCode = 1
      }
      break
    }
    case 'help':
    case '--help':
    case '-h':
      printHelp()
      break
    default:
      console.error(`Unknown command: ${command}`)
      printHelp()
      process.exitCode = 1
  }
}

const isDirectExecution = Boolean(process.argv[1])
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isDirectExecution) {
  main()
}

