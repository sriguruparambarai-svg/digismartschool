// api/voice-config.js
// ElevenLabs voice mapping by class/subject/language
// Change voice IDs from admin settings later

const VOICE_MAP = {
  class_1_3: {
    voice_id: 'EXAVITQu4vr4xnSDxMaL', // Bella — warm, slow, child-friendly
    name: 'Primary Teacher',
    stability: 0.75,
    similarity_boost: 0.85,
    style: 0.20,
    speed: 0.82
  },
  class_4_7: {
    voice_id: 'ThT5KcBeYPX3keUQqHPh', // Dorothy — clear, encouraging
    name: 'Middle School Teacher',
    stability: 0.70,
    similarity_boost: 0.80,
    style: 0.15,
    speed: 0.88
  },
  class_8_10: {
    voice_id: 'TxGEqnHWrfWFTfGW9XjX', // Josh — confident, neutral Indian
    name: 'Senior Teacher',
    stability: 0.65,
    similarity_boost: 0.78,
    style: 0.10,
    speed: 0.92
  },
  class_11_12: {
    voice_id: 'VR6AewLTigWG4xSOukaG', // Arnold — authoritative
    name: 'Higher Secondary Teacher',
    stability: 0.60,
    similarity_boost: 0.75,
    style: 0.08,
    speed: 0.95
  },
  tamil: {
    voice_id: 'pNInz6obpgDQGcFmaJgB', // Adam — works well for Tamil
    name: 'Tamil Teacher',
    stability: 0.80,
    similarity_boost: 0.85,
    style: 0.20,
    speed: 0.82
  }
};

function getVoiceForLesson(cls, subject, lang) {
  if (lang === 'ta') return VOICE_MAP.tamil;
  const num = parseInt((cls || '').match(/\d+/)?.[0] || '7');
  if (num <= 3)  return VOICE_MAP.class_1_3;
  if (num <= 7)  return VOICE_MAP.class_4_7;
  if (num <= 10) return VOICE_MAP.class_8_10;
  return VOICE_MAP.class_11_12;
}

module.exports = { VOICE_MAP, getVoiceForLesson };
