import { StrictMode } from "react"; // React strict mode wrapper.
import { createRoot } from "react-dom/client"; // React 18+ root API.
import "./index.css"; // Global styles.
import App from "./App.tsx"; // Main app component.

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
); // Mount React app into the root div.
