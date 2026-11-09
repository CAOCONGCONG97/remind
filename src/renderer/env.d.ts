import type { RemindApi } from '../preload/index'

declare global {
  interface Window {
    remind: RemindApi
  }
}

export {}
