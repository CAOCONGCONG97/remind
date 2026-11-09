const form = document.getElementById('form') as HTMLFormElement
const modeFixed = document.getElementById('modeFixed') as HTMLInputElement
const modeCumulative = document.getElementById('modeCumulative') as HTMLInputElement
const workMinutes = document.getElementById('workMinutes') as HTMLInputElement
const workLabel = document.getElementById('workLabel') as HTMLElement
const restMinutes = document.getElementById('restMinutes') as HTMLInputElement
const preRestWarnMinutes = document.getElementById('preRestWarnMinutes') as HTMLInputElement
const password = document.getElementById('password') as HTMLInputElement
const passwordConfirm = document.getElementById('passwordConfirm') as HTMLInputElement
const autoStart = document.getElementById('autoStart') as HTMLInputElement
const dailyShutdownEnabled = document.getElementById('dailyShutdownEnabled') as HTMLInputElement
const shutdownFields = document.getElementById('shutdownFields') as HTMLElement
const shutdownHour = document.getElementById('shutdownHour') as HTMLInputElement
const shutdownMinute = document.getElementById('shutdownMinute') as HTMLInputElement
const shutdownWarnMinutes = document.getElementById('shutdownWarnMinutes') as HTMLInputElement
const errorEl = document.getElementById('error') as HTMLElement
const okEl = document.getElementById('ok') as HTMLElement

function selectedTriggerMode(): 'fixed' | 'cumulative' {
  return modeCumulative.checked ? 'cumulative' : 'fixed'
}

function syncWorkLabel(): void {
  workLabel.textContent =
    selectedTriggerMode() === 'cumulative' ? '累计阈值（分钟）' : '工作间隔（分钟）'
}

function syncShutdownFields(): void {
  shutdownFields.classList.toggle('is-disabled', !dailyShutdownEnabled.checked)
}

function parseTimeParts(value: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) {
    return { hour: 23, minute: 30 }
  }
  return { hour: Number(match[1]), minute: Number(match[2]) }
}

function formatShutdownTime(): string {
  const hour = Math.min(23, Math.max(0, Math.floor(Number(shutdownHour.value) || 0)))
  const minute = Math.min(59, Math.max(0, Math.floor(Number(shutdownMinute.value) || 0)))
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

async function load(): Promise<void> {
  const settings = await window.remind.getSettings()
  modeFixed.checked = settings.triggerMode !== 'cumulative'
  modeCumulative.checked = settings.triggerMode === 'cumulative'
  workMinutes.value = String(settings.workMinutes)
  restMinutes.value = String(settings.restMinutes)
  preRestWarnMinutes.value = String(settings.preRestWarnMinutes)
  autoStart.checked = settings.autoStart
  dailyShutdownEnabled.checked = settings.dailyShutdownEnabled
  const parts = parseTimeParts(settings.shutdownTime)
  shutdownHour.value = String(parts.hour)
  shutdownMinute.value = String(parts.minute)
  shutdownWarnMinutes.value = String(settings.shutdownWarnMinutes)
  syncWorkLabel()
  syncShutdownFields()
}

modeFixed.addEventListener('change', syncWorkLabel)
modeCumulative.addEventListener('change', syncWorkLabel)
dailyShutdownEnabled.addEventListener('change', syncShutdownFields)

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  errorEl.textContent = ''
  okEl.textContent = ''
  try {
    await window.remind.saveSettings({
      triggerMode: selectedTriggerMode(),
      workMinutes: Number(workMinutes.value),
      restMinutes: Number(restMinutes.value),
      preRestWarnMinutes: Number(preRestWarnMinutes.value),
      autoStart: autoStart.checked,
      dailyShutdownEnabled: dailyShutdownEnabled.checked,
      shutdownTime: formatShutdownTime(),
      shutdownWarnMinutes: Number(shutdownWarnMinutes.value),
      password: password.value,
      passwordConfirm: passwordConfirm.value
    })
    password.value = ''
    passwordConfirm.value = ''
    okEl.textContent = '已保存'
  } catch (error) {
    errorEl.textContent = error instanceof Error ? error.message : String(error)
  }
})

void load()
