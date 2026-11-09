import type { EngineSnapshot } from '../../core/types'

const countdownEl = document.getElementById('countdown') as HTMLElement
const statusEl = document.getElementById('status') as HTMLElement
const tipEl = document.getElementById('tip') as HTMLElement
const continueBtn = document.getElementById('continueBtn') as HTMLButtonElement
const emergencyBtn = document.getElementById('emergencyBtn') as HTMLButtonElement
const emergencyForm = document.getElementById('emergencyForm') as HTMLFormElement
const passwordInput = document.getElementById('password') as HTMLInputElement
const emergencyError = document.getElementById('emergencyError') as HTMLElement
const cancelEmergency = document.getElementById('cancelEmergency') as HTMLButtonElement

const TIPS = [
  '站起来走走，看看远处 6 米外的景物',
  '肩膀向下沉，缓慢呼气 4 秒',
  '活动手腕与颈椎，左右各转 5 次',
  '喝一口水，离开键盘一会儿',
  '闭眼默数 10 下，再睁眼看远处',
  '双手交叉举过头顶，轻轻拉伸侧面'
]

let tipIndex = 0
let tipTimer: number | null = null

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function startTips(): void {
  if (tipTimer !== null) {
    return
  }
  tipEl.hidden = false
  tipEl.textContent = TIPS[tipIndex % TIPS.length]
  tipTimer = window.setInterval(() => {
    tipIndex += 1
    tipEl.textContent = TIPS[tipIndex % TIPS.length]
  }, 12_000)
}

function stopTips(): void {
  if (tipTimer !== null) {
    window.clearInterval(tipTimer)
    tipTimer = null
  }
}

function render(snapshot: EngineSnapshot): void {
  if (snapshot.phase === 'awaitContinue') {
    countdownEl.textContent = '00:00'
    statusEl.textContent = '休息结束，点击「继续工作」回到编码'
    tipEl.textContent = '做得好。下次提前提醒时，也可以选择延长本段。'
    continueBtn.hidden = false
    stopTips()
  } else {
    countdownEl.textContent = formatMs(snapshot.restRemainingMs)
    statusEl.textContent = '请离开屏幕，放松一下'
    continueBtn.hidden = true
    startTips()
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
