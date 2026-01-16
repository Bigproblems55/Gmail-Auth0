import { useEffect, useState } from "react";
import GoogleLoginButton from "./components/GoogleLoginButton";
import ProfileEditor from "./components/ProfileEditor";
import type { User } from "./types/auth";

type MeResponse = { user: User } | { error: string };

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const api = import.meta.env.VITE_API_URL;

  async function loadMe() {
    const res = await fetch(`${api}/me`, { credentials: "include" });
    if (!res.ok) {
      setUser(null);
      return;
    }
    const data = (await res.json()) as MeResponse;
    if ("user" in data) setUser(data.user);
    else setUser(null);
  }

  useEffect(() => {
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await fetch(`${api}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Google Sign-In</h1>

      {!user ? (
        <>
          <p>Sign in:</p>
          <GoogleLoginButton onLogin={(u) => setUser(u)} />
        </>
      ) : (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            border: "1px solid #ddd",
            borderRadius: 12,
            maxWidth: 700,
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {user.picture ? (
              <img
                src={user.picture}
                alt="avatar"
                width={64}
                height={64}
                style={{ borderRadius: "50%" }}
              />
            ) : (
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "#eee",
                }}
              />
            )}

            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {user.name ?? "No name set"}
              </div>
              <div style={{ opacity: 0.8 }}>{user.email}</div>
              {user.username ? (
                <div style={{ opacity: 0.8 }}>@{user.username}</div>
              ) : null}
            </div>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
            <button onClick={logout} style={{ padding: "10px 14px" }}>
              Logout
            </button>
            <button onClick={loadMe} style={{ padding: "10px 14px" }}>
              Refresh profile
            </button>
          </div>

          <ProfileEditor
            user={user}
            onSave={(u) => {
              setUser(u);
            }}
          />
        </div>
      )}
    </div>
  );
}
