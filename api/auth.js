const https = require('https');

module.exports.config = { api: { bodyParser: { sizeLimit: '1mb' } } };

const HOST = 'pzxosqukijwpjdlfdfst.supabase.co';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const key = process.env.SUPABASE_SECRET_KEY;
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: HOST, path, method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Prefer': 'return=representation',
        ...(data && { 'Content-Length': Buffer.byteLength(data) })
      }
    };
    const r = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: d ? JSON.parse(d) : {} }); }
        catch(e) { resolve({ status: res.statusCode, data: d }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

module.exports = async function(req2, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req2.method === 'OPTIONS') return res.status(200).end();
  if (req2.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req2.body || {};
  const { action } = body;

  try {

    // ── LOGIN ──
    if (action === 'login') {
      const { email, password } = body;
      const r = await req('POST', '/auth/v1/token?grant_type=password', { email, password });
      if (r.status !== 200) return res.json({ error: 'Invalid email or password' });
      const { access_token } = r.data;

      // Super admin check first
      if (email === 'sriguruparambarai@gmail.com') {
        return res.json({ success: true, role: 'super_admin', user: { name: 'Kayal - Super Admin', email }, token: access_token });
      }

      // School admin?
      const sr = await req('GET', `/rest/v1/schools?email=eq.${encodeURIComponent(email)}&select=*`);
      if (sr.data && sr.data.length > 0) {
        return res.json({ success: true, role: 'school_admin', user: sr.data[0], token: access_token });
      }

      // Teacher?
      const tr = await req('GET', `/rest/v1/teachers?email=eq.${encodeURIComponent(email)}&select=*,schools(*)`);
      if (tr.data && tr.data.length > 0) {
        return res.json({ success: true, role: 'teacher', user: tr.data[0], token: access_token });
      }

      return res.json({ error: 'Account not found. Contact your administrator.' });
    }

    // ── REGISTER SCHOOL ──
    if (action === 'register_school') {
      const { school_name, email, password, phone, city, subscription_end } = body;

      // Create auth user
      const ar = await req('POST', '/auth/v1/admin/users', {
        email, password, email_confirm: true,
        user_metadata: { role: 'school_admin', school_name }
      });
      if (ar.status !== 200 && ar.status !== 201) {
        const msg = (typeof ar.data === 'object' ? ar.data.message || ar.data.msg || JSON.stringify(ar.data) : ar.data) || 'Failed to create account';
        return res.json({ error: msg });
      }

      // Create school record
      const endDate = subscription_end || new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0];
      const sr = await req('POST', '/rest/v1/schools', {
        name: school_name, email, phone, city,
        subscription_status: 'active',
        subscription_end: endDate
      });
      if (sr.status !== 201) {
        const msg = typeof sr.data === 'object' ? JSON.stringify(sr.data) : sr.data;
        return res.json({ error: 'School record failed: ' + msg });
      }
      return res.json({ success: true, school: Array.isArray(sr.data) ? sr.data[0] : sr.data });
    }

    // ── ADD TEACHER ──
    if (action === 'add_teacher') {
      const { school_id, teacher_name, teacher_email, teacher_password } = body;

      // Create auth user for teacher
      const ar = await req('POST', '/auth/v1/admin/users', {
        email: teacher_email, password: teacher_password,
        email_confirm: true,
        user_metadata: { role: 'teacher', school_id }
      });
      if (ar.status !== 200 && ar.status !== 201) {
        const msg = typeof ar.data === 'object' ? (ar.data.message || ar.data.msg || JSON.stringify(ar.data)) : ar.data;
        return res.json({ error: 'Auth error: ' + msg });
      }

      // Add teacher record
      const tr = await req('POST', '/rest/v1/teachers', {
        school_id, name: teacher_name, email: teacher_email, role: 'teacher'
      });
      if (tr.status !== 201) {
        const msg = typeof tr.data === 'object' ? JSON.stringify(tr.data) : tr.data;
        return res.json({ error: 'Teacher record failed: ' + msg });
      }
      return res.json({ success: true, teacher: Array.isArray(tr.data) ? tr.data[0] : tr.data });
    }

    // ── GET ALL SCHOOLS ──
    if (action === 'get_schools') {
      const r = await req('GET', '/rest/v1/schools?select=*&order=created_at.desc');
      return res.json({ success: true, schools: r.data || [] });
    }

    // ── GET TEACHERS ──
    if (action === 'get_teachers') {
      const r = await req('GET', `/rest/v1/teachers?school_id=eq.${body.school_id}&select=*`);
      return res.json({ success: true, teachers: r.data || [] });
    }

    // ── UPDATE SUBSCRIPTION ──
    if (action === 'update_subscription') {
      const { school_id, status, end_date } = body;
      await req('PATCH', `/rest/v1/schools?id=eq.${school_id}`, {
        subscription_status: status, subscription_end: end_date
      });
      return res.json({ success: true });
    }

    return res.json({ error: 'Unknown action: ' + action });

  } catch(e) {
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
};
