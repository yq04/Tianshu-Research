/**
 * Exposure Snapshot and Tool Manifest for tianshu-research MCP.
 * Implements connection-level tool freezing, dormant empty listing,
 * and canonical SHA-256 toolsDigest to defend LLM prefix cache.
 */

import { createHash } from 'node:crypto'
import {
  RESEARCH_QUERY_SCHEMA,
  RESEARCH_EVIDENCE_SCHEMA,
  JOURNAL_PALETTE_SCHEMA,
  RESEARCH_STATUS_SCHEMA,
  TOOL_DESCRIPTIONS,
} from '../contracts/registry.js'

/**
 * Authoritative 4 public gateway definitions.
 * Order and schemas are frozen to guarantee byte-stable prefix caching.
 */
export const ACTIVE_TOOLS = Object.freeze([
  {
    name: 'research_query',
    description: TOOL_DESCRIPTIONS.research_query,
    inputSchema: RESEARCH_QUERY_SCHEMA,
  },
  {
    name: 'research_evidence',
    description: TOOL_DESCRIPTIONS.research_evidence,
    inputSchema: RESEARCH_EVIDENCE_SCHEMA,
  },
  {
    name: 'journal_palette',
    description: TOOL_DESCRIPTIONS.journal_palette,
    inputSchema: JOURNAL_PALETTE_SCHEMA,
  },
  {
    name: 'research_status',
    description: TOOL_DESCRIPTIONS.research_status,
    inputSchema: RESEARCH_STATUS_SCHEMA,
  },
])

export const ACTIVE_TOOLS_DIGEST = createHash('sha256')
  .update(JSON.stringify(ACTIVE_TOOLS))
  .digest('hex')

export const EMPTY_TOOLS_DIGEST = createHash('sha256')
  .update(JSON.stringify([]))
  .digest('hex')

/**
 * Generates an ExposureSnapshot according to current server status.
 *
 * @param {'dormant' | 'active' | 'revoked'} status
 * @param {object} [options]
 * @param {string} [options.generation]
 * @param {string} [options.scopeId]
 * @param {'connection' | 'dynamic'} [options.mode='connection']
 * @param {string} [options.instructions]
 * @returns {object} ExposureSnapshot
 */
export function generateExposureSnapshot(status, options = {}) {
  const mode = options.mode || 'connection'
  const generation = options.generation || `gen-${status}-${options.scopeId || 'default'}`
  const scopeId = options.scopeId

  if (status === 'dormant') {
    return {
      generation,
      contractVersion: 'research-v2',
      toolNames: [],
      tools: [],
      instructions: undefined,
      canonicalToolsDigest: EMPTY_TOOLS_DIGEST,
      scopeId,
      mode,
      status: 'dormant',
    }
  }

  if (status === 'active') {
    return {
      generation,
      contractVersion: 'research-v2',
      toolNames: ACTIVE_TOOLS.map((t) => t.name),
      tools: ACTIVE_TOOLS,
      instructions: options.instructions !== undefined ? options.instructions : undefined,
      canonicalToolsDigest: ACTIVE_TOOLS_DIGEST,
      scopeId,
      mode,
      status: 'active',
    }
  }

  if (status === 'revoked') {
    // In connection mode, tools are retained as stubs so the tool definition schema
    // does not change during the connection lifetime, but calls are rejected.
    return {
      generation,
      contractVersion: 'research-v2',
      toolNames: ACTIVE_TOOLS.map((t) => t.name),
      tools: ACTIVE_TOOLS,
      instructions: undefined,
      canonicalToolsDigest: ACTIVE_TOOLS_DIGEST,
      scopeId,
      mode,
      status: 'revoked',
    }
  }

  throw new Error(`Invalid exposure status: ${status}`)
}

