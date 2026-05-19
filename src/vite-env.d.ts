/// <reference types="chrome" />
/// <reference types="vite/client" />

// CSS module and side-effect import declarations for TypeScript 6.0
declare module '*.css' {
  const content: Record<string, string>
  export default content
}

declare global {
  interface Window {
    chrome: typeof chrome
    __UMM_DEBUG__?: {
      checkContext: () => void
      simulateInvalidation: () => void
    }
  }
}

export {}
