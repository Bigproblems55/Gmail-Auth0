import { useMemo, useState } from "react"; // React hooks for state and memo.
import type { User } from "../types/auth"; // User shape from the API.

type Props = {
  user: User; // Current user record.
  onSave?: (user: User) => void; // Called after save completes.
};

type ProfileUpdateBody = {
  username?: string | null; // Optional username update.
  bio?: string | null; // Optional bio update.
  phone?: string | null; // Optional phone update.
  address_line1?: string | null; // Optional address line 1.
  address_line2?: string | null; // Optional address line 2.
  address_city?: string | null; // Optional city.
  address_state?: string | null; // Optional state/region.
  address_postal?: string | null; // Optional postal code.
  address_country?: string | null; // Optional country code.
};

type ProfileUpdateResponse = { user: User } | { error: string }; // /profile response.

export default function ProfileEditor({ user, onSave }: Props) { // Profile form component.
  const api = import.meta.env.VITE_API_URL; // API base URL.

  const initial = useMemo(
    () => ({
      username: user.username ?? "", // Default username value.
      bio: user.bio ?? "", // Default bio value.
      phone: user.phone ?? "", // Default phone value.
      address_line1: user.address_line1 ?? "", // Default address line 1.
      address_line2: user.address_line2 ?? "", // Default address line 2.
      address_city: user.address_city ?? "", // Default city.
      address_state: user.address_state ?? "", // Default state/region.
      address_postal: user.address_postal ?? "", // Default postal code.
      address_country: user.address_country ?? "", // Default country.
    }),
    [user] // Recompute initial state when user changes.
  );

  const [form, setForm] = useState(initial); // Editable form state.
  const [saving, setSaving] = useState(false); // Save in progress flag.
  const [err, setErr] = useState<string>(""); // Inline error message.

  function setField<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { // Update a single field.
    setForm((p) => ({ ...p, [k]: v })); // Merge new field into form state.
  } // End setField.

  async function save() { // Submit updates to the API.
    setSaving(true); // Disable submit while saving.
    setErr(""); // Clear previous errors.

    const body: ProfileUpdateBody = {
      username: form.username.trim() ? form.username.trim() : null, // Normalize empty to null.
      bio: form.bio.trim() ? form.bio.trim() : null, // Normalize empty to null.
      phone: form.phone.trim() ? form.phone.trim() : null, // Normalize empty to null.
      address_line1: form.address_line1.trim() ? form.address_line1.trim() : null,
      address_line2: form.address_line2.trim() ? form.address_line2.trim() : null,
      address_city: form.address_city.trim() ? form.address_city.trim() : null,
      address_state: form.address_state.trim() ? form.address_state.trim() : null,
      address_postal: form.address_postal.trim() ? form.address_postal.trim() : null,
      address_country: form.address_country.trim()
        ? form.address_country.trim().toUpperCase()
        : null,
    }; // End request payload.

    const res = await fetch(`${api}/profile`, {
      method: "POST", // Update profile via POST.
      headers: { "Content-Type": "application/json" }, // JSON body.
      credentials: "include", // Send session cookie.
      body: JSON.stringify(body), // Serialized payload.
    });

    setSaving(false); // Re-enable submit.

    const data = (await res.json().catch(() => ({}))) as ProfileUpdateResponse; // Parse response.

    if (!res.ok) { // Handle error response.
      const msg = "error" in data ? data.error : "Save failed"; // Pick error message.
      setErr(msg); // Show error in UI.
      return; // Stop on failure.
    }

    if ("user" in data) onSave?.(data.user); // Notify parent with updated user.
  } // End save.

  return ( // Render profile form.
    <div style={{ marginTop: 18, maxWidth: 640 }}>{/* Form container */}
      <h3>Profile</h3> {/* Section title */}

      <div style={{ marginBottom: 10, opacity: 0.85 }}>{/* Role row */}
        Role: <b>{user.role}</b> {/* Current role */}
      </div> {/* End role row */}

      {err && ( // Show error if present.
        <div
          style={{
            marginBottom: 10,
            padding: 10,
            border: "1px solid #f2c",
            borderRadius: 10,
          }}
        >
          {err} {/* Error message */}
        </div>
      )} {/* End error block */}

      <div style={{ display: "grid", gap: 10 }}>{/* Form fields grid */}
        <label>
          Username {/* Field label */}
          <input
            value={form.username}
            onChange={(e) => setField("username", e.target.value)}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label> {/* End username field */}

        <label>
          Bio {/* Field label */}
          <textarea
            value={form.bio}
            onChange={(e) => setField("bio", e.target.value)}
            rows={4}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label> {/* End bio field */}

        <label>
          Phone {/* Field label */}
          <input
            value={form.phone}
            onChange={(e) => setField("phone", e.target.value)}
            placeholder="+1..."
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label> {/* End phone field */}

        <h4 style={{ margin: "10px 0 0" }}>Address</h4> {/* Address section */}

        <label>
          Line 1 {/* Field label */}
          <input
            value={form.address_line1}
            onChange={(e) => setField("address_line1", e.target.value)}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label> {/* End address line 1 */}

        <label>
          Line 2 {/* Field label */}
          <input
            value={form.address_line2}
            onChange={(e) => setField("address_line2", e.target.value)}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label> {/* End address line 2 */}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{/* City/State row */}
          <label>
            City {/* Field label */}
            <input
              value={form.address_city}
              onChange={(e) => setField("address_city", e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label> {/* End city field */}

          <label>
            State/Region {/* Field label */}
            <input
              value={form.address_state}
              onChange={(e) => setField("address_state", e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label> {/* End state field */}
        </div> {/* End city/state row */}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{/* Postal/Country row */}
          <label>
            Postal {/* Field label */}
            <input
              value={form.address_postal}
              onChange={(e) => setField("address_postal", e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label> {/* End postal field */}

          <label>
            Country (2-letter) {/* Field label */}
            <input
              value={form.address_country}
              onChange={(e) => setField("address_country", e.target.value.toUpperCase())}
              placeholder="US"
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label> {/* End country field */}
        </div> {/* End postal/country row */}

        <button onClick={save} disabled={saving} style={{ padding: "10px 14px" }}>{/* Save button */}
          {saving ? "Saving..." : "Save Profile"} {/* Button label */}
        </button> {/* End save button */}
      </div> {/* End form grid */}
    </div> {/* End form container. */}
  ); // End render.
} // End ProfileEditor.
