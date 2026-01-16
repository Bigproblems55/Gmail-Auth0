/// <reference types="vite/client" /> // Vite's client-side type defs.

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string; // Google OAuth client id.
  readonly VITE_API_URL: string; // Backend API base URL.
}

interface ImportMeta {
  readonly env: ImportMetaEnv; // Env variables exposed by Vite.
}
