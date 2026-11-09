const remainEl = document.getElementById('remain') as HTMLElement
const mainActions = document.getElementById('mainActions') as HTMLElement
const ackBtn = document.getElementById('ackBtn') as HTMLButtonElement
const extendBtn = document.getElementById('extendBtn') as HTMLButtonElement
const extendForm = document.getElementById('extendForm') as HTMLFormElement
const passwordInput = document.getElementById('password') as HTMLInputElement
const errorEl = document.getElementById('error') as HTMLElement
const backBtn = document.getElementById('backBtn') as HTMLButtonElement

let pendingMinutes = 15

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

window.remind.onPreRestState((payload) => {
  remainEl.textContent = `剩余 ${formatMs(payload.remainingMs)}`
})

ackBtn.addEventListener('click', () => {
  void window.remind.dismissPreRestToast()
})

extendBtn.addEventListener('click', () => {
  mainActions.hidden = true
  extendForm.hidden = false
  errorEl.textContent = ''
  passwordInput.value = ''
  passwordInput.focus()
})

backBtn.addEventListener('click', () => {
  extendForm.hidden = true
  mainActions.hidden = false
  errorEl.textContent = ''
})

extendForm.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  if (target instanceof HTMLButtonElement && target.dataset.minutes) {
    pendingMinutes = Number(target.dataset.minutes) === 30 ? 30 : 15
  }
})

extendForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const result = await window.remind.extendWorkWithPassword(pendingMinutes, passwordInput.value)
  if (!result.ok) {
    errorEl.textContent = result.message ?? '延长失败'
    return
  }
  extendForm.hidden = true
  mainActions.hidden = false
})
