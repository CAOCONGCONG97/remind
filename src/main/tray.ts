import { Menu, Tray, app, nativeImage } from 'electron'
import { join } from 'node:path'

export type TrayActions = {
  openSettings: () => void
  startRestNow: () => void
  showAbout: () => void
  quit: () => void
}

function createTrayIcon(): Electron.NativeImage {
  // 16x16 深蓝方块 PNG（内嵌，避免额外资源依赖）
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPElEQVQ4T2NkYGD4z0ABYBzVMKphVANjGPwzMDAw/GdgYPjPQAkwMjL+Z2Bg+M9AGYxqGNUAAQYAAP//AQb/AcK2Q0kAAAAASUVORK5CYII='
  const image = nativeImage.createFromDataURL(`data:image/png;base64,${pngBase64}`)
  if (!image.isEmpty()) {
    return image
  }
  // 回退：空图标仍可出托盘（部分环境）
  return nativeImage.createEmpty()
}

export function createAppTray(actions: TrayActions): Tray {
  const tray = new Tray(createTrayIcon())
  tray.setToolTip('强制休息提醒')
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '设置…',
      click: () => actions.openSettings()
    },
    {
      label: '立即休息',
      click: () => actions.startRestNow()
    },
    { type: 'separator' },
    {
      label: '关于',
      click: () => actions.showAbout()
    },
    {
      label: '退出',
      click: () => actions.quit()
    }
  ])
  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => actions.openSettings())
  return tray
}

export function aboutMessage(): string {
  return `强制休息提醒\n版本 ${app.getVersion()}\n纯本地离线 · Win11`
}

export function iconPathHint(): string {
  return join(__dirname, '../../resources/tray.png')
}
