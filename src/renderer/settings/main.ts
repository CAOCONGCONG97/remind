const form = document.getElementById('form') as HTMLFormElement
const triggerMode = document.getElementById('triggerMode') as HTMLSelectElement
const workMinutes = document.getElementById('workMinutes') as HTMLInputElement
const restMinutes = document.getElementById('restMinutes') as HTMLInputElement
const password = document.getElementById('password') as HTMLInputElement
const passwordConfirm = document.getElementById('passwordConfirm') as HTMLInputElement
const autoStart = document.getElementById('autoStart') as HTMLInputElement
const dailyShutdownEnabled = document.getElementById('dailyShutdownEnabled') as HTMLInputElement
const shutdownTime = document.getElementById('shutdownTime') as HTMLInputElement
const shutdownWarnMinutes = document.getElementById('shutdownWarnMinutes') as HTMLInputElement
const errorEl = document.getElementById('error') as HTMLElement
const okEl = document.getElementById('ok') as HTMLElement

async function load(): Promise<void> {
  const settings = await window.remind.getSettings()
  triggerMode.value = settings.triggerMode
  workMinutes.value = String(settings.workMinutes)
  restMinutes.value = String(settings.restMinutes)
  autoStart.checked = settings.autoStart
  dailyShutdownEnabled.checked = settings.dailyShutdownEnabled
  shutdownTime.value = settings.shutdownTime
  shutdownWarnMinutes.value = String(settings.shutdownWarnMinutes)
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  errorEl.textContent = ''
  okEl.textContent = ''
  try {
    await window.remind.saveSettings({
      triggerMode: triggerMode.value === 'cumulative' ? 'cumulative' : 'fixed',
      workMinutes: Number(workMinutes.value),
      restMinutes: Number(restMinutes.value),
      autoStart: autoStart.checked,
      dailyShutdownEnabled: dailyShutdownEnabled.checked,
      shutdownTime: shutdownTime.value,
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
