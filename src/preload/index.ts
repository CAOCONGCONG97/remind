import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, CancelShutdownScope, EngineSnapshot } from '../core/types'

export type PublicSettings = Omit<AppSettings, 'passwordHash'> & {
  hasPassword: boolean
}

const api = {
  getSettings: (): Promise<PublicSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch: Partial<AppSettings> & { password?: string; passwordConfirm?: string }): Promise<PublicSettings> =>
    ipcRenderer.invoke('settings:save', patch),
  setupPassword: (password: string, passwordConfirm: string): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke('setup:password', { password, passwordConfirm }),
  continueWork: (): Promise<void> => ipcRenderer.invoke('rest:continue'),
  emergencySkip: (password: string): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke('rest:emergency', password),
  cancelShutdown: (
    password: string,
    scope: CancelShutdownScope
  ): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke('shutdown:cancel', { password, scope }),
  dismissShutdownToast: (): Promise<void> => ipcRenderer.invoke('shutdown:dismiss-toast'),
  onOverlayState: (handler: (snapshot: EngineSnapshot) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: EngineSnapshot): void => handler(snapshot)
    ipcRenderer.on('overlay:state', listener)
    return () => ipcRenderer.removeListener('overlay:state', listener)
  },
  onShutdownState: (
    handler: (payload: { shutdownAtLabel: string; remainingMs: number }) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { shutdownAtLabel: string; remainingMs: number }
    ): void => handler(payload)
    ipcRenderer.on('shutdown:state', listener)
    return () => ipcRenderer.removeListener('shutdown:state', listener)
  }
}

contextBridge.exposeInMainWorld('remind', api)

export type RemindApi = typeof api

declare global {
  interface Window {
    remind: RemindApi
  }
}
