/// <reference types="vite/client" /> // Vite client-side types.

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string; // Google OAuth client id.
  readonly VITE_API_URL: string; // Backend API base URL.
} // End ImportMetaEnv.

interface ImportMeta {
  readonly env: ImportMetaEnv; // Env variables exposed by Vite.
} // End ImportMeta.
