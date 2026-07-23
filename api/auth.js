const https = require('https');

module.exports.config = { api: { bodyParser: { sizeLimit: '20mb' } } };

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

    // ── REQUEST PASSWORD RESET (send reset email) ──
    if (action === 'request_reset') {
      const { email } = body;
      if (!email) return res.json({ error: 'Please enter your school email.' });
      const redirect = 'https://digismartschool.com/reset-password.html';
      await req('POST', '/auth/v1/recover?redirect_to=' + encodeURIComponent(redirect), { email });
      // Always report success so we never reveal which emails are registered
      return res.json({ success: true });
    }

    // ── CONFIRM PASSWORD RESET (set the new password) ──
    if (action === 'confirm_reset') {
      const { access_token, new_password } = body;
      if (!access_token) return res.json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
      if (!new_password || new_password.length < 6) return res.json({ error: 'Password must be at least 6 characters.' });
      const key = process.env.SUPABASE_SECRET_KEY;
      const result = await new Promise((resolve) => {
        const payload = JSON.stringify({ password: new_password });
        const rq = https.request({
          hostname: HOST,
          path: '/auth/v1/user',
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'apikey': key,
            'Authorization': 'Bearer ' + access_token,
            'Content-Length': Buffer.byteLength(payload)
          }
        }, resp => {
          let d = '';
          resp.on('data', ch => d += ch);
          resp.on('end', () => {
            try { resolve({ status: resp.statusCode, data: d ? JSON.parse(d) : {} }); }
            catch(e) { resolve({ status: resp.statusCode, data: d }); }
          });
        });
        rq.on('error', () => resolve({ status: 0, data: {} }));
        rq.write(payload);
        rq.end();
      });
      if (result.status === 200) return res.json({ success: true });
      return res.json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    }

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
        const school = sr.data[0];

        // ── SUBSCRIPTION EXPIRY CHECK ──
        if (school.subscription_status === 'suspended') {
          return res.json({ error: 'SUBSCRIPTION_SUSPENDED', message: 'Your subscription has been suspended. Please contact DigiSmartSchool support to renew.' });
        }
        if (school.subscription_end) {
          const today = new Date(); today.setHours(0,0,0,0);
          const expiry = new Date(school.subscription_end); expiry.setHours(0,0,0,0);
          if (expiry < today) {
            await req('PATCH', `/rest/v1/schools?id=eq.${school.id}`, { subscription_status: 'expired' });
            const daysAgo = Math.floor((today - expiry) / (1000*60*60*24));
            return res.json({ error: 'SUBSCRIPTION_EXPIRED', message: 'Your subscription expired ' + daysAgo + ' day(s) ago. Please contact DigiSmartSchool to renew.', expiry_date: school.subscription_end });
          }
          const daysLeft = Math.floor((expiry - today) / (1000*60*60*24));
          if (daysLeft <= 7) {
            return res.json({ success: true, role: 'school_admin', user: school, token: access_token, warning: 'Your subscription expires in ' + daysLeft + ' day(s). Please renew to avoid interruption.' });
          }
        }

        return res.json({ success: true, role: 'school_admin', user: school, token: access_token });
      }

      const tr = await req('GET', `/rest/v1/teachers?email=eq.${encodeURIComponent(email)}&select=*,schools(*)`);
      if (tr.data && tr.data.length > 0) {
        const teacher = tr.data[0];
        const teacherSchool = teacher.schools;

        // ── SUBSCRIPTION CHECK FOR TEACHER ──
        if (teacherSchool) {
          if (teacherSchool.subscription_status === 'suspended' || teacherSchool.subscription_status === 'expired') {
            return res.json({ error: 'SUBSCRIPTION_EXPIRED', message: 'Your school subscription has expired. Please ask your principal to contact DigiSmartSchool to renew.' });
          }
          if (teacherSchool.subscription_end) {
            const today = new Date(); today.setHours(0,0,0,0);
            const expiry = new Date(teacherSchool.subscription_end); expiry.setHours(0,0,0,0);
            if (expiry < today) {
              return res.json({ error: 'SUBSCRIPTION_EXPIRED', message: 'Your school subscription has expired. Please ask your principal to renew with DigiSmartSchool.' });
            }
          }
        }

        return res.json({ success: true, role: 'teacher', user: teacher, token: access_token });
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

      // ── TEACHER LIMIT CHECK ──
      // Get school's max_teachers setting
      const schoolR = await req('GET', `/rest/v1/schools?id=eq.${school_id}&select=max_teachers,name`);
      const schoolData = schoolR.data && schoolR.data.length > 0 ? schoolR.data[0] : null;
      const maxTeachers = schoolData ? (parseInt(schoolData.max_teachers) || 5) : 5;

      // Count current teachers for this school
      const countR = await req('GET', `/rest/v1/teachers?school_id=eq.${school_id}&select=id`);
      const currentCount = Array.isArray(countR.data) ? countR.data.length : 0;

      if (currentCount >= maxTeachers) {
        return res.json({
          error: `Teacher limit reached. Your plan allows ${maxTeachers} teacher(s). Currently: ${currentCount}. Please contact DigiSmartSchool to upgrade your plan.`
        });
      }

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

    // ── GET SCHOOL INFO (for dashboard) ──
    if (action === 'get_school_info') {
      const { email, role: userRole } = body;
      if (!email) return res.json({ error: 'Email required' });
      if (userRole === 'teacher') {
        const tr = await req('GET', `/rest/v1/teachers?email=eq.${encodeURIComponent(email)}&select=*,schools(*)`);
        if (tr.data && tr.data.length > 0 && tr.data[0].schools) {
          return res.json({ success: true, school: tr.data[0].schools });
        }
        return res.json({ school: null });
      } else {
        const sr = await req('GET', `/rest/v1/schools?email=eq.${encodeURIComponent(email)}&select=*`);
        if (sr.data && sr.data.length > 0) {
          return res.json({ success: true, school: sr.data[0] });
        }
        return res.json({ school: null });
      }
    }

    // ── ACTIVE LESSONS (TeachBot) ──
    if (action === 'save_active_lesson') {
      const { school_id, class_name, subject, chapter, lesson_text } = body;
      if (!school_id) return res.json({ error: 'school_id required' });
      // Key includes school_id so two schools can have same class without conflict
      const key = school_id + '_' + (class_name||'').replace(/\s+/g,'-').toLowerCase()+'_'+(subject||'').replace(/\s+/g,'-').toLowerCase();
      const payload = {
        class_id: key, class_name, subject, chapter,
        lesson_text: lesson_text||'',
        school_id: school_id,
        updated_at: new Date().toISOString()
      };

      // Check existing record for THIS school only
      const checkR = await req('GET', `/rest/v1/active_lessons?class_id=eq.${encodeURIComponent(key)}&school_id=eq.${encodeURIComponent(school_id)}&select=id`);
      let r;
      if (checkR.data && checkR.data.length > 0) {
        r = await req('PATCH', `/rest/v1/active_lessons?class_id=eq.${encodeURIComponent(key)}&school_id=eq.${encodeURIComponent(school_id)}`, {
          class_name, subject, chapter,
          lesson_text: lesson_text||'',
          updated_at: new Date().toISOString()
        });
      } else {
        r = await req('POST', '/rest/v1/active_lessons', payload);
      }

      if (r.status !== 200 && r.status !== 201 && r.status !== 204) {
        const errMsg = typeof r.data === 'object' ? JSON.stringify(r.data) : r.data;
        console.error('save_active_lesson error:', r.status, errMsg);
        return res.json({ error: 'Failed to save: ' + errMsg });
      }
      return res.json({ success: true });
    }

    if (action === 'delete_active_lesson') {
      const { class_id, school_id } = body;
      // Always scope delete to school — never delete another school's lesson
      const filter = school_id
        ? `/rest/v1/active_lessons?class_id=eq.${encodeURIComponent(class_id)}&school_id=eq.${encodeURIComponent(school_id)}`
        : `/rest/v1/active_lessons?class_id=eq.${encodeURIComponent(class_id)}`;
      await req('DELETE', filter, null);
      return res.json({ success: true });
    }

    if (action === 'get_active_lessons') {
      const { school_id } = body;
      // Always filter by school_id — each school sees only their own lessons
      if (!school_id) return res.json({ success: true, lessons: [] });
      const r = await req('GET', `/rest/v1/active_lessons?school_id=eq.${encodeURIComponent(school_id)}&select=*&order=updated_at.desc`);
      return res.json({ success: true, lessons: Array.isArray(r.data) ? r.data : [] });
    }

    // ── STUDENT LOGIN ──
    if (action === 'student_login') {
      const { school_code, class_name, roll_no } = body;
      if (!school_code || !class_name || !roll_no)
        return res.json({ error: 'Please fill all fields.' });

      // Step 1: Find school by school_code first, then try by id
      let sr = await req('GET',
        `/rest/v1/schools?school_code=eq.${encodeURIComponent(school_code)}&select=id,name,school_code&limit=1`
      );
      // If not found by school_code, try by UUID id
      if (!sr.data || !sr.data.length) {
        sr = await req('GET',
          `/rest/v1/schools?id=eq.${encodeURIComponent(school_code)}&select=id,name,school_code&limit=1`
        );
      }
      if (!sr.data || !sr.data.length)
        return res.json({ error: 'School code not found. Please check with your teacher.' });

      const school = sr.data[0];

      // Step 2: Find student in diary_students
      const dr = await req('GET',
        `/rest/v1/diary_students?school_id=eq.${school.id}&class=eq.${encodeURIComponent(class_name)}&roll_no=eq.${encodeURIComponent(roll_no)}&select=*&limit=1`
      );
      if (!dr.data || !dr.data.length)
        return res.json({ error: 'Roll number '+roll_no+' not found in '+class_name+'. Ask your teacher to add you.' });

      return res.json({
        success: true,
        school_name: school.name,
        student: dr.data[0]
      });
    }

    // ── GET REPORT CARDS (for parent/student diary view) ──
    if (action === 'get_report_cards') {
      const { school_id, roll_no } = body;
      if (!school_id || !roll_no)
        return res.json({ error: 'school_id and roll_no required' });

      // report_cards is saved with school_code (text), student session has school_id (UUID) — resolve it
      const sr = await req('GET',
        `/rest/v1/schools?id=eq.${encodeURIComponent(school_id)}&select=school_code&limit=1`
      );
      if (!sr.data || !sr.data.length)
        return res.json({ success: true, report_cards: [] });

      const schoolCode = sr.data[0].school_code;
      if (!schoolCode) return res.json({ success: true, report_cards: [] });

      const rr = await req('GET',
        `/rest/v1/report_cards?school_code=eq.${encodeURIComponent(schoolCode)}&roll_no=eq.${encodeURIComponent(roll_no)}&select=*&order=created_at.desc`
      );

      return res.json({ success: true, report_cards: rr.data || [] });
    }

    // ── DIARY STUDENT OPERATIONS ──
    if (action === 'add_diary_student') {
      const { school_id, class_name, roll_no, name } = body;
      if (!school_id || !class_name || !roll_no || !name)
        return res.json({ error: 'Missing fields' });
      const r = await req('POST', '/rest/v1/diary_students', {
        school_id, class: class_name, roll_no, name
      });
      if (r.status === 201 || r.status === 200) {
        return res.json({ success: true });
      }
      // Try upsert if duplicate
      if (r.status === 409 || (r.data && r.data.code === '23505')) {
        const u = await req('PATCH',
          `/rest/v1/diary_students?school_id=eq.${school_id}&class=eq.${encodeURIComponent(class_name)}&roll_no=eq.${encodeURIComponent(roll_no)}`,
          { name }
        );
        return res.json({ success: true });
      }
      const msg = typeof r.data === 'object' ? JSON.stringify(r.data) : r.data;
      return res.json({ error: 'Failed to add student: ' + msg });
    }

    if (action === 'bulk_add_diary_students') {
      const { school_id, class_name, students } = body;
      if (!school_id || !class_name || !students || !students.length)
        return res.json({ error: 'Missing fields' });
      const rows = students.map(s => ({
        school_id, class: class_name, roll_no: s.roll_no, name: s.name
      }));
      // Insert in batches of 20
      const batchSize = 20;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        await req('POST', '/rest/v1/diary_students?on_conflict=school_id,class,roll_no', batch);
      }
      return res.json({ success: true, count: rows.length });
    }

    if (action === 'get_diary_students') {
      const { school_id } = body;
      if (!school_id) return res.json({ students: [] });
      const r = await req('GET',
        `/rest/v1/diary_students?school_id=eq.${school_id}&select=*&order=class.asc,roll_no.asc`
      );
      return res.json({ success: true, students: Array.isArray(r.data) ? r.data : [] });
    }

    if (action === 'delete_diary_student') {
      const { id } = body;
      if (!id) return res.json({ error: 'ID required' });
      await req('DELETE', `/rest/v1/diary_students?id=eq.${id}`, null);
      return res.json({ success: true });
    }

    // ── GET DIARY ENTRIES FOR STUDENT ──
    if (action === 'get_diary_entries') {
      const { school_id, class_name } = body;
      if (!school_id || !class_name) return res.json({ entries: [] });
      const r = await req('GET',
        `/rest/v1/diary_entries?school_id=eq.${encodeURIComponent(school_id)}&class_name=eq.${encodeURIComponent(class_name)}&select=*&order=lesson_date.desc&limit=60`
      );
      return res.json({ success: true, entries: Array.isArray(r.data) ? r.data : [] });
    }

    // ── UPDATE SUBSCRIPTION ──
    if (action === 'update_subscription') {
      const { school_id, status, end_date, max_teachers } = body;
      const updatePayload = {
        subscription_status: status,
        subscription_end: end_date
      };
      // Save max_teachers if provided
      if (max_teachers) updatePayload.max_teachers = parseInt(max_teachers);
      await req('PATCH', `/rest/v1/schools?id=eq.${school_id}`, updatePayload);
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

    // ── TEXTBOOK LIBRARY ──
    // admin.html calls: tblDB(table, 'GET'/'POST'/'DELETE', body, params)
    // which sends: { action:'tbl_get'/'tbl_post'/'tbl_delete', table, body, params }

    if (action === 'tbl_get') {
      // table = 'textbook_library' or 'textbook_chapters' or 'school_library_access'
      const table = body.table || 'textbook_library';
      const params = body.params ? '?' + body.params : '?select=*&order=created_at.desc';
      const r = await req('GET', '/rest/v1/' + table + params);
      return res.json(Array.isArray(r.data) ? r.data : (r.data || []));
    }

    if (action === 'tbl_post') {
      const table = body.table || 'textbook_library';
      const payload = body.body || {};
      // Generate id if missing (for textbook_library)
      if (table === 'textbook_library' && !payload.id) {
        payload.id = 'tbl_' + Date.now();
      }
      const r = await req('POST', '/rest/v1/' + table, payload);
      if (r.status === 201 || r.status === 200) return res.json({ success: true, data: r.data });
      const msg = typeof r.data === 'object' ? JSON.stringify(r.data) : r.data;
      return res.json({ error: 'Save failed: ' + msg });
    }

    if (action === 'tbl_delete') {
      const table = body.table || 'textbook_library';
      const params = body.params ? '?' + body.params : '';
      if (!params) return res.json({ error: 'Delete filter required' });
      await req('DELETE', '/rest/v1/' + table + params, null);
      return res.json({ success: true });
    }

    // ── SCHOOL LIBRARY ACCESS ──
    if (action === 'lib_access_get') {
      const r = await req('GET', '/rest/v1/school_library_access?select=school_id');
      return res.json({ success: true, access: Array.isArray(r.data) ? r.data : [] });
    }

    if (action === 'lib_access_toggle') {
      const { school_id, grant } = body;
      if (!school_id) return res.json({ error: 'school_id required' });
      if (grant) {
        await req('POST', '/rest/v1/school_library_access?on_conflict=school_id',
          { school_id, granted_by: 'super_admin', granted_at: new Date().toISOString() });
      } else {
        await req('DELETE', `/rest/v1/school_library_access?school_id=eq.${encodeURIComponent(school_id)}`, null);
      }
      return res.json({ success: true });
    }

    // ── SCHOOL CONTENT SOURCES (Text-based / Samacheer / Image-based) ──
    // Returns which of the three upload sources this school is allowed to use.
    if (action === 'get_school_sources') {
      const { school_id } = body;
      if (!school_id) return res.json({ success: true, has_text_upload: true, has_samacheer: false, has_image_upload: false });
      const sr = await req('GET', '/rest/v1/schools?id=eq.' + encodeURIComponent(school_id) + '&select=has_text_upload,has_image_upload');
      const row = (sr.data && sr.data[0]) || {};
      const lr = await req('GET', '/rest/v1/school_library_access?school_id=eq.' + encodeURIComponent(school_id) + '&select=school_id&limit=1');
      const hasSam = Array.isArray(lr.data) && lr.data.length > 0;
      return res.json({
        success: true,
        has_text_upload: row.has_text_upload !== false,
        has_samacheer: hasSam,
        has_image_upload: row.has_image_upload === true
      });
    }

    // Admin flips a text-based or image-based source on/off for one school.
    if (action === 'set_school_source') {
      const { school_id, source, enabled } = body;
      if (!school_id || !source) return res.json({ error: 'school_id and source required' });
      const col = source === 'text' ? 'has_text_upload' : (source === 'image' ? 'has_image_upload' : null);
      if (!col) return res.json({ error: 'invalid source' });
      const patch = {}; patch[col] = !!enabled;
      const r = await req('PATCH', '/rest/v1/schools?id=eq.' + encodeURIComponent(school_id), patch);
      if (r.status === 200 || r.status === 204) return res.json({ success: true });
      const msg = typeof r.data === 'object' ? JSON.stringify(r.data) : r.data;
      return res.json({ error: 'Update failed: ' + msg });
    }

    // ── IMAGE-BASED CHAPTERS (scanned PDF read once by AI Vision, reused by all teachers) ──
    if (action === 'save_image_chapter') {
      const { school_id, class_name, subject, chapter_number, chapter_title, extracted_text, page_count } = body;
      if (!school_id || !class_name || !subject || !extracted_text) {
        return res.json({ error: 'Missing required fields (school_id, class_name, subject, extracted_text).' });
      }
      const payload = {
        id: 'imgch_' + Date.now(),
        school_id, class_name, subject,
        chapter_number: chapter_number || '',
        chapter_title: chapter_title || '',
        extracted_text,
        page_count: page_count || 0,
        created_at: new Date().toISOString()
      };
      const r = await req('POST', '/rest/v1/school_image_chapters', payload);
      if (r.status === 201 || r.status === 200) return res.json({ success: true, chapter: (r.data && r.data[0]) || payload });
      const msg = typeof r.data === 'object' ? JSON.stringify(r.data) : r.data;
      return res.json({ error: 'Save failed: ' + msg });
    }

    if (action === 'get_image_chapters') {
      const { school_id } = body;
      if (!school_id) return res.json({ success: true, chapters: [] });
      const r = await req('GET', '/rest/v1/school_image_chapters?school_id=eq.' + encodeURIComponent(school_id) + '&select=*&order=created_at.desc');
      return res.json({ success: true, chapters: Array.isArray(r.data) ? r.data : [] });
    }

    if (action === 'delete_image_chapter') {
      const { chapter_id } = body;
      if (!chapter_id) return res.json({ error: 'chapter_id required' });
      await req('DELETE', '/rest/v1/school_image_chapters?id=eq.' + encodeURIComponent(chapter_id), null);
      return res.json({ success: true });
    }

    // ── SAVE BOOK RECORD (after browser uploads PDF directly to storage) ──
    if (action === 'save_book_record') {
      const { school_id, book_name, class_name, term, pdf_url, file_path, uploaded_by } = body;
      if (!school_id || !book_name || !class_name || !term || !pdf_url) {
        return res.json({ error: 'Missing required fields.' });
      }
      const saveRes = await req('POST', '/rest/v1/school_books', {
        school_id, book_name, class_name, term, pdf_url,
        file_path: file_path || '',
        uploaded_by: uploaded_by || ''
      });
      if (saveRes.status !== 201) {
        const msg = typeof saveRes.data === 'object' ? JSON.stringify(saveRes.data) : saveRes.data;
        return res.json({ error: 'Save failed: ' + msg });
      }
      return res.json({ success: true, book: Array.isArray(saveRes.data) ? saveRes.data[0] : saveRes.data });
    }

    // ── UPLOAD BOOK TO SUPABASE STORAGE ──
    if (action === 'upload_book') {
      const { school_id, book_name, class_name, term, file_base64, file_name } = body;
      if (!school_id || !book_name || !class_name || !term || !file_base64) {
        return res.json({ error: 'Missing required fields.' });
      }

      const key = process.env.SUPABASE_SECRET_KEY;
      const fileBuffer = Buffer.from(file_base64, 'base64');
      const filePath = school_id + '/' + class_name.replace(/\s+/g, '-') + '_term' + term + '_' + Date.now() + '.pdf';

      // Upload PDF to storage bucket using service key (bypasses RLS)
      await new Promise((resolve, reject) => {
        const opts = {
          hostname: HOST,
          path: '/storage/v1/object/school-books/' + filePath,
          method: 'POST',
          headers: {
            'Content-Type': 'application/pdf',
            'apikey': key,
            'Authorization': 'Bearer ' + key,
            'x-upsert': 'true',
            'Content-Length': fileBuffer.length
          }
        };
        const r = https.request(opts, response => {
          let d = '';
          response.on('data', c => d += c);
          response.on('end', () => {
            if (response.statusCode >= 200 && response.statusCode < 300) {
              resolve(d);
            } else {
              reject(new Error('Storage upload failed: ' + d));
            }
          });
        });
        r.on('error', reject);
        r.write(fileBuffer);
        r.end();
      });

      const pdfUrl = 'https://' + HOST + '/storage/v1/object/public/school-books/' + filePath;

      // Save book record to school_books table
      const saveRes = await req('POST', '/rest/v1/school_books', {
        school_id,
        book_name,
        class_name,
        term,
        pdf_url: pdfUrl,
        file_path: filePath,
        uploaded_by: body.uploaded_by || ''
      });

      if (saveRes.status !== 201) {
        const msg = typeof saveRes.data === 'object' ? JSON.stringify(saveRes.data) : saveRes.data;
        return res.json({ error: 'Book record save failed: ' + msg });
      }

      return res.json({ success: true, pdf_url: pdfUrl, book: Array.isArray(saveRes.data) ? saveRes.data[0] : saveRes.data });
    }

    // ── GET SCHOOL BOOKS ──
    if (action === 'get_school_books') {
      const { school_id } = body;
      if (!school_id) return res.json({ books: [] });
      const r = await req('GET', '/rest/v1/school_books?school_id=eq.' + encodeURIComponent(school_id) + '&select=*&order=created_at.desc');
      return res.json({ success: true, books: Array.isArray(r.data) ? r.data : [] });
    }

    // ── DELETE SCHOOL BOOK ──
    if (action === 'delete_school_book') {
      const { book_id, file_path } = body;
      if (!book_id) return res.json({ error: 'book_id required' });

      // Delete from storage if file_path provided
      if (file_path) {
        const key = process.env.SUPABASE_SECRET_KEY;
        await new Promise((resolve) => {
          const opts = {
            hostname: HOST,
            path: '/storage/v1/object/school-books/' + file_path,
            method: 'DELETE',
            headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
          };
          const r = https.request(opts, res2 => { res2.on('data', () => {}); res2.on('end', resolve); });
          r.on('error', resolve);
          r.end();
        });
      }

      // Delete from table
      await req('DELETE', '/rest/v1/school_books?id=eq.' + encodeURIComponent(book_id), null);
      return res.json({ success: true });
    }

    // ── SAVE DIARY ENTRY (Book Back Answers, Homework Diary — server-side, safe) ──
    if (action === 'save_diary_entry') {
      const { school_id, class_name, subject, lesson_title, lesson_date, class_notes, homework, announcements, book_back_answers, voice_url } = body;
      if (!school_id || !class_name || !subject || !lesson_date) {
        return res.json({ error: 'Missing required fields (school_id, class_name, subject, lesson_date).' });
      }

      const checkR = await req('GET',
        `/rest/v1/diary_entries?school_id=eq.${encodeURIComponent(school_id)}&class_name=eq.${encodeURIComponent(class_name)}&subject=eq.${encodeURIComponent(subject)}&lesson_date=eq.${encodeURIComponent(lesson_date)}&select=id&limit=1`
      );

      const payload = {
        school_id, class_name, subject,
        lesson_title: lesson_title || (subject + ' — ' + lesson_date),
        lesson_date,
        updated_at: new Date().toISOString()
      };
      if (class_notes !== undefined) payload.class_notes = class_notes;
      if (homework !== undefined) payload.homework = homework;
      if (announcements !== undefined) payload.announcements = announcements;
      if (book_back_answers !== undefined) payload.book_back_answers = book_back_answers;
      if (voice_url !== undefined) payload.voice_url = voice_url;

      let r;
      if (checkR.data && checkR.data.length > 0) {
        r = await req('PATCH', `/rest/v1/diary_entries?id=eq.${checkR.data[0].id}`, payload);
      } else {
        r = await req('POST', '/rest/v1/diary_entries', payload);
      }

      if (r.status !== 200 && r.status !== 201 && r.status !== 204) {
        const msg = typeof r.data === 'object' ? JSON.stringify(r.data) : r.data;
        return res.json({ error: 'Save failed: ' + msg });
      }
      return res.json({ success: true });
    }

    // ── UPLOAD DIARY VOICE MESSAGE (teacher's recorded voice note for parents) ──
    if (action === 'upload_diary_voice') {
      const { school_id, file_base64 } = body;
      if (!school_id || !file_base64) {
        return res.json({ error: 'Missing required fields (school_id, file_base64).' });
      }

      const key = process.env.SUPABASE_SECRET_KEY;
      const fileBuffer = Buffer.from(file_base64, 'base64');
      const filePath = school_id + '/voice_' + Date.now() + '.webm';

      await new Promise((resolve, reject) => {
        const opts = {
          hostname: HOST,
          path: '/storage/v1/object/diary-voice/' + filePath,
          method: 'POST',
          headers: {
            'Content-Type': 'audio/webm',
            'apikey': key,
            'Authorization': 'Bearer ' + key,
            'x-upsert': 'true',
            'Content-Length': fileBuffer.length
          }
        };
        const r = https.request(opts, response => {
          let d = '';
          response.on('data', c => d += c);
          response.on('end', () => {
            if (response.statusCode >= 200 && response.statusCode < 300) resolve(d);
            else reject(new Error('Voice upload failed: ' + d));
          });
        });
        r.on('error', reject);
        r.write(fileBuffer);
        r.end();
      });

      const voiceUrl = 'https://' + HOST + '/storage/v1/object/public/diary-voice/' + filePath;
      return res.json({ success: true, voice_url: voiceUrl });
    }

    return res.json({ error: 'Unknown action: ' + action });

  } catch(e) {
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
};
