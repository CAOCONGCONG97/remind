const form = document.getElementById('form') as HTMLFormElement
const password = document.getElementById('password') as HTMLInputElement
const passwordConfirm = document.getElementById('passwordConfirm') as HTMLInputElement
const errorEl = document.getElementById('error') as HTMLElement

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  errorEl.textContent = ''
  const result = await window.remind.setupPassword(password.value, passwordConfirm.value)
  if (!result.ok) {
    errorEl.textContent = result.message ?? '设置失败'
  }
})
