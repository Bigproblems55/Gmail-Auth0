import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import pg from "pg";

const { Pool } = pg;

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN,
    credentials: true,
  })
);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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
];

let appUserColumnsCache;

function signSession(payload) {
  return jwt.sign(payload, process.env.APP_JWT_SECRET, { expiresIn: "7d" });
}

function verifySession(token) {
  return jwt.verify(token, process.env.APP_JWT_SECRET);
}

async function getAppUserColumns() {
  if (appUserColumnsCache) return appUserColumnsCache;
  const { rows } = await pool.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'app_users'"
  );
  appUserColumnsCache = new Set(rows.map((row) => row.column_name));
  return appUserColumnsCache;
}

function normalizeUser(row) {
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
  const fullName = claims?.name?.trim();
  if (fullName) return fullName.toLowerCase().replace(/\s+/g, "");
  const email = claims?.email?.trim();
  if (!email) return null;
  return email.split("@")[0] || null;
}

async function upsertUserByEmail(email, name, picture, googleSub, username) {
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

async function updateUserProfile(userId, updates) {
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

app.get("/debug/schema", async (req, res) => {
  try {
    const columns = await getAppUserColumns();
    res.json({ columns: Array.from(columns).sort() });
  } catch (err) {
    console.error("Schema debug failed:", err?.message || err);
    res.status(500).json({ error: "Schema debug failed" });
  }
});

app.post("/auth/google", async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: "Missing idToken" });

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const claims = ticket.getPayload();

    if (!claims?.email) {
      return res.status(401).json({ error: "No email in token" });
    }
    if (!claims?.email_verified) {
      return res.status(401).json({ error: "Email not verified" });
    }

    const email = claims.email;
    const name = claims.name ?? null;
    const picture = claims.picture ?? null;
    const googleSub = claims.sub ?? null;
    const username = deriveUsername(claims);
    const user = await upsertUserByEmail(
      email,
      name,
      picture,
      googleSub,
      username
    );
    if (!user?.id) {
      return res.status(500).json({ error: "User id missing after login" });
    }

    const token = signSession({ uid: user.id });
    res.cookie("session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
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
  try {
    const token = req.cookies.session;
    if (!token) return res.status(401).json({ error: "Not logged in" });

    const payload = verifySession(token);
    const user = await selectUser("id = $1", [payload.uid]);
    if (!user) return res.status(401).json({ error: "Session user missing" });

    res.json({ user });
  } catch {
    res.status(401).json({ error: "Not logged in" });
  }
});

app.post("/profile", async (req, res) => {
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
  res.clearCookie("session");
  res.json({ ok: true });
});

app.listen(process.env.PORT || 3001, () => {
  console.log(`Auth API running on http://localhost:${process.env.PORT || 3001}`);
});
