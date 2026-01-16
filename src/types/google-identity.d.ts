export {}; // Ensure this file is treated as a module.

declare global { // Extend global type declarations.
  interface Window { // Add Google fields to window.
    google?: { // Google namespace if the script loaded.
      accounts: { // Accounts API namespace.
        id: { // Google Identity Services (ID).
          initialize: (options: { // Initialize ID services.
            client_id: string; // OAuth client id.
            callback: (response: { credential: string }) => void; // Credential callback.
          }) => void; // End initialize signature.
          renderButton: ( // Render the sign-in button.
            parent: HTMLElement, // Target container element.
            options?: Record<string, unknown> // Button render options.
          ) => void; // End renderButton signature.
          prompt?: () => void; // Optional prompt helper.
        }; // End id namespace.
      }; // End accounts namespace.
    }; // End google namespace.
  } // End Window interface.
} // End global declaration.
