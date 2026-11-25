import './style.css'

/** 渲染层本地类型（避免把 Node crypto 的 shared/totp 拉进 web 类型检查） */
type AccountPublic = {
  id: string
  issuer: string
  label: string
  algorithm: string
  digits: number
  period: number
  createdAt: number
  updatedAt: number
}

type TotpLiveCode = {
  id: string
  code: string
  remainingSec: number
  period: number
}

const root = document.getElementById('app')!

type UiState = {
  accounts: AccountPublic[]
  codes: Map<string, TotpLiveCode>
  selected: Set<string>
  encryptionAvailable: boolean
  storagePath: string
  toast: string
}

const state: UiState = {
  accounts: [],
  codes: new Map(),
  selected: new Set(),
  encryptionAvailable: true,
  storagePath: '',
  toast: ''
}

function formatCode(code: string): string {
  if (code.length === 6) {
    return `${code.slice(0, 3)} ${code.slice(3)}`
  }
  return code
}

function setToast(message: string, isError = false): void {
  state.toast = message
  const el = document.getElementById('toast')
  if (el) {
    el.textContent = message
    el.className = isError ? 'status error' : 'status'
  }
}

async function refreshMeta(): Promise<void> {
  const meta = await window.authenticator.meta()
  state.encryptionAvailable = meta.encryptionAvailable
  state.storagePath = meta.storagePath
}

async function refreshAccounts(): Promise<void> {
  state.accounts = await window.authenticator.listAccounts()
  const validIds = new Set(state.accounts.map((account) => account.id))
  for (const id of [...state.selected]) {
    if (!validIds.has(id)) {
      state.selected.delete(id)
    }
  }
  render()
}

async function refreshCodes(): Promise<void> {
  const codes = await window.authenticator.liveCodes()
  state.codes = new Map(codes.map((item) => [item.id, item]))
  updateCodeDom()
}

function updateCodeDom(): void {
  for (const account of state.accounts) {
    const live = state.codes.get(account.id)
    const codeEl = document.querySelector<HTMLElement>(`[data-code="${account.id}"]`)
    const countEl = document.querySelector<HTMLElement>(`[data-count="${account.id}"]`)
    const barEl = document.querySelector<HTMLElement>(`[data-bar="${account.id}"]`)
    if (!live || !codeEl || !countEl || !barEl) {
      continue
    }
    codeEl.textContent = formatCode(live.code)
    countEl.textContent = `${live.remainingSec}s`
    const ratio = Math.max(0, Math.min(1, live.remainingSec / live.period))
    barEl.style.width = `${ratio * 100}%`
  }
}

function openDialog(id: string): void {
  const dialog = document.getElementById(id) as HTMLDialogElement | null
  dialog?.showModal()
}

function closeDialog(id: string): void {
  const dialog = document.getElementById(id) as HTMLDialogElement | null
  dialog?.close()
}

async function handleAddFromUri(uri: string): Promise<void> {
  await window.authenticator.addAccount({ source: 'otpauth', uri })
  closeDialog('add-dialog')
  setToast('已添加账号')
  await refreshAccounts()
  await refreshCodes()
}

