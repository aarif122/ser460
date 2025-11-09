// server.js
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ----------------------------------------------------
// Helpers / current user (for demo)
// ----------------------------------------------------
function currentUser(req) {
  // Simulate auth: header X-User-Id (defaults to "1")
  const id = Number(req.header("X-User-Id") || 1);
  return { id, name: id === 1 ? "Alice Student" : "Demo User" };
}

// ----------------------------------------------------
// In-memory data
// ----------------------------------------------------
let events = [
  {
    id: 101,
    title: "Club Fair",
    category: "Social",
    date: "2025-11-10T10:00:00",
    location: "Student Center",
    clubId: 1,
    free: true,
    price: 0,
    requiresVerification: false,
    spotsLeft: 20,
    popularity: 88,
  },
  {
    id: 102,
    title: "ML Workshop: Intro to LLMs",
    category: "Workshop",
    date: "2025-11-12T13:00:00",
    location: "Brickyard 210",
    clubId: 1,
    free: false,
    price: 10,
    requiresVerification: true, // needs verification and payment
    spotsLeft: 8,
    popularity: 76,
  },
  {
    id: 103,
    title: "Tech Talk: Building Scalable APIs",
    category: "Tech Talk",
    date: "2025-11-15T16:00:00",
    location: "Engineering Hall",
    clubId: 2,
    free: true,
    price: 0,
    requiresVerification: false,
    spotsLeft: 15,
    popularity: 70,
  },
  {
    id: 104,
    title: "Hack Night",
    category: "Social",
    date: "2025-11-20T18:30:00",
    location: "Polytechnic Lab 2",
    clubId: 3,
    free: false,
    price: 5,
    requiresVerification: false,
    spotsLeft: 12,
    popularity: 82,
  },
];

let registrations = []; // {userId, eventId, at}

// Fake verification + payments stores
const userFlags = new Map(); // userId -> { verifiedAt: ISO }
const otpStore = new Map();  // userId -> { code, expiresAt }
const payments = new Map();  // paymentId -> { id, userId, eventId, amount, status }
let NEXT_PAYMENT_ID = 1;

// ----------------------------------------------------
// Basic events API
// ----------------------------------------------------
app.get("/api/events", (req, res) => {
  const sorted = [...events].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );
  res.json(sorted);
});

app.get("/api/events/:id", (req, res) => {
  const ev = events.find((e) => e.id === Number(req.params.id));
  if (!ev) return res.status(404).json({ ok: false, error: "Event not found" });
  res.json(ev);
});

// List current user registrations
app.get("/api/registrations/me", (req, res) => {
  const user = currentUser(req);
  const mine = registrations
    .filter((r) => r.userId === user.id)
    .map((r) => ({ ...r, event: events.find((e) => e.id === r.eventId) }));
  res.json(mine);
});

// ----------------------------------------------------
// Fake verification (OTP)
// ----------------------------------------------------
app.post("/api/verify/request", (req, res) => {
  const user = currentUser(req);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 mins
  otpStore.set(user.id, { code, expiresAt });

  // For demo, return the code (real systems would send SMS/email)
  res.json({
    ok: true,
    message: "Verification code generated (simulated)",
    demoCode: code,
    expiresInSeconds: 300,
  });
});

app.post("/api/verify/confirm", (req, res) => {
  const user = currentUser(req);
  const { code } = req.body || {};
  const entry = otpStore.get(user.id);

  if (!entry) return res.status(400).json({ ok: false, error: "No code requested" });
  if (Date.now() > entry.expiresAt) return res.status(400).json({ ok: false, error: "Code expired" });
  if (String(code) !== String(entry.code)) return res.status(400).json({ ok: false, error: "Invalid code" });

  otpStore.delete(user.id);
  const now = new Date().toISOString();
  userFlags.set(user.id, { ...(userFlags.get(user.id) || {}), verifiedAt: now });

  res.json({ ok: true, verified: true, verifiedAt: now });
});

