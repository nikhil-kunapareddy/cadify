/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CADIFY_GENERATION_BACKEND?: "mock" | "worker";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
