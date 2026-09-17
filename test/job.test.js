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

      // Complete job
      const completed = updateJob(tmp, 'job_test_01', {
        status: 'completed',
        progress: 100,
        result: { papersFound: 10 },
      })
      assert.equal(completed.status, 'completed')
      assert.equal(completed.progress, 100)

      // Render report
      const report = renderJobReport(completed)
      assert.match(report, /异步科研任务报告/)
      assert.match(report, /Cryogenic LEFM Literature Survey/)
      assert.match(report, /COMPLETED/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('cancels active job gracefully', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tianshu-job-cancel-'))
    try {
      createJob(tmp, { id: 'job_to_cancel', title: 'Task to be cancelled' })
      const cancelled = cancelJob(tmp, 'job_to_cancel', 'timeout_exceeded')
      assert.equal(cancelled.status, 'cancelled')
      const lastEvent = cancelled.events[cancelled.events.length - 1]
      assert.equal(lastEvent.event, 'job_cancelled')
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
  it('executes full job lifecycle via gateway actions', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tianshu-gw-job-'))
    try {
      // 1. Start
      const startRes = await runResearchJob({
        action: 'start',
        workspace: tmp,
        jobId: 'run_gw_01',
        title: 'Batch Citation Extraction',
      })
      assert.equal(startRes.isError, undefined)
      assert.match(startRes.content, /异步科研任务已启动/)

      // 2. Query
      const queryRes = await runResearchJob({
        action: 'query',
        workspace: tmp,
        jobId: 'run_gw_01',
      })
      assert.equal(queryRes.isError, undefined)
      assert.match(queryRes.content, /QUEUED/)

      // 3. Update
      const updateRes = await runResearchJob({
        action: 'update',
        workspace: tmp,
        jobId: 'run_gw_01',
        status: 'running',
        progress: 40,
        message: 'Parsing PDF sections',
      })
      assert.equal(updateRes.isError, undefined)
      assert.match(updateRes.content, /已更新为: running \(40%\)/)

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
