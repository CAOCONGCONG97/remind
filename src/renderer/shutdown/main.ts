const titleEl = document.getElementById('title') as HTMLElement
const summaryEl = document.getElementById('summary') as HTMLElement
const remainEl = document.getElementById('remain') as HTMLElement
const mainActions = document.getElementById('mainActions') as HTMLElement
const cancelBtn = document.getElementById('cancelBtn') as HTMLButtonElement
const deferBtn = document.getElementById('deferBtn') as HTMLButtonElement
const ackBtn = document.getElementById('ackBtn') as HTMLButtonElement
const actionForm = document.getElementById('actionForm') as HTMLFormElement
const passwordInput = document.getElementById('password') as HTMLInputElement
const formHint = document.getElementById('formHint') as HTMLElement
const cancelChoices = document.getElementById('cancelChoices') as HTMLElement
const deferChoices = document.getElementById('deferChoices') as HTMLElement
const errorEl = document.getElementById('error') as HTMLElement
const backBtn = document.getElementById('backBtn') as HTMLButtonElement

type PendingAction = 'cancel-once' | 'cancel-today' | 'defer-15' | 'defer-30'
let pendingAction: PendingAction = 'cancel-once'

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function openForm(mode: 'cancel' | 'defer'): void {
  mainActions.hidden = true
  actionForm.hidden = false
  errorEl.textContent = ''
  passwordInput.value = ''
  cancelChoices.hidden = mode !== 'cancel'
  deferChoices.hidden = mode !== 'defer'
  formHint.textContent = mode === 'cancel' ? '取消范围' : '推迟多久'
  pendingAction = mode === 'cancel' ? 'cancel-once' : 'defer-15'
  void window.remind.setShutdownLayout('form')
  passwordInput.focus()
}

function closeForm(): void {
  actionForm.hidden = true
  mainActions.hidden = false
  errorEl.textContent = ''
  void window.remind.setShutdownLayout('main')
}

window.remind.onShutdownState((payload) => {
  titleEl.textContent = payload.deferred ? '已推迟关机' : '即将关机'
  summaryEl.textContent = `${payload.deferred ? '推迟至' : '计划关机时刻'} ${payload.shutdownAtLabel}`
  remainEl.textContent = `剩余 ${formatMs(payload.remainingMs)}`
})

cancelBtn.addEventListener('click', () => openForm('cancel'))
deferBtn.addEventListener('click', () => openForm('defer'))

ackBtn.addEventListener('click', () => {
  void window.remind.dismissShutdownToast()
})

backBtn.addEventListener('click', () => {
  closeForm()
})

actionForm.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  if (target instanceof HTMLButtonElement && target.dataset.action) {
    pendingAction = target.dataset.action as PendingAction
  }
})

actionForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const password = passwordInput.value
  let result: { ok: boolean; message?: string }
  if (pendingAction === 'cancel-once' || pendingAction === 'cancel-today') {
    result = await window.remind.cancelShutdown(
      password,
      pendingAction === 'cancel-today' ? 'today' : 'once'
    )
  } else {
    result = await window.remind.deferShutdown(password, pendingAction === 'defer-30' ? 30 : 15)
  }
  if (!result.ok) {
    errorEl.textContent = result.message ?? '操作失败'
    return
  }
  closeForm()
})
