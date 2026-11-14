import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'

export type PreRestToastPayload = {
  remainingMs: number
}

export type PreRestToastLayout = 'main' | 'extend'

const TOAST_WIDTH = 380
const LAYOUT_HEIGHT: Record<PreRestToastLayout, number> = {
  // 标题 + 倒计时 + 说明 + 两个按钮
  main: 240,
  // 上述内容 + 密码框 + 延长按钮 + 返回（避免底部被裁切）
  extend: 400
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
  private layout: PreRestToastLayout = 'main'

  constructor(private readonly preloadPath: string) {}

  show(payload: PreRestToastPayload): void {
    const win = this.ensureWindow()
    this.setLayout('main')
    win.webContents.send('prerest:state', payload)
    win.showInactive()
  }

  update(payload: PreRestToastPayload): void {
    if (!this.window || this.window.isDestroyed()) {
      return
    }
    this.window.webContents.send('prerest:state', payload)
  }

  /** 主操作 / 延长表单切换时拉高窗口，避免内容被裁切 */
  setLayout(layout: PreRestToastLayout): void {
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
    this.applyBounds(this.window)
    this.window.loadURL(pageUrl('prerest'))
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
    // 略高于关机 toast，避免完全重叠时看不见
    const x = work.x + work.width - TOAST_WIDTH - margin
    const y = work.y + work.height - height - margin - 40
    win.setBounds({ x, y, width: TOAST_WIDTH, height })
  }
}
