import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createJob,
  getJob,
  updateJob,
  cancelJob,
  listJobs,
  renderJobReport,
} from '../jobs/job-manager.js'
import { runResearchJob } from '../gateway-job.js'

describe('Job Manager Core', () => {
  it('creates, queries, and transitions job states in workspace', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tianshu-job-test-'))
    try {
      const job = createJob(tmp, {
        id: 'job_test_01',
        type: 'literature_screening',
        title: 'Cryogenic LEFM Literature Survey',
      })
      assert.equal(job.id, 'job_test_01')
      assert.equal(job.status, 'queued')
      assert.equal(job.progress, 0)
      assert.equal(job.events[0].stateTransition, 'IDLE -> PLAN')
      assert.equal(job.events[0].confidence, 1.0)
      assert.equal(job.events[0].action, 'create_job')

      // Query job
      const fetched = getJob(tmp, 'job_test_01')
      assert.equal(fetched.id, 'job_test_01')
      assert.equal(fetched.events.length, 1)

      // Update progress
      const updated = updateJob(tmp, 'job_test_01', {
        status: 'running',
        progress: 50,
        message: 'Screened 10 arXiv papers',
      })
      assert.equal(updated.status, 'running')
      assert.equal(updated.progress, 50)
      assert.equal(updated.events[1].stateTransition, 'QUEUED -> RUNNING')

      // Complete job
      const completed = updateJob(tmp, 'job_test_01', {
        status: 'completed',
        progress: 100,
        result: { papersFound: 10 },
      })
      assert.equal(completed.status, 'completed')
      assert.equal(completed.progress, 100)
      assert.equal(completed.events[2].stateTransition, 'RUNNING -> COMPLETED')

      // Render report
      const report = renderJobReport(completed)
      assert.match(report, /异步科研任务报告/)
      assert.match(report, /Cryogenic LEFM Literature Survey/)
      assert.match(report, /COMPLETED/)
      assert.match(report, /事件与因果追踪/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('records CVM causal trace events with confidence, metrics and causal reasons', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tianshu-job-cvm-'))
    try {
      const job = createJob(tmp, {
        id: 'cvm_job_01',
        type: 'scientific_claim_audit',
        title: 'Fracture Mechanics Causal Verification',
        causalReason: 'Initiated audit following research hypothesis formulation',
        confidence: 0.95,
        metrics: { claimsToAudit: 3 },
      })
      assert.equal(job.events[0].causalReason, 'Initiated audit following research hypothesis formulation')
      assert.equal(job.events[0].confidence, 0.95)
      assert.deepEqual(job.events[0].metrics, { claimsToAudit: 3 })

      // Transition PLAN -> EXECUTE
      const executing = updateJob(tmp, 'cvm_job_01', {
        status: 'running',
        progress: 30,
        stateTransition: 'PLAN -> EXECUTE',
        traceAction: 'resolve_paper',
        confidence: 0.98,
        causalReason: 'Target arXiv paper 2401.12345 resolved with valid OA PDF link',
        message: 'Reading section 3.2 fracture toughness values',
      })
      assert.equal(executing.events.length, 2)
      assert.equal(executing.events[1].stateTransition, 'PLAN -> EXECUTE')
      assert.equal(executing.events[1].action, 'resolve_paper')
      assert.equal(executing.events[1].confidence, 0.98)

      // Transition EXECUTE -> REFLECT
      const reflecting = updateJob(tmp, 'cvm_job_01', {
        status: 'running',
        progress: 60,
        stateTransition: 'EXECUTE -> REFLECT',
        traceAction: 'dimension_check',
        confidence: 0.7,
        causalReason: 'Dimensional mismatch detected in SI units: MPa*m^(1/2) expected, got Pa*m',
        message: 'Entering reflective loop to evaluate unit scaling factor',
      })
      assert.equal(reflecting.events.length, 3)
      assert.equal(reflecting.events[2].stateTransition, 'EXECUTE -> REFLECT')
      assert.match(reflecting.events[2].causalReason, /Dimensional mismatch/)

      // Transition REFLECT -> PLAN (Correction)
      const corrected = updateJob(tmp, 'cvm_job_01', {
        status: 'running',
        progress: 80,
        stateTransition: 'REFLECT -> PLAN',
        traceAction: 'adjust_extraction_rule',
        confidence: 0.96,
        causalReason: 'Corrected unit conversion factor from Pa to MPa',
        message: 'Plan updated with corrected multiplier',
      })
      assert.equal(corrected.events.length, 4)

      // Render report and check causal timeline output
      const report = renderJobReport(corrected)
      assert.match(report, /Causal Trace Timeline/)
      assert.match(report, /PLAN -> EXECUTE/)
      assert.match(report, /EXECUTE -> REFLECT/)
      assert.match(report, /REFLECT -> PLAN/)
      assert.match(report, /Reason: Dimensional mismatch/)
      assert.match(report, /conf: 0.7/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('cancels active job gracefully with HALT state transition', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tianshu-job-cancel-'))
    try {
      createJob(tmp, { id: 'job_to_cancel', title: 'Task to be cancelled' })
      const cancelled = cancelJob(tmp, 'job_to_cancel', 'timeout_exceeded')
      assert.equal(cancelled.status, 'cancelled')
      const lastEvent = cancelled.events[cancelled.events.length - 1]
      assert.equal(lastEvent.event, 'job_cancelled')
      assert.equal(lastEvent.stateTransition, 'RUNNING -> HALT')
      assert.equal(lastEvent.action, 'cancel_job')
      assert.equal(lastEvent.causalReason, 'timeout_exceeded')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('lists jobs with optional status filter', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tianshu-job-list-'))
    try {
      createJob(tmp, { id: 'job_a', type: 'type_1' })
      createJob(tmp, { id: 'job_b', type: 'type_2' })
      updateJob(tmp, 'job_b', { status: 'completed', progress: 100 })

      const all = listJobs(tmp)
      assert.equal(all.length, 2)

      const queuedOnly = listJobs(tmp, { status: 'queued' })
      assert.equal(queuedOnly.length, 1)
      assert.equal(queuedOnly[0].id, 'job_a')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('Research Job Gateway', () => {
  it('executes full job lifecycle via gateway actions including CVM trace parameters', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tianshu-gw-job-'))
    try {
      // 1. Start with causal trace parameters
      const startRes = await runResearchJob({
        action: 'start',
        workspace: tmp,
        jobId: 'run_gw_01',
        title: 'Batch Citation Extraction',
        stateTransition: 'IDLE -> PLAN',
        causalReason: 'User initiated batch extraction for 5 papers',
        confidence: 0.99,
        metrics: { totalPapers: 5 },
      })
      assert.equal(startRes.isError, undefined)
      assert.match(startRes.content, /异步科研任务已启动/)
      assert.equal(startRes.data.events[0].stateTransition, 'IDLE -> PLAN')
      assert.equal(startRes.data.events[0].confidence, 0.99)

      // 2. Query
      const queryRes = await runResearchJob({
        action: 'query',
        workspace: tmp,
        jobId: 'run_gw_01',
      })
      assert.equal(queryRes.isError, undefined)
      assert.match(queryRes.content, /QUEUED/)

      // 3. Update with CVM transition and causal reason
      const updateRes = await runResearchJob({
        action: 'update',
        workspace: tmp,
        jobId: 'run_gw_01',
        status: 'running',
        progress: 40,
        message: 'Parsing PDF sections',
        stateTransition: 'PLAN -> EXECUTE',
        causalReason: 'Commenced extraction on first batch of 2 papers',
        confidence: 0.94,
        metrics: { processed: 2 },
      })
      assert.equal(updateRes.isError, undefined)
      assert.ok(updateRes.content.includes('已更新为: running (40%)'))
      const lastEvent = updateRes.data.events[updateRes.data.events.length - 1]
      assert.equal(lastEvent.stateTransition, 'PLAN -> EXECUTE')
      assert.equal(lastEvent.causalReason, 'Commenced extraction on first batch of 2 papers')
      assert.equal(lastEvent.confidence, 0.94)

      // 4. List
      const listRes = await runResearchJob({
        action: 'list',
        workspace: tmp,
      })
      assert.equal(listRes.isError, undefined)
      assert.match(listRes.content, /检索到 1 项科研任务记录/)

      // 5. Report
      const reportRes = await runResearchJob({
        action: 'report',
        workspace: tmp,
        jobId: 'run_gw_01',
      })
      assert.equal(reportRes.isError, undefined)
      assert.match(reportRes.content, /Batch Citation Extraction/)
      assert.match(reportRes.content, /Causal Trace Timeline/)
      assert.match(reportRes.content, /PLAN -> EXECUTE/)

      // 6. Cancel
      const cancelRes = await runResearchJob({
        action: 'cancel',
        workspace: tmp,
        jobId: 'run_gw_01',
      })
      assert.equal(cancelRes.isError, undefined)
      assert.match(cancelRes.content, /已取消/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
