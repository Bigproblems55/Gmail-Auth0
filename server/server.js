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

function signSession(payload) {
  return jwt.sign(payload, process.env.APP_JWT_SECRET, { expiresIn: "7d" });
}

function verifySession(token) {
  return jwt.verify(token, process.env.APP_JWT_SECRET);
}

app.post("/auth/google", async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: "Missing idToken" });

    // Verify Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const claims = ticket.getPayload();
    if (!claims?.email || !claims?.email_verified) {
      return res.status(401).json({ error: "Email not verified" });
    }

    const googleSub = claims.sub; // stable Google user id
    const email = claims.email;
    const name = claims.name ?? null;
    const picture = claims.picture ?? null;

    // Upsert user
    const q = `
      insert into app_users (google_sub, email, name, picture)
      values ($1, $2, $3, $4)
      on conflict (google_sub)
      do update set
        email = excluded.email,
        name = excluded.name,
        picture = excluded.picture,
        updated_at = now()
      returning id, google_sub, email, name, picture, created_at, updated_at
    `;
    const { rows } = await pool.query(q, [googleSub, email, name, picture]);
    const user = rows[0];

    // Create app session cookie
    const sessionToken = signSession({ uid: user.id, email: user.email });

    res.cookie("session", sessionToken, {
      httpOnly: true,
      secure: false, // set true on HTTPS in production
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ user });
  } catch (err) {
    res.status(401).json({ error: "Invalid Google token" });
  }
});

app.get("/me", async (req, res) => {
  try {
    const token = req.cookies.session;
    if (!token) return res.status(401).json({ error: "Not logged in" });

    const payload = verifySession(token);
    const { rows } = await pool.query(
      "select id, email, name, picture from app_users where id = $1",
      [payload.uid]
    );
    if (!rows[0]) return res.status(401).json({ error: "Session user missing" });

    res.json({ user: rows[0] });
  } catch {
    res.status(401).json({ error: "Not logged in" });
  }
});

app.post("/auth/logout", (req, res) => {
  res.clearCookie("session");
  res.json({ ok: true });
});

app.listen(process.env.PORT || 3001, () => {
  console.log(`Auth API running on http://localhost:${process.env.PORT || 3001}`);
});
