// api/generate-lesson-audio.js
// Called when teacher saves a lesson — queues audio generation
// Fire-and-forget: returns immediately, generates in background

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { getVoiceForLesson } = require('./voice-config');

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
  );
}

function hashText(text) {
  return crypto.createHash('md5').update((text || '').trim()).digest('hex');
}

function splitParagraphs(text) {
  if (!text) return [];
  return text
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .map(p => p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 20 && !p.match(/^\d+$/));
}

async function upsertParagraphs(supabase, lesson_id, paragraphs, voice) {
  const results = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const text = paragraphs[i];
    const paragraph_id = `${lesson_id}_p${i + 1}`;
    const hash = hashText(text);

    // Check if exists
    const { data: existing } = await supabase
      .from('lesson_audio_cache')
      .select('id, cache_hash, status, audio_url')
      .eq('lesson_id', lesson_id)
      .eq('paragraph_id', paragraph_id)
      .maybeSingle();

    if (existing) {
      if (existing.cache_hash === hash && existing.status === 'ready') {
        // Unchanged and already generated — skip
        results.push({ ...existing, skipped: true });
        continue;
      }
      // Text changed or failed — re-queue
      await supabase
        .from('lesson_audio_cache')
        .update({
          paragraph_text: text,
          paragraph_order: i + 1,
          cache_hash: hash,
          voice_id: voice.voice_id,
          status: 'pending',
          audio_url: null,
          error_message: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
      results.push({ id: existing.id, status: 'pending' });
    } else {
      // New paragraph
      const { data: inserted } = await supabase
        .from('lesson_audio_cache')
        .insert({
          lesson_id,
          paragraph_id,
          paragraph_order: i + 1,
          paragraph_text: text,
          cache_hash: hash,
          voice_id: voice.voice_id,
          status: 'pending'
        })
        .select('id')
        .single();
      results.push({ id: inserted?.id, status: 'pending' });
    }
  }
  return results;
}

async function generateAllPending(supabase, lesson_id, voice) {
  const { data: pending } = await supabase
    .from('lesson_audio_cache')
    .select('*')
    .eq('lesson_id', lesson_id)
    .eq('status', 'pending')
    .order('paragraph_order');

  if (!pending?.length) return;

  for (const para of pending) {
    try {
      await generateAndStoreSingle(supabase, para, voice);
      await new Promise(r => setTimeout(r, 400)); // rate limit buffer
    } catch (e) {
      console.error(`Para ${para.paragraph_id} failed:`, e.message);
    }
  }
}

async function generateAndStoreSingle(supabase, para, voice) {
  // Mark generating
  await supabase
    .from('lesson_audio_cache')
    .update({ status: 'generating' })
    .eq('id', para.id);

  // Call ElevenLabs
  const elResp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice.voice_id}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text: para.paragraph_text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: voice.stability,
          similarity_boost: voice.similarity_boost,
          style: voice.style || 0,
          use_speaker_boost: true
        }
      })
    }
  );

  if (!elResp.ok) {
    const errText = await elResp.text().catch(() => '');
    throw new Error(`ElevenLabs ${elResp.status}: ${errText.slice(0, 200)}`);
  }

  const audioBuffer = Buffer.from(await elResp.arrayBuffer());

  // Upload to Supabase Storage bucket: lesson-audio
  const storagePath = `${para.lesson_id}/${para.paragraph_id}.mp3`;
  const { error: uploadErr } = await supabase.storage
    .from('lesson-audio')
    .upload(storagePath, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: true,
      cacheControl: '31536000' // 1 year cache
    });

  if (uploadErr) throw new Error(`Storage upload: ${uploadErr.message}`);

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('lesson-audio')
    .getPublicUrl(storagePath);

  // Update cache record
  await supabase
    .from('lesson_audio_cache')
    .update({
      status: 'ready',
      audio_url: urlData.publicUrl,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', para.id);
}

// Export helper for other modules
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { lesson_id, lesson_text, cls, subject, lang } = req.body || {};
  if (!lesson_id || !lesson_text) {
    return res.status(400).json({ error: 'lesson_id and lesson_text required' });
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured in Vercel' });
  }

  const supabase = getSupabase();
  const voice = getVoiceForLesson(cls, subject, lang);
  const paragraphs = splitParagraphs(lesson_text);

  if (!paragraphs.length) {
    return res.status(400).json({ error: 'No paragraphs found in lesson text' });
  }

  // Queue paragraphs (fast — just DB writes)
  await upsertParagraphs(supabase, lesson_id, paragraphs, voice);

  // Return immediately — generate audio in background
  res.status(200).json({
    message: 'Audio generation queued',
    lesson_id,
    paragraphs: paragraphs.length,
    voice: voice.name
  });

  // Background generation (after response sent)
  generateAllPending(supabase, lesson_id, voice).catch(console.error);
};

module.exports.generateAndStoreSingle = generateAndStoreSingle;
module.exports.splitParagraphs = splitParagraphs;
