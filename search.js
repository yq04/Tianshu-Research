/**
 * Thin OA literature lookup — arXiv Atom + OpenAlex JSON.
 * Not a replacement for paper-search-mcp (20 sources); enough for click-to-use screening.
 */

export function getOpenAlexMailto() {
  return process.env.OPENALEX_MAILTO?.trim() || 'tianshu-research@users.noreply.github.com'
}

export const USER_AGENT = 'TianshuResearch/0.1 (https://github.com/huiliyi37/Tianshu-harness)'
const FETCH_MS = 12_000
const MAX_LIMIT = 8

let lastArxivReqTime = 0
let arxivQueue = Promise.resolve()
let arxivMinIntervalMs = 3000

export function _setArxivMinIntervalForTest(ms) {
  arxivMinIntervalMs = ms
}

export function _resetArxivThrottleForTest() {
  lastArxivReqTime = 0
  arxivQueue = Promise.resolve()
  arxivMinIntervalMs = 3000
}

export async function scheduleArxiv(fn) {
  const run = async () => {
    const now = Date.now()
    const elapsed = now - lastArxivReqTime
    if (elapsed < arxivMinIntervalMs && lastArxivReqTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, arxivMinIntervalMs - elapsed))
    }
    lastArxivReqTime = Date.now()
    return fn()
  }
  const next = arxivQueue.then(run, run)
  arxivQueue = next.catch(() => {})
  return next
}

export function clampLimit(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 5
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(v)))
}

