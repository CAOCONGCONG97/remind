import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { buildOtpAuthUri, parseOtpAuthUri } from '../../shared/otpauth'
import { generateTotp, normalizeBase32 } from '../../shared/totp'
import type {
  AccountPublic,
  AccountRecord,
  AddAccountInput,
  ExportPayload,
  TotpLiveCode
} from '../../shared/authenticator-types'

type StoredFileV1 = {
  version: 1
  /** Electron safeStorage 加密后的 base64；不可用时回落明文 JSON（仅开发兜底） */
  encrypted: boolean
  payload: string
}

type StorePayload = {
  accounts: AccountRecord[]
}

function toPublic(account: AccountRecord): AccountPublic {
  return {
    id: account.id,
    issuer: account.issuer,
    label: account.label,
    algorithm: account.algorithm,
    digits: account.digits,
    period: account.period,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  }
}

export class AccountStore {
  private accounts: AccountRecord[] = []
  private readonly filePath: string

  constructor(filePath?: string) {
    // 与休息设置分离，避免混在同一 JSON；仍落在 remind userData 下
    const dir = join(app.getPath('userData'), 'authenticator')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.filePath = filePath ?? join(dir, 'accounts.enc.json')
    this.load()
  }

  listPublic(): AccountPublic[] {
    return this.accounts
      .slice()
      .sort((left, right) => left.issuer.localeCompare(right.issuer) || left.label.localeCompare(right.label))
      .map(toPublic)
  }

  liveCodes(nowMs = Date.now()): TotpLiveCode[] {
    return this.accounts.map((account) => {
      const totp = generateTotp(account.secret, {
        algorithm: account.algorithm,
        digits: account.digits,
        period: account.period,
        nowMs
      })
      return {
        id: account.id,
        code: totp.code,
        remainingSec: totp.remainingSec,
        period: totp.period
      }
    })
  }

  getById(id: string): AccountRecord | undefined {
    return this.accounts.find((account) => account.id === id)
  }

  add(input: AddAccountInput): AccountPublic {
    let parsed
    if (input.source === 'otpauth') {
      parsed = parseOtpAuthUri(input.uri)
    } else {
      const secret = normalizeBase32(input.secret)
      // 先校验能解码
      generateTotp(secret, {
        algorithm: input.algorithm ?? 'SHA1',
        digits: input.digits ?? 6,
        period: input.period ?? 30
      })
      parsed = {
        type: 'totp' as const,
        secret,
        issuer: (input.issuer ?? '').trim() || '手动添加',
        label: (input.label ?? '').trim() || '账号',
        algorithm: input.algorithm ?? 'SHA1',
        digits: input.digits ?? 6,
        period: input.period ?? 30
      }
    }

    const duplicate = this.accounts.find(
      (account) =>
        normalizeBase32(account.secret) === parsed.secret &&
        account.issuer === parsed.issuer &&
        account.label === parsed.label
    )
    if (duplicate) {
      throw new Error('相同账号已存在')
    }

    const now = Date.now()
    const record: AccountRecord = {
      id: randomUUID(),
      issuer: parsed.issuer,
      label: parsed.label,
      secret: parsed.secret,
      algorithm: parsed.algorithm,
      digits: parsed.digits,
      period: parsed.period,
      createdAt: now,
      updatedAt: now
    }
    this.accounts.push(record)
    this.save()
    return toPublic(record)
  }

  remove(ids: string[]): number {
    const idSet = new Set(ids)
    const before = this.accounts.length
    this.accounts = this.accounts.filter((account) => !idSet.has(account.id))
    const removed = before - this.accounts.length
    if (removed > 0) {
      this.save()
    }
    return removed
  }

  revealSecret(id: string): string {
    const account = this.getById(id)
    if (!account) {
      throw new Error('账号不存在')
    }
    return account.secret
  }

  otpauthUri(id: string): string {
    const account = this.getById(id)
    if (!account) {
      throw new Error('账号不存在')
    }
    return buildOtpAuthUri(account)
  }

  exportAccounts(ids?: string[]): ExportPayload {
    const selected =
      ids && ids.length > 0
        ? this.accounts.filter((account) => ids.includes(account.id))
        : this.accounts.slice()
    return {
      accounts: selected.map((account) => ({
        id: account.id,
        issuer: account.issuer,
        label: account.label,
        secret: account.secret,
        algorithm: account.algorithm,
        digits: account.digits,
        period: account.period,
        otpauthUri: buildOtpAuthUri(account)
      }))
    }
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      this.accounts = []
      return
    }
    const raw = readFileSync(this.filePath, 'utf8')
    const stored = JSON.parse(raw) as StoredFileV1
    let json: string
    if (stored.encrypted) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('本机加密不可用，无法读取已加密账号库')
      }
      json = safeStorage.decryptString(Buffer.from(stored.payload, 'base64'))
    } else {
      json = stored.payload
    }
    const payload = JSON.parse(json) as StorePayload
    this.accounts = Array.isArray(payload.accounts) ? payload.accounts : []
  }

  private save(): void {
    const payload: StorePayload = { accounts: this.accounts }
    const json = JSON.stringify(payload)
    let stored: StoredFileV1
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(json)
      stored = {
        version: 1,
        encrypted: true,
        payload: encrypted.toString('base64')
      }
    } else {
      // 开发/特殊环境兜底：仍写入本地文件，启动时 UI 会提示加密不可用
      stored = {
        version: 1,
        encrypted: false,
        payload: json
      }
    }
    writeFileSync(this.filePath, JSON.stringify(stored, null, 2), 'utf8')
  }

  encryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  storagePath(): string {
    return this.filePath
  }
}
