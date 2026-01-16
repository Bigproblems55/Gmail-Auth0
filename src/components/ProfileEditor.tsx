import { useMemo, useState } from "react";
import type { User } from "../types/auth";

type Props = {
  user: User;
  onSave?: (user: User) => void;
};

type ProfileUpdateBody = {
  username?: string | null;
  bio?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_postal?: string | null;
  address_country?: string | null;
};

type ProfileUpdateResponse = { user: User } | { error: string };

export default function ProfileEditor({ user, onSave }: Props) {
  const api = import.meta.env.VITE_API_URL;

  const initial = useMemo(
    () => ({
      username: user.username ?? "",
      bio: user.bio ?? "",
      phone: user.phone ?? "",
      address_line1: user.address_line1 ?? "",
      address_line2: user.address_line2 ?? "",
      address_city: user.address_city ?? "",
      address_state: user.address_state ?? "",
      address_postal: user.address_postal ?? "",
      address_country: user.address_country ?? "",
    }),
    [user]
  );

  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>("");

  function setField<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setErr("");

    const body: ProfileUpdateBody = {
      username: form.username.trim() ? form.username.trim() : null,
      bio: form.bio.trim() ? form.bio.trim() : null,
      phone: form.phone.trim() ? form.phone.trim() : null,
      address_line1: form.address_line1.trim() ? form.address_line1.trim() : null,
      address_line2: form.address_line2.trim() ? form.address_line2.trim() : null,
      address_city: form.address_city.trim() ? form.address_city.trim() : null,
      address_state: form.address_state.trim() ? form.address_state.trim() : null,
      address_postal: form.address_postal.trim() ? form.address_postal.trim() : null,
      address_country: form.address_country.trim()
        ? form.address_country.trim().toUpperCase()
        : null,
    };

    const res = await fetch(`${api}/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });

    setSaving(false);

    const data = (await res.json().catch(() => ({}))) as ProfileUpdateResponse;

    if (!res.ok) {
      const msg = "error" in data ? data.error : "Save failed";
      setErr(msg);
      return;
    }

    if ("user" in data) onSave?.(data.user);
  }

  return (
    <div style={{ marginTop: 18, maxWidth: 640 }}>
      <h3>Profile</h3>

      <div style={{ marginBottom: 10, opacity: 0.85 }}>
        Role: <b>{user.role}</b>
      </div>

      {err && (
        <div
          style={{
            marginBottom: 10,
            padding: 10,
            border: "1px solid #f2c",
            borderRadius: 10,
          }}
        >
          {err}
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        <label>
          Username
          <input
            value={form.username}
            onChange={(e) => setField("username", e.target.value)}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label>

        <label>
          Bio
          <textarea
            value={form.bio}
            onChange={(e) => setField("bio", e.target.value)}
            rows={4}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label>

        <label>
          Phone
          <input
            value={form.phone}
            onChange={(e) => setField("phone", e.target.value)}
            placeholder="+1..."
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label>

        <h4 style={{ margin: "10px 0 0" }}>Address</h4>

        <label>
          Line 1
          <input
            value={form.address_line1}
            onChange={(e) => setField("address_line1", e.target.value)}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label>

        <label>
          Line 2
          <input
            value={form.address_line2}
            onChange={(e) => setField("address_line2", e.target.value)}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label>
            City
            <input
              value={form.address_city}
              onChange={(e) => setField("address_city", e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <label>
            State/Region
            <input
              value={form.address_state}
              onChange={(e) => setField("address_state", e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label>
            Postal
            <input
              value={form.address_postal}
              onChange={(e) => setField("address_postal", e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <label>
            Country (2-letter)
            <input
              value={form.address_country}
              onChange={(e) => setField("address_country", e.target.value.toUpperCase())}
              placeholder="US"
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>
        </div>

        <button onClick={save} disabled={saving} style={{ padding: "10px 14px" }}>
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </div>
    </div>
  );
}
