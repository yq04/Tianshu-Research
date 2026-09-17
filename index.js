// tianshu-research — OA literature screening (arXiv + OpenAlex) + Evidence Ledger + research-flow skill.

import { runJournalPalette } from './figure.js'
import { runPaperLookup, runPaperSearch } from './search.js'
import { runResearchStatus } from './tools/research-status.js'
import { runResearchQuery } from './gateway-query.js'
import { runResearchEvidence } from './gateway-evidence.js'
import {
  JOURNAL_PALETTE_SCHEMA,
  PAPER_LOOKUP_SCHEMA,
  PAPER_SEARCH_SCHEMA,
  RESEARCH_STATUS_SCHEMA,
  RESEARCH_QUERY_SCHEMA,
  RESEARCH_EVIDENCE_SCHEMA,
  TOOL_DESCRIPTIONS,
} from './tool-contracts.js'

export const tools = [
  {
    definition: {
      name: 'research_status',
      description: TOOL_DESCRIPTIONS.research_status,
      input_schema: RESEARCH_STATUS_SCHEMA,
    },
    execute: (params) => runResearchStatus(params),
    requiresApproval: () => false,
    isConcurrencySafe: () => true,
    isEnabled: () => true,
  },
  {
    definition: {
      name: 'research_query',
      description: TOOL_DESCRIPTIONS.research_query,
      input_schema: RESEARCH_QUERY_SCHEMA,
    },
    execute: (params) => runResearchQuery(params),
    requiresApproval: () => false,
    isConcurrencySafe: () => true,
    isEnabled: () => true,
  },
  {
    definition: {
      name: 'research_evidence',
      description: TOOL_DESCRIPTIONS.research_evidence,
      input_schema: RESEARCH_EVIDENCE_SCHEMA,
    },
    execute: (params) => runResearchEvidence(params),
    requiresApproval: () => false,
    isConcurrencySafe: () => true,
    isEnabled: () => true,
  },
  {
    definition: {
      name: 'paper_search',
      description: TOOL_DESCRIPTIONS.paper_search,
      input_schema: PAPER_SEARCH_SCHEMA,
    },
    execute: (params) => runPaperSearch(params),
    requiresApproval: () => false,
    isConcurrencySafe: () => true,
    isEnabled: () => true,
  },
  {
    definition: {
      name: 'paper_lookup',
      description: TOOL_DESCRIPTIONS.paper_lookup,
      input_schema: PAPER_LOOKUP_SCHEMA,
    },
    execute: (params) => runPaperLookup(params),
    requiresApproval: () => false,
    isConcurrencySafe: () => true,
    isEnabled: () => true,
  },
  {
    definition: {
      name: 'journal_palette',
      description: TOOL_DESCRIPTIONS.journal_palette,
      input_schema: JOURNAL_PALETTE_SCHEMA,
    },
    execute: (params) => runJournalPalette(params),
    requiresApproval: () => false,
    isConcurrencySafe: () => true,
    isEnabled: () => true,
  },
]
