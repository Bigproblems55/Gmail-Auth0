import { useEffect, useState } from "react";
import GoogleLoginButton from "./components/GoogleLoginButton";
import type { User } from "./types/auth";

export default function App() {
  const [user, setUser] = useState<User | null>(null);

  async function loadMe(): Promise<void> {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/me`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = (await res.json()) as { user: User };
      setUser(data.user);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  async function logout(): Promise<void> {
    await fetch(`${import.meta.env.VITE_API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Google Sign-In</h1>

      {!user ? (
        <GoogleLoginButton onLogin={(u) => setUser(u)} />
      ) : (
        <>
          <p>Logged in as: <b>{user.email}</b></p>
          {user.picture && <img src={user.picture} alt="" width="64" />}
          <div>
            <button onClick={logout}>Logout</button>
          </div>
        </>
      )}
    </div>
  );
}
