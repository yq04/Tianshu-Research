#!/usr/bin/env node
/**
 * First-party stdio MCP server for tianshu-research.
 * Powered by protocol/server.js with connection-level dormant mode,
 * project scope enforcement, and LLM prefix cache protection.
 */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { McpServer } from './protocol/server.js'
import { ACTIVE_TOOLS } from './protocol/exposure.js'

export { McpServer, createMcpServer } from './protocol/server.js'
export const MCP_TOOLS = ACTIVE_TOOLS

export function parseArgs(argv = process.argv) {
  const options = {
    workspace: process.env.TIANSHU_RESEARCH_WORKSPACE || null,
    exposureMode: 'connection',
  }

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--workspace' && i + 1 < argv.length) {
      options.workspace = argv[++i]
    } else if (arg.startsWith('--workspace=')) {
      options.workspace = arg.slice('--workspace='.length)
    } else if ((arg === '--exposure' || arg === '--mode') && i + 1 < argv.length) {
      options.exposureMode = argv[++i]
    } else if (arg.startsWith('--exposure=')) {
      options.exposureMode = arg.slice('--exposure='.length)
    }
  }

  return options
}

const cliOptions = parseArgs(process.argv)
export const defaultServer = new McpServer(cliOptions)

export async function handleMcpMessage(msg) {
  return defaultServer.handleMessage(msg)
}

const invokedDirectly = Boolean(process.argv[1])
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (invokedDirectly) {
  defaultServer.startStdio()
}

