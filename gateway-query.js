/**
 * Research Query Gateway for tianshu-research.
 * Unifies paper search and metadata lookup across arXiv and OpenAlex.
 */

import { runPaperLookup, runPaperSearch, formatPaperTable } from './search.js'
import { createOpenAlexConnector } from './connectors/openalex.js'
import { createArxivConnector } from './connectors/arxiv.js'
import { SnapshotTransport } from './connectors/source-snapshot.js'
import { assertInvocationAuthorized } from './scope/invocation-guard.js'

export async function runResearchQuery(params = {}, fetchImpl = fetch, context = {}) {
  let effectiveFetch = fetchImpl
  let effectiveContext = context
  if (typeof fetchImpl !== 'function') {
    effectiveContext = fetchImpl || {}
    effectiveFetch = fetch
  }

  const action = typeof params.action === 'string' ? params.action.trim() : ''

  try {
    assertInvocationAuthorized('research_query', action, params, effectiveContext)
  } catch (err) {
    return {
      content: `科研检索受限: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    }
  }

  if (action === 'search_papers') {
    return await runPaperSearch({
      query: params.query,
      source: params.source,
      limit: params.limit,
    }, effectiveFetch)
  }

  if (action === 'resolve_paper') {
    return await runPaperLookup({
      id: params.id || params.query,
    }, effectiveFetch)
  }

  if (action === 'search_sources') {
    return await runConnectorSearch(params, effectiveFetch)
  }

  return {
    content: `Error: Unsupported research_query action "${action}". Supported actions: search_papers, resolve_paper, search_sources`,
    isError: true,
  }
}

/**
 * Connector-backed search (Phase 9A): cursor/start pagination, dedup with
 * version merge, honest 429 backoff, and optional offline snapshot mode.
 * `mode: 'replay'` never touches the network and fails honestly on a
 * SNAPSHOT_MISS; `mode: 'record'` persists responses for later replay.
 */
async function runConnectorSearch(params, effectiveFetch) {
  const query = typeof params.query === 'string' ? params.query.trim() : ''
  if (!query) {
    return { content: 'Error: query 必填', isError: true }
  }
  const source = String(params.source || 'openalex').toLowerCase()
  const mode = ['live', 'record', 'replay'].includes(params.mode) ? params.mode : 'live'
  const snapshotDir = params.snapshotDir
  if (mode !== 'live' && !snapshotDir) {
    return { content: `Error: mode "${mode}" 需要 snapshotDir 参数`, isError: true }
  }

  try {
    const transport = new SnapshotTransport({
      mode,
      snapshotDir,
      fetchImpl: effectiveFetch,
    })

    let result
    if (source === 'openalex') {
      const connector = createOpenAlexConnector({ transport })
      const { records, meta } = await connector.searchWorks({
        query,
        maxResults: params.maxResults || 25,
      })
      result = { papers: records, meta: { source, pages: meta.pages, rawCount: meta.rawCount } }
    } else if (source === 'arxiv') {
      const connector = createArxivConnector({ transport })
      const { records, meta } = await connector.search({
        query,
        maxResults: params.maxResults || 25,
      })
      result = { papers: records, meta: { source, pages: meta.pages } }
    } else {
      return { content: `Error: search_sources 的 source 支持 openalex / arxiv（收到「${source}」）`, isError: true }
    }

    const metaLine = `检索完成（${result.meta.source}，分页 ${result.meta.pages} 次${result.meta.rawCount !== undefined ? `，原始 ${result.meta.rawCount} 条` : ''}，mode=${mode}）。`
    if (result.papers.length === 0) {
      return { content: `${metaLine}\n没有结果。换关键词，或注明这是 OA 初筛。` }
    }
    return { content: `${metaLine}\n\n${formatPaperTable(result.papers)}` }
  } catch (err) {
    return { content: `检索失败：${err instanceof Error ? err.message : String(err)}`, isError: true }
  }
}
