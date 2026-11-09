import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * 执行系统关机。
 * Windows：shutdown /s /t 0
 * 其它平台：仅打日志（避免误关开发机）。
 */
export async function shutdownNow(reason = '强制休息提醒：到达设定关机时刻'): Promise<void> {
  if (process.platform !== 'win32') {
    console.warn('[power] shutdown skipped on non-win32:', reason)
    return
  }
  // /f 强制关闭应用；/t 0 立即。取消需在真正执行前完成。
  await execFileAsync('shutdown', ['/s', '/t', '0', '/f', '/c', reason], {
    windowsHide: true
  })
}

/** 取消仍在排队的 shutdown（若曾用 /t >0）；本应用用即时关机，主要用于防御性清理。 */
export async function abortQueuedShutdown(): Promise<void> {
  if (process.platform !== 'win32') {
    return
  }
  try {
    await execFileAsync('shutdown', ['/a'], { windowsHide: true })
  } catch {
    // 无排队任务时 shutdown /a 会失败，忽略
  }
}
