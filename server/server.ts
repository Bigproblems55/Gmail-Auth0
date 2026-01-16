/**
 * Auth API server for Google Sign-In + profile storage.
 * Endpoints:
 * - POST /auth/google: verify Google ID token, upsert user, set session cookie.
 * - GET /me: return current session user.
 * - POST /profile: update profile fields for the session user.
 * - GET /debug/schema: list columns detected on app_users.
 * Required env: CLIENT_ORIGIN, DATABASE_URL, GOOGLE_CLIENT_ID, APP_JWT_SECRET.
 */
import "dotenv/config"; // Loads .env into process.env at startup.
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import pg from "pg";

const { Pool } = pg; // pg is a CJS module; destructure Pool for convenience.

const app = express(); // Main Express app.
app.use(express.json()); // Parse JSON bodies.
app.use(cookieParser()); // Read cookies into req.cookies.

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN, // Allow the frontend origin from env.
    credentials: true, // Allow cookies to be sent from the browser.
  })
);

const pool = new Pool({ connectionString: process.env.DATABASE_URL }); // Postgres connection pool.
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID); // Google ID token verifier.

const desiredUserFields = [
  "id",
  "email",
  "name",
  "picture",
  "google_sub",
  "username",
  "bio",
  "phone",
  "address_line1",
  "address_line2",
  "address_city",
  "address_state",
  "address_postal",
  "address_country",
  "role",
]; // Full user shape expected by the frontend.

// Cache schema lookups so each request does not hit information_schema.
let appUserColumnsCache; // Cached Set<string> of app_users columns.

function signSession(payload) {
  // Signs a short payload into a JWT stored in an HTTP-only cookie.
  return jwt.sign(payload, process.env.APP_JWT_SECRET, { expiresIn: "7d" });
}

function verifySession(token) {
  // Verifies the JWT cookie and returns its payload.
  return jwt.verify(token, process.env.APP_JWT_SECRET);
}

async function getAppUserColumns() {
  // Fetch schema only once; helpful if migrations are missing columns.
  if (appUserColumnsCache) return appUserColumnsCache;
  const { rows } = await pool.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'app_users'"
  );
  appUserColumnsCache = new Set(rows.map((row) => row.column_name));
  return appUserColumnsCache;
}

function normalizeUser(row) {
  // Fill missing columns with null so the frontend always gets a full shape.
  if (!row) return null;
  const normalized = Object.fromEntries(
    desiredUserFields.map((field) => [field, null])
  );
  for (const [key, value] of Object.entries(row)) {
    normalized[key] = value;
  }
  return normalized;
}

async function selectUser(whereClause, params) {
  // Select a single user using only columns that actually exist.
  const columns = await getAppUserColumns();
  if (!columns.has("id") || !columns.has("email")) {
    throw new Error("app_users must include id and email columns");
  }

  const selectColumns = desiredUserFields.filter((field) => columns.has(field));
  const { rows } = await pool.query(
    `select ${selectColumns.join(", ")} from app_users where ${whereClause} limit 1`,
    params
  );
  return normalizeUser(rows[0]);
}

function deriveUsername(claims) {
  // Build a simple username from Google profile (fallback to email local-part).
  const fullName = claims?.name?.trim();
  if (fullName) return fullName.toLowerCase().replace(/\s+/g, "");
  const email = claims?.email?.trim();
  if (!email) return null;
  return email.split("@")[0] || null;
}