function render(): void {
  const selectedCount = state.selected.size
  root.innerHTML = `
    <header>
      <div>
        <h1>认证器</h1>
        <p class="sub">与强制休息同进程 · 本地 TOTP · 无网络</p>
      </div>
      <div class="toolbar">
        <button class="primary" id="btn-add">添加账号</button>
        <button id="btn-export-selected" ${selectedCount ? '' : 'disabled'}>导出选中</button>
        <button id="btn-export-all" ${state.accounts.length ? '' : 'disabled'}>导出全部</button>
        <button class="danger" id="btn-delete" ${selectedCount ? '' : 'disabled'}>删除选中</button>
      </div>
    </header>
    <div class="note">
      密钥与动态码属于敏感凭据。数据仅保存在本机（${state.encryptionAvailable ? '已用系统凭据加密落盘' : '当前环境加密不可用，请谨慎使用'}）。
      关闭窗口后应用仍在托盘运行。Microsoft Authenticator 等通常无法直接导入历史条目，换机/换 App 多半仍需重新扫码绑定。
    </div>
    <div class="meta">存储：${escapeHtml(state.storagePath || '…')} · 账号 ${state.accounts.length} · <span id="toast" class="status">${escapeHtml(state.toast)}</span></div>
    <main>
      ${
        state.accounts.length === 0
          ? `<div class="empty">还没有账号。点击「添加账号」扫屏二维码，或粘贴 otpauth URI / Base32 密钥。</div>`
          : `<div class="list">${state.accounts.map(renderRow).join('')}</div>`
      }
    </main>

    <dialog id="add-dialog">
      <div class="dialog-body">
        <h2>添加账号</h2>
        <p>优先扫屏识别 otpauth:// 二维码；也可手动粘贴 URI 或 Base32 密钥。</p>
        <div class="tabs">
          <button type="button" class="active" data-tab="scan">扫屏 / 图片</button>
          <button type="button" data-tab="uri">otpauth URI</button>
          <button type="button" data-tab="manual">手动密钥</button>
        </div>
        <div data-panel="scan">
          <div class="toolbar">
            <button class="primary" id="scan-all">扫描全部显示器</button>
            <button id="scan-region">框选区域</button>
            <button id="scan-image">从图片识别</button>
          </div>
          <p id="scan-status" class="status" style="margin-top:10px"></p>
        </div>
        <div data-panel="uri" hidden>
          <div class="field">
            <label for="uri-input">otpauth://totp/...</label>
            <textarea id="uri-input" placeholder="otpauth://totp/Issuer:account?secret=..."></textarea>
          </div>
        </div>
        <div data-panel="manual" hidden>
          <div class="field">
            <label for="manual-issuer">发行方</label>
            <input id="manual-issuer" placeholder="例如 GitHub" />
          </div>
          <div class="field">
            <label for="manual-label">账号名</label>
            <input id="manual-label" placeholder="例如 you@example.com" />
          </div>
          <div class="field">
            <label for="manual-secret">Base32 密钥</label>
            <textarea id="manual-secret" placeholder="JBSWY3DPEHPK3PXP"></textarea>
          </div>
        </div>
        <div class="dialog-actions">
          <button type="button" id="add-cancel">取消</button>
          <button type="button" class="primary" id="add-confirm">添加</button>
        </div>
      </div>
    </dialog>

    <dialog id="export-dialog">
      <div class="dialog-body">
        <h2>导出 / 显示二维码</h2>
        <div class="qr-wrap">
          <img id="export-qr" alt="otpauth 二维码" />
          <div id="export-uri" class="secret-box"></div>
          <div id="export-secret" class="secret-box" hidden></div>
        </div>
        <div class="dialog-actions">
          <button type="button" id="export-copy-uri">复制 URI</button>
          <button type="button" id="export-reveal">显示 / 复制密钥</button>
          <button type="button" id="export-close">关闭</button>
        </div>
      </div>
    </dialog>
  `

  bindMainEvents()
  updateCodeDom()
}

