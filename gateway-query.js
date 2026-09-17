/**
 * Research Query Gateway for tianshu-research.
 * Unifies paper search and metadata lookup across arXiv and OpenAlex.
 */

import { runPaperLookup, runPaperSearch } from './search.js'

export async function runResearchQuery(params = {}, fetchImpl = fetch) {
  const action = typeof params.action === 'string' ? params.action.trim() : ''

  if (action === 'search_papers') {
    return await runPaperSearch({
      query: params.query,
      source: params.source,
      limit: params.limit,
    }, fetchImpl)
  }

  if (action === 'resolve_paper') {
    return await runPaperLookup({
      id: params.id || params.query,
    }, fetchImpl)
  }

  return {
    content: `Error: Unsupported research_query action "${action}". Supported actions: search_papers, resolve_paper`,
    isError: true,
  }
}