async function upsertUserByEmail(email, name, picture, googleSub, username) {
  // Insert or update a user based on email, respecting existing schema.
  const columns = await getAppUserColumns();
  if (!columns.has("id") || !columns.has("email")) {
    throw new Error("app_users must include id and email columns");
  }

  if (columns.has("google_sub") && !googleSub) {
    throw new Error("google_sub is required for app_users");
  }

  let user = await selectUser("email = $1", [email]);

  if (user) {
    const updates = [];
    const values = [];
    let idx = 1;
    if (columns.has("name")) {
      updates.push(`name = $${idx++}`);
      values.push(name);
    }
    if (columns.has("picture")) {
      updates.push(`picture = $${idx++}`);
      values.push(picture);
    }
    if (columns.has("google_sub") && googleSub) {
      updates.push(`google_sub = $${idx++}`);
      values.push(googleSub);
    }
    if (columns.has("username") && !user.username && username) {
      updates.push(`username = $${idx++}`);
      values.push(username);
    }

    if (updates.length > 0) {
      values.push(user.id);
      const selectColumns = desiredUserFields.filter((field) =>
        columns.has(field)
      );
      const { rows } = await pool.query(
        `
          update app_users
          set ${updates.join(", ")}
          where id = $${idx}
          returning ${selectColumns.join(", ")}
        `,
        values
      );
      user = normalizeUser(rows[0]);
    }
    return user;
  }

  const insertColumns = ["email"];
  const insertValues = [email];

  if (columns.has("name")) {
    insertColumns.push("name");
    insertValues.push(name);
  }
  if (columns.has("picture")) {
    insertColumns.push("picture");
    insertValues.push(picture);
  }
  if (columns.has("google_sub")) {
    insertColumns.push("google_sub");
    insertValues.push(googleSub);
  }
  if (columns.has("username") && username) {
    insertColumns.push("username");
    insertValues.push(username);
  }
  if (columns.has("role")) {
    insertColumns.push("role");
    insertValues.push("user");
  }

  const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(", ");
  const selectColumns = desiredUserFields.filter((field) => columns.has(field));
  const { rows } = await pool.query(
    `
      insert into app_users (${insertColumns.join(", ")})
      values (${placeholders})
      returning ${selectColumns.join(", ")}
    `,
    insertValues
  );
  return normalizeUser(rows[0]);
}

// Updates only columns that exist in app_users to avoid schema mismatch errors.
async function updateUserProfile(userId, updates) {
  // Accept only whitelisted profile fields and ignore missing columns.
  const columns = await getAppUserColumns();
  const allowed = [
    "username",
    "bio",
    "phone",
    "address_line1",
    "address_line2",
    "address_city",
    "address_state",
    "address_postal",
    "address_country",
  ].filter((field) => columns.has(field));

  const setParts = [];
  const values = [];
  let idx = 1;

  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      setParts.push(`${field} = $${idx++}`);
      values.push(updates[field]);
    }
  }

  if (setParts.length === 0) {
    return selectUser("id = $1", [userId]);
  }

  values.push(userId);
  const selectColumns = desiredUserFields.filter((field) => columns.has(field));
  const { rows } = await pool.query(
    `
      update app_users
      set ${setParts.join(", ")}
      where id = $${idx}
      returning ${selectColumns.join(", ")}
    `,
    values
  );
  return normalizeUser(rows[0]);
}

