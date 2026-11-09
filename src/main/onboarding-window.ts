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

/** 首次设密后的三步引导 */
export class OnboardingWindowController {
  private window: BrowserWindow | null = null
  private resolveClosed: (() => void) | null = null

  constructor(private readonly preloadPath: string) {}

  openAndWait(): Promise<void> {
    return new Promise((resolve) => {
      this.resolveClosed = resolve
      if (this.window && !this.window.isDestroyed()) {
        this.window.show()
        this.window.focus()
        return
      }
      this.window = new BrowserWindow({
        width: 480,
        height: 520,
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        title: '快速开始',
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
      this.window.once('ready-to-show', () => this.window?.show())
      this.window.loadURL(pageUrl('onboarding'))
    })
  }

  markComplete(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
    this.resolveClosed?.()
    this.resolveClosed = null
  }
}
