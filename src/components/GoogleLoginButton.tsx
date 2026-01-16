import { useEffect, useRef } from "react";
import type { User } from "../types/auth";

type Props = {
  onLogin?: (user: User) => void;
};

type AuthGoogleResponse = {
  user: User;
};

export default function GoogleLoginButton({ onLogin }: Props) {
  const btnRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const google = window.google;
    if (!google || !btnRef.current) return;

    google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: async (response) => {
        console.log("Google credential received", response?.credential?.slice(0, 20));
        console.log("Posting token to API", import.meta.env.VITE_API_URL);

        const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ idToken: response.credential }),
        });

        if (!res.ok) {
          console.error("Login failed");
          return;
        }

        const data = (await res.json()) as AuthGoogleResponse;
        onLogin?.(data.user);
      },
    });

    google.accounts.id.renderButton(btnRef.current, {
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "pill",
    });
  }, [onLogin]);

  return <div ref={btnRef} />;
}
