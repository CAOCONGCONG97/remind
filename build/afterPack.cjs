const path = require('node:path')
const { existsSync } = require('node:fs')

/**
 * signAndEditExecutable=false 时 electron-builder 不会改写 exe 资源
 *（为避开 winCodeSign 解压 symlink 权限问题），因此在 afterPack 用 rcedit 写入图标。
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return
  }
  const productName = context.packager.appInfo.productFilename
  const exePath = path.join(context.appOutDir, `${productName}.exe`)
  const iconPath = path.join(context.packager.projectDir, 'resources', 'icon.ico')
  if (!existsSync(exePath)) {
    throw new Error(`afterPack: exe 不存在 ${exePath}`)
  }
  if (!existsSync(iconPath)) {
    throw new Error(`afterPack: 图标不存在 ${iconPath}`)
  }
  const rcedit = require('rcedit')
  await rcedit(exePath, { icon: iconPath })
  console.log(`[afterPack] embedded icon into ${exePath}`)
}
