import type { RemindApi, AuthenticatorApi } from '../preload/index'

declare global {
  interface Window {
    remind: RemindApi
    authenticator: AuthenticatorApi
  }
}

export {}
