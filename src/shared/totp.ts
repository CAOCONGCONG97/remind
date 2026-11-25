import { createHmac } from 'node:crypto'
import type { TotpAlgorithm } from './authenticator-types'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** 规范化用户粘贴的 base32（去空格、忽略 padding） */
export function normalizeBase32(input: string): string {
  return input.replace(/[\s=\-]/g, '').toUpperCase()
}

export function decodeBase32(secret: string): Buffer {
  const cleaned = normalizeBase32(secret)
  if (!cleaned) {
    throw new Error('密钥为空')
  }
  let bits = ''
  for (const char of cleaned) {
    const value = BASE32_ALPHABET.indexOf(char)
    if (value < 0) {
      throw new Error('密钥不是有效的 Base32')
    }
    bits += value.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2))
  }
  if (bytes.length === 0) {
    throw new Error('密钥过短')
  }
  return Buffer.from(bytes)
}

export function encodeBase32(buffer: Buffer): string {
  let bits = ''
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0')
  }
  let output = ''
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, '0')
    output += BASE32_ALPHABET[Number.parseInt(chunk, 2)]
  }
  return output
}

function algorithmToNode(algorithm: TotpAlgorithm): string {
  switch (algorithm) {
    case 'SHA1':
      return 'sha1'
    case 'SHA256':
      return 'sha256'
    case 'SHA512':
      return 'sha512'
    default:
      return 'sha1'
  }
}

function counterToBuffer(counter: number): Buffer {
  const buffer = Buffer.alloc(8)
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  buffer.writeUInt32BE(counter >>> 0, 4)
  return buffer
}

/** RFC 6238 TOTP；默认 SHA1 / 30s / 6 位 */
export function generateTotp(
  secretBase32: string,
  options?: {
    algorithm?: TotpAlgorithm
    digits?: number
    period?: number
    nowMs?: number
  }
): { code: string; remainingSec: number; period: number } {
  const algorithm = options?.algorithm ?? 'SHA1'
  const digits = options?.digits ?? 6
  const period = options?.period ?? 30
  const nowMs = options?.nowMs ?? Date.now()
  const epochSec = Math.floor(nowMs / 1000)
  const counter = Math.floor(epochSec / period)
  const remainingSec = period - (epochSec % period)

  const key = decodeBase32(secretBase32)
  const hmac = createHmac(algorithmToNode(algorithm), key)
  hmac.update(counterToBuffer(counter))
  const digest = hmac.digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  const otp = binary % 10 ** digits
  return {
    code: otp.toString().padStart(digits, '0'),
    remainingSec,
    period
  }
}
