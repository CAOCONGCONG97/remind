import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'

export type PreRestToastPayload = {
  remainingMs: number
}

function pageUrl(name: string): string {
  if (process.env.ELECTRON_RENDERER_URL) {
    return `${process.env.ELECTRON_RENDERER_URL}/${name}/index.html`
  }
  return join(__dirname, `../renderer/${name}/index.html`)
}

/** 休息前右下角轻提醒（非强制） */
export class PreRestToastController {
  private window: BrowserWindow | null = null

  constructor(private readonly preloadPath: string) {}

  show(payload: PreRestToastPayload): void {
    const win = this.ensureWindow()
    win.webContents.send('prerest:state', payload)
    win.showInactive()
  }

  update(payload: PreRestToastPayload): void {
    if (!this.window || this.window.isDestroyed()) {
      return
    }
    this.window.webContents.send('prerest:state', payload)
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
      return this.window
    }
    this.window = new BrowserWindow({
      width: 340,
      height: 190,
      frame: false,
      resizable: false,
      movable: true,
      skipTaskbar: true,
      show: false,
      alwaysOnTop: true,
      backgroundColor: '#0f172a',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
    this.window.setMenuBarVisibility(false)
    this.window.setAlwaysOnTop(true, 'floating')
    this.placeBottomRight(this.window)
    this.window.loadURL(pageUrl('prerest'))
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
    // 略高于关机 toast，避免完全重叠时看不见
    win.setPosition(work.x + work.width - width - margin, work.y + work.height - height - margin - 40)
  }
}
