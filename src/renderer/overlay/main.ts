import type { EngineSnapshot } from '../../core/types'

const countdownEl = document.getElementById('countdown') as HTMLElement
const statusEl = document.getElementById('status') as HTMLElement
const continueBtn = document.getElementById('continueBtn') as HTMLButtonElement
const emergencyBtn = document.getElementById('emergencyBtn') as HTMLButtonElement
const emergencyForm = document.getElementById('emergencyForm') as HTMLFormElement
const passwordInput = document.getElementById('password') as HTMLInputElement
const emergencyError = document.getElementById('emergencyError') as HTMLElement
const cancelEmergency = document.getElementById('cancelEmergency') as HTMLButtonElement

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function render(snapshot: EngineSnapshot): void {
  if (snapshot.phase === 'awaitContinue') {
    countdownEl.textContent = '00:00'
    statusEl.textContent = '休息结束，点击「继续工作」回到编码'
    continueBtn.hidden = false
  } else {
    countdownEl.textContent = formatMs(snapshot.restRemainingMs)
    statusEl.textContent = '请离开屏幕，放松一下'
    continueBtn.hidden = true
  }
}

continueBtn.addEventListener('click', () => {
  void window.remind.continueWork()
})

emergencyBtn.addEventListener('click', () => {
  emergencyForm.hidden = false
  emergencyError.textContent = ''
  passwordInput.value = ''
  passwordInput.focus()
})

cancelEmergency.addEventListener('click', () => {
  emergencyForm.hidden = true
  emergencyError.textContent = ''
})

emergencyForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const result = await window.remind.emergencySkip(passwordInput.value)
  if (!result.ok) {
    emergencyError.textContent = result.message ?? '密码错误'
    return
  }
  emergencyForm.hidden = true
})

window.remind.onOverlayState(render)
