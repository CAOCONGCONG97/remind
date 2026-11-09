import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'

export type ShutdownToastPayload = {
  shutdownAtLabel: string
  remainingMs: number
}

function pageUrl(name: string): string {
  if (process.env.ELECTRON_RENDERER_URL) {
    return `${process.env.ELECTRON_RENDERER_URL}/${name}/index.html`
  }
  return join(__dirname, `../renderer/${name}/index.html`)
}

/**
 * 右下角关机提醒。alwaysOnTop level 高于休息遮罩，保证可点。
 */
export class ShutdownToastController {
  private window: BrowserWindow | null = null

  constructor(private readonly preloadPath: string) {}

  show(payload: ShutdownToastPayload): void {
    const win = this.ensureWindow()
    win.webContents.send('shutdown:state', payload)
    win.show()
    win.moveTop()
  }

  update(payload: ShutdownToastPayload): void {
    if (!this.window || this.window.isDestroyed()) {
      return
    }
    this.window.webContents.send('shutdown:state', payload)
  }

  hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide()
    }
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      this.placeBottomRight(this.window)
      this.window.setAlwaysOnTop(true, 'screen-saver')
      return this.window
    }
    const width = 360
    const height = 220
    this.window = new BrowserWindow({
      width,
      height,
      frame: false,
      resizable: false,
      movable: true,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#111827',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
    this.window.setMenuBarVisibility(false)
    this.window.setAlwaysOnTop(true, 'screen-saver')
    this.placeBottomRight(this.window)
    this.window.loadURL(pageUrl('shutdown'))
    this.window.on('closed', () => {
      this.window = null
    })
    return this.window
  }

  private placeBottomRight(win: BrowserWindow): void {
    const display = screen.getPrimaryDisplay()
    const { width, height } = win.getBounds()
    const work = display.workArea
    const margin = 16
    win.setPosition(work.x + work.width - width - margin, work.y + work.height - height - margin)
  }
}
