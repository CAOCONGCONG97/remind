import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, CancelShutdownScope, EngineSnapshot } from '../core/types'
import type { AccountPublic, AddAccountInput, TotpLiveCode } from '../shared/authenticator-types'

export type PublicSettings = Omit<AppSettings, 'passwordHash'> & {
  hasPassword: boolean
}

const authenticatorApi = {
  listAccounts: (): Promise<AccountPublic[]> => ipcRenderer.invoke('accounts:list'),
  liveCodes: (): Promise<TotpLiveCode[]> => ipcRenderer.invoke('accounts:codes'),
  meta: (): Promise<{ encryptionAvailable: boolean; storagePath: string; count: number }> =>
    ipcRenderer.invoke('accounts:meta'),
  addAccount: (input: AddAccountInput): Promise<AccountPublic> => ipcRenderer.invoke('accounts:add', input),
  removeAccounts: (ids: string[]): Promise<{ removed: number; cancelled?: boolean }> =>
    ipcRenderer.invoke('accounts:remove', ids),
  revealSecret: (id: string): Promise<{ secret?: string; cancelled?: boolean }> =>
    ipcRenderer.invoke('accounts:reveal-secret', id),
  copyCode: (id: string): Promise<{ ok: boolean; code: string }> => ipcRenderer.invoke('accounts:copy-code', id),
  copySecret: (id: string): Promise<{ ok?: boolean; cancelled?: boolean }> =>
    ipcRenderer.invoke('accounts:copy-secret', id),
  otpauthUri: (id: string): Promise<string> => ipcRenderer.invoke('accounts:otpauth', id),
  qrDataUrl: (id: string): Promise<{ uri: string; dataUrl: string }> =>
    ipcRenderer.invoke('accounts:qr-data-url', id),
  exportAccounts: (
    ids: string[] | null
  ): Promise<{ ok?: boolean; cancelled?: boolean; path?: string; count?: number }> =>
    ipcRenderer.invoke('accounts:export', ids),
  scanAllScreens: (): Promise<{
    ok: boolean
    hits?: Array<{ uri: string; displayId: string; displayLabel: string }>
  }> => ipcRenderer.invoke('scan:all-screens'),
  startRegionScan: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('scan:start-region'),
  submitRegionScan: (
    region: { x: number; y: number; width: number; height: number } | null
  ): Promise<{ ok: boolean; uri?: string; message?: string }> =>
    ipcRenderer.invoke('scan:region-result', region),
  pickImageScan: (): Promise<{ ok: boolean; uri?: string; message?: string }> =>
    ipcRenderer.invoke('scan:image-file'),
  showItemInFolder: (filePath: string): Promise<void> => ipcRenderer.invoke('shell:show-item', filePath),
  onOpenAddScan: (handler: () => void): (() => void) => {
    const listener = (): void => handler()
    ipcRenderer.on('ui:open-add-scan', listener)
    return () => ipcRenderer.removeListener('ui:open-add-scan', listener)
  },
  onRegionScanDone: (
    handler: (payload: { ok: boolean; uri?: string; message?: string }) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { ok: boolean; uri?: string; message?: string }
    ): void => handler(payload)
    ipcRenderer.on('ui:scan-region-done', listener)
    return () => ipcRenderer.removeListener('ui:scan-region-done', listener)
  }
}

const api = {
  openAuthenticator: (): Promise<void> => ipcRenderer.invoke('authenticator:open'),
  getSettings: (): Promise<PublicSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch: Partial<AppSettings> & { password?: string; passwordConfirm?: string }): Promise<PublicSettings> =>
    ipcRenderer.invoke('settings:save', patch),
  setupPassword: (password: string, passwordConfirm: string): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke('setup:password', { password, passwordConfirm }),
  completeOnboarding: (patch?: Partial<AppSettings>): Promise<PublicSettings> =>
    ipcRenderer.invoke('onboarding:complete', patch),
  continueWork: (): Promise<void> => ipcRenderer.invoke('rest:continue'),
  emergencySkip: (password: string): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke('rest:emergency', password),
  extendWorkWithPassword: (
    minutes: number,
    password: string
  ): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke('rest:extend', { minutes, password }),
  dismissPreRestToast: (): Promise<void> => ipcRenderer.invoke('prerest:dismiss'),
  setPreRestLayout: (layout: 'main' | 'extend'): Promise<void> =>
    ipcRenderer.invoke('prerest:layout', layout),
  setShutdownLayout: (layout: 'main' | 'form'): Promise<void> =>
    ipcRenderer.invoke('shutdown:layout', layout),
  cancelShutdown: (
    password: string,
    scope: CancelShutdownScope
  ): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke('shutdown:cancel', { password, scope }),
  deferShutdown: (
    password: string,
    minutes: number
  ): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke('shutdown:defer', { password, minutes }),
  dismissShutdownToast: (): Promise<void> => ipcRenderer.invoke('shutdown:dismiss-toast'),
  onOverlayState: (handler: (snapshot: EngineSnapshot) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: EngineSnapshot): void => handler(snapshot)
    ipcRenderer.on('overlay:state', listener)
    return () => ipcRenderer.removeListener('overlay:state', listener)
  },
  onShutdownState: (
    handler: (payload: { shutdownAtLabel: string; remainingMs: number; deferred?: boolean }) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { shutdownAtLabel: string; remainingMs: number; deferred?: boolean }
    ): void => handler(payload)
    ipcRenderer.on('shutdown:state', listener)
    return () => ipcRenderer.removeListener('shutdown:state', listener)
  },
  onPreRestState: (handler: (payload: { remainingMs: number }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { remainingMs: number }): void =>
      handler(payload)
    ipcRenderer.on('prerest:state', listener)
    return () => ipcRenderer.removeListener('prerest:state', listener)
  }
}

contextBridge.exposeInMainWorld('remind', api)
contextBridge.exposeInMainWorld('authenticator', authenticatorApi)

export type RemindApi = typeof api
export type AuthenticatorApi = typeof authenticatorApi

declare global {
  interface Window {
    remind: RemindApi
    authenticator: AuthenticatorApi
  }
}
