import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as ToolContracts from '../tool-contracts.js'
import * as Registry from '../contracts/registry.js'
import * as Validators from '../contracts/validators.js'
import { tools as nativeTools } from '../index.js'

describe('Contract Parity and Schema Integrity', () => {
  describe('tool-contracts.js export parity with contracts/', () => {
    it('re-exports all authoritative schemas from registry.js', () => {
      const expectedSchemas = [
        'PAPER_SEARCH_SCHEMA',
        'PAPER_LOOKUP_SCHEMA',
        'JOURNAL_PALETTE_SCHEMA',
        'RESEARCH_STATUS_SCHEMA',
        'RESEARCH_QUERY_SCHEMA',
        'RESEARCH_EVIDENCE_SCHEMA',
        'RESEARCH_COMPUTE_SCHEMA',
        'RESEARCH_DOCUMENT_SCHEMA',
        'RESEARCH_JOB_SCHEMA',
      ]
      for (const name of expectedSchemas) {
        assert.ok(ToolContracts[name], `Missing schema export: ${name}`)
        assert.equal(ToolContracts[name], Registry[name])
      }
    })

    it('re-exports all action constants and enums from registry.js', () => {
      const expectedConstants = [
        'ROLES',
        'SOURCES',
        'RESEARCH_QUERY_ACTIONS',
        'RESEARCH_EVIDENCE_ACTIONS',
        'RESEARCH_COMPUTE_ACTIONS',
        'RESEARCH_DOCUMENT_ACTIONS',
        'RESEARCH_JOB_ACTIONS',
        'TOOL_DESCRIPTIONS',
      ]
      for (const name of expectedConstants) {
        assert.ok(ToolContracts[name], `Missing constant export: ${name}`)
        assert.equal(ToolContracts[name], Registry[name])
      }
    })

    it('re-exports all parameter validators from validators.js', () => {
      const expectedValidators = [
        'validatePaperSearchParams',
        'validatePaperLookupParams',
        'validateJournalPaletteParams',
        'validateResearchStatusParams',
        'validateResearchQueryParams',
        'validateResearchEvidenceParams',
        'validateResearchComputeParams',
        'validateResearchDocumentParams',
        'validateResearchJobParams',
      ]
      for (const name of expectedValidators) {
        assert.equal(typeof ToolContracts[name], 'function', `Missing validator export: ${name}`)
        assert.equal(ToolContracts[name], Validators[name])
      }
    })
  })

  describe('RESEARCH_EVIDENCE_SCHEMA field parity', () => {
    const props = ToolContracts.RESEARCH_EVIDENCE_SCHEMA.properties

    it('contains all document ingestion and section reading fields', () => {
      assert.ok(props.docId, 'docId must exist in schema properties')
      assert.ok(props.sourcePath, 'sourcePath must exist in schema properties')
      assert.ok(props.text, 'text must exist in schema properties')
      assert.ok(props.section, 'section must exist in schema properties')
      assert.ok(props.maxChars, 'maxChars must exist in schema properties')
      assert.ok(props.offset, 'offset must exist in schema properties')
      assert.ok(props.outputPath, 'outputPath must exist in schema properties')
      assert.ok(props.locatorThreshold, 'locatorThreshold must exist in schema properties')
    })

    it('validates ingest_document action with docId, text, and sourcePath', () => {
      const vValidText = ToolContracts.validateResearchEvidenceParams({
        action: 'ingest_document',
        docId: 'doc_1',
        text: 'Sample paper text',
      })
      assert.equal(vValidText.ok, true)
      assert.equal(vValidText.value.docId, 'doc_1')
      assert.equal(vValidText.value.text, 'Sample paper text')

      const vValidPath = ToolContracts.validateResearchEvidenceParams({
        action: 'ingest_document',
        id: 'doc_2',
        sourcePath: 'path/to/paper.txt',
      })
      assert.equal(vValidPath.ok, true)
      assert.equal(vValidPath.value.docId, 'doc_2')
      assert.equal(vValidPath.value.sourcePath, 'path/to/paper.txt')

      const vMissingBoth = ToolContracts.validateResearchEvidenceParams({
        action: 'ingest_document',
        docId: 'doc_3',
      })
      assert.equal(vMissingBoth.ok, false)
      assert.ok(vMissingBoth.error.includes('text or sourcePath is required'))
    })

    it('validates read_section action with docId, section, maxChars, and offset', () => {
      const vSec = ToolContracts.validateResearchEvidenceParams({
        action: 'read_section',
        docId: 'doc_1',
        section: 'Introduction',
        maxChars: 1500,
        offset: 200,
      })
      assert.equal(vSec.ok, true)
      assert.equal(vSec.value.docId, 'doc_1')
      assert.equal(vSec.value.section, 'Introduction')
      assert.equal(vSec.value.maxChars, 1500)
      assert.equal(vSec.value.offset, 200)

      const vMissingSec = ToolContracts.validateResearchEvidenceParams({
        action: 'read_section',
        docId: 'doc_1',
      })
      assert.equal(vMissingSec.ok, false)
      assert.ok(vMissingSec.error.includes('section is required'))
    })

    it('validates export_csl_json and export_ris with outputPath', () => {
      const vCsl = ToolContracts.validateResearchEvidenceParams({
        action: 'export_csl_json',
        outputPath: 'export/out.csl.json',
      })
      assert.equal(vCsl.ok, true)
      assert.equal(vCsl.value.outputPath, 'export/out.csl.json')

      const vRis = ToolContracts.validateResearchEvidenceParams({
        action: 'export_ris',
        outputPath: 'export/out.ris',
      })
      assert.equal(vRis.ok, true)
      assert.equal(vRis.value.outputPath, 'export/out.ris')
    })

    it('rejects unknown properties in evidence requests strictly', () => {
      const vBad = ToolContracts.validateResearchEvidenceParams({
        action: 'add_source',
        id: 's1',
        title: 'T',
        unrecognizedParam: 42,
      })
      assert.equal(vBad.ok, false)
      assert.ok(vBad.error.includes('Unknown property: unrecognizedParam'))
    })
  })

  describe('Native plugin tool definition parity', () => {
    it('exposes exactly the four public gateways', () => {
      const toolNames = nativeTools.map((t) => t.definition.name)
      assert.deepEqual(toolNames.sort(), [
        'journal_palette',
        'research_evidence',
        'research_query',
        'research_status',
      ])
    })

    it('binds authoritative descriptions and input_schemas', () => {
      for (const t of nativeTools) {
        const name = t.definition.name
        assert.equal(t.definition.description, ToolContracts.TOOL_DESCRIPTIONS[name])
        assert.ok(t.definition.input_schema, `Missing schema on ${name}`)
        assert.equal(typeof t.execute, 'function')
      }
    })
  })
})
