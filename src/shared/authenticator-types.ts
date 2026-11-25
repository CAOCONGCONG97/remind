/** 账号公开视图：永不把明文 secret 默认返回给渲染层列表 */
export type AccountPublic = {
  id: string
  issuer: string
  label: string
  algorithm: TotpAlgorithm
  digits: number
  period: number
  createdAt: number
  updatedAt: number
}

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512'

export type AccountRecord = AccountPublic & {
  /** base32 secret（内存中明文；落盘前加密） */
  secret: string
}

export type TotpLiveCode = {
  id: string
  code: string
  remainingSec: number
  period: number
}

export type ParsedOtpAuth = {
  type: 'totp'
  secret: string
  issuer: string
  label: string
  algorithm: TotpAlgorithm
  digits: number
  period: number
}

export type AddAccountInput =
  | { source: 'otpauth'; uri: string }
  | { source: 'manual'; secret: string; issuer?: string; label?: string; algorithm?: TotpAlgorithm; digits?: number; period?: number }

export type ScanResult =
  | { ok: true; uri: string; displayName?: string }
  | { ok: false; message: string }

export type ExportPayload = {
  accounts: Array<{
    id: string
    issuer: string
    label: string
    secret: string
    algorithm: TotpAlgorithm
    digits: number
    period: number
    otpauthUri: string
  }>
}
