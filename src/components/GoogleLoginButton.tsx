import { useEffect, useRef } from "react"; // React hooks for lifecycle and refs.
import type { User } from "../types/auth"; // User shape returned by the API.

type Props = {
  onLogin?: (user: User) => void; // Optional callback when login succeeds.
};

type AuthGoogleResponse = {
  user: User; // Payload returned by /auth/google.
};

export default function GoogleLoginButton({ onLogin }: Props) {
  const btnRef = useRef<HTMLDivElement | null>(null); // DOM container for GSI button.
  const tokenClientRef = useRef<any>(null); // OAuth token client for People API.
  const idTokenRef = useRef<string | null>(null); // Hold latest ID token.

  useEffect(() => {
    const google = window.google; // Global injected by Google Identity Services.
    if (!google || !btnRef.current) return; // Bail if script not loaded yet.

    tokenClientRef.current = google.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope:
        "https://www.googleapis.com/auth/user.phonenumbers.read " +
        "https://www.googleapis.com/auth/user.addresses.read",
      callback: async (tokenResponse) => {
        const idToken = idTokenRef.current;
        if (!idToken) return;

        const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            idToken,
            accessToken: tokenResponse?.access_token,
          }),
        });

        if (!res.ok) {
          console.error("Login failed");
          return;
        }

        const data = (await res.json()) as AuthGoogleResponse;
        onLogin?.(data.user);
      },
    });

    google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID, // OAuth client id.
      callback: async (response) => {
        console.log(
          "Google credential received",
          response?.credential?.slice(0, 20)
        );
        console.log("Posting token to API", import.meta.env.VITE_API_URL);

        idTokenRef.current = response.credential ?? null;

        if (tokenClientRef.current) {
          tokenClientRef.current.requestAccessToken({ prompt: "" });
          return;
        }

        const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" }, // JSON body.
          credentials: "include", // Allow session cookie to be set.
          body: JSON.stringify({ idToken: response.credential }), // Send ID token.
        });

        if (!res.ok) {
          console.error("Login failed"); // Surface auth errors in console.
          return;
        }

        const data = (await res.json()) as AuthGoogleResponse;
        onLogin?.(data.user); // Notify parent with logged-in user.
      },
    });

    google.accounts.id.renderButton(btnRef.current, {
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "pill",
    });
  }, [onLogin]);

  return <div ref={btnRef} />; // Google renders the button inside this div.
}
