import './style.css'

const box = document.getElementById('box') as HTMLDivElement
let startX = 0
let startY = 0
let dragging = false

function finish(region: { x: number; y: number; width: number; height: number } | null): void {
  void window.authenticator.submitRegionScan(region)
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    finish(null)
  }
})

window.addEventListener('mousedown', (event) => {
  dragging = true
  startX = event.clientX
  startY = event.clientY
  box.hidden = false
  box.style.left = `${startX}px`
  box.style.top = `${startY}px`
  box.style.width = '0px'
  box.style.height = '0px'
})

window.addEventListener('mousemove', (event) => {
  if (!dragging) {
    return
  }
  const x = Math.min(startX, event.clientX)
  const y = Math.min(startY, event.clientY)
  const width = Math.abs(event.clientX - startX)
  const height = Math.abs(event.clientY - startY)
  box.style.left = `${x}px`
  box.style.top = `${y}px`
  box.style.width = `${width}px`
  box.style.height = `${height}px`
})

window.addEventListener('mouseup', (event) => {
  if (!dragging) {
    return
  }
  dragging = false
  const x = Math.min(startX, event.clientX)
  const y = Math.min(startY, event.clientY)
  const width = Math.abs(event.clientX - startX)
  const height = Math.abs(event.clientY - startY)
  if (width < 20 || height < 20) {
    finish(null)
    return
  }
  finish({ x, y, width, height })
})
