const summaryEl = document.getElementById('summary') as HTMLElement
const remainEl = document.getElementById('remain') as HTMLElement
const mainActions = document.getElementById('mainActions') as HTMLElement
const cancelBtn = document.getElementById('cancelBtn') as HTMLButtonElement
const ackBtn = document.getElementById('ackBtn') as HTMLButtonElement
const cancelForm = document.getElementById('cancelForm') as HTMLFormElement
const passwordInput = document.getElementById('password') as HTMLInputElement
const errorEl = document.getElementById('error') as HTMLElement
const backBtn = document.getElementById('backBtn') as HTMLButtonElement

let pendingScope: 'once' | 'today' = 'once'

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

window.remind.onShutdownState((payload) => {
  summaryEl.textContent = `计划关机时刻 ${payload.shutdownAtLabel}`
  remainEl.textContent = `剩余 ${formatMs(payload.remainingMs)}`
})

cancelBtn.addEventListener('click', () => {
  mainActions.hidden = true
  cancelForm.hidden = false
  errorEl.textContent = ''
  passwordInput.value = ''
  passwordInput.focus()
})

ackBtn.addEventListener('click', () => {
  void window.remind.dismissShutdownToast()
})

backBtn.addEventListener('click', () => {
  cancelForm.hidden = true
  mainActions.hidden = false
  errorEl.textContent = ''
})

cancelForm.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  if (target instanceof HTMLButtonElement && target.dataset.scope) {
    pendingScope = target.dataset.scope === 'today' ? 'today' : 'once'
  }
})

cancelForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const result = await window.remind.cancelShutdown(passwordInput.value, pendingScope)
  if (!result.ok) {
    errorEl.textContent = result.message ?? '取消失败'
    return
  }
  cancelForm.hidden = true
  mainActions.hidden = false
})
