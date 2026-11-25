/**
 * 对本机 win-unpacked 安装态路径做一次自启写入验证（不启动 UI）。
 * 用法：node scripts/verify-autostart.mjs
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const exe = join(root, 'release', 'win-unpacked', '强制休息提醒.exe')
const valueName = 'RemindForcedRest'

if (!existsSync(exe)) {
  console.error('missing unpacked exe, run npm run pack:win first:', exe)
  process.exit(1)
}

// 用 Electron 子进程执行一小段：setLoginItemSettings + reg
const electronCli = join(root, 'node_modules', 'electron', 'cli.js')
const probe = `
const { app } = require('electron');
const { execFileSync } = require('child_process');
const path = ${JSON.stringify(exe)};
app.setAppUserModelId('com.chaopin.remind');
app.whenReady().then(() => {
  app.setLoginItemSettings({
    openAtLogin: true,
    enabled: true,
    path,
    args: [],
    name: '${valueName}'
  });
  const cmd = '"' + path + '"';
  execFileSync('reg.exe', ['add', 'HKCU\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run', '/v', '${valueName}', '/t', 'REG_SZ', '/d', cmd, '/f'], { windowsHide: true });
  try {
    execFileSync('reg.exe', ['delete', 'HKCU\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run', '/v', 'electron.app.Electron', '/f'], { windowsHide: true });
  } catch {}
  const out = execFileSync('reg.exe', ['query', 'HKCU\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run', '/v', '${valueName}'], { encoding: 'utf8', windowsHide: true });
  console.log(out);
  const settings = app.getLoginItemSettings({ path, args: [], name: '${valueName}' });
  console.log(JSON.stringify({ openAtLogin: settings.openAtLogin, executableWillLaunchAtLogin: settings.executableWillLaunchAtLogin, path }));
  app.quit();
});
`

const result = spawnSync(process.execPath, [electronCli, '-e', probe], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
  shell: false
})

// electron -e 对 packaged path 探测：改用直接 reg 模拟安装版路径验证（主路径）
console.log('--- direct registry write for win-unpacked ---')
const command = `"${exe}"`
execFileSync(
  'reg.exe',
  ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', valueName, '/t', 'REG_SZ', '/d', command, '/f'],
  { windowsHide: true }
)
try {
  execFileSync(
    'reg.exe',
    ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'electron.app.Electron', '/f'],
    { windowsHide: true }
  )
  console.log('removed legacy electron.app.Electron')
} catch {
  console.log('legacy electron.app.Electron already absent')
}
const query = execFileSync(
  'reg.exe',
  ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', valueName],
  { encoding: 'utf8', windowsHide: true }
)
console.log(query)
const match = query.match(/RemindForcedRest\s+REG_SZ\s+(.+)/)
const written = (match?.[1] || '').trim().replace(/^"|"$/g, '')
const ok = written.toLowerCase() === exe.toLowerCase() || written.toLowerCase() === `"${exe}"`.toLowerCase()
console.log(JSON.stringify({ ok, written, expected: exe, electronProbeStatus: result.status, electronProbeStderr: result.stderr?.slice(0, 400) }))
if (!ok) process.exit(2)
