const stepIndicator = document.getElementById('stepIndicator') as HTMLElement
const step1 = document.getElementById('step1') as HTMLElement
const step2 = document.getElementById('step2') as HTMLElement
const step3 = document.getElementById('step3') as HTMLElement
const modeFixed = document.getElementById('modeFixed') as HTMLInputElement
const modeCumulative = document.getElementById('modeCumulative') as HTMLInputElement
const workMinutes = document.getElementById('workMinutes') as HTMLInputElement
const workLabel = document.getElementById('workLabel') as HTMLElement
const restMinutes = document.getElementById('restMinutes') as HTMLInputElement
const dailyShutdownEnabled = document.getElementById('dailyShutdownEnabled') as HTMLInputElement
const backBtn = document.getElementById('backBtn') as HTMLButtonElement
const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement
const errorEl = document.getElementById('error') as HTMLElement

let step = 1

function syncWorkLabel(): void {
  workLabel.textContent = modeCumulative.checked ? '累计阈值（分钟）' : '工作间隔（分钟）'
}

function renderStep(): void {
  step1.hidden = step !== 1
  step2.hidden = step !== 2
  step3.hidden = step !== 3
  stepIndicator.textContent = `第 ${step} / 3 步`
  backBtn.hidden = step === 1
  nextBtn.textContent = step === 3 ? '开始使用' : '下一步'
  syncWorkLabel()
}

modeFixed.addEventListener('change', syncWorkLabel)
modeCumulative.addEventListener('change', syncWorkLabel)

backBtn.addEventListener('click', () => {
  step = Math.max(1, step - 1)
  renderStep()
})

nextBtn.addEventListener('click', async () => {
  errorEl.textContent = ''
  if (step < 3) {
    step += 1
    renderStep()
    return
  }
  try {
    await window.remind.completeOnboarding({
      triggerMode: modeCumulative.checked ? 'cumulative' : 'fixed',
      workMinutes: Number(workMinutes.value) || 60,
      restMinutes: Number(restMinutes.value) || 5,
      dailyShutdownEnabled: dailyShutdownEnabled.checked
    })
  } catch (error) {
    errorEl.textContent = error instanceof Error ? error.message : String(error)
  }
})

renderStep()