function decodeXml(s) {
  return String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function tagText(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const m = block.match(re)
  return m ? decodeXml(m[1]) : ''
}

function arxivIdFromUrl(idUrl) {
  const s = String(idUrl)
  const neu = s.match(/arxiv\.org\/(?:abs|pdf|html|e-print)\/(\d{4}\.\d{4,5})(?:v\d+)?/i)
  if (neu) return neu[1]
  const old = s.match(/arxiv\.org\/(?:abs|pdf|html|e-print)\/([a-z-]+(?:\.[a-z-]+)?\/\d{7})(?:v\d+)?/i)
  return old ? old[1] : ''
}

export function cleanDoi(rawDoi) {
  let doi = String(rawDoi ?? '').trim()
  doi = doi.replace(/[.,;]+$/, '')
  while (doi.endsWith(')')) {
    const openCount = (doi.match(/\(/g) || []).length
    const closeCount = (doi.match(/\)/g) || []).length
    if (closeCount > openCount) {
      doi = doi.slice(0, -1).replace(/[.,;]+$/, '')
    } else {
      break
    }
  }
  return doi
}

/** Parse a pasted arXiv URL/id or DOI. Inspired by gpt_academic arxiv helper UX; not their code. */
export function parsePaperRef(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null

  if (/^https?:\/\//i.test(s)) {
    try {
      const parsed = new URL(s)
      const host = parsed.hostname.toLowerCase()
      if (host === 'arxiv.org' || host.endsWith('.arxiv.org')) {
        const m = parsed.pathname.match(/\/(?:abs|pdf|html|e-print)\/([a-z-]+(?:\.[a-z-]+)?\/\d{7}|\d{4}\.\d{4,5})(v\d+)?(?:\.pdf)?$/i)
        if (m) {
          const res = { kind: 'arxiv', id: m[1] }
          if (m[2]) res.version = m[2]
          return res
        }
      }
      if (host === 'doi.org' || host.endsWith('.doi.org')) {
        const doiPath = parsed.pathname.replace(/^\//, '')
        const doiMatch = doiPath.match(/^(10\.\d{4,}\/.+)$/)
        if (doiMatch) {
          return { kind: 'doi', id: cleanDoi(doiMatch[1]) }
        }
      }
    } catch {
      // fallback
    }
  }

  const arxivNeu = s.match(/^(?:arxiv:\s*)?(\d{4}\.\d{4,5})(v\d+)?$/i)
  if (arxivNeu) {
    const res = { kind: 'arxiv', id: arxivNeu[1] }
    if (arxivNeu[2]) res.version = arxivNeu[2]
    return res
  }

  const arxivOld = s.match(/^(?:arxiv:\s*)?([a-z-]+(?:\.[a-z-]+)?\/\d{7})(v\d+)?$/i)
  if (arxivOld) {
    const res = { kind: 'arxiv', id: arxivOld[1] }
    if (arxivOld[2]) res.version = arxivOld[2]
    return res
  }

  const doiMatch = s.match(/^(?:doi:\s*)?(10\.\d{4,}\/\S+)$/i)
  if (doiMatch) return { kind: 'doi', id: cleanDoi(doiMatch[1]) }

  return null
}

/** OpenAlex stores abstracts as inverted index; reconstruct for the reading card. */
export function reconstructInvertedAbstract(index, maxLen = 500) {
  if (!index || typeof index !== 'object' || Array.isArray(index)) return ''
  const MAX_POS = 2000
  const entries = []
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue
    for (const pos of positions) {
      if (Number.isInteger(pos) && pos >= 0 && pos <= MAX_POS) {
        entries.push([pos, word])
      }
    }
  }
  if (entries.length === 0) return ''
  entries.sort((a, b) => a[0] - b[0])
  const words = []
  let expectedPos = 0
  for (const [pos, word] of entries) {
    while (expectedPos < pos) {
      words.push('')
      expectedPos++
    }
    words.push(word)
    expectedPos = pos + 1
  }
  return words.filter(Boolean).join(' ').slice(0, maxLen)
}

export function parseArxivAtom(xml) {
  const parts = String(xml).split(/<entry[\s>]/i).slice(1)
  const out = []
  for (const raw of parts) {
    const title = tagText(raw, 'title')
    if (!title || title.toLowerCase() === 'error') continue
    const summary = tagText(raw, 'summary')
    if (summary.toLowerCase().startsWith('error:')) continue

    const idUrl = tagText(raw, 'id')
    const published = tagText(raw, 'published')
    const doiMatch = raw.match(/<arxiv:doi[^>]*>([^<]+)<\/arxiv:doi>/i)
      ?? raw.match(/<doi[^>]*>([^<]+)<\/doi>/i)
    const pdfMatch = raw.match(/href=["']([^"']+)["'][^>]*(?:type=["']application\/pdf["']|title=["']pdf["'])/i)
      ?? raw.match(/<link[^>]*title=["']pdf["'][^>]*href=["']([^"']+)["']/i)
      ?? raw.match(/<link[^>]*href=["']([^"']+)["'][^>]*title=["']pdf["']/i)
    const authors = [...raw.matchAll(/<name>([^<]*)<\/name>/gi)].map((m) => decodeXml(m[1])).filter(Boolean)
    const arxivId = arxivIdFromUrl(idUrl)
    const doi = doiMatch ? decodeXml(doiMatch[1]) : ''
    out.push({
      source: 'arxiv',
      title,
      authors,
      year: published.slice(0, 4) || '',
      doi,
      arxivId,
      landingUrl: idUrl || (arxivId ? `https://arxiv.org/abs/${arxivId}` : ''),
      pdfUrl: pdfMatch ? decodeXml(pdfMatch[1]) : (arxivId ? `https://arxiv.org/pdf/${arxivId}` : ''),
      abstract: summary.slice(0, 500),
    })
  }
  return out
}

export function mapOpenAlexWork(work) {
  if (!work || typeof work !== 'object') return null
  const title = decodeXml(work.display_name || work.title || '')
  if (!title) return null
  const authors = Array.isArray(work.authorships)
    ? work.authorships.map((a) => a?.author?.display_name).filter(Boolean)
    : []
  const doiRaw = typeof work.doi === 'string' ? work.doi.replace(/^https?:\/\/doi\.org\//i, '') : ''
  const bestOa = work.best_oa_location || {}
  const primaryLoc = work.primary_location || {}
  const pdfUrl = (bestOa.pdf_url && typeof bestOa.pdf_url === 'string')
    ? bestOa.pdf_url
    : ((primaryLoc.pdf_url && typeof primaryLoc.pdf_url === 'string') ? primaryLoc.pdf_url : '')
  const oaUrl = (typeof work.open_access?.oa_url === 'string' && work.open_access.oa_url !== pdfUrl)
    ? work.open_access.oa_url
    : undefined
  const landingUrl = bestOa.landing_page_url || primaryLoc.landing_page_url || (doiRaw ? `https://doi.org/${doiRaw}` : '') || work.id || ''
  return {
    source: 'openalex',
    title,
    authors,
    year: work.publication_year ? String(work.publication_year) : '',
    doi: doiRaw,
    arxivId: '',
    landingUrl,
    pdfUrl,
    oaUrl,
    abstract: reconstructInvertedAbstract(work.abstract_inverted_index),
    citedBy: typeof work.cited_by_count === 'number' ? work.cited_by_count : undefined,
    oa: work.open_access?.is_oa === true,
  }
}

export function mergePapers(lists) {
  const seen = new Set()
  const out = []
  for (const paper of lists.flat()) {
    const key = (paper.doi && `doi:${paper.doi.toLowerCase()}`)
      || (paper.arxivId && `arxiv:${paper.arxivId}`)
      || `title:${paper.title.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(paper)
  }
  return out
}

export function formatPaperTable(papers) {
  if (papers.length === 0) {
    return '没有结果。换关键词，或注明这是 OA 初筛（付费论文 / Google Scholar 不在本工具里）。'
  }
  const lines = [
    '| # | year | source | title | authors | doi / id | pdf |',
    '|---|------|--------|-------|---------|----------|-----|',
  ]
  papers.forEach((p, i) => {
    const authors = (p.authors || []).slice(0, 3).join(', ')
    const id = p.doi || (p.arxivId ? `arXiv:${p.arxivId}` : '')
    const pdf = p.pdfUrl ? 'OA' : '—'
    lines.push(`| ${i + 1} | ${p.year || '—'} | ${p.source} | ${p.title.replace(/\|/g, '/')} | ${authors.replace(/\|/g, '/')} | ${id} | ${pdf} |`)
  })
  lines.push('')
  lines.push('短用：把候选表给用户选，不要编造 DOI。要精读某篇再用 paper_lookup。公式/图表看原 PDF，不要把摘要当验证。')
  return lines.join('\n')
}

async function fetchText(url, fetchImpl) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS)
  try {
    const res = await fetchImpl(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': `TianshuResearch/0.1 (mailto:${getOpenAlexMailto()}; https://github.com/huiliyi37/Tianshu-harness)`,
        Accept: 'application/atom+xml, application/json, */*',
      },
    })
    const body = await res.text()
    if (!res.ok) {
      if (res.status === 429) {
        throw new Error(`429 Too Many Requests: 数据源速率受限 (${url})，请稍后重试或配置专用 API 密钥`)
      }
      if (res.status === 403) {
        throw new Error(`403 Forbidden: 数据源访问受限 (${url})，请检查网络代理或配置合法 OPENALEX_MAILTO`)
      }
      throw new Error(`${res.status} ${url}: ${body.slice(0, 180)}`)
    }
    return body
  } finally {
    clearTimeout(timer)
  }
}

export async function searchArxiv(query, limit, fetchImpl = fetch) {
  const n = clampLimit(limit)
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(`all:${query}`)}&start=0&max_results=${n}`
  const xml = await scheduleArxiv(() => fetchText(url, fetchImpl))
  return parseArxivAtom(xml).slice(0, n)
}

export async function searchOpenAlex(query, limit, fetchImpl = fetch) {
  const n = clampLimit(limit)
  const mailto = getOpenAlexMailto()
  let url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=is_oa:true&per_page=${n}&mailto=${encodeURIComponent(mailto)}`
  if (process.env.OPENALEX_API_KEY?.trim()) {
    url += `&api_key=${encodeURIComponent(process.env.OPENALEX_API_KEY.trim())}`
  }
  const raw = await fetchText(url, fetchImpl)
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('OpenAlex 返回了非 JSON')
  }
  const results = Array.isArray(data.results) ? data.results : []
  return results.map(mapOpenAlexWork).filter(Boolean).slice(0, n)
}

export async function lookupArxiv(arxivId, fetchImpl = fetch) {
  const id = String(arxivId).replace(/^arxiv:/i, '').replace(/v\d+$/, '').trim()
  const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`
  const xml = await scheduleArxiv(() => fetchText(url, fetchImpl))
  const papers = parseArxivAtom(xml)
  return papers[0] ?? null
}

export async function lookupOpenAlexDoi(doi, fetchImpl = fetch) {
  const clean = cleanDoi(String(doi).replace(/^https?:\/\/doi\.org\//i, ''))
  if (!/^10\.\d{4,}\/\S+$/.test(clean)) {
    throw new Error(`不像 DOI：${doi}`)
  }
  const mailto = getOpenAlexMailto()
  let url = `https://api.openalex.org/works/doi:${encodeURIComponent(clean)}?mailto=${encodeURIComponent(mailto)}`
  if (process.env.OPENALEX_API_KEY?.trim()) {
    url += `&api_key=${encodeURIComponent(process.env.OPENALEX_API_KEY.trim())}`
  }
  const raw = await fetchText(url, fetchImpl)
  try {
    return mapOpenAlexWork(JSON.parse(raw))
  } catch {
    throw new Error('OpenAlex lookup 返回了非 JSON')
  }
}

export async function lookupPaper(raw, fetchImpl = fetch) {
  const ref = parsePaperRef(raw)
  if (!ref) {
    return { paper: null, error: `无法识别「${String(raw ?? '').slice(0, 80)}」。请给 arXiv（1706.03762 或 abs 链接）或 DOI。` }
  }
  if (ref.kind === 'arxiv') {
    const paper = await lookupArxiv(ref.id, fetchImpl)
    return { paper, error: paper ? null : `未找到 arXiv:${ref.id}` }
  }
  const paper = await lookupOpenAlexDoi(ref.id, fetchImpl)
  return { paper, error: paper ? null : `未找到 DOI ${ref.id}` }
}

export function formatPaperCard(paper) {
  const lines = [
    `# ${paper.title}`,
    '',
    `- source: ${paper.source}`,
    `- year: ${paper.year || '—'}`,
    `- authors: ${(paper.authors || []).join(', ') || '—'}`,
    `- doi: ${paper.doi || '—'}`,
    `- arxiv: ${paper.arxivId || '—'}`,
    `- landing: ${paper.landingUrl || '—'}`,
    `- pdf: ${paper.pdfUrl || '（无 OA PDF）'}`,
  ]
  if (paper.arxivId) {
    const cleanId = String(paper.arxivId).replace(/^arxiv:/i, '').replace(/v\d+$/, '').trim()
    lines.push(`- html: https://arxiv.org/html/${cleanId}`)
  }
  if (paper.oaUrl) {
    lines.push(`- oa_landing: ${paper.oaUrl}`)
  }
  if (paper.abstract) {
    lines.push('', '## abstract', paper.abstract)
  }
  lines.push('', '这是元数据+摘要，不是全文。中文解读只根据摘要写问题/方法/结果/局限四行，并声明未读全文。公式/图表打开 PDF。')
  return lines.join('\n')
}

export async function searchPapers({ query, source = 'both', limit = 5, fetchImpl = fetch }) {
  const q = String(query ?? '').trim()
  if (!q) return { papers: [], errors: ['query 必填'] }

  const ref = parsePaperRef(q)
  if (ref) {
    try {
      const { paper, error } = await lookupPaper(q, fetchImpl)
      if (paper) return { papers: [paper], errors: [] }
      return { papers: [], errors: [error || 'lookup 失败'] }
    } catch (err) {
      return { papers: [], errors: [err instanceof Error ? err.message : String(err)] }
    }
  }
  const src = String(source || 'both').toLowerCase()
  const errors = []
  const buckets = []

  if (src === 'both') {
    const [arxivRes, openalexRes] = await Promise.allSettled([
      searchArxiv(q, limit, fetchImpl),
      searchOpenAlex(q, limit, fetchImpl),
    ])
    if (arxivRes.status === 'fulfilled') {
      buckets.push(arxivRes.value)
    } else {
      errors.push(`arxiv: ${arxivRes.reason instanceof Error ? arxivRes.reason.message : String(arxivRes.reason)}`)
    }
    if (openalexRes.status === 'fulfilled') {
      buckets.push(openalexRes.value)
    } else {
      errors.push(`openalex: ${openalexRes.reason instanceof Error ? openalexRes.reason.message : String(openalexRes.reason)}`)
    }
  } else if (src === 'arxiv') {
    try {
      buckets.push(await searchArxiv(q, limit, fetchImpl))
    } catch (err) {
      errors.push(`arxiv: ${err instanceof Error ? err.message : String(err)}`)
    }
  } else if (src === 'openalex') {
    try {
      buckets.push(await searchOpenAlex(q, limit, fetchImpl))
    } catch (err) {
      errors.push(`openalex: ${err instanceof Error ? err.message : String(err)}`)
    }
  } else {
    errors.push(`未知 source「${source}」，请用 arxiv / openalex / both`)
  }

  return { papers: mergePapers(buckets), errors }
}

export async function runPaperSearch(params, fetchImpl = fetch) {
  const query = typeof params.query === 'string' ? params.query.trim() : ''
  if (!query) return { content: 'Error: query 必填', isError: true }
  try {
    const { papers, errors } = await searchPapers({
      query,
      source: params.source,
      limit: params.limit,
      fetchImpl,
    })
    const table = papers.length === 1 && papers[0]?.abstract
      ? formatPaperCard(papers[0])
      : formatPaperTable(papers)
    const errBlock = errors.length > 0 ? `\n\n部分源失败：\n- ${errors.join('\n- ')}` : ''
    if (papers.length === 0 && errors.length > 0) {
      return { content: `检索失败。${errBlock}`, isError: true }
    }
    return { content: table + errBlock }
  } catch (err) {
    return { content: `检索失败：${err instanceof Error ? err.message : String(err)}`, isError: true }
  }
}

export async function runPaperLookup(params, fetchImpl = fetch) {
  const id = typeof params.id === 'string' ? params.id.trim() : ''
  if (!id) return { content: 'Error: id 必填（arXiv 链接/id 或 DOI）', isError: true }
  try {
    const { paper, error } = await lookupPaper(id, fetchImpl)
    if (!paper) return { content: error || `未找到：${id}`, isError: true }
    return { content: formatPaperCard(paper) }
  } catch (err) {
    return { content: `查找失败：${err instanceof Error ? err.message : String(err)}`, isError: true }
  }
}



