/// <reference types="chrome" />
/// <reference types="vite/client" />

// No `declare module '*.vue'` shim: vue-tsc resolves SFC types directly, and a
// wildcard shim would erase every SFC's props down to `DefineComponent<{},{},any>`.

// CSS module and side-effect import declarations for TypeScript 6.0
declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

declare global {
  interface Window {
    chrome: typeof chrome;
    __UMM_DEBUG__?: {
      checkContext: () => void;
      simulateInvalidation: () => void;
    };
  }
}

export {};
