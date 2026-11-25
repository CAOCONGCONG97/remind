import { normalizeBase32 } from './totp'
import type { AccountRecord, ParsedOtpAuth, TotpAlgorithm } from './authenticator-types'

function parseAlgorithm(raw: string | null): TotpAlgorithm {
  if (!raw) {
    return 'SHA1'
  }
  const upper = raw.toUpperCase().replace(/-/g, '')
  if (upper === 'SHA256' || upper === 'SHA2') {
    return 'SHA256'
  }
  if (upper === 'SHA512') {
    return 'SHA512'
  }
  return 'SHA1'
}

/**
 * 解析 otpauth://totp/... URI。
 * 示例：otpauth://totp/Issuer:user@ex.com?secret=JBSWY3DPEHPK3PXP&issuer=Issuer&digits=6&period=30&algorithm=SHA1
 */
export function parseOtpAuthUri(uri: string): ParsedOtpAuth {
  const trimmed = uri.trim()
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('不是有效的 otpauth URI')
  }
  if (url.protocol !== 'otpauth:') {
    throw new Error('仅支持 otpauth:// 协议')
  }
  if (url.hostname.toLowerCase() !== 'totp') {
    throw new Error('当前仅支持 TOTP（otpauth://totp/...）')
  }

  const pathPart = decodeURIComponent(url.pathname.replace(/^\//, ''))
  let issuerFromPath = ''
  let label = pathPart
  const colonIndex = pathPart.indexOf(':')
  if (colonIndex >= 0) {
    issuerFromPath = pathPart.slice(0, colonIndex).trim()
    label = pathPart.slice(colonIndex + 1).trim()
  }

  const secretRaw = url.searchParams.get('secret')
  if (!secretRaw) {
    throw new Error('URI 缺少 secret 参数')
  }
  const secret = normalizeBase32(secretRaw)
  const issuerParam = url.searchParams.get('issuer')?.trim() ?? ''
  const issuer = issuerParam || issuerFromPath || '未知'
  const digits = Number.parseInt(url.searchParams.get('digits') ?? '6', 10)
  const period = Number.parseInt(url.searchParams.get('period') ?? '30', 10)
  if (![6, 7, 8].includes(digits)) {
    throw new Error('digits 仅支持 6/7/8')
  }
  if (!Number.isFinite(period) || period < 15 || period > 120) {
    throw new Error('period 无效')
  }

  return {
    type: 'totp',
    secret,
    issuer,
    label: label || '账号',
    algorithm: parseAlgorithm(url.searchParams.get('algorithm')),
    digits,
    period
  }
}

export function buildOtpAuthUri(account: Pick<AccountRecord, 'issuer' | 'label' | 'secret' | 'algorithm' | 'digits' | 'period'>): string {
  const labelPath = account.issuer
    ? `${encodeURIComponent(account.issuer)}:${encodeURIComponent(account.label)}`
    : encodeURIComponent(account.label)
  const params = new URLSearchParams()
  params.set('secret', normalizeBase32(account.secret))
  if (account.issuer) {
    params.set('issuer', account.issuer)
  }
  params.set('algorithm', account.algorithm)
  params.set('digits', String(account.digits))
  params.set('period', String(account.period))
  return `otpauth://totp/${labelPath}?${params.toString()}`
}
