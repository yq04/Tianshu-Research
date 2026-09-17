/**
 * Research Job Gateway for tianshu-research.
 * Implements asynchronous task lifecycle, state transitions, and event stream reporting.
 */

import {
  createJob,
  getJob,
  updateJob,
  cancelJob,
  listJobs,
  renderJobReport,
} from './jobs/job-manager.js'

export async function runResearchJob(params = {}) {
  const action = typeof params.action === 'string' ? params.action.trim() : ''
  const workspace = params.workspace || process.cwd()

  try {
    if (action === 'start') {
      const job = createJob(workspace, {
        id: params.jobId || params.id,
        type: params.type || 'batch_task',
        title: params.title || 'Asynchronous Research Run',
        payload: params.payload || {},
        message: params.message,
        stateTransition: params.stateTransition || params.state_transition,
        causalReason: params.causalReason || params.causal_reason,
        confidence: params.confidence,
        metrics: params.metrics,
        traceAction: params.traceAction,
      })
      return {
        content: `🚀 异步科研任务已启动 [${job.id}]: ${job.title}\n当前状态: ${job.status} (进度: ${job.progress}%)\n日志目录: .rivet/research/runs/${job.id}/`,
        data: job,
      }
    }

    if (action === 'query') {
      const jobId = params.jobId || params.id
      if (!jobId) {
        return { content: 'Error: jobId is required for query', isError: true }
      }
      const job = getJob(workspace, jobId)
      const lastEvent = job.events && job.events.length > 0 ? job.events[job.events.length - 1] : null
      const eventMsg = lastEvent ? ` (最新事件: ${lastEvent.message || lastEvent.event})` : ''
      return {
        content: `📋 任务 [${job.id}] 状态: **${job.status.toUpperCase()}** (${job.progress}%)${eventMsg}`,
        data: job,
      }
    }

    if (action === 'update') {
      const jobId = params.jobId || params.id
      if (!jobId) {
        return { content: 'Error: jobId is required for update', isError: true }
      }
      const job = updateJob(workspace, jobId, {
        status: params.status,
        progress: params.progress,
        event: params.event,
        message: params.message,
        result: params.result,
        error: params.error,
        stateTransition: params.stateTransition || params.state_transition,
        causalReason: params.causalReason || params.causal_reason,
        confidence: params.confidence,
        metrics: params.metrics,
        traceAction: params.traceAction,
      })
      return {
        content: `✅ 任务 [${job.id}] 已更新为: ${job.status} (${job.progress}%)`,
        data: job,
      }
    }

    if (action === 'cancel') {
      const jobId = params.jobId || params.id
      if (!jobId) {
        return { content: 'Error: jobId is required for cancel', isError: true }
      }
      const job = cancelJob(workspace, jobId, params.reason || 'user_cancelled')
      return {
        content: `🛑 任务 [${job.id}] 已取消。`,
        data: job,
      }
    }

    if (action === 'list') {
      const jobs = listJobs(workspace, { status: params.status, type: params.type })
      if (jobs.length === 0) {
        return {
          content: '当前工作区暂无异步科研任务记录。',
          data: { count: 0, jobs: [] },
        }
      }
      const lines = [
        `### 📑 检索到 ${jobs.length} 项科研任务记录:`,
        '',
        ...jobs.map((j, i) => `${i + 1}. **[${j.id}]** ${j.title} — [${j.status}] (${j.progress}% | ${j.createdAt})`),
      ]
      return {
        content: lines.join('\n'),
        data: { count: jobs.length, jobs },
      }
    }

    if (action === 'report') {
      const jobId = params.jobId || params.id
      if (!jobId) {
        return { content: 'Error: jobId is required for report', isError: true }
      }
      const job = getJob(workspace, jobId)
      return {
        content: renderJobReport(job),
        data: job,
      }
    }

    return {
      content: `Error: Unsupported research_job action "${action}". Supported: start, query, update, cancel, list, report`,
      isError: true,
    }
  } catch (err) {
    return {
      content: `任务操作失败: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    }
  }
}
