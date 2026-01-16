import "dotenv/config"; // Load environment variables from .env.
import express from "express"; // Express web framework.
import cors from "cors"; // CORS middleware.
import cookieParser from "cookie-parser"; // Cookie parsing middleware.
import jwt from "jsonwebtoken"; // JWT signing/verifying.
import { OAuth2Client } from "google-auth-library"; // Google ID token verifier.
import pg from "pg"; // Postgres client.

const { Pool } = pg; // Extract Pool class from pg.

const app = express(); // Create Express app.
app.use(express.json()); // Parse JSON request bodies.
app.use(cookieParser()); // Populate req.cookies.

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN, // Allow frontend origin from env.
    credentials: true, // Allow cookies across origins.
  }) // End CORS config.
); // Register CORS middleware.

const pool = new Pool({ connectionString: process.env.DATABASE_URL }); // DB pool.
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID); // Google verifier.

const desiredUserFields = [ // Fields expected by the frontend.
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
]; // End desired user fields list.

let appUserColumnsCache; // Cached Set of app_users columns.

function signSession(payload) { // Create a signed session token.
  return jwt.sign(payload, process.env.APP_JWT_SECRET, { expiresIn: "7d" }); // 7 days.
} // End signSession.

function verifySession(token) { // Validate session token.
  return jwt.verify(token, process.env.APP_JWT_SECRET); // Throws if invalid.
} // End verifySession.

async function getAppUserColumns() { // Load app_users column names.
  if (appUserColumnsCache) return appUserColumnsCache; // Use cache if present.
  const { rows } = await pool.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'app_users'" // Schema query.
  ); // Execute query.
  appUserColumnsCache = new Set(rows.map((row) => row.column_name)); // Cache results.
  return appUserColumnsCache; // Return cached set.
} // End getAppUserColumns.

function normalizeUser(row) { // Normalize DB row to full user shape.
  if (!row) return null; // Return null when no row.
  const normalized = Object.fromEntries(
    desiredUserFields.map((field) => [field, null]) // Default all fields to null.
  );
  for (const [key, value] of Object.entries(row)) {
    normalized[key] = value; // Copy actual values onto normalized object.
  }
  return normalized; // Return full user object.
} // End normalizeUser.

async function selectUser(whereClause, params) { // Fetch a single user row.
  const columns = await getAppUserColumns(); // Load available columns.
  if (!columns.has("id") || !columns.has("email")) { // Require id/email columns.
    throw new Error("app_users must include id and email columns"); // Hard error.
  }

  const selectColumns = desiredUserFields.filter((field) => columns.has(field)); // Only existing columns.
  const { rows } = await pool.query(
    `select ${selectColumns.join(", ")} from app_users where ${whereClause} limit 1`, // Query by clause.
    params // Bind parameters.
  );
  return normalizeUser(rows[0]); // Normalize and return.
} // End selectUser.

function deriveUsername(claims) { // Derive a username from Google claims.
  const fullName = claims?.name?.trim(); // Use full name if available.
  if (fullName) return fullName.toLowerCase().replace(/\s+/g, ""); // Slugify name.
  const email = claims?.email?.trim(); // Fallback to email local-part.
  if (!email) return null; // No email means no username.
  return email.split("@")[0] || null; // Return local-part.
} // End deriveUsername.

async function upsertUserByEmail(email, name, picture, googleSub, username) { // Insert/update user by email.
  const columns = await getAppUserColumns(); // Load available columns.
  if (!columns.has("id") || !columns.has("email")) { // Require core columns.
    throw new Error("app_users must include id and email columns"); // Fail fast.
  }

  if (columns.has("google_sub") && !googleSub) { // Ensure google_sub when required.
    throw new Error("google_sub is required for app_users"); // Fail on missing sub.
  }

  let user = await selectUser("email = $1", [email]); // Try to find existing user.

  if (user) { // Update existing user.
    const updates = []; // Columns to update.
    const values = []; // Values to bind.
    let idx = 1; // Parameter index counter.
    if (columns.has("name")) {
      updates.push(`name = $${idx++}`); // Update name column.
      values.push(name); // Bind name value.
    }
    if (columns.has("picture")) {
      updates.push(`picture = $${idx++}`); // Update picture column.
      values.push(picture); // Bind picture value.
    }
    if (columns.has("google_sub") && googleSub) {
      updates.push(`google_sub = $${idx++}`); // Update google_sub.
      values.push(googleSub); // Bind google_sub.
    }
    if (columns.has("username") && !user.username && username) {
      updates.push(`username = $${idx++}`); // Set username if missing.
      values.push(username); // Bind username.
    }

    if (updates.length > 0) { // Only update when there is something to set.
      values.push(user.id); // Bind user id for where clause.
      const selectColumns = desiredUserFields.filter((field) =>
        columns.has(field)
      ); // Determine return columns.
      const { rows } = await pool.query(
        `
          update app_users
          set ${updates.join(", ")}
          where id = $${idx}
          returning ${selectColumns.join(", ")}
        `, // Update query.
        values // Bound params.
      );
      user = normalizeUser(rows[0]); // Normalize updated row.
    }
    return user; // Return updated user.
  }

  const insertColumns = ["email"]; // Base insert columns.
  const insertValues = [email]; // Base insert values.

  if (columns.has("name")) {
    insertColumns.push("name"); // Add name column.
    insertValues.push(name); // Bind name value.
  }
  if (columns.has("picture")) {
    insertColumns.push("picture"); // Add picture column.
    insertValues.push(picture); // Bind picture value.
  }
  if (columns.has("google_sub")) {
    insertColumns.push("google_sub"); // Add google_sub column.
    insertValues.push(googleSub); // Bind google_sub value.
  }
  if (columns.has("username") && username) {
    insertColumns.push("username"); // Add username column.
    insertValues.push(username); // Bind username value.
  }
  if (columns.has("role")) {
    insertColumns.push("role"); // Add role column.
    insertValues.push("user"); // Default role for new users.
  }

  const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(", "); // Build placeholders.
  const selectColumns = desiredUserFields.filter((field) => columns.has(field)); // Determine return columns.
  const { rows } = await pool.query(
    `
      insert into app_users (${insertColumns.join(", ")})
      values (${placeholders})
      returning ${selectColumns.join(", ")}
    `, // Insert query.
    insertValues // Bound params.
  );
  return normalizeUser(rows[0]); // Return inserted user.
} // End upsertUserByEmail.

