import { defineConfig } from "vite"; // Vite config helper.
import react from "@vitejs/plugin-react"; // React plugin for Vite.

// https://vite.dev/config/
export default defineConfig({ // Define and export Vite config object.
  plugins: [react()], // Enable React plugin for JSX/fast refresh.
}); // Export the Vite configuration.
