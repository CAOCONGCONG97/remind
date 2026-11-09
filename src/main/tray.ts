import { Menu, Tray, app, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { formatDurationZh, type EngineSnapshot, type TriggerMode } from '../core/types'

export type TrayActions = {
  openSettings: () => void
  startRestNow: () => void
  extendWork: (minutes: number) => void
  showAbout: () => void
  quit: () => void
}

export type TrayStatus = {
  snapshot: EngineSnapshot
  triggerMode: TriggerMode
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
      return fromFile.resize({ width: 16, height: 16 })
    }
  }
  return nativeImage.createEmpty()
}

function statusLabel(status: TrayStatus): string {
  const { snapshot, triggerMode } = status
  const modeText = triggerMode === 'cumulative' ? '累计时长' : '固定间隔'
  if (snapshot.phase === 'resting') {
    return `休息中 · 剩余 ${formatDurationZh(snapshot.restRemainingMs)}`
  }
  if (snapshot.phase === 'awaitContinue') {
    return '休息结束 · 等待继续工作'
  }
  if (snapshot.sessionPaused) {
    return `${modeText} · 已暂停（锁屏/睡眠）`
  }
  return `${modeText} · 距休息 ${formatDurationZh(snapshot.workRemainingMs)}`
}

export class AppTrayController {
  private readonly tray: Tray
  private lastStatus: TrayStatus | null = null

  constructor(private readonly actions: TrayActions) {
    this.tray = new Tray(createTrayIcon())
    this.tray.setToolTip('强制休息提醒')
    this.rebuildMenu()
    this.tray.on('double-click', () => this.actions.openSettings())
  }

  updateStatus(status: TrayStatus): void {
    this.lastStatus = status
    this.tray.setToolTip(`强制休息提醒\n${statusLabel(status)}`)
    // 菜单里的状态行需要重建才刷新
    this.rebuildMenu()
  }

  destroy(): void {
    this.tray.destroy()
  }

  private rebuildMenu(): void {
    const statusText = this.lastStatus ? statusLabel(this.lastStatus) : '状态加载中…'
    const canExtend = this.lastStatus?.snapshot.phase === 'working'

    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: statusText,
          enabled: false
        },
        { type: 'separator' },
        {
          label: '设置…',
          click: () => this.actions.openSettings()
        },
        {
          label: '立即休息',
          click: () => this.actions.startRestNow()
        },
        {
          label: '本段再延长',
          enabled: canExtend,
          submenu: [
            {
              label: '延长 15 分钟',
              click: () => this.actions.extendWork(15)
            },
            {
              label: '延长 30 分钟',
              click: () => this.actions.extendWork(30)
            }
          ]
        },
        { type: 'separator' },
        {
          label: '关于',
          click: () => this.actions.showAbout()
        },
        {
          label: '退出',
          click: () => this.actions.quit()
        }
      ])
    )
  }
}

export function aboutMessage(): string {
  return `强制休息提醒\n版本 ${app.getVersion()}\n纯本地离线 · Win11`
}