async function updateUserProfile(userId, updates) { // Update profile fields.
  const columns = await getAppUserColumns(); // Load available columns.
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
  ].filter((field) => columns.has(field)); // Restrict to existing columns.

  const setParts = []; // SQL SET clauses.
  const values = []; // Parameter values for SQL.
  let idx = 1; // Parameter index counter.

  for (const field of allowed) { // Iterate allowed profile fields.
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      setParts.push(`${field} = $${idx++}`); // Add SET clause.
      values.push(updates[field]); // Bind field value.
    }
  }

  if (setParts.length === 0) { // No updates provided.
    return selectUser("id = $1", [userId]); // Return current user.
  }

  values.push(userId); // Bind user id at end.
  const selectColumns = desiredUserFields.filter((field) => columns.has(field)); // Return columns.
  const { rows } = await pool.query(
    `
      update app_users
      set ${setParts.join(", ")}
      where id = $${idx}
      returning ${selectColumns.join(", ")}
    `, // Update query.
    values // Bound params.
  );
  return normalizeUser(rows[0]); // Return updated user.
} // End updateUserProfile.

app.get("/debug/schema", async (req, res) => { // Debug schema endpoint.
  try {
    const columns = await getAppUserColumns(); // Load columns.
    res.json({ columns: Array.from(columns).sort() }); // Return sorted list.
  } catch (err) {
    console.error("Schema debug failed:", err?.message || err); // Log error.
    res.status(500).json({ error: "Schema debug failed" }); // Return error.
  }
}); // End /debug/schema.

app.post("/auth/google", async (req, res) => { // Google login endpoint.
  try {
    const { idToken } = req.body; // Read ID token from request.
    if (!idToken) return res.status(400).json({ error: "Missing idToken" }); // Require token.

    const ticket = await googleClient.verifyIdToken({
      idToken, // Token to verify.
      audience: process.env.GOOGLE_CLIENT_ID, // Expected client id.
    });

    const claims = ticket.getPayload(); // Extract token claims.

    if (!claims?.email) {
      return res.status(401).json({ error: "No email in token" }); // Require email.
    }
    if (!claims?.email_verified) {
      return res.status(401).json({ error: "Email not verified" }); // Require verified email.
    }

    const email = claims.email; // Required email.
    const name = claims.name ?? null; // Optional full name.
    const picture = claims.picture ?? null; // Optional avatar.
    const googleSub = claims.sub ?? null; // Google subject id.
    const username = deriveUsername(claims); // Derived username.
    const user = await upsertUserByEmail(
      email,
      name,
      picture,
      googleSub,
      username
    ); // Insert/update user.
    if (!user?.id) {
      return res.status(500).json({ error: "User id missing after login" }); // Guard against missing id.
    }

    const token = signSession({ uid: user.id }); // Create session token.
    res.cookie("session", token, {
      httpOnly: true, // Prevent JS access to cookie.
      sameSite: "lax", // Reduce CSRF risk.
      secure: process.env.NODE_ENV === "production", // HTTPS-only in prod.
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms.
    });

    return res.json({ user }); // Return user payload.
  } catch (err) {
    console.error("Google token verify failed:", err?.message || err); // Log error.
    return res.status(401).json({
      error: "Invalid Google token", // Error message.
      detail: err?.message || String(err), // Error detail.
    });
  }
}); // End /auth/google.


app.get("/me", async (req, res) => { // Current session endpoint.
  try {
    const token = req.cookies.session; // Read session cookie.
    if (!token) return res.status(401).json({ error: "Not logged in" }); // Require login.

    const payload = verifySession(token); // Validate JWT.
    const user = await selectUser("id = $1", [payload.uid]); // Fetch user by id.
    if (!user) return res.status(401).json({ error: "Session user missing" }); // Guard missing user.

    res.json({ user }); // Return user.
  } catch {
    res.status(401).json({ error: "Not logged in" }); // Invalid or expired token.
  }
}); // End /me.

app.post("/profile", async (req, res) => { // Profile update endpoint.
  try {
    const token = req.cookies.session; // Read session cookie.
    if (!token) return res.status(401).json({ error: "Not logged in" }); // Require login.

    const payload = verifySession(token); // Validate JWT.
    const user = await updateUserProfile(payload.uid, req.body || {}); // Apply updates.
    if (!user) return res.status(401).json({ error: "Session user missing" }); // Guard missing user.

    res.json({ user }); // Return updated user.
  } catch (err) {
    console.error("Profile update failed:", err?.message || err); // Log error.
    res.status(400).json({ error: "Profile update failed" }); // Respond with error.
  }
}); // End /profile.

app.post("/auth/logout", (req, res) => { // Logout endpoint.
  res.clearCookie("session"); // Clear session cookie.
  res.json({ ok: true }); // Return ok response.
}); // End /auth/logout.

app.listen(process.env.PORT || 3001, () => { // Start HTTP server.
  console.log(`Auth API running on http://localhost:${process.env.PORT || 3001}`); // Log URL.
}); // End app.listen.
