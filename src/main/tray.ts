import { Menu, Tray, app, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type TrayActions = {
  openSettings: () => void
  startRestNow: () => void
  showAbout: () => void
  quit: () => void
}

/** 开发时指向仓库 resources；打包后指向 resources 旁路目录 */
export function resolveTrayIconPath(): string {
  const candidates = [
    join(process.resourcesPath, 'tray.png'),
    join(app.getAppPath(), 'resources', 'tray.png'),
    join(__dirname, '../../resources/tray.png'),
    join(__dirname, '../../../resources/tray.png')
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return candidates[2]
}

function createTrayIcon(): Electron.NativeImage {
  const iconPath = resolveTrayIconPath()
  if (existsSync(iconPath)) {
    const fromFile = nativeImage.createFromPath(iconPath)
    if (!fromFile.isEmpty()) {
      // Win 托盘常见 16×16；提供一份缩放更清晰
      return fromFile.resize({ width: 16, height: 16 })
    }
  }
  // 兜底：内嵌蓝底暂停图标（避免空图标）
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABaElEQVRYR+2XMQ6CQBBF/4wWVhgjFpaewMJYeAEPYGHiBTyBhRZewMJYeAEPwMFYeAELC42FxuB/gwZZliULwYRJNrvzZ+bNzO7sAkf8xxHz4QQwA5gBzABmADOAGWAuAKjX61yv1/9lIJVK0Wq1KJfLPD8/E4/HGQwGDAYD0uk0mUyGSCQCwGaz0Ww2yWazRKNRms0m8XicWq1GLpdjNBqxWq1IJpOcTic2mw3lcpnBYMDxeOTj44N4PM5kMmG5XFIqlWg0Guj1esjn83S7XQaDAYlEglwuRyqV4vX1lUKhgFarxXq9ZrvdUiqVKBaL6HQ6DAYD5vM5x+ORSqVCp9NhvV5jGAao1+s0Gg0Mw2C321Eul9HpdDgajQgGg9i2TSAQwLIsAFiv1/R6PVKpFMfjkUAgQDgcBmC5XLJYLHj/9YLfXwL8dQH+dQF+A2AGMAOYv4D/8AJmADOAGWAuAH4A6QhWQW6q/1gAAAAASUVORK5CYII='
  const image = nativeImage.createFromDataURL(`data:image/png;base64,${pngBase64}`)
  if (!image.isEmpty()) {
    return image.resize({ width: 16, height: 16 })
  }
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
