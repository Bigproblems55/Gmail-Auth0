import { StrictMode } from "react"; // React strict mode wrapper.
import { createRoot } from "react-dom/client"; // React 18+ root API.
import "./index.css"; // Global styles.
import App from "./App.tsx"; // Main app component.

createRoot(document.getElementById("root")!).render( // Create root and render app.
  <StrictMode>{/* Enable extra checks in dev. */}
    <App /> {/* Render the main application. */}
  </StrictMode> {/* End strict mode wrapper. */}
); // Close render call.
