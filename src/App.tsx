import { useEffect, useState } from "react"; // React state and lifecycle hooks.
import GoogleLoginButton from "./components/GoogleLoginButton"; // Google sign-in widget.
import ProfileEditor from "./components/ProfileEditor"; // Editable profile form.
import type { User } from "./types/auth"; // User shape shared with the API.

type MeResponse = { user: User } | { error: string }; // /me API response union.

export default function App() { // Main app component.
  const [user, setUser] = useState<User | null>(null); // Current session user.
  const api = import.meta.env.VITE_API_URL; // API base URL from env.

  async function loadMe() { // Fetch the current session user.
    const res = await fetch(`${api}/me`, { credentials: "include" }); // Send cookie.
    if (!res.ok) { // Unauthenticated or invalid session.
      setUser(null); // Clear user state.
      return; // Stop on failure.
    }
    const data = (await res.json()) as MeResponse; // Parse response body.
    if ("user" in data) setUser(data.user); // Store user data.
    else setUser(null); // Clear on error payload.
  } // End loadMe.

  useEffect(() => { // Run once on mount.
    loadMe(); // Load session user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps means only on first render.

  async function logout() { // Log out by clearing session cookie.
    await fetch(`${api}/auth/logout`, { // POST to logout endpoint.
      method: "POST", // Logout uses POST.
      credentials: "include", // Include session cookie.
    });
    setUser(null); // Clear local user state.
  } // End logout.

  return ( // Render UI.
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>{/* App wrapper */}
      <h1>Google Sign-In</h1> {/* Page title */}

      {!user ? ( // Show login if no user.
        <> {/* Fragment wrapper */}
          <p>Sign in:</p> {/* Prompt text */}
          <GoogleLoginButton onLogin={(u) => setUser(u)} /> {/* Google login */}
        </> {/* End fragment. */}
      ) : (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            border: "1px solid #ddd",
            borderRadius: 12,
            maxWidth: 700,
          }}
        > {/* Profile card */}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>{/* Avatar row */}
            {user.picture ? ( // Show avatar if present.
              <img
                src={user.picture}
                alt="avatar"
                width={64}
                height={64}
                style={{ borderRadius: "50%" }}
              /> {/* User avatar image. */}
            ) : (
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "#eee",
                }}
              /> {/* Placeholder avatar. */}
            )} {/* End avatar conditional */}

            <div>{/* User text details */}
              <div style={{ fontSize: 18, fontWeight: 700 }}>{/* Name */}
                {user.name ?? "No name set"} {/* Name value */}
              </div> {/* End name */}
              <div style={{ opacity: 0.8 }}>{user.email}</div> {/* Email */}
              {user.username ? ( // Show username if set.
                <div style={{ opacity: 0.8 }}>@{user.username}</div> {/* Username line. */}
              ) : null} {/* End username conditional */}
            </div> {/* End user text */}
          </div> {/* End avatar row */}

          <div style={{ marginTop: 16, display: "flex", gap: 12 }}>{/* Action buttons */}
            <button onClick={logout} style={{ padding: "10px 14px" }}>{/* Logout */}
              Logout {/* Button label */}
            </button> {/* End logout button */}
            <button onClick={loadMe} style={{ padding: "10px 14px" }}>{/* Refresh */}
              Refresh profile {/* Button label */}
            </button> {/* End refresh button */}
          </div> {/* End action buttons */}

          <ProfileEditor
            user={user}
            onSave={(u) => {
              setUser(u);
            }}
          /> {/* Profile editor form */}
        </div> {/* End profile card. */}
      )} {/* End login/profile conditional */}
    </div> {/* End app wrapper. */}
  ); // End render.
} // End App component.
