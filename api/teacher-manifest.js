// api/teacher-manifest.js — DigiSmart Teacher App "install as app" file (Oct 2026)
//
// GET /api/teacher-manifest?t=CODE
// Each teacher has her own link (my-day.html?t=CODE). When she taps
// "Install app" / "Add to Home screen", the phone reads this file, so the
// app icon on her home screen always opens HER link — never a bare page.
// It reads nothing from the database and gives out nothing private:
// the link still needs her 4-digit PIN, exactly as before.

module.exports = async function handler(req, res) {
  const raw = String((req.query && req.query.t) || '').trim().toLowerCase();
  const code = /^[a-z0-9]{1,20}$/.test(raw) ? raw : '';
  const start = '/my-day.html' + (code ? '?t=' + code : '');

  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(JSON.stringify({
    id: start,
    name: 'My Day — DigiSmart Teacher App',
    short_name: 'My Day',
    description: 'Today\'s plan, homework check and Submit my day.',
    start_url: start,
    scope: '/my-day.html',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F7EFE2',
    theme_color: '#6B0F1A',
    icons: [
      { src: '/assets/teacher-app/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/assets/teacher-app/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/assets/teacher-app/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  }));
};
