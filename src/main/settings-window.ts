import { BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

function pageUrl(name: string): string {
  if (process.env.ELECTRON_RENDERER_URL) {
    return `${process.env.ELECTRON_RENDERER_URL}/${name}/index.html`
  }
  return join(__dirname, `../renderer/${name}/index.html`)
}

function windowIconPath(): string | undefined {
  const candidates = [
    join(process.resourcesPath, 'icon.ico'),
    join(__dirname, '../../resources/icon.ico'),
    join(__dirname, '../../../resources/icon.ico')
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return undefined
}

export class SettingsWindowController {
  private window: BrowserWindow | null = null

  constructor(private readonly preloadPath: string) {}

  open(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show()
      this.window.focus()
      return
    }
    this.window = new BrowserWindow({
      width: 480,
      height: 760,
      resizable: true,
      minimizable: true,
      maximizable: false,
      title: '强制休息 — 设置',
      show: false,
      backgroundColor: '#f8fafc',
      icon: windowIconPath(),
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
    this.window.setMenuBarVisibility(false)
    this.window.once('ready-to-show', () => {
      this.window?.show()
    })
    this.window.on('closed', () => {
      this.window = null
    })
    this.window.loadURL(pageUrl('settings'))
  }

  close(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close()
    }
  }
}

export class SetupWindowController {
  private window: BrowserWindow | null = null
  private resolveClosed: (() => void) | null = null

  constructor(private readonly preloadPath: string) {}

  /** 首次强制设密；关闭且已设密后 resolve */
  openAndWait(): Promise<void> {
    return new Promise((resolve) => {
      this.resolveClosed = resolve
      if (this.window && !this.window.isDestroyed()) {
        this.window.show()
        this.window.focus()
        return
      }
      this.window = new BrowserWindow({
        width: 420,
        height: 460,
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        title: '首次设置紧急密码',
        show: false,
        backgroundColor: '#eff6ff',
        icon: windowIconPath(),
        webPreferences: {
          preload: this.preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false
        }
      })
      this.window.setMenuBarVisibility(false)
      this.window.once('ready-to-show', () => this.window?.show())
      this.window.loadURL(pageUrl('setup'))
    })
  }

  /** 设密成功后由主进程调用以放行 */
  markComplete(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
    this.resolveClosed?.()
    this.resolveClosed = null
  }
}
