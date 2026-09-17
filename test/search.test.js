import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  clampLimit,
  cleanDoi,
  formatPaperTable,
  mapOpenAlexWork,
  mergePapers,
  parseArxivAtom,
  parsePaperRef,
  reconstructInvertedAbstract,
  searchPapers,
  searchOpenAlex,
  formatPaperCard,
  getOpenAlexMailto,
  _setArxivMinIntervalForTest,
  _resetArxivThrottleForTest,
} from '../search.js'

const fixtureDir = dirname(fileURLToPath(import.meta.url))

describe('tianshu-research search parsers', () => {
  it('clamps per-source limit to 1–8', () => {
    assert.equal(clampLimit(99), 8)
    assert.equal(clampLimit(0), 1)
    assert.equal(clampLimit('nope'), 5)
  })

  it('parses arXiv Atom entries including pdf link and authors', () => {
    const xml = readFileSync(join(fixtureDir, 'arxiv-sample.xml'), 'utf8')
    const papers = parseArxivAtom(xml)
    assert.equal(papers.length, 1)
    assert.equal(papers[0].arxivId, '1706.03762')
    assert.match(papers[0].title, /Attention Is All You Need/i)
    assert.ok(papers[0].authors.includes('Ashish Vaswani'))
    assert.equal(papers[0].year, '2017')
    assert.ok(papers[0].pdfUrl.includes('pdf'))
  })

  it('ignores arXiv error entries in Atom feed', () => {
    const errXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/api/errors#1</id>
    <title>Error</title>
    <summary>Error: incorrect id format</summary>
  </entry>
</feed>`
    const papers = parseArxivAtom(errXml)
    assert.equal(papers.length, 0)
  })

  it('decodes XML numeric and standard entities', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2101.00001</id>
    <title>Entangled &amp; &#65;&#66;&#67; &lt;Systems&gt;</title>
    <summary>Research summary</summary>
    <published>2021-01-01</published>
  </entry>
</feed>`
    const papers = parseArxivAtom(xml)
    assert.equal(papers.length, 1)
    assert.equal(papers[0].title, 'Entangled & ABC <Systems>')
  })

  it('maps OpenAlex works and distinguishes oaUrl from pdfUrl', () => {
    const work = {
      display_name: 'Attention Is All You Need',
      publication_year: 2017,
      doi: 'https://doi.org/10.5555/3295222.3295349',
      authorships: [{ author: { display_name: 'Ashish Vaswani' } }],
      open_access: { is_oa: true, oa_url: 'https://example.com/landing' },
      primary_location: { landing_page_url: 'https://example.com/paper', pdf_url: null },
      best_oa_location: { landing_page_url: 'https://example.com/landing', pdf_url: 'https://example.com/actual.pdf' },
      cited_by_count: 42,
    }
    const mapped = mapOpenAlexWork(work)
    assert.ok(mapped)
    assert.equal(mapped.doi, '10.5555/3295222.3295349')
    assert.equal(mapped.pdfUrl, 'https://example.com/actual.pdf')
    assert.equal(mapped.oaUrl, 'https://example.com/landing')
    const merged = mergePapers([
      [mapped],
      [{
        ...mapped,
        source: 'arxiv',
        arxivId: '1706.03762',
        abstract: '',
        pdfUrl: '',
      }],
    ])
    assert.equal(merged.length, 1)
  })

  it('cleanDoi handles balanced parentheses and strips trailing dots/semicolons', () => {
    assert.equal(cleanDoi('10.1234/foo(bar)'), '10.1234/foo(bar)')
    assert.equal(cleanDoi('10.1234/foo(bar);'), '10.1234/foo(bar)')
    assert.equal(cleanDoi('10.1234/foo(bar).'), '10.1234/foo(bar)')
    assert.equal(cleanDoi('10.1234/foo)'), '10.1234/foo')
  })

  it('formats an empty result without pretending it is a review', () => {
    assert.match(formatPaperTable([]), /没有结果/)
  })

  it('searchPapers uses injected fetch and reports partial source failure', async () => {
    const xml = readFileSync(join(fixtureDir, 'arxiv-sample.xml'), 'utf8')
    const fetchImpl = async (url) => {
      const href = String(url)
      if (href.includes('arxiv.org')) {
        return { ok: true, text: async () => xml }
      }
      return { ok: false, status: 503, text: async () => 'down' }
    }
    const { papers, errors } = await searchPapers({
      query: 'attention',
      source: 'both',
      limit: 3,
      fetchImpl,
    })
    assert.equal(papers.length, 1)
    assert.ok(errors.some((e) => e.startsWith('openalex:')))
  })

  it('parsePaperRef accepts arXiv abs/pdf URLs, versions, and balanced DOI URLs', () => {
    assert.deepEqual(parsePaperRef('https://arxiv.org/abs/1706.03762'), { kind: 'arxiv', id: '1706.03762' })
    assert.deepEqual(parsePaperRef('https://arxiv.org/pdf/1706.03762v7.pdf'), { kind: 'arxiv', id: '1706.03762', version: 'v7' })
    assert.deepEqual(parsePaperRef('arxiv:1706.03762v7'), { kind: 'arxiv', id: '1706.03762', version: 'v7' })
    assert.deepEqual(parsePaperRef('https://arxiv.org/abs/quant-ph/0308137'), { kind: 'arxiv', id: 'quant-ph/0308137' })
    assert.deepEqual(parsePaperRef('https://doi.org/10.5555/3295222.3295349'), { kind: 'doi', id: '10.5555/3295222.3295349' })
    assert.deepEqual(parsePaperRef('10.1002/sim(123)'), { kind: 'doi', id: '10.1002/sim(123)' })
    assert.equal(parsePaperRef('transformer attention'), null)
  })

  it('reconstructs an OpenAlex inverted abstract safely with bounds', () => {
    const text = reconstructInvertedAbstract({
      Attention: [0],
      Is: [1],
      All: [2],
      You: [3],
      Need: [4],
      OutOfBounds: [999999],
    })
    assert.equal(text, 'Attention Is All You Need')
    assert.equal(reconstructInvertedAbstract(null), '')
  })

  it('mapOpenAlexWork fills abstract from inverted index', () => {
    const mapped = mapOpenAlexWork({
      display_name: 'Attention Is All You Need',
      publication_year: 2017,
      doi: 'https://doi.org/10.5555/3295222.3295349',
      authorships: [{ author: { display_name: 'Ashish Vaswani' } }],
      open_access: { is_oa: false, oa_url: null },
      primary_location: { landing_page_url: 'https://example.com/paper', pdf_url: null },
      abstract_inverted_index: { Attention: [0], Need: [1] },
      cited_by_count: 42,
    })
    assert.ok(mapped)
    assert.equal(mapped.abstract, 'Attention Need')
  })

  it('searchPapers treats a pasted arXiv URL as lookup, not keyword search', async () => {
    const xml = readFileSync(join(fixtureDir, 'arxiv-sample.xml'), 'utf8')
    const seen = []
    const fetchImpl = async (url) => {
      seen.push(String(url))
      return { ok: true, text: async () => xml }
    }
    const { papers, errors } = await searchPapers({
      query: 'https://arxiv.org/abs/1706.03762',
      source: 'both',
      fetchImpl,
    })
    assert.equal(errors.length, 0)
    assert.equal(papers.length, 1)
    assert.ok(seen.some((u) => u.includes('id_list=1706.03762')))
    assert.ok(!seen.some((u) => u.includes('search_query=')))
  })
  it('appends mailto parameter and api_key to OpenAlex works search', async () => {
    const seenUrls = []
    const fetchImpl = async (url) => {
      seenUrls.push(String(url))
      return { ok: true, text: async () => JSON.stringify({ results: [] }) }
    }
    process.env.OPENALEX_MAILTO = 'researcher@example.org'
    process.env.OPENALEX_API_KEY = 'test_oa_key'
    try {
      await searchOpenAlex('pinn', 3, fetchImpl)
      assert.ok(seenUrls.length === 1)
      assert.ok(seenUrls[0].includes('mailto=researcher%40example.org'))
      assert.ok(seenUrls[0].includes('api_key=test_oa_key'))
    } finally {
      delete process.env.OPENALEX_MAILTO
      delete process.env.OPENALEX_API_KEY
    }
  })

  it('formatPaperCard outputs arXiv HTML direct reading link', () => {
    const card = formatPaperCard({
      source: 'arxiv',
      title: 'Physics-informed neural networks',
      arxivId: '1711.10561v1',
      pdfUrl: 'https://arxiv.org/pdf/1711.10561v1',
    })
    assert.ok(card.includes('- html: https://arxiv.org/html/1711.10561'))
  })

  it('handles 429 and 403 errors with structured friendly guidance', async () => {
    _setArxivMinIntervalForTest(0)
    try {
      const fetch429 = async () => ({ ok: false, status: 429, text: async () => 'Too Many Requests' })
      const res429 = await searchPapers({ query: 'quantum', source: 'arxiv', fetchImpl: fetch429 })
      assert.ok(res429.errors.some((e) => e.includes('429 Too Many Requests') && e.includes('数据源速率受限')))

      const fetch403 = async () => ({ ok: false, status: 403, text: async () => 'Forbidden' })
      const res403 = await searchPapers({ query: 'quantum', source: 'openalex', fetchImpl: fetch403 })
      assert.ok(res403.errors.some((e) => e.includes('403 Forbidden') && e.includes('数据源访问受限')))
    } finally {
      _resetArxivThrottleForTest()
    }
  })
});
