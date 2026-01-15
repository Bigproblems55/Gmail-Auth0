import { useEffect, useRef } from "react";
import type { User } from "../types/auth";

type GoogleCredentialResponse = {
  credential: string;
};

type GoogleLoginButtonProps = {
  onLogin?: (user: User) => void;
};

export default function GoogleLoginButton({ onLogin }: GoogleLoginButtonProps) {
  const btnRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!window.google || !btnRef.current) return;

    window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: async (response: GoogleCredentialResponse) => {
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
        const data = await res.json();
        onLogin?.(data.user);
      },
    });

    window.google.accounts.id.renderButton(btnRef.current, {
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "pill",
    });
  }, [onLogin]);

  return <div ref={btnRef} />;
}