async function fetchPeopleProfile(accessToken) {
  // Fetch phone/address data from Google People API using an OAuth access token.
  if (!accessToken) return null;
  const res = await fetch(
    "https://people.googleapis.com/v1/people/me?personFields=phoneNumbers,addresses",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (!res.ok) return null;

  const data = await res.json();
  console.log("People API response:", JSON.stringify(data, null, 2));
  const phoneNumber = data?.phoneNumbers?.[0]?.value ?? null;
  const addr = data?.addresses?.[0] ?? null;
  const address = addr
    ? {
        line1: addr.streetAddress ?? null,
        line2: addr.extendedAddress ?? null,
        city: addr.city ?? null,
        state: addr.region ?? null,
        postal: addr.postalCode ?? null,
        country: (addr.countryCode ?? addr.country ?? null)?.toUpperCase?.() ?? null,
      }
    : null;

  return { phoneNumber, address };
}

function buildPrefillUpdates(user, people) {
  // Prefill only missing fields so user edits are preserved.
  if (!user || !people) return {};
  const isBlank = (value) => value === null || value === "";
  const updates = {};

  if (people.phoneNumber && isBlank(user.phone)) {
    updates.phone = people.phoneNumber;
  }

  const addr = people.address;
  if (addr) {
    if (addr.line1 && isBlank(user.address_line1)) updates.address_line1 = addr.line1;
    if (addr.line2 && isBlank(user.address_line2)) updates.address_line2 = addr.line2;
    if (addr.city && isBlank(user.address_city)) updates.address_city = addr.city;
    if (addr.state && isBlank(user.address_state)) updates.address_state = addr.state;
    if (addr.postal && isBlank(user.address_postal)) updates.address_postal = addr.postal;
    if (addr.country && isBlank(user.address_country)) {
      updates.address_country = addr.country;
    }
  }

  return updates;
}

app.get("/debug/schema", async (req, res) => {
  // Return schema columns to confirm migrations ran on the active DB.
  try {
    const columns = await getAppUserColumns();
    res.json({ columns: Array.from(columns).sort() });
  } catch (err) {
    console.error("Schema debug failed:", err?.message || err);
    res.status(500).json({ error: "Schema debug failed" });
  }
});

app.post("/auth/google", async (req, res) => {
  // Exchange Google ID token for a session cookie and user payload.
  try {
    const { idToken, accessToken } = req.body;
    if (!idToken) return res.status(400).json({ error: "Missing idToken" });

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const claims = ticket.getPayload(); // Google profile claims from the ID token.

    if (!claims?.email) {
      return res.status(401).json({ error: "No email in token" });
    }
    if (!claims?.email_verified) {
      return res.status(401).json({ error: "Email not verified" });
    }

    const email = claims.email; // Required unique identifier.
    const name = claims.name ?? null; // Full name from Google.
    const picture = claims.picture ?? null; // Avatar URL from Google.
    const googleSub = claims.sub ?? null; // Stable Google user id.
    const username = deriveUsername(claims); // Derived username fallback.
    let user = await upsertUserByEmail(
      email,
      name,
      picture,
      googleSub,
      username
    );
    if (!user?.id) {
      return res.status(500).json({ error: "User id missing after login" });
    }

    if (accessToken) {
      const people = await fetchPeopleProfile(accessToken);
      const updates = buildPrefillUpdates(user, people);
      if (Object.keys(updates).length > 0) {
        user = await updateUserProfile(user.id, updates);
      }
    }

    const token = signSession({ uid: user.id }); // Store user id in the session.
    res.cookie("session", token, {
      httpOnly: true, // Not accessible to JS in the browser.
      sameSite: "lax", // Allows cookie on same-site and top-level navs.
      secure: process.env.NODE_ENV === "production", // HTTPS-only in prod.
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days.
    });

    return res.json({ user });
  } catch (err) {
    console.error("Google token verify failed:", err?.message || err);
    return res.status(401).json({
      error: "Invalid Google token",
      detail: err?.message || String(err),
    });
  }
});


app.get("/me", async (req, res) => {
  // Read the session cookie and return the current user.
  try {
    const token = req.cookies.session;
    if (!token) return res.status(401).json({ error: "Not logged in" });

    const payload = verifySession(token); // Throws if token invalid/expired.
    const user = await selectUser("id = $1", [payload.uid]);
    if (!user) return res.status(401).json({ error: "Session user missing" });

    res.json({ user });
  } catch {
    res.status(401).json({ error: "Not logged in" });
  }
});

app.post("/profile", async (req, res) => {
  // Persist user profile fields sent from the frontend editor.
  try {
    const token = req.cookies.session;
    if (!token) return res.status(401).json({ error: "Not logged in" });

    const payload = verifySession(token);
    const user = await updateUserProfile(payload.uid, req.body || {});
    if (!user) return res.status(401).json({ error: "Session user missing" });

    res.json({ user });
  } catch (err) {
    console.error("Profile update failed:", err?.message || err);
    res.status(400).json({ error: "Profile update failed" });
  }
});

app.post("/auth/logout", (req, res) => {
  // Clear the session cookie to log out.
  res.clearCookie("session");
  res.json({ ok: true });
});

app.listen(process.env.PORT || 3001, () => {
  // Start HTTP server.
  console.log(`Auth API running on http://localhost:${process.env.PORT || 3001}`);
});
