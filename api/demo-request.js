// api/demo-request.js
// Receives "Book a free demo" enquiries from home.html.
//
// The public site used to insert straight into Supabase from the browser,
// which meant the project URL and a write-capable key sat in the page source
// for anyone to read and reuse. This endpoint moves that write to the server,
// the same way every other write in DigiSmartSchool is handled.
//
// The leads table lives in the DigiSmart ERP project, not the TeachBot one,
// so this reads its own key: ERP_SECRET_KEY.

const https = require('https');
const tls = require('tls');

const HOST = 'nkfxrbumhjztmdyepygt.supabase.co';   // DigiSmart ERP project
const TABLE = '/rest/v1/demo_requests';

function insert(row) {
  return new Promise((resolve) => {
    const key = process.env.ERP_SECRET_KEY;
    const data = JSON.stringify([row]);
    if (!key) { resolve({ status: 0, body: 'ERP_SECRET_KEY not set' }); return; }
    const opts = {
      hostname: HOST,
      path: TABLE,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Prefer': 'return=minimal',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const r = https.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: body }));
    });
    r.on('error', () => resolve({ status: 0, body: 'network' }));
    r.write(data);
    r.end();
  });
}

// Keep one field to a sane length so a bot cannot post a novel into the table.
function clean(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max || 200);
}

// ── Email alert ───────────────────────────────────────────────
// Sends a plain SMTP message over TLS so no npm package is needed.
// Hostinger: smtp.hostinger.com, port 465, implicit SSL.

const SMTP_HOST = 'smtp.hostinger.com';
const SMTP_PORT = 465;
const SMTP_USER = 'info@digismartschool.com';

function b64(s) { return Buffer.from(String(s), 'utf8').toString('base64'); }

// Subject lines may hold Tamil or a long school name, so encode them.
function mimeWord(s) { return '=?UTF-8?B?' + b64(s) + '?='; }

function sendMail(to, subject, body, replyTo) {
  return new Promise((resolve) => {
    const pass = process.env.SMTP_PASSWORD;
    if (!pass) { resolve({ ok: false, why: 'SMTP_PASSWORD not set' }); return; }

    // Each step waits for the code it expects before sending the next line.
    const steps = [
      { expect: 220, send: 'EHLO digismartschool.com' },
      { expect: 250, send: 'AUTH LOGIN' },
      { expect: 334, send: b64(SMTP_USER) },
      { expect: 334, send: b64(pass) },
      { expect: 235, send: 'MAIL FROM:<' + SMTP_USER + '>' },
      { expect: 250, send: 'RCPT TO:<' + to + '>' },
      { expect: 250, send: 'DATA' },
      { expect: 354, send: null },   // headers + body, then the closing dot
      { expect: 250, send: 'QUIT' }
    ];

    let i = 0, buf = '', done = false;
    const finish = (ok, why) => {
      if (done) return;
      done = true;
      try { sock.end(); } catch (e) {}
      resolve({ ok: ok, why: why || '' });
    };

    const sock = tls.connect({ host: SMTP_HOST, port: SMTP_PORT, servername: SMTP_HOST });
    sock.setEncoding('utf8');
    sock.setTimeout(15000);
    sock.on('timeout', () => finish(false, 'timeout'));
    sock.on('error', (e) => finish(false, 'socket: ' + e.message));

    sock.on('data', (chunk) => {
      buf += chunk;
      // A reply can span several lines; the last one has a space after the code.
      const lines = buf.split('\r\n').filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (!/^\d{3} /.test(last)) return;      // still mid-reply, wait for more
      buf = '';

      const code = parseInt(last.slice(0, 3), 10);
      const step = steps[i];
      if (!step) { finish(true); return; }
      if (code !== step.expect) { finish(false, 'expected ' + step.expect + ', got: ' + last); return; }

      i++;
      if (i === steps.length) { finish(true); return; }

      const next = steps[i - 1];
      if (next.send === null) {
        const msg =
          'From: DigiSmartSchool <' + SMTP_USER + '>\r\n' +
          'To: <' + to + '>\r\n' +
          (replyTo ? 'Reply-To: <' + replyTo + '>\r\n' : '') +
          'Subject: ' + mimeWord(subject) + '\r\n' +
          'MIME-Version: 1.0\r\n' +
          'Content-Type: text/plain; charset=UTF-8\r\n' +
          'Content-Transfer-Encoding: base64\r\n' +
          '\r\n' +
          b64(body).replace(/(.{76})/g, '$1\r\n') + '\r\n' +
          '.\r\n';
        sock.write(msg);
      } else {
        sock.write(next.send + '\r\n');
      }
    });
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const b = (req.body && typeof req.body === 'object') ? req.body : {};

  // Honeypot: a real person never sees or fills this field. A bot fills
  // everything. Answer as if it worked, but write nothing.
  if (clean(b.website, 100)) {
    res.status(200).json({ ok: true });
    return;
  }

  const school = clean(b.school_name, 150);
  const name = clean(b.contact_name, 100);
  const mobile = clean(b.mobile, 20);
  const digits = mobile.replace(/\D/g, '');

  if (!school || !name || !digits) {
    res.status(400).json({ ok: false, error: 'School name, your name and mobile number are required.' });
    return;
  }
  if (digits.length < 10 || digits.length > 15) {
    res.status(400).json({ ok: false, error: 'Please enter a valid mobile number.' });
    return;
  }

  const row = {
    school_name: school,
    contact_name: name,
    mobile: mobile,
    email: clean(b.email, 150),
    city: clean(b.city, 100),
    students: clean(b.students, 60),
    plan: clean(b.plan, 100),
    requested_at: new Date().toISOString()
  };

  const out = await insert(row);

  if (out.status >= 200 && out.status < 300) {
    // The enquiry is safely stored. The alert is a convenience on top, so a
    // mail failure must never turn a saved lead into an error for the school.
    try {
      const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const lines = [
        'New demo request from the website.',
        '',
        'School    : ' + row.school_name,
        'Contact   : ' + row.contact_name,
        'Mobile    : ' + row.mobile,
        'Email     : ' + (row.email || '-'),
        'City      : ' + (row.city || '-'),
        'Students  : ' + (row.students || '-'),
        'Interested: ' + (row.plan || '-'),
        'Received  : ' + when + ' IST',
        '',
        'They were promised a reply within 24 hours.'
      ].join('\n');

      const to = process.env.ALERT_TO || SMTP_USER;
      const mail = await sendMail(to, 'Demo request: ' + row.school_name, lines, row.email || '');
      if (!mail.ok) console.error('demo-request alert failed:', mail.why);
    } catch (e) {
      console.error('demo-request alert threw:', e && e.message);
    }

    res.status(200).json({ ok: true });
    return;
  }

  console.error('demo-request insert failed:', out.status, out.body);
  res.status(502).json({ ok: false, error: 'Could not save the request.' });
};
