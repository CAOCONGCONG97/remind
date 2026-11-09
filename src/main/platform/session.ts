import { powerMonitor } from 'electron'

export type SessionHooks = {
  onLock: () => void
  onUnlock: () => void
  onSuspend: () => void
  onResume: () => void
}

/**
 * 订阅 Win 会话锁与电源事件。
 * 非 win32 也尽量挂 powerMonitor（开发机可测）；失败则静默。
 */
export function bindSessionHooks(hooks: SessionHooks): () => void {
  const onLock = (): void => hooks.onLock()
  const onUnlock = (): void => hooks.onUnlock()
  const onSuspend = (): void => hooks.onSuspend()
  const onResume = (): void => hooks.onResume()

  powerMonitor.on('lock-screen', onLock)
  powerMonitor.on('unlock-screen', onUnlock)
  powerMonitor.on('suspend', onSuspend)
  powerMonitor.on('resume', onResume)

  return () => {
    powerMonitor.removeListener('lock-screen', onLock)
    powerMonitor.removeListener('unlock-screen', onUnlock)
    powerMonitor.removeListener('suspend', onSuspend)
    powerMonitor.removeListener('resume', onResume)
  }
}
