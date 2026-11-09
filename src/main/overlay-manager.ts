import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import type { EngineSnapshot } from '../core/types'

function rendererPage(name: string): string {
  if (process.env.ELECTRON_RENDERER_URL) {
    return `${process.env.ELECTRON_RENDERER_URL}/${name}/index.html`
  }
  return join(__dirname, `../renderer/${name}/index.html`)
}

/**
 * 每个显示器一个全屏置顶遮罩。
 * 热插拔时重建。无法覆盖 UAC/安全桌面/部分独占全屏游戏——产品需诚实说明。
 */
export class OverlayManager {
  private windows = new Map<number, BrowserWindow>()
  private lastSnapshot: EngineSnapshot | null = null
  private visible = false

  constructor(private readonly preloadPath: string) {
    screen.on('display-added', () => this.relayout())
    screen.on('display-removed', () => this.relayout())
    screen.on('display-metrics-changed', () => this.relayout())
  }

  show(snapshot: EngineSnapshot): void {
    this.visible = true
    this.lastSnapshot = snapshot
    this.ensureWindows()
    this.broadcast(snapshot)
  }

  update(snapshot: EngineSnapshot): void {
    this.lastSnapshot = snapshot
    if (!this.visible) {
      return
    }
    this.broadcast(snapshot)
  }

  hide(): void {
    this.visible = false
    this.lastSnapshot = null
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) {
        win.hide()
      }
    }
  }

  destroy(): void {
    this.visible = false
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) {
        win.destroy()
      }
    }
    this.windows.clear()
  }

  /** 让关机提醒窗可以叠在遮罩之上时，遮罩仍保持 top，但 level 略低 */
  setBelowShutdownToast(active: boolean): void {
    for (const win of this.windows.values()) {
      if (win.isDestroyed()) {
        continue
      }
      // floating < screen-saver；关机提醒用 screen-saver
      win.setAlwaysOnTop(true, active ? 'pop-up-menu' : 'screen-saver')
    }
  }

  private ensureWindows(): void {
    const displays = screen.getAllDisplays()
    const keep = new Set(displays.map((display) => display.id))

    for (const [displayId, win] of this.windows) {
      if (!keep.has(displayId) || win.isDestroyed()) {
        if (!win.isDestroyed()) {
          win.destroy()
        }
        this.windows.delete(displayId)
      }
    }

    for (const display of displays) {
      let win = this.windows.get(display.id)
      if (!win || win.isDestroyed()) {
        win = this.createWindow(display.bounds)
        this.windows.set(display.id, win)
      } else {
        win.setBounds(display.bounds)
      }
      win.setAlwaysOnTop(true, 'screen-saver')
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      win.show()
      win.focus()
    }
  }

  private createWindow(bounds: Electron.Rectangle): BrowserWindow {
    const win = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      frame: false,
      transparent: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreen: false,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#0b1220',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
    win.setMenuBarVisibility(false)
    win.loadURL(rendererPage('overlay'))
    win.on('closed', () => {
      for (const [displayId, mapped] of this.windows) {
        if (mapped === win) {
          this.windows.delete(displayId)
        }
      }
    })
    return win
  }

  private broadcast(snapshot: EngineSnapshot): void {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) {
        win.webContents.send('overlay:state', snapshot)
      }
    }
  }

  private relayout(): void {
    if (!this.visible || !this.lastSnapshot) {
      return
    }
    this.ensureWindows()
    this.broadcast(this.lastSnapshot)
  }
}
