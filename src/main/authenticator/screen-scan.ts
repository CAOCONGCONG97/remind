import { BrowserWindow, desktopCapturer, nativeImage, screen, type NativeImage } from 'electron'
import jsQR from 'jsqr'

export type ScreenScanHit = {
  uri: string
  displayId: string
  displayLabel: string
}

/** Electron toBitmap 为 BGRA，jsQR 需要 RGBA */
function nativeImageToRgba(image: NativeImage): { data: Uint8ClampedArray; width: number; height: number } {
  const size = image.getSize()
  const bgra = image.toBitmap()
  const pixelCount = size.width * size.height
  const rgba = new Uint8ClampedArray(pixelCount * 4)
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4
    rgba[offset] = bgra[offset + 2]
    rgba[offset + 1] = bgra[offset + 1]
    rgba[offset + 2] = bgra[offset]
    rgba[offset + 3] = bgra[offset + 3]
  }
  return { data: rgba, width: size.width, height: size.height }
}

function tryDecodeQr(image: NativeImage): string | null {
  if (image.isEmpty()) {
    return null
  }
  const { data, width, height } = nativeImageToRgba(image)
  const result = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })
  if (!result?.data) {
    return null
  }
  const text = result.data.trim()
  if (!text.toLowerCase().startsWith('otpauth://')) {
    return null
  }
  return text
}

/** 抓取全部显示器并尝试解码 otpauth QR */
export async function scanAllDisplaysForOtpAuth(): Promise<ScreenScanHit[]> {
  const displays = screen.getAllDisplays()
  const maxWidth = Math.max(...displays.map((display) => Math.round(display.size.width * display.scaleFactor)))
  const maxHeight = Math.max(...displays.map((display) => Math.round(display.size.height * display.scaleFactor)))

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.min(maxWidth, 3840),
      height: Math.min(maxHeight, 2160)
    },
    fetchWindowIcons: false
  })

  const hits: ScreenScanHit[] = []
  for (const source of sources) {
    try {
      const uri = tryDecodeQr(source.thumbnail)
      if (uri) {
        hits.push({
          uri,
          displayId: source.display_id || source.id,
          displayLabel: source.name
        })
      }
    } catch {
      // 单屏失败不影响其它屏
    }
  }
  return hits
}

/**
 * 抓取指定显示器区域并解码。
 * region 为相对该显示器左上角的逻辑像素；hostWindow 为空时使用主屏。
 */
export async function scanRegionForOtpAuth(
  hostWindow: BrowserWindow | null,
  region: { x: number; y: number; width: number; height: number }
): Promise<ScreenScanHit | null> {
  const display = hostWindow
    ? screen.getDisplayMatching(hostWindow.getBounds())
    : screen.getPrimaryDisplay()
  const scale = display.scaleFactor
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width * scale),
      height: Math.round(display.size.height * scale)
    }
  })

  const matched =
    sources.find((source) => source.display_id && String(source.display_id) === String(display.id)) ??
    sources[0]
  if (!matched) {
    return null
  }

  const cropped = matched.thumbnail.crop({
    x: Math.max(0, Math.round(region.x * scale)),
    y: Math.max(0, Math.round(region.y * scale)),
    width: Math.max(1, Math.round(region.width * scale)),
    height: Math.max(1, Math.round(region.height * scale))
  })
  const uri = tryDecodeQr(cropped)
  if (!uri) {
    return null
  }
  return {
    uri,
    displayId: String(display.id),
    displayLabel: matched.name
  }
}

/** 从本地 PNG/JPEG 文件缓冲解码（手动导入截图兜底） */
export function scanImageBufferForOtpAuth(buffer: Buffer): string | null {
  const image = nativeImage.createFromBuffer(buffer)
  return tryDecodeQr(image)
}
