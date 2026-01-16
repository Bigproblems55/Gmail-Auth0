import { useEffect, useState } from "react"; // React state and lifecycle.
import GoogleLoginButton from "./components/GoogleLoginButton"; // Google sign-in widget.
import ProfileEditor from "./components/ProfileEditor"; // Editable profile form.
import type { User } from "./types/auth"; // User shape shared with the API.

type MeResponse = { user: User } | { error: string }; // /me API response union.

export default function App() {
  const [user, setUser] = useState<User | null>(null); // Current session user.
  const api = import.meta.env.VITE_API_URL; // API base URL from Vite env.

  async function loadMe() {
    // Ask the backend for the current session user.
    const res = await fetch(`${api}/me`, { credentials: "include" });
    if (!res.ok) {
      setUser(null); // Not logged in or session invalid.
      return;
    }
    const data = (await res.json()) as MeResponse;
    if ("user" in data) setUser(data.user); // Store the user payload.
    else setUser(null); // Defensive fallback for error payloads.
  }

  useEffect(() => {
    loadMe(); // Load session user on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    // Invalidate the session cookie on the server.
    await fetch(`${api}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setUser(null); // Clear UI state immediately.
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
              setUser(u); // Sync UI with saved profile.
            }}
          />
        </div>
      )}
    </div>
  );
}
