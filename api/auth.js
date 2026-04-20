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
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
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

      if (email === 'sriguruparambarai@gmail.com') {
        return res.json({ success: true, role: 'super_admin', user: { name: 'Kayal - Super Admin', email }, token: access_token });
      }

      const sr = await req('GET', `/rest/v1/schools?email=eq.${encodeURIComponent(email)}&select=*`);
      if (sr.data && sr.data.length > 0) {
        return res.json({ success: true, role: 'school_admin', user: sr.data[0], token: access_token });
      }

      const tr = await req('GET', `/rest/v1/teachers?email=eq.${encodeURIComponent(email)}&select=*,schools(*)`);
      if (tr.data && tr.data.length > 0) {
        return res.json({ success: true, role: 'teacher', user: tr.data[0], token: access_token });
      }

      return res.json({ error: 'Account not found. Contact your administrator.' });
    }

    // ── REGISTER SCHOOL ──
    if (action === 'register_school') {
      const { school_name, email, password, phone, city, subscription_end } = body;

      // Step 1: Check if auth user already exists — delete if so (cleanup from failed attempt)
      const existingUsers = await req('GET', `/auth/v1/admin/users?email=${encodeURIComponent(email)}`);
      if (existingUsers.data && existingUsers.data.users && existingUsers.data.users.length > 0) {
        const existingUserId = existingUsers.data.users[0].id;
        // Check if school record exists for this email
        const existingSchool = await req('GET', `/rest/v1/schools?email=eq.${encodeURIComponent(email)}&select=*`);
        if (existingSchool.data && existingSchool.data.length > 0) {
          return res.json({ error: 'A school with this email already exists.' });
        }
        // Auth user exists but no school record — delete the orphan auth user first
        await req('DELETE', `/auth/v1/admin/users/${existingUserId}`, null);
      }

      // Step 2: Create auth user
      const ar = await req('POST', '/auth/v1/admin/users', {
        email, password, email_confirm: true,
        user_metadata: { role: 'school_admin', school_name }
      });
      if (ar.status !== 200 && ar.status !== 201) {
        const msg = typeof ar.data === 'object'
          ? (ar.data.message || ar.data.msg || JSON.stringify(ar.data))
          : ar.data;
        return res.json({ error: 'Account creation failed: ' + msg });
      }

      // Step 3: Create school record — with retry for schema cache
      const endDate = subscription_end || new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0];
      const schoolData = { name: school_name, email, phone: phone||'', city: city||'', subscription_status: 'active', subscription_end: endDate };

      let sr = await req('POST', '/rest/v1/schools', schoolData);

      // Retry once if schema cache issue
      if (sr.status !== 201) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        sr = await req('POST', '/rest/v1/schools', schoolData);
      }

      if (sr.status !== 201) {
        // Rollback auth user
        if (ar.data && ar.data.id) {
          await req('DELETE', `/auth/v1/admin/users/${ar.data.id}`, null);
        }
        const msg = typeof sr.data === 'object' ? JSON.stringify(sr.data) : sr.data;
        return res.json({ error: 'School record failed: ' + msg });
      }

      return res.json({ success: true, school: Array.isArray(sr.data) ? sr.data[0] : sr.data });
    }

    // ── ADD TEACHER ──
    if (action === 'add_teacher') {
      const { school_id, teacher_name, teacher_email, teacher_password } = body;

      // Check if auth user exists and clean up if orphan
      const existingUsers = await req('GET', `/auth/v1/admin/users?email=${encodeURIComponent(teacher_email)}`);
      if (existingUsers.data && existingUsers.data.users && existingUsers.data.users.length > 0) {
        const existingId = existingUsers.data.users[0].id;
        const existingTeacher = await req('GET', `/rest/v1/teachers?email=eq.${encodeURIComponent(teacher_email)}&select=*`);
        if (existingTeacher.data && existingTeacher.data.length > 0) {
          return res.json({ error: 'A teacher with this email already exists.' });
        }
        await req('DELETE', `/auth/v1/admin/users/${existingId}`, null);
      }

      const ar = await req('POST', '/auth/v1/admin/users', {
        email: teacher_email, password: teacher_password,
        email_confirm: true,
        user_metadata: { role: 'teacher', school_id }
      });
      if (ar.status !== 200 && ar.status !== 201) {
        const msg = typeof ar.data === 'object' ? (ar.data.message || ar.data.msg || JSON.stringify(ar.data)) : ar.data;
        return res.json({ error: 'Account creation failed: ' + msg });
      }

      let tr = await req('POST', '/rest/v1/teachers', {
        school_id, name: teacher_name, email: teacher_email, role: 'teacher'
      });

      if (tr.status !== 201) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        tr = await req('POST', '/rest/v1/teachers', {
          school_id, name: teacher_name, email: teacher_email, role: 'teacher'
        });
      }

      if (tr.status !== 201) {
        if (ar.data && ar.data.id) await req('DELETE', `/auth/v1/admin/users/${ar.data.id}`, null);
        const msg = typeof tr.data === 'object' ? JSON.stringify(tr.data) : tr.data;
        return res.json({ error: 'Teacher record failed: ' + msg });
      }

      return res.json({ success: true, teacher: Array.isArray(tr.data) ? tr.data[0] : tr.data });
    }

    // ── GET ALL SCHOOLS ──
    if (action === 'get_schools') {
      const r = await req('GET', '/rest/v1/schools?select=*&order=created_at.desc');
      return res.json({ success: true, schools: Array.isArray(r.data) ? r.data : [] });
    }

    // ── GET TEACHERS ──
    if (action === 'get_teachers') {
      const r = await req('GET', `/rest/v1/teachers?school_id=eq.${body.school_id}&select=*`);
      return res.json({ success: true, teachers: Array.isArray(r.data) ? r.data : [] });
    }

    // ── UPDATE SUBSCRIPTION ──
    if (action === 'update_subscription') {
      const { school_id, status, end_date } = body;
      await req('PATCH', `/rest/v1/schools?id=eq.${school_id}`, {
        subscription_status: status, subscription_end: end_date
      });
      return res.json({ success: true });
    }

    // ── DELETE ORPHAN AUTH USERS (cleanup tool) ──
    if (action === 'cleanup_user') {
      const { email } = body;
      const users = await req('GET', `/auth/v1/admin/users?email=${encodeURIComponent(email)}`);
      if (users.data && users.data.users && users.data.users.length > 0) {
        await req('DELETE', `/auth/v1/admin/users/${users.data.users[0].id}`, null);
        return res.json({ success: true, message: 'User deleted' });
      }
      return res.json({ success: true, message: 'No user found' });
    }

    return res.json({ error: 'Unknown action: ' + action });

  } catch(e) {
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
};
