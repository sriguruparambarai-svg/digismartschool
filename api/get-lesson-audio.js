// api/get-lesson-audio.js
// Called by teaching mode to fetch cached audio URLs for a lesson

const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const { lesson_id } = req.query;
  if (!lesson_id) return res.status(400).json({ error: 'lesson_id required' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
  );

  const { data, error } = await supabase
    .from('lesson_audio_cache')
    .select('paragraph_id, paragraph_order, paragraph_text, audio_url, status, audio_duration')
    .eq('lesson_id', lesson_id)
    .order('paragraph_order');

  if (error) return res.status(500).json({ error: error.message });

  const total = data?.length || 0;
  const ready = data?.filter(p => p.status === 'ready').length || 0;
  const pending = data?.filter(p => p.status === 'pending').length || 0;
  const generating = data?.filter(p => p.status === 'generating').length || 0;

  return res.status(200).json({
    lesson_id,
    paragraphs: data || [],
    summary: { total, ready, pending, generating }
  });
};
