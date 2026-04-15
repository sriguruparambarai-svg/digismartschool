const https = require('https');

module.exports.config = {
  api: { bodyParser: { sizeLimit: '1mb' } }
};

const SUPABASE_URL = 'https://pzxosqukijwpjdlfdfst.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

async function supabase(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'pzxosqukijwpjdlfdfst.supabase.co',
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=representation',
        ...(data && { 'Content-Length': Buffer.byteLength(data) })
      }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function supabaseAuth(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'pzxosqukijwpjdlfdfst.supabase.co',
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, email, password, school_name, phone, city, token } = req.body || {};

  try {
    // LOGIN
    if (action === 'login') {
      const authRes = await supabaseAuth('POST', '/auth/v1/token?grant_type=password', { email, password });
      if (authRes.status !== 200) return res.json({ error: 'Invalid email or password' });

      const { access_token, user } = authRes.data;

      // Get school/teacher info
      const schoolRes = await supabase('GET', `/rest/v1/schools?email=eq.${encodeURIComponent(email)}&select=*`);
      if (schoolRes.data && schoolRes.data.length > 0) {
        const school = schoolRes.data[0];
        return res.json({ success: true, role: 'school_admin', user: school, token: access_token });
      }

      const teacherRes = await supabase('GET', `/rest/v1/teachers?email=eq.${encodeURIComponent(email)}&select=*,schools(*)`);
      if (teacherRes.data && teacherRes.data.length > 0) {
        const teacher = teacherRes.data[0];
        return res.json({ success: true, role: 'teacher', user: teacher, token: access_token });
      }

      // Check super admin
      if (email === 'sriguruparambarai@gmail.com') {
        return res.json({ success: true, role: 'super_admin', user: { name: 'Kayal - Super Admin', email }, token: access_token });
      }

      return res.json({ error: 'Account not found. Contact your administrator.' });
    }

    // REGISTER SCHOOL (super admin only)
    if (action === 'register_school') {
      // Create auth user
      const authRes = await supabaseAuth('POST', '/auth/v1/admin/users', {
        email, password,
        email_confirm: true,
        user_metadata: { role: 'school_admin', school_name }
      });
      if (authRes.status !== 200 && authRes.status !== 201) {
        return res.json({ error: authRes.data.message || 'Failed to create account' });
      }

      // Create school record
      const schoolRes = await supabase('POST', '/rest/v1/schools', {
        name: school_name, email, phone, city,
        subscription_status: 'active',
        subscription_end: req.body.subscription_end || new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]
      });

      if (schoolRes.status !== 201) return res.json({ error: 'Failed to create school record' });
      return res.json({ success: true, school: schoolRes.data[0] });
    }

    // ADD TEACHER
    if (action === 'add_teacher') {
      const { school_id, teacher_name, teacher_email, teacher_password } = req.body;

      const authRes = await supabaseAuth('POST', '/auth/v1/admin/users', {
        email: teacher_email, password: teacher_password,
        email_confirm: true,
        user_metadata: { role: 'teacher', school_id }
      });
      if (authRes.status !== 200 && authRes.status !== 201) {
        return res.json({ error: authRes.data.message || 'Failed to create teacher account' });
      }

      const teacherRes = await supabase('POST', '/rest/v1/teachers', {
        school_id, name: teacher_name, email: teacher_email, role: 'teacher'
      });
      if (teacherRes.status !== 201) return res.json({ error: 'Failed to add teacher' });
      return res.json({ success: true, teacher: teacherRes.data[0] });
    }

    // GET ALL SCHOOLS (super admin)
    if (action === 'get_schools') {
      const r = await supabase('GET', '/rest/v1/schools?select=*&order=created_at.desc');
      return res.json({ success: true, schools: r.data });
    }

    // GET TEACHERS FOR SCHOOL
    if (action === 'get_teachers') {
      const { school_id } = req.body;
      const r = await supabase('GET', `/rest/v1/teachers?school_id=eq.${school_id}&select=*`);
      return res.json({ success: true, teachers: r.data });
    }

    // UPDATE SUBSCRIPTION
    if (action === 'update_subscription') {
      const { school_id, status, end_date } = req.body;
      const r = await supabase('PATCH', `/rest/v1/schools?id=eq.${school_id}`, {
        subscription_status: status, subscription_end: end_date
      });
      return res.json({ success: true });
    }

    return res.json({ error: 'Unknown action' });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
