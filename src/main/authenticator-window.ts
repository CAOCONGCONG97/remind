import {
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  screen,
  shell,
  app
} from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import QRCode from 'qrcode'
import { AccountStore } from './authenticator/account-store'
import {
  scanAllDisplaysForOtpAuth,
  scanImageBufferForOtpAuth,
  scanRegionForOtpAuth
} from './authenticator/screen-scan'
import type { AddAccountInput } from '../shared/authenticator-types'

function pageUrl(name: string): string {
  if (process.env.ELECTRON_RENDERER_URL) {
    return `${process.env.ELECTRON_RENDERER_URL}/${name}/index.html`
  }
  return join(__dirname, `../renderer/${name}/index.html`)
}

/**
 * remind 同进程认证器：主窗口列表 + 框选扫码层。
 * 数据落在 userData/authenticator/，与休息设置 JSON 分离。
 */
export class AuthenticatorController {
  private store: AccountStore | null = null
  private mainWindow: BrowserWindow | null = null
  private captureWindow: BrowserWindow | null = null
  private ipcRegistered = false

  constructor(private readonly preloadPath: string) {}

  /** 应用就绪后调用一次：初始化存储并挂 IPC */
  init(): void {
    this.store = new AccountStore()
    this.registerIpc()
  }

  open(): void {
    if (!this.store) {
      this.init()
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show()
      this.mainWindow.focus()
      return
    }
    this.mainWindow = new BrowserWindow({
      width: 720,
      height: 640,
      minWidth: 560,
      minHeight: 480,
      show: false,
      title: '强制休息 — 认证器',
      autoHideMenuBar: true,
      backgroundColor: '#f4f6f8',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
    this.mainWindow.once('ready-to-show', () => this.mainWindow?.show())
    this.mainWindow.on('closed', () => {
      this.mainWindow = null
    })
    void this.mainWindow.loadURL(pageUrl('authenticator'))
  }

  openAddScan(): void {
    this.open()
    this.mainWindow?.webContents.send('ui:open-add-scan')
  }

  private requireStore(): AccountStore {
    if (!this.store) {
      throw new Error('认证器尚未初始化')
    }
    return this.store
  }

  private openCaptureOverlay(): void {
    if (this.captureWindow && !this.captureWindow.isDestroyed()) {
      this.captureWindow.focus()
      return
    }
    const display = screen.getPrimaryDisplay()
    const { x, y, width, height } = display.bounds
    this.captureWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      fullscreenable: false,
      hasShadow: false,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
    this.captureWindow.setAlwaysOnTop(true, 'screen-saver')
    void this.captureWindow.loadURL(pageUrl('auth-capture'))
    this.captureWindow.on('closed', () => {
      this.captureWindow = null
    })
  }

  private registerIpc(): void {
    if (this.ipcRegistered) {
      return
    }
    this.ipcRegistered = true
    const host = (): BrowserWindow | undefined =>
      this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : undefined

    const ask = async (
      options: Electron.MessageBoxOptions
    ): Promise<Electron.MessageBoxReturnValue> => {
      const parent = host()
      return parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options)
    }

    ipcMain.handle('accounts:list', () => this.requireStore().listPublic())
    ipcMain.handle('accounts:codes', () => this.requireStore().liveCodes())
    ipcMain.handle('accounts:meta', () => {
      const store = this.requireStore()
      return {
        encryptionAvailable: store.encryptionAvailable(),
        storagePath: store.storagePath(),
        count: store.listPublic().length
      }
    })
    ipcMain.handle('accounts:add', (_event, input: AddAccountInput) => this.requireStore().add(input))

    ipcMain.handle('accounts:remove', async (_event, ids: string[]) => {
      if (!ids?.length) {
        return { removed: 0 }
      }
      const result = await ask({
        type: 'warning',
        buttons: ['取消', '删除'],
        defaultId: 0,
        cancelId: 0,
        title: '确认删除',
        message: `确定删除选中的 ${ids.length} 个账号？`,
        detail: '删除后无法恢复。若其它设备仍需该码，请先导出备份。'
      })
      if (result.response !== 1) {
        return { removed: 0, cancelled: true }
      }
      return { removed: this.requireStore().remove(ids) }
    })

    ipcMain.handle('accounts:reveal-secret', async (_event, id: string) => {
      const result = await ask({
        type: 'warning',
        buttons: ['取消', '显示密钥'],
        defaultId: 0,
        cancelId: 0,
        title: '敏感操作',
        message: '即将显示 Base32 密钥',
        detail: '请确保周围无人窥视。密钥等同于账号第二因素。'
      })
      if (result.response !== 1) {
        return { cancelled: true }
      }
      return { secret: this.requireStore().revealSecret(id) }
    })

    ipcMain.handle('accounts:copy-code', (_event, id: string) => {
      const code = this.requireStore().liveCodes().find((item) => item.id === id)
      if (!code) {
        throw new Error('账号不存在')
      }
      clipboard.writeText(code.code)
      return { ok: true, code: code.code }
    })

    ipcMain.handle('accounts:copy-secret', async (_event, id: string) => {
      const result = await ask({
        type: 'warning',
        buttons: ['取消', '复制密钥'],
        defaultId: 0,
        cancelId: 0,
        title: '敏感操作',
        message: '即将把 Base32 密钥复制到剪贴板',
        detail: '复制后请尽快粘贴并清空剪贴板。'
      })
      if (result.response !== 1) {
        return { cancelled: true }
      }
      clipboard.writeText(this.requireStore().revealSecret(id))
      return { ok: true }
    })

    ipcMain.handle('accounts:otpauth', (_event, id: string) => this.requireStore().otpauthUri(id))

    ipcMain.handle('accounts:qr-data-url', async (_event, id: string) => {
      const uri = this.requireStore().otpauthUri(id)
      const dataUrl = await QRCode.toDataURL(uri, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 280
      })
      return { uri, dataUrl }
    })

    ipcMain.handle('accounts:export', async (_event, ids: string[] | null) => {
      const scopeLabel = ids && ids.length > 0 ? `选中的 ${ids.length} 个` : '全部'
      const confirm = await ask({
        type: 'warning',
        buttons: ['取消', '继续导出'],
        defaultId: 0,
        cancelId: 0,
        title: '导出确认',
        message: `即将导出${scopeLabel}账号的明文密钥`,
        detail:
          '导出文件含完整 otpauth URI 与 Base32 密钥，等同于二因素凭据。请仅保存在本机受控位置。\n\n注意：Microsoft Authenticator 等通常无法直接导入旧条目，多数场景仍需重新扫码绑定。'
      })
      if (confirm.response !== 1) {
        return { cancelled: true }
      }
      const payload = this.requireStore().exportAccounts(ids ?? undefined)
      const defaultName = `remind-authenticator-export-${new Date().toISOString().slice(0, 10)}.json`
      const parent = host()
      const saveOptions: Electron.SaveDialogOptions = {
        title: '保存导出文件',
        defaultPath: join(app.getPath('desktop'), defaultName),
        filters: [{ name: 'JSON', extensions: ['json'] }]
      }
      const save = parent
        ? await dialog.showSaveDialog(parent, saveOptions)
        : await dialog.showSaveDialog(saveOptions)
      if (save.canceled || !save.filePath) {
        return { cancelled: true }
      }
      writeFileSync(
        save.filePath,
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            app: 'remind-authenticator',
            warning: '含明文 TOTP 密钥，请妥善保管。',
            accounts: payload.accounts
          },
          null,
          2
        ),
        'utf8'
      )
      return { ok: true, path: save.filePath, count: payload.accounts.length }
    })

    ipcMain.handle('scan:all-screens', async () => {
      const wasVisible = this.mainWindow?.isVisible()
      this.mainWindow?.hide()
      await new Promise((resolve) => setTimeout(resolve, 280))
      try {
        const hits = await scanAllDisplaysForOtpAuth()
        return { ok: true as const, hits }
      } finally {
        if (wasVisible) {
          this.mainWindow?.show()
        }
      }
    })

    ipcMain.handle('scan:start-region', () => {
      this.mainWindow?.hide()
      this.openCaptureOverlay()
      return { ok: true }
    })

    ipcMain.handle(
      'scan:region-result',
      async (_event, region: { x: number; y: number; width: number; height: number } | null) => {
        if (this.captureWindow && !this.captureWindow.isDestroyed()) {
          this.captureWindow.close()
        }
        if (!region) {
          this.open()
          this.mainWindow?.webContents.send('ui:scan-region-done', {
            ok: false,
            message: '已取消框选'
          })
          return { ok: false, message: '已取消框选' }
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
        try {
          const hit = await scanRegionForOtpAuth(null, region)
          this.open()
          if (!hit) {
            const payload = { ok: false as const, message: '未在选区识别到 otpauth 二维码' }
            this.mainWindow?.webContents.send('ui:scan-region-done', payload)
            return payload
          }
          const payload = { ok: true as const, uri: hit.uri }
          this.mainWindow?.webContents.send('ui:scan-region-done', payload)
          return payload
        } catch (error) {
          this.open()
          const payload = {
            ok: false as const,
            message: error instanceof Error ? error.message : '扫码失败'
          }
          this.mainWindow?.webContents.send('ui:scan-region-done', payload)
          return payload
        }
      }
    )

    ipcMain.handle('scan:image-file', async () => {
      const parent = host()
      const openOptions: Electron.OpenDialogOptions = {
        title: '选择含二维码的图片',
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'webp'] }],
        properties: ['openFile']
      }
      const picked = parent
        ? await dialog.showOpenDialog(parent, openOptions)
        : await dialog.showOpenDialog(openOptions)
      if (picked.canceled || !picked.filePaths[0]) {
        return { ok: false, message: '已取消' }
      }
      const { readFileSync } = await import('node:fs')
      const uri = scanImageBufferForOtpAuth(readFileSync(picked.filePaths[0]))
      if (!uri) {
        return { ok: false, message: '图片中未识别到 otpauth 二维码' }
      }
      return { ok: true, uri }
    })

    ipcMain.handle('shell:show-item', (_event, filePath: string) => {
      shell.showItemInFolder(filePath)
    })
  }
}
