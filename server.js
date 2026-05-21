const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const axios = require('axios');
const path = require('path');
const fs = require('fs');
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
 
// ===================== STATUS FILE =====================
const statusPath = path.join(__dirname, 'apply-status.json');
 
function getStatus() {
  if (!fs.existsSync(statusPath)) {
    fs.writeFileSync(statusPath, JSON.stringify({ open: false }));
  }
  return JSON.parse(fs.readFileSync(statusPath));
}
 
function setStatus(open) {
  fs.writeFileSync(statusPath, JSON.stringify({ open }));
}
 
// ===================== PAGES =====================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'website/index.html'));
});
 
app.get('/apply', (req, res) => {
  res.sendFile(path.join(__dirname, 'website/apply.html'));
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
app.get('/api/status', (req, res) => {
  res.json(getStatus());
});
 
app.post('/api/toggle', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'غير مسموح' });
 
  const allowedIDs = process.env.FOUNDER_IDS?.split(',') || [];
  if (!allowedIDs.includes(req.user.id)) {
    return res.status(403).json({ error: 'مش عندك صلاحية!' });
  }
 
  const current = getStatus();
  setStatus(!current.open);
  res.json({ open: !current.open });
});
 
app.post('/api/apply', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'لازم تسجل دخول!' });
 
  const status = getStatus();
  if (!status.open) return res.status(403).json({ error: 'التقديم مغلق حالياً!' });
 
  const { answers } = req.body;
  const user = req.user;
 
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
        thumbnail: {
          url: user.avatar
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
            : `https://cdn.discordapp.com/embed/avatars/0.png`
        },
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
 
app.listen(process.env.PORT || 3000, () => {
  console.log('🌐 Server running!');
});
 
