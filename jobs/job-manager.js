/**
 * Research Job Manager & State Machine for tianshu-research.
 * Manages asynchronous research tasks, event logging, and state transitions
 * in <workspace>/.rivet/research/runs/<jobId>/.
 * Implements Cognitive Virtual Machine (CVM) Causal Trace event logging.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const JOB_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
  'partial',
]

export function getRunsDir(workspace = process.cwd()) {
  return join(resolve(workspace), '.rivet', 'research', 'runs')
}

export function createJob(workspace, options = {}) {
  const runsDir = getRunsDir(workspace)
  mkdirSync(runsDir, { recursive: true })

  const nonce = Math.random().toString(36).slice(2, 7)
  const timestamp = Date.now()
  const id = options.id || `run_${timestamp}_${nonce}`

  const jobDir = join(runsDir, id)
  mkdirSync(jobDir, { recursive: true })

  const now = new Date().toISOString()
  const job = {
    id,
    type: options.type || 'custom',
    title: options.title || `Research Run [${id}]`,
    status: 'queued',
    progress: 0,
    createdAt: now,
    updatedAt: now,
    payload: options.payload || {},
  }

  writeFileSync(join(jobDir, 'job.json'), JSON.stringify(job, null, 2), 'utf8')

  const initialEvent = {
    event: options.event || 'job_created',
    status: 'queued',
    progress: 0,
    timestamp: now,
    message: options.message || 'Job initialized and queued',
    stateTransition: options.stateTransition || options.state_transition || 'IDLE -> PLAN',
    action: options.action || options.traceAction || 'create_job',
    confidence: options.confidence !== undefined ? options.confidence : 1.0,
    causalReason: options.causalReason || options.causal_reason || 'Job created and initialized',
    ...(options.metrics ? { metrics: options.metrics } : {}),
  }
  writeFileSync(join(jobDir, 'events.jsonl'), JSON.stringify(initialEvent) + '\n', 'utf8')

  return { ...job, events: [initialEvent], result: null }
}

export function getJob(workspace, jobId) {
  const runsDir = getRunsDir(workspace)
  const jobDir = join(runsDir, String(jobId).trim())

  if (!existsSync(jobDir)) {
    throw new Error(`Research job "${jobId}" not found in ${runsDir}`)
  }

  const jobFile = join(jobDir, 'job.json')
  if (!existsSync(jobFile)) {
    throw new Error(`Job definition missing for "${jobId}"`)
  }

  const job = JSON.parse(readFileSync(jobFile, 'utf8'))

  const eventsFile = join(jobDir, 'events.jsonl')
  const events = []
  if (existsSync(eventsFile)) {
    const lines = readFileSync(eventsFile, 'utf8').split('\n')
    for (const l of lines) {
      if (!l.trim()) continue
      try {
        events.push(JSON.parse(l))
      } catch {
        // ignore bad event lines
      }
    }
  }

  const resultFile = join(jobDir, 'result.json')
  let result = null
  if (existsSync(resultFile)) {
    try {
      result = JSON.parse(readFileSync(resultFile, 'utf8'))
    } catch {
      // ignore
    }
  }

  return { ...job, events, result: result || job.result }
}

export function updateJob(workspace, jobId, updates = {}) {
  const current = getJob(workspace, jobId)
  const jobDir = join(getRunsDir(workspace), String(jobId).trim())

  const now = new Date().toISOString()
  const updated = {
    ...current,
    status: updates.status || current.status,
    progress: updates.progress !== undefined ? Math.min(100, Math.max(0, updates.progress)) : current.progress,
    updatedAt: now,
  }

  if (updates.result !== undefined) {
    updated.result = updates.result
    writeFileSync(join(jobDir, 'result.json'), JSON.stringify(updates.result, null, 2), 'utf8')
  }

  if (updates.error !== undefined) {
    updated.error = updates.error
  }

  // Remove temporary non-persisted fields from job.json
  const toSave = { ...updated }
  delete toSave.events

  writeFileSync(join(jobDir, 'job.json'), JSON.stringify(toSave, null, 2), 'utf8')

  const hasEventTrigger = Boolean(
    current.status !== updated.status ||
    updates.event ||
    updates.message ||
    updates.stateTransition ||
    updates.state_transition ||
    updates.causalReason ||
    updates.causal_reason ||
    updates.confidence !== undefined ||
    updates.metrics ||
    updates.traceAction
  )

  if (hasEventTrigger) {
    const stateTransition =
      updates.stateTransition ||
      updates.state_transition ||
      (current.status !== updated.status ? `${current.status.toUpperCase()} -> ${updated.status.toUpperCase()}` : undefined)
    const causalReason = updates.causalReason || updates.causal_reason
    const confidence = updates.confidence !== undefined ? updates.confidence : undefined
    const metrics = updates.metrics
    const traceAction = updates.traceAction

    const ev = {
      event: updates.event || 'status_update',
      status: updated.status,
      progress: updated.progress,
      timestamp: now,
      message: updates.message || '',
      ...(stateTransition ? { stateTransition } : {}),
      ...(traceAction ? { action: traceAction } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
      ...(causalReason ? { causalReason } : {}),
      ...(metrics ? { metrics } : {}),
    }
    appendFileSync(join(jobDir, 'events.jsonl'), JSON.stringify(ev) + '\n', 'utf8')
    if (Array.isArray(updated.events)) {
      updated.events = [...updated.events, ev]
    } else {
      updated.events = [ev]
    }
  }

  return updated
}

export function cancelJob(workspace, jobId, reason = 'user_cancelled') {
  return updateJob(workspace, jobId, {
    status: 'cancelled',
    event: 'job_cancelled',
    message: `Job cancelled: ${reason}`,
    stateTransition: 'RUNNING -> HALT',
    traceAction: 'cancel_job',
    causalReason: reason,
  })
}

export function listJobs(workspace, filter = {}) {
  const runsDir = getRunsDir(workspace)
  if (!existsSync(runsDir)) return []

  const entries = readdirSync(runsDir, { withFileTypes: true })
  const jobs = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const jobFile = join(runsDir, entry.name, 'job.json')
    if (existsSync(jobFile)) {
      try {
        const raw = JSON.parse(readFileSync(jobFile, 'utf8'))
        if (filter.status && raw.status !== filter.status) continue
        if (filter.type && raw.type !== filter.type) continue
        jobs.push(raw)
      } catch {
        // ignore
      }
    }
  }

  jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return jobs
}

export function renderJobReport(job) {
  const lines = [
    `### 📊 异步科研任务报告: [${job.id}]`,
    '',
    `- **任务标题**: ${job.title}`,
    `- **任务类型**: ` + '`' + job.type + '`',
    `- **当前状态**: **${job.status.toUpperCase()}** (${job.progress}%)`,
    `- **创建时间**: ${job.createdAt}`,
    `- **最后更新**: ${job.updatedAt}`,
  ]

  if (job.error) {
    lines.push('', `❌ **异常信息**: ${job.error}`)
  }

  if (job.events && job.events.length > 0) {
    lines.push('', '#### ⏱️ 事件与因果追踪 (Causal Trace Timeline)')
    for (const ev of job.events) {
      let line = `- ` + '`[' + ev.status.toUpperCase() + ']`'
      if (ev.stateTransition) {
        line += ' `' + ev.stateTransition + '`'
      }
      if (ev.action) {
        line += ' [action: ' + ev.action + ']'
      }
      line += ': ' + (ev.message || ev.event)
      if (ev.confidence !== undefined) {
        line += ' (conf: ' + ev.confidence + ')'
      }
      if (ev.causalReason) {
        line += ' — *Reason: ' + ev.causalReason + '*'
      }
      if (ev.metrics) {
        const metricStr = typeof ev.metrics === 'object' ? JSON.stringify(ev.metrics) : String(ev.metrics)
        line += ' [metrics: ' + metricStr + ']'
      }
      line += ' *(' + ev.timestamp + ')*'
      lines.push(line)
    }
  }

  if (job.result) {
    lines.push('', '#### 📦 任务交付产物 (Result)', '```json', JSON.stringify(job.result, null, 2), '```')
  }

  return lines.join('\n')
}
