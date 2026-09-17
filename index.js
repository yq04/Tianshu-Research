// tianshu-research — OA literature screening (arXiv + OpenAlex) + research-flow skill.

import { runJournalPalette } from './figure.js'
import { runPaperLookup, runPaperSearch } from './search.js'
import {
  JOURNAL_PALETTE_SCHEMA,
  PAPER_LOOKUP_SCHEMA,
  PAPER_SEARCH_SCHEMA,
  TOOL_DESCRIPTIONS,
} from './tool-contracts.js'

export const tools = [
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

