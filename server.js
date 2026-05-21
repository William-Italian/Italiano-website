const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'website')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'italiano_secret',
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// ===================== POSTGRESQL =====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// اعمل الجداول لو مش موجودة
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      discord_id TEXT NOT NULL,
      username TEXT NOT NULL,
      avatar TEXT,
      answers JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT INTO settings (key, value) VALUES ('apply_open', 'false')
    ON CONFLICT (key) DO NOTHING;
  `);
  console.log('✅ Database ready!');
}

initDB();

// ===================== DISCORD LOGIN =====================
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.REDIRECT_URI,
  scope: ['identify']
}, (accessToken, refreshToken, profile, done) => {
  return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ===================== PAGES =====================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'website/index.html'));
});

app.get('/apply', (req, res) => {
  res.sendFile(path.join(__dirname, 'website/apply.html'));
});

app.get('/my-applications', (req, res) => {
  res.sendFile(path.join(__dirname, 'website/my-applications.html'));
});

// ===================== AUTH =====================
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/callback', passport.authenticate('discord', {
  failureRedirect: '/'
}), (req, res) => {
  res.redirect('/apply');
});

app.get('/auth/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

app.get('/api/founders', (req, res) => {
  const allowedIDs = process.env.FOUNDER_IDS?.split(',') || [];
  res.json({ ids: allowedIDs });
});

app.get('/auth/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      id: req.user.id,
      username: req.user.username,
      avatar: req.user.avatar
        ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/0.png`
    });
  } else {
    res.json(null);
  }
});

// ===================== API =====================
app.get('/api/status', async (req, res) => {
  const result = await pool.query("SELECT value FROM settings WHERE key = 'apply_open'");
  res.json({ open: result.rows[0]?.value === 'true' });
});

app.post('/api/toggle', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'غير مسموح' });

  const allowedIDs = process.env.FOUNDER_IDS?.split(',') || [];
  if (!allowedIDs.includes(req.user.id)) {
    return res.status(403).json({ error: 'مش عندك صلاحية!' });
  }

  const result = await pool.query("SELECT value FROM settings WHERE key = 'apply_open'");
  const current = result.rows[0]?.value === 'true';
  const newValue = !current;
  await pool.query("UPDATE settings SET value = $1 WHERE key = 'apply_open'", [newValue.toString()]);
  res.json({ open: newValue });
});

app.post('/api/apply', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'لازم تسجل دخول!' });

  const result = await pool.query("SELECT value FROM settings WHERE key = 'apply_open'");
  if (result.rows[0]?.value !== 'true') {
    return res.status(403).json({ error: 'التقديم مغلق حالياً!' });
  }

  const { answers } = req.body;
  const user = req.user;
  const avatar = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;

  // حفظ في Database
  await pool.query(
    'INSERT INTO applications (discord_id, username, avatar, answers) VALUES ($1, $2, $3, $4)',
    [user.id, user.username, avatar, JSON.stringify(answers)]
  );

  const fields = [
    { name: '👤 المتقدم', value: `${user.username}`, inline: true },
    { name: '🪪 Discord ID', value: user.id, inline: true },
    { name: '1️⃣ الاسم في الخادم', value: answers[0] || 'لم يجب', inline: false },
    { name: '2️⃣ الايدي في الخادم', value: answers[1] || 'لم يجب', inline: false },
    { name: '3️⃣ عدد الساعات', value: answers[2] || 'لم يجب', inline: false },
    { name: '4️⃣ المخالفات الإدارية', value: answers[3] || 'لم يجب', inline: false },
    { name: '5️⃣ قاعدة TK', value: answers[4] || 'لم يجب', inline: false },
    { name: '6️⃣ قاعدة DM', value: answers[5] || 'لم يجب', inline: false },
    { name: '7️⃣ قاعدة VDM', value: answers[6] || 'لم يجب', inline: false },
    { name: '8️⃣ قاعدة SK', value: answers[7] || 'لم يجب', inline: false },
    { name: '9️⃣ قاعدة PG', value: answers[8] || 'لم يجب', inline: false },
    { name: '🔟 قاعدة MG', value: answers[9] || 'لم يجب', inline: false },
    { name: '1️⃣1️⃣ قاعدة SL', value: answers[10] || 'لم يجب', inline: false },
    { name: '1️⃣2️⃣ قاعدة SP', value: answers[11] || 'لم يجب', inline: false },
    { name: '1️⃣3️⃣ قاعدة WS', value: answers[12] || 'لم يجب', inline: false },
    { name: '1️⃣4️⃣ قاعدة RK', value: answers[13] || 'لم يجب', inline: false },
    { name: '1️⃣5️⃣ قاعدة GR', value: answers[14] || 'لم يجب', inline: false },
    { name: '1️⃣6️⃣ مهمتك في العيلة', value: answers[15] || 'لم يجب', inline: false },
    { name: '1️⃣7️⃣ تصرفك مع مواطن', value: answers[16] || 'لم يجب', inline: false },
    { name: '1️⃣8️⃣ تصرفك مع شخص يسأل', value: answers[17] || 'لم يجب', inline: false },
  ];

  try {
    await axios.post(process.env.WEBHOOK_URL, {
      embeds: [{
        title: '📋 تقديم جديد — ITALIANO Family',
        color: 0x8B0000,
        thumbnail: { url: avatar },
        fields,
        footer: { text: 'ITALIANO • نظام التقديم' },
        timestamp: new Date().toISOString()
      }]
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'حصل خطأ!' });
  }
});

// تقديمات اليوزر
app.get('/api/my-applications', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'لازم تسجل دخول!' });

  const result = await pool.query(
    'SELECT * FROM applications WHERE discord_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json(result.rows);
});

app.listen(process.env.PORT || 3000, () => {
  console.log('🌐 Server running!');
});
