export type AutoStartTarget = {
  path: string
  args: string[]
  source: 'portable' | 'packaged' | 'dev'
}

/**
 * 解析开机自启目标路径（与 Electron 解耦，便于单测）。
 * 便携版必须指向外层 portable.exe，不能指向 Temp 解压目录中的 process.execPath。
 */
export function resolveAutoStartTarget(input: {
  portableExecutableFile?: string | null
  execPath: string
  packaged: boolean
  appPath: string
}): AutoStartTarget {
  const portable = (input.portableExecutableFile || '').trim()
  if (portable) {
    return { path: portable, args: [], source: 'portable' }
  }
  if (input.packaged) {
    return { path: input.execPath, args: [], source: 'packaged' }
  }
  return {
    path: input.execPath,
    args: [input.appPath],
    source: 'dev'
  }
}

/** Temp 解压路径重启后会消失，不能写入 Run */
export function isEphemeralTempPath(filePath: string, tempRoots: string[] = []): boolean {
  const normalized = filePath.replace(/\//g, '\\').toLowerCase()
  for (const root of tempRoots) {
    const tempRoot = root.replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '')
    if (tempRoot && normalized.startsWith(tempRoot + '\\')) {
      return true
    }
  }
  return /\\temp\\[a-z0-9_-]+\\/i.test(normalized)
}