function renderRow(account: AccountPublic): string {
  const live = state.codes.get(account.id)
  const checked = state.selected.has(account.id) ? 'checked' : ''
  const code = live ? formatCode(live.code) : '······'
  const remaining = live?.remainingSec ?? '—'
  const period = live?.period ?? account.period
  const ratio = live ? Math.max(0, Math.min(1, live.remainingSec / period)) : 0
  return `
    <div class="row" data-id="${account.id}">
      <input type="checkbox" data-select="${account.id}" ${checked} />
      <div>
        <div class="title">${escapeHtml(account.issuer || '未命名')}</div>
        <div class="label">${escapeHtml(account.label)} · ${account.algorithm} · ${account.digits}位 / ${account.period}s</div>
        <div class="row-actions">
          <button type="button" data-action="qr" data-id="${account.id}">显示二维码</button>
          <button type="button" data-action="secret" data-id="${account.id}">查看密钥</button>
        </div>
      </div>
      <div class="code-block">
        <div class="code" data-code="${account.id}" title="点击复制">${code}</div>
        <div class="countdown">剩余 <span data-count="${account.id}">${remaining}</span>s</div>
        <div class="bar"><span data-bar="${account.id}" style="width:${ratio * 100}%"></span></div>
      </div>
    </div>
  `
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function bindMainEvents(): void {
  document.getElementById('btn-add')?.addEventListener('click', () => openDialog('add-dialog'))
  document.getElementById('add-cancel')?.addEventListener('click', () => closeDialog('add-dialog'))

  document.querySelectorAll('.tabs button').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = (button as HTMLElement).dataset.tab
      document.querySelectorAll('.tabs button').forEach((node) => node.classList.remove('active'))
      button.classList.add('active')
      document.querySelectorAll('[data-panel]').forEach((panel) => {
        const element = panel as HTMLElement
        element.hidden = element.dataset.panel !== tab
      })
    })
  })

  document.getElementById('scan-all')?.addEventListener('click', async () => {
    const status = document.getElementById('scan-status')
    if (status) {
      status.textContent = '正在扫描显示器…'
      status.className = 'status'
    }
    try {
      const result = await window.authenticator.scanAllScreens()
      const hits = result.hits ?? []
      if (!hits.length) {
        if (status) {
          status.textContent = '未识别到 otpauth 二维码。可改用框选、图片或手动粘贴。'
          status.className = 'status error'
        }
        return
      }
      if (hits.length === 1) {
        await handleAddFromUri(hits[0].uri)
        return
      }
      // 多命中：取第一个并提示
      await handleAddFromUri(hits[0].uri)
      setToast(`检测到 ${hits.length} 个二维码，已添加第一个`)
    } catch (error) {
      if (status) {
        status.textContent = error instanceof Error ? error.message : '扫描失败'
        status.className = 'status error'
      }
    }
  })

  document.getElementById('scan-region')?.addEventListener('click', async () => {
    closeDialog('add-dialog')
    await window.authenticator.startRegionScan()
  })

  document.getElementById('scan-image')?.addEventListener('click', async () => {
    const status = document.getElementById('scan-status')
    const result = await window.authenticator.pickImageScan()
    if (!result.ok || !result.uri) {
      if (status) {
        status.textContent = result.message || '未识别'
        status.className = 'status error'
      }
      return
    }
    await handleAddFromUri(result.uri)
  })

  document.getElementById('add-confirm')?.addEventListener('click', async () => {
    const activeTab = document.querySelector('.tabs button.active') as HTMLElement | null
    const tab = activeTab?.dataset.tab ?? 'uri'
    try {
      if (tab === 'uri') {
        const uri = (document.getElementById('uri-input') as HTMLTextAreaElement).value
        await handleAddFromUri(uri)
        return
      }
      if (tab === 'manual') {
        const issuer = (document.getElementById('manual-issuer') as HTMLInputElement).value
        const label = (document.getElementById('manual-label') as HTMLInputElement).value
        const secret = (document.getElementById('manual-secret') as HTMLTextAreaElement).value
        await window.authenticator.addAccount({
          source: 'manual',
          issuer,
          label,
          secret
        })
        closeDialog('add-dialog')
        setToast('已添加账号')
        await refreshAccounts()
        await refreshCodes()
        return
      }
      setToast('请先扫码或切换到 URI / 手动密钥页', true)
    } catch (error) {
      setToast(error instanceof Error ? error.message : '添加失败', true)
    }
  })

  document.querySelectorAll('[data-select]').forEach((node) => {
    node.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement
      const id = target.dataset.select!
      if (target.checked) {
        state.selected.add(id)
      } else {
        state.selected.delete(id)
      }
      render()
      void refreshCodes()
    })
  })

  document.querySelectorAll('[data-code]').forEach((node) => {
    node.addEventListener('click', async () => {
      const id = (node as HTMLElement).dataset.code!
      const result = await window.authenticator.copyCode(id)
      setToast(`已复制 ${formatCode(result.code)}`)
    })
  })

  document.querySelectorAll('[data-action="qr"]').forEach((node) => {
    node.addEventListener('click', async () => {
      const id = (node as HTMLElement).dataset.id!
      const qr = await window.authenticator.qrDataUrl(id)
      openDialog('export-dialog')
      const img = document.getElementById('export-qr') as HTMLImageElement
      const uriBox = document.getElementById('export-uri')!
      const secretBox = document.getElementById('export-secret')!
      img.src = qr.dataUrl
      uriBox.textContent = qr.uri
      secretBox.hidden = true
      secretBox.textContent = ''
      ;(document.getElementById('export-dialog') as HTMLElement).dataset.accountId = id
    })
  })

  document.querySelectorAll('[data-action="secret"]').forEach((node) => {
    node.addEventListener('click', async () => {
      const id = (node as HTMLElement).dataset.id!
      const revealed = await window.authenticator.revealSecret(id)
      if (revealed.cancelled || !revealed.secret) {
        return
      }
      openDialog('export-dialog')
      const qr = await window.authenticator.qrDataUrl(id)
      const img = document.getElementById('export-qr') as HTMLImageElement
      const uriBox = document.getElementById('export-uri')!
      const secretBox = document.getElementById('export-secret')!
      img.src = qr.dataUrl
      uriBox.textContent = qr.uri
      secretBox.hidden = false
      secretBox.textContent = revealed.secret
      ;(document.getElementById('export-dialog') as HTMLElement).dataset.accountId = id
    })
  })

  document.getElementById('export-close')?.addEventListener('click', () => closeDialog('export-dialog'))
  document.getElementById('export-copy-uri')?.addEventListener('click', async () => {
    const id = (document.getElementById('export-dialog') as HTMLElement).dataset.accountId
    if (!id) return
    const uri = await window.authenticator.otpauthUri(id)
    await navigator.clipboard.writeText(uri)
    setToast('已复制 otpauth URI')
  })
  document.getElementById('export-reveal')?.addEventListener('click', async () => {
    const id = (document.getElementById('export-dialog') as HTMLElement).dataset.accountId
    if (!id) return
    await window.authenticator.copySecret(id)
    const revealed = await window.authenticator.revealSecret(id)
    if (revealed.secret) {
      const secretBox = document.getElementById('export-secret')!
      secretBox.hidden = false
      secretBox.textContent = revealed.secret
    }
  })

  document.getElementById('btn-export-selected')?.addEventListener('click', async () => {
    const result = await window.authenticator.exportAccounts([...state.selected])
    if (result.cancelled) return
    setToast(`已导出 ${result.count} 个账号`)
    if (result.path) {
      await window.authenticator.showItemInFolder(result.path)
    }
  })

  document.getElementById('btn-export-all')?.addEventListener('click', async () => {
    const result = await window.authenticator.exportAccounts(null)
    if (result.cancelled) return
    setToast(`已导出 ${result.count} 个账号`)
    if (result.path) {
      await window.authenticator.showItemInFolder(result.path)
    }
  })

  document.getElementById('btn-delete')?.addEventListener('click', async () => {
    const result = await window.authenticator.removeAccounts([...state.selected])
    if (result.cancelled) return
    state.selected.clear()
    setToast(`已删除 ${result.removed} 个账号`)
    await refreshAccounts()
    await refreshCodes()
  })
}

async function bootstrap(): Promise<void> {
  await refreshMeta()
  await refreshAccounts()
  await refreshCodes()
  window.setInterval(() => {
    void refreshCodes()
  }, 1000)
  window.authenticator.onOpenAddScan(() => {
    openDialog('add-dialog')
  })
  window.authenticator.onRegionScanDone(async (payload) => {
    if (!payload.ok || !payload.uri) {
      setToast(payload.message || '框选扫码未成功', true)
      openDialog('add-dialog')
      return
    }
    try {
      await handleAddFromUri(payload.uri)
    } catch (error) {
      setToast(error instanceof Error ? error.message : '添加失败', true)
      openDialog('add-dialog')
    }
  })
}

void bootstrap()
