// api/regenerate-audio.js
// Admin endpoint — force regenerate audio for a lesson
// Used when teacher changes voice or wants fresh audio

const { createClient } = require('@supabase/supabase-js');
const { getVoiceForLesson } = require('./voice-config');
const { generateAndStoreSingle } = require('./generate-lesson-audio');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { lesson_id, paragraph_id, cls, subject, lang, action } = req.body || {};
  if (!lesson_id) return res.status(400).json({ error: 'lesson_id required' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
  );

  const voice = getVoiceForLesson(cls, subject, lang);

  if (action === 'delete') {
    // Delete all cached audio for lesson
    await supabase.from('lesson_audio_cache').delete().eq('lesson_id', lesson_id);
    // Delete from storage
    const { data: files } = await supabase.storage.from('lesson-audio').list(lesson_id);
    if (files?.length) {
      const paths = files.map(f => `${lesson_id}/${f.name}`);
      await supabase.storage.from('lesson-audio').remove(paths);
    }
    return res.status(200).json({ message: 'Audio cache deleted for lesson ' + lesson_id });
  }

  if (paragraph_id) {
    // Regenerate single paragraph
    const { data: para } = await supabase
      .from('lesson_audio_cache')
      .select('*')
      .eq('lesson_id', lesson_id)
      .eq('paragraph_id', paragraph_id)
      .single();

    if (!para) return res.status(404).json({ error: 'Paragraph not found' });

    await supabase
      .from('lesson_audio_cache')
      .update({ status: 'pending' })
      .eq('id', para.id);

    res.status(200).json({ message: 'Regenerating paragraph ' + paragraph_id });
    generateAndStoreSingle(supabase, { ...para, status: 'pending' }, voice).catch(console.error);

  } else {
    // Regenerate all paragraphs for lesson
    await supabase
      .from('lesson_audio_cache')
      .update({ status: 'pending', audio_url: null })
      .eq('lesson_id', lesson_id);

    const { data: pending } = await supabase
      .from('lesson_audio_cache')
      .select('*')
      .eq('lesson_id', lesson_id)
      .order('paragraph_order');

    res.status(200).json({ message: 'Regenerating all audio', count: pending?.length || 0 });

    // Background generation
    (async () => {
      for (const para of (pending || [])) {
        try {
          await generateAndStoreSingle(supabase, { ...para, status: 'pending' }, voice);
          await new Promise(r => setTimeout(r, 400));
        } catch (e) { console.error(e.message); }
      }
    })().catch(console.error);
  }
};
