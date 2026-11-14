import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'

export type ShutdownToastPayload = {
  shutdownAtLabel: string
  remainingMs: number
  deferred?: boolean
}

export type ShutdownToastLayout = 'main' | 'form'

const TOAST_WIDTH = 400
const LAYOUT_HEIGHT: Record<ShutdownToastLayout, number> = {
  main: 280,
  // 密码 + 选项 + 返回，避免底部裁切
  form: 420
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
  private layout: ShutdownToastLayout = 'main'

  constructor(private readonly preloadPath: string) {}

  show(payload: ShutdownToastPayload): void {
    const win = this.ensureWindow()
    this.setLayout('main')
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

  setLayout(layout: ShutdownToastLayout): void {
    this.layout = layout
    if (!this.window || this.window.isDestroyed()) {
      return
    }
    this.applyBounds(this.window)
  }

  hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide()
    }
    this.layout = 'main'
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
    this.layout = 'main'
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      this.applyBounds(this.window)
      this.window.setAlwaysOnTop(true, 'screen-saver')
      return this.window
    }
    this.window = new BrowserWindow({
      width: TOAST_WIDTH,
      height: LAYOUT_HEIGHT.main,
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
    this.applyBounds(this.window)
    this.window.loadURL(pageUrl('shutdown'))
    this.window.on('closed', () => {
      this.window = null
      this.layout = 'main'
    })
    return this.window
  }

  private applyBounds(win: BrowserWindow): void {
    const height = LAYOUT_HEIGHT[this.layout]
    const display = screen.getPrimaryDisplay()
    const work = display.workArea
    const margin = 16
    const x = work.x + work.width - TOAST_WIDTH - margin
    const y = work.y + work.height - height - margin
    win.setBounds({ x, y, width: TOAST_WIDTH, height })
  }
}