app.get("/api/verify/status", (req, res) => {
  const user = currentUser(req);
  const flags = userFlags.get(user.id) || {};
  res.json({ verified: Boolean(flags.verifiedAt), verifiedAt: flags.verifiedAt || null });
});

// ----------------------------------------------------
// Fake payments
// ----------------------------------------------------
app.post("/api/payments/intent", (req, res) => {
  const user = currentUser(req);
  const { eventId } = req.body || {};
  const ev = events.find((e) => e.id === Number(eventId));
  if (!ev) return res.status(404).json({ ok: false, error: "Event not found" });

  const amount = ev.price ?? 0;
  const id = `pay_${NEXT_PAYMENT_ID++}`;
  const intent = {
    id,
    userId: user.id,
    eventId: ev.id,
    amount,
    status: "requires_confirmation",
  };
  payments.set(id, intent);

  res.json({
    ok: true,
    paymentId: id,
    clientSecret: `demo_secret_${id}`,
    amount,
    status: intent.status,
  });
});

app.post("/api/payments/confirm", (req, res) => {
  const user = currentUser(req);
  const { paymentId } = req.body || {};
  const intent = payments.get(paymentId);
  if (!intent || intent.userId !== user.id)
    return res.status(404).json({ ok: false, error: "Payment not found" });

  // Simulate the processor responding "succeeded"
  intent.status = "succeeded";
  payments.set(paymentId, intent);

  res.json({ ok: true, status: intent.status });
});

app.get("/api/payments/:id", (req, res) => {
  const p = payments.get(req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: "Not found" });
  res.json(p);
});

// ----------------------------------------------------
// Registration preview + unified register
// ----------------------------------------------------
app.post("/api/registrations/preview", (req, res) => {
  const user = currentUser(req);
  const { eventId } = req.body || {};
  const ev = events.find((e) => e.id === Number(eventId));
  if (!ev) return res.status(404).json({ ok: false, error: "Event not found" });

  const flags = userFlags.get(user.id) || {};
  const needsVerification = !!ev.requiresVerification && !flags.verifiedAt;
  const needsPayment = !ev.free && (ev.price ?? 0) > 0;

  res.json({
    ok: true,
    event: { id: ev.id, title: ev.title, price: ev.price ?? 0, free: ev.free },
    needsPayment,
    needsVerification,
  });
});

app.post("/api/registrations/register", (req, res) => {
  const user = currentUser(req);
  const { eventId, paymentId } = req.body || {};
  const ev = events.find((e) => e.id === Number(eventId));
  if (!ev) return res.status(404).json({ ok: false, error: "Event not found" });
  if (ev.spotsLeft <= 0) return res.status(400).json({ ok: false, error: "Event is full" });

  // Already registered?
  const already = registrations.some((r) => r.userId === user.id && r.eventId === ev.id);
  if (already) return res.json({ ok: true, message: "Already registered" });

  // Verification required?
  if (ev.requiresVerification) {
    const flags = userFlags.get(user.id) || {};
    if (!flags.verifiedAt) {
      return res.status(400).json({ ok: false, error: "Verification required" });
    }
  }

  // Payment required?
  if (!ev.free && (ev.price ?? 0) > 0) {
    const intent = payments.get(paymentId);
    if (!intent || intent.userId !== user.id || intent.eventId !== ev.id) {
      return res.status(400).json({ ok: false, error: "Missing or invalid payment" });
    }
    if (intent.status !== "succeeded") {
      return res.status(400).json({ ok: false, error: "Payment not completed" });
    }
  }

  // Complete registration
  registrations.push({ userId: user.id, eventId: ev.id, at: new Date().toISOString() });
  ev.spotsLeft = Math.max(0, ev.spotsLeft - 1);

  res.json({ ok: true, registered: true });
});

// ----------------------------------------------------
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
