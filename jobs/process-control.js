/**
 * Cross-platform process tree termination for tianshu-research.
 * Ensures cancellation reliably terminates child processes and avoids zombie or orphan jobs.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Terminates a process and all its child processes in the process tree.
 * @param {number} pid - Process ID to terminate
 * @param {object} [options]
 * @param {string} [options.signal='SIGTERM']
 * @param {number} [options.timeoutMs=5000]
 * @returns {Promise<{ success: boolean, pid: number, note?: string, error?: string }>}
 */
export async function terminateProcessTree(pid, options = {}) {
  if (!pid || typeof pid !== 'number' || pid <= 0) {
    return { success: false, pid, error: 'Invalid PID: ' + pid };
  }

  const isWindows = process.platform === 'win32';

  if (isWindows) {
    try {
      // /T terminates process tree, /F forces termination
      await execAsync(`taskkill /pid ${pid} /T /F`);
      return { success: true, pid };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found') || msg.includes('找不到') || msg.includes('没有找到')) {
        return { success: true, pid, note: 'Process already exited' };
      }
      return { success: false, pid, error: msg };
    }
  }

  // POSIX platform
  try {
    try {
      process.kill(-pid, options.signal || 'SIGKILL');
      return { success: true, pid };
    } catch {
      process.kill(pid, options.signal || 'SIGKILL');
      return { success: true, pid };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err && err.code === 'ESRCH') {
      return { success: true, pid, note: 'Process already exited' };
    }
    return { success: false, pid, error: msg };
  }
}
