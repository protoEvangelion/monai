/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_ENABLE_BROWSER_AI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
