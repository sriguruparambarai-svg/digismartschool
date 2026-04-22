/**
 * ═══════════════════════════════════════════════════════════
 * DigiSmartSchool — Multilingual AI Voice Engine v2.0
 * Tamil + English Code-Switching | Math TTS | SSML | Neural
 * ═══════════════════════════════════════════════════════════
 *
 * USAGE (include in any page):
 *   <script src="voice-engine.js"></script>
 *
 *   // Speak anything:
 *   DSVoice.speak("இன்று நாம் fractions பற்றி கற்போம்");
 *   DSVoice.speak("x² + 5x + 6 = 0", { mode: 'teaching' });
 *   DSVoice.speak("Great work!", { mode: 'feedback', lang: 'english' });
 *
 *   // Stop:
 *   DSVoice.stop();
 *
 *   // Configure:
 *   DSVoice.setLevel('beginner');   // slower speech
 *   DSVoice.setLevel('advanced');   // normal speed
 */

(function(global) {
'use strict';

// ══════════════════════════════════════════════════
// VOICE MODE PROFILES
// Controls rate, pitch and style per teaching context
// ══════════════════════════════════════════════════
const VOICE_MODES = {
  teaching: {
    rate: 0.78,          // slow and clear
    pitch: 1.0,
    description: 'Calm, slow, clear — for explaining new concepts',
    ssmlRate: 'slow',
    pauseAfterSentence: 500,  // ms
    emphasisLevel: 'moderate'
  },
  storytelling: {
    rate: 0.9,           // expressive, natural
    pitch: 1.05,
    description: 'Expressive — for history stories, narratives',
    ssmlRate: 'medium',
    pauseAfterSentence: 350,
    emphasisLevel: 'strong'
  },
  instruction: {
    rate: 0.92,          // slightly faster, crisp
    pitch: 1.0,
    description: 'Crisp — for step-by-step instructions',
    ssmlRate: 'medium',
    pauseAfterSentence: 300,
    emphasisLevel: 'moderate'
  },
  feedback: {
    rate: 0.88,          // friendly, warm
    pitch: 1.08,         // slightly higher = warmer
    description: 'Friendly tone — for praise and corrections',
    ssmlRate: 'medium',
    pauseAfterSentence: 300,
    emphasisLevel: 'moderate'
  },
  revision: {
    rate: 0.82,          // slow for memorising
    pitch: 1.0,
    description: 'Slow and clear — for revision and flashcards',
    ssmlRate: 'slow',
    pauseAfterSentence: 600,
    emphasisLevel: 'strong'
  },
  quiz: {
    rate: 0.90,          // clear, not rushed
    pitch: 1.0,
    description: 'Clear — for quiz questions',
    ssmlRate: 'medium',
    pauseAfterSentence: 400,
    emphasisLevel: 'none'
  }
};

// ══════════════════════════════════════════════════
// STUDENT LEVEL — adjusts speed
// ══════════════════════════════════════════════════
const LEVEL_SPEED = {
  beginner:     0.82,   // extra slow
  intermediate: 0.90,   // normal
  advanced:     1.00    // full speed
};

// ══════════════════════════════════════════════════
// MATHS CONVERSION ENGINE
// Converts equations/symbols → spoken student-friendly form
// ══════════════════════════════════════════════════
const MathTTS = {

  // Ordered rule pairs: [regex, replacement]
  // Order matters — more specific patterns first
  RULES: [

    // ── FRACTIONS ──
    [/(\d+)\s*\/\s*(\d+)/g, (_, n, d) => `${MathTTS.ordinal(n)} by ${MathTTS.numWord(d)}`],
    [/1\/2/g, 'one by two'],
    [/1\/3/g, 'one by three'],
    [/1\/4/g, 'one by four'],
    [/3\/4/g, 'three by four'],

    // ── SQUARE ROOTS ──
    [/√\(([^)]+)\)/g, (_, e) => `square root of ${e}`],
    [/√(\d+)/g, (_, n) => `square root of ${n}`],
    [/sqrt\(([^)]+)\)/gi, (_, e) => `square root of ${e}`],

    // ── POWERS / EXPONENTS ──
    [/([a-zA-Z0-9]+)\^2/g, (_, b) => `${b} squared`],
    [/([a-zA-Z0-9]+)\^3/g, (_, b) => `${b} cubed`],
    [/([a-zA-Z0-9]+)\^(-?\d+)/g, (_, b, e) => `${b} to the power ${e}`],
    [/([a-zA-Z0-9]+)²/g, (_, b) => `${b} squared`],
    [/([a-zA-Z0-9]+)³/g, (_, b) => `${b} cubed`],
    [/\^2\b/g, ' squared'],
    [/\^3\b/g, ' cubed'],
    [/\^(\d+)/g, (_, e) => ` to the power ${e}`],
    [/²/g, ' squared'],
    [/³/g, ' cubed'],

    // ── SUBSCRIPTS ──
    [/([a-zA-Z])_(\d+)/g, (_, v, n) => `${v} subscript ${n}`],
    [/([a-zA-Z])_\{([^}]+)\}/g, (_, v, n) => `${v} sub ${n}`],

    // ── OPERATORS (space-safe) ──
    [/\s*\+\s*/g, ' plus '],
    [/\s*−\s*/g, ' minus '],           // unicode minus
    [/\s*-\s*(?=\d)/g, ' minus '],     // hyphen before digit
    [/\s*×\s*/g, ' multiplied by '],
    [/\s*÷\s*/g, ' divided by '],
    [/\s*\*\s*/g, ' multiplied by '],
    [/\s*\/\s*/g, ' divided by '],

    // ── COMPARISONS ──
    [/\s*=\s*/g, ' equals '],
    [/≠/g, ' is not equal to '],
    [/≤/g, ' less than or equal to '],
    [/≥/g, ' greater than or equal to '],
    [/<(?!=)/g, ' is less than '],
    [/>(?!=)/g, ' is greater than '],

    // ── GREEK / SPECIAL ──
    [/π/g, ' pi '],
    [/θ/g, ' theta '],
    [/α/g, ' alpha '],
    [/β/g, ' beta '],
    [/γ/g, ' gamma '],
    [/Δ/g, ' delta '],
    [/λ/g, ' lambda '],
    [/∑/g, ' sum of '],
    [/∫/g, ' integral of '],
    [/∞/g, ' infinity '],
    [/°/g, ' degrees '],
    [/%/g, ' percent '],

    // ── PARENTHESES (cleanup) ──
    [/\(\s*/g, ' open bracket '],
    [/\s*\)/g, ' close bracket '],

    // ── PHYSICS / SCIENCE ──
    [/F\s*=\s*ma/g, 'F equals m a'],
    [/V\s*=\s*IR/g, 'V equals I R'],
    [/E\s*=\s*mc²/g, 'E equals m c squared'],
    [/v\s*=\s*u\s*\+\s*at/g, 'v equals u plus a t'],
    [/\bm\/s\b/g, ' metres per second'],
    [/\bkm\/h\b/g, ' kilometres per hour'],
    [/\bm\/s²\b/g, ' metres per second squared'],
    [/\bN\b/g, ' Newtons'],
    [/\bJ\b/g, ' Joules'],
    [/\bW\b/g, ' Watts'],
    [/\bΩ\b/g, ' Ohms'],

    // ── CLEANUP ──
    [/\s{2,}/g, ' ']
  ],

  // Convert a number to ordinal word (for fractions)
  ordinal(n) {
    const nums = { 1:'one',2:'two',3:'three',4:'four',5:'five',
                   6:'six',7:'seven',8:'eight',9:'nine',10:'ten' };
    return nums[parseInt(n)] || n;
  },

  numWord(n) {
    const words = {
      2:'two', 3:'three', 4:'four', 5:'five', 6:'six',
      7:'seven', 8:'eight', 9:'nine', 10:'ten', 12:'twelve',
      100:'hundred', 1000:'thousand'
    };
    return words[parseInt(n)] || n;
  },

  // Main conversion function
  convert(text) {
    if (!text) return '';
    let result = String(text);

    // Detect if it looks like a math expression
    const hasMath = /[+\-×÷=²³√πθ^<>≤≥∑%°]/u.test(result) ||
                    /\d+\/\d+/.test(result) ||
                    /[a-zA-Z]\^/.test(result) ||
                    /sqrt\(/.test(result);

    if (!hasMath) return result;

    // Apply all rules in order
    for (const [pattern, replacement] of MathTTS.RULES) {
      if (typeof replacement === 'function') {
        result = result.replace(pattern, replacement);
      } else {
        result = result.replace(pattern, replacement);
      }
    }

    return result.trim();
  },

  // Test the converter (for debugging)
  test() {
    const tests = [
      ['2 + 3 = 5', 'two plus three equals five'],
      ['x² + 5x + 6 = 0', 'x squared plus five x plus six equals zero'],
      ['1/2', 'one by two'],
      ['√16', 'square root of sixteen'],
      ['F = ma', 'F equals m a'],
      ['3/4 + 1/4 = 1', 'three by four plus one by four equals one'],
      ['y = mx + c', 'y equals mx plus c'],
      ['a² + b² = c²', 'a squared plus b squared equals c squared'],
    ];
    console.group('MathTTS Test Results');
    tests.forEach(([input, expected]) => {
      const result = MathTTS.convert(input);
      const pass = result.trim().toLowerCase().includes(expected.toLowerCase().split(' ')[0]);
      console.log(pass ? '✅' : '❌', `"${input}" → "${result}"`);
    });
    console.groupEnd();
  }
};

// ══════════════════════════════════════════════════
// LANGUAGE DETECTOR
// Detects Tamil, English, or Mixed (code-switch)
// ══════════════════════════════════════════════════
const LangDetect = {

  TAMIL_RANGE: /[\u0B80-\u0BFF]/,  // Unicode block for Tamil script

  hasTamil(text) {
    return LangDetect.TAMIL_RANGE.test(text);
  },

  hasEnglish(text) {
    return /[a-zA-Z]/.test(text);
  },

  // Returns: 'tamil' | 'english' | 'mixed'
  detect(text) {
    const t = LangDetect.hasTamil(text);
    const e = LangDetect.hasEnglish(text);
    if (t && e) return 'mixed';
    if (t) return 'tamil';
    return 'english';
  },

  // Split a mixed text into segments with language tags
  // Returns: [{text, lang}]
  splitSegments(text) {
    const segments = [];
    let current = '';
    let currentLang = null;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const isTamilChar = LangDetect.TAMIL_RANGE.test(ch);
      const isEnglishChar = /[a-zA-Z0-9]/.test(ch);

      let charLang = null;
      if (isTamilChar) charLang = 'tamil';
      else if (isEnglishChar) charLang = 'english';
      else charLang = currentLang || 'english'; // punctuation/space inherits

      if (charLang !== currentLang && current.trim() && currentLang) {
        segments.push({ text: current.trim(), lang: currentLang });
        current = ch;
        currentLang = charLang;
      } else {
        current += ch;
        if (!currentLang) currentLang = charLang;
      }
    }

    if (current.trim()) {
      segments.push({ text: current.trim(), lang: currentLang || 'english' });
    }

    return segments;
  }
};

// ══════════════════════════════════════════════════
// SSML BUILDER
// Generates proper SSML for all platforms
// ══════════════════════════════════════════════════
const SSMLBuilder = {

  // Escape text for XML/SSML
  escape(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  },

  // Build SSML for a single-language text
  buildMono(text, mode = 'teaching', lang = 'english', level = 'intermediate') {
    const profile = VOICE_MODES[mode] || VOICE_MODES.teaching;
    const levelFactor = LEVEL_SPEED[level] || 1.0;
    const finalRate = (profile.rate * levelFactor).toFixed(2);

    // Convert math
    const converted = MathTTS.convert(text);

    // Rate as SSML percentage
    const ratePct = Math.round(parseFloat(finalRate) * 100) + '%';

    // Add sentence-ending pauses
    const withPauses = converted
      .replace(/\. /g, `.  `)   // sentence pause handled via prosody
      .replace(/\? /g, `?  `)
      .replace(/! /g, `!  `);

    const escaped = SSMLBuilder.escape(withPauses);

    // Language attribute
    const langAttr = lang === 'tamil' ? 'ta-IN' : 'en-IN';

    return `<speak>
  <voice name="${DSVoice.getVoiceName(lang, mode)}">
    <prosody rate="${ratePct}" pitch="${profile.pitch >= 1 ? '+' : ''}${Math.round((profile.pitch - 1) * 100)}%">
      <lang xml:lang="${langAttr}">
        ${escaped}
      </lang>
    </prosody>
  </voice>
</speak>`;
  },

  // Build SSML for mixed Tamil+English (code-switching)
  buildMixed(text, mode = 'teaching', level = 'intermediate') {
    const profile = VOICE_MODES[mode] || VOICE_MODES.teaching;
    const levelFactor = LEVEL_SPEED[level] || 1.0;
    const finalRate = (profile.rate * levelFactor).toFixed(2);
    const ratePct = Math.round(parseFloat(finalRate) * 100) + '%';

    const segments = LangDetect.splitSegments(text);

    let inner = '';
    for (const seg of segments) {
      const converted = MathTTS.convert(seg.text);
      const escaped = SSMLBuilder.escape(converted);
      const langCode = seg.lang === 'tamil' ? 'ta-IN' : 'en-IN';
      const voiceName = DSVoice.getVoiceName(seg.lang, mode);

      inner += `\n      <voice name="${voiceName}">
        <lang xml:lang="${langCode}">${escaped}</lang>
      </voice>`;

      // Add a brief pause between language switches
      if (seg.lang === 'tamil') {
        inner += `\n      <break time="150ms"/>`;
      }
    }

    return `<speak>
  <prosody rate="${ratePct}">
    ${inner.trim()}
  </prosody>
</speak>`;
  },

  // Build from pre-structured teaching script
  buildTeachingScript(script) {
    // script = [{ type, text, lang, emphasis, pause }]
    let inner = '';

    for (const part of script) {
      const converted = MathTTS.convert(part.text || '');
      const escaped = SSMLBuilder.escape(converted);
      const lang = part.lang || 'english';
      const langCode = lang === 'tamil' ? 'ta-IN' : 'en-IN';

      if (part.emphasis) {
        inner += `<emphasis level="${part.emphasis}">${escaped}</emphasis>`;
      } else {
        inner += escaped;
      }

      if (part.pause) {
        inner += `<break time="${part.pause}ms"/>`;
      } else {
        inner += ' ';
      }
    }

    return `<speak>\n  ${inner.trim()}\n</speak>`;
  },

  // Build for quiz/question — adds proper pauses
  buildQuestion(questionText, options = [], mode = 'quiz') {
    const profile = VOICE_MODES[mode] || VOICE_MODES.quiz;
    const ratePct = Math.round(profile.rate * 100) + '%';
    const qEscaped = SSMLBuilder.escape(MathTTS.convert(questionText));

    let optionsSSML = '';
    const letters = ['A', 'B', 'C', 'D'];
    options.forEach((opt, i) => {
      const escaped = SSMLBuilder.escape(MathTTS.convert(String(opt)));
      optionsSSML += `\n      <break time="400ms"/>Option ${letters[i] || i+1}: ${escaped}`;
    });

    return `<speak>
  <prosody rate="${ratePct}">
    ${qEscaped}
    <break time="600ms"/>
    ${optionsSSML}
    <break time="800ms"/>
  </prosody>
</speak>`;
  },

  // Build feedback SSML (correct / wrong)
  buildFeedback(isCorrect, message, mode = 'feedback') {
    const emoji = isCorrect ? '' : '';  // stripped for TTS
    const prefix = isCorrect
      ? '<emphasis level="moderate">சரி!</emphasis> <break time="200ms"/> Correct!'
      : 'தவறு. <break time="200ms"/> Let\'s try again.';
    const escaped = SSMLBuilder.escape(MathTTS.convert(message || ''));

    return `<speak>
  <prosody rate="90%" pitch="+5%">
    ${prefix}
    <break time="300ms"/>
    ${escaped}
  </prosody>
</speak>`;
  }
};

// ══════════════════════════════════════════════════
// VOICE RECOMMENDATION ENGINE
// Returns best voice name for each context
// ══════════════════════════════════════════════════
const VoiceRecommender = {

  // Priority ranked voice names per platform
  GOOGLE = {
    tamil_teaching:     'ta-IN-Neural2-A',    // Female, Neural2
    tamil_story:        'ta-IN-Neural2-D',    // Male, Neural2
    tamil_feedback:     'ta-IN-Neural2-A',
    english_teaching:   'en-IN-Neural2-A',    // Female Indian Neural2
    english_story:      'en-IN-Neural2-B',    // Male Indian Neural2
    english_feedback:   'en-IN-Neural2-C',    // Female, warmer
    english_default:    'en-IN-Neural2-A',
    tamil_default:      'ta-IN-Neural2-A',
  },

  AZURE: {
    tamil_teaching:     'ta-IN-PallaviNeural',     // Female, calm
    tamil_story:        'ta-IN-ValluvarNeural',    // Male, expressive
    tamil_feedback:     'ta-IN-PallaviNeural',
    english_teaching:   'en-IN-NeerjaNeural',      // Female, clear
    english_story:      'en-IN-PrabhatNeural',     // Male
    english_feedback:   'en-IN-NeerjaExpressiveNeural',  // Warm
    english_default:    'en-IN-NeerjaNeural',
    tamil_default:      'ta-IN-PallaviNeural',
  },

  ELEVENLABS: {
    teaching:  'Rachel',      // Calm, clear
    story:     'Josh',        // Expressive
    feedback:  'Elli',        // Friendly
  },

  BROWSER: {
    // Patterns to match from speechSynthesis.getVoices()
    tamil_priority: [
      'Microsoft Pallavi Online (Natural)',     // Edge — best Tamil
      'Google Tamil',
      'Tamil',
    ],
    english_in_priority: [
      'Microsoft Neerja Online (Natural) - English (India)',   // Edge — best Indian EN
      'Microsoft Ravi Online (Natural) - English (India)',
      'Google English India',
      'en-IN',
    ],
    english_priority: [
      'Microsoft Aria Online (Natural)',
      'Microsoft Jenny Online (Natural)',
      'Google UK English Female',
    ]
  },

  // Get recommended voice name
  get(lang, mode, platform = 'azure') {
    const key = `${lang}_${mode}`;
    if (platform === 'google') return VoiceRecommender.GOOGLE[key] || VoiceRecommender.GOOGLE[`${lang}_default`] || 'en-IN-Neural2-A';
    if (platform === 'azure')  return VoiceRecommender.AZURE[key]  || VoiceRecommender.AZURE[`${lang}_default`]  || 'en-IN-NeerjaNeural';
    if (platform === 'elevenlabs') return VoiceRecommender.ELEVENLABS[mode] || 'Rachel';
    return VoiceRecommender.AZURE[key] || 'en-IN-NeerjaNeural';
  },

  // Find best matching browser voice from available voices
  getBrowserVoice(voices, lang, mode) {
    const isTamil = lang === 'tamil';
    const priorityList = isTamil
      ? VoiceRecommender.BROWSER.tamil_priority
      : VoiceRecommender.BROWSER.english_in_priority;

    // Try to match by name (Neural/Natural first)
    for (const nameFragment of priorityList) {
      const match = voices.find(v =>
        v.name.toLowerCase().includes(nameFragment.toLowerCase())
      );
      if (match) return match;
    }

    // Fallback: any voice matching language code
    const langCode = isTamil ? 'ta' : 'en';
    const byLang = voices.filter(v => v.lang.startsWith(langCode));

    // Prefer Neural/Online voices
    const neural = byLang.find(v => v.name.toLowerCase().includes('neural') || v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('online'));
    if (neural) return neural;

    return byLang[0] || voices[0] || null;
  },

  // Return full recommendation report for a text
  recommend(text, mode = 'teaching') {
    const lang = LangDetect.detect(text);
    return {
      platform_priority: ['azure', 'google', 'browser', 'elevenlabs'],
      azure:       { voice: VoiceRecommender.get(lang === 'mixed' ? 'english' : lang, mode, 'azure'), confidence: lang === 'mixed' ? 'medium' : 'high' },
      google:      { voice: VoiceRecommender.get(lang === 'mixed' ? 'english' : lang, mode, 'google'), confidence: lang === 'mixed' ? 'medium' : 'high' },
      elevenlabs:  { voice: VoiceRecommender.ELEVENLABS[mode] || 'Rachel', note: 'Premium only' },
      language_detected: lang,
      mode_used: mode,
      has_math: /[+\-×÷=²³√πθ^<>≤≥%°]/u.test(text) || /\d+\/\d+/.test(text)
    };
  }
};

// ══════════════════════════════════════════════════
// MAIN DSVoice ENGINE
// The public-facing API
// ══════════════════════════════════════════════════
const DSVoice = {

  // State
  _voices: [],
  _voiceOn: true,
  _level: 'intermediate',   // beginner | intermediate | advanced
  _platform: 'browser',     // browser | google | azure | elevenlabs
  _currentMode: 'teaching',
  _utteranceQueue: [],
  _speaking: false,
  _apiKey: null,

  // ── INIT ──
  init() {
    if (typeof speechSynthesis === 'undefined') {
      console.warn('DSVoice: Web Speech API not available');
      return;
    }
    speechSynthesis.onvoiceschanged = () => {
      DSVoice._voices = speechSynthesis.getVoices();
    };
    // Try loading voices immediately
    DSVoice._voices = speechSynthesis.getVoices();
    if (!DSVoice._voices.length) {
      setTimeout(() => { DSVoice._voices = speechSynthesis.getVoices(); }, 800);
    }
  },

  // ── CONFIGURATION ──
  setLevel(level) {
    DSVoice._level = LEVEL_SPEED[level] ? level : 'intermediate';
  },
  setVoiceOn(on) {
    DSVoice._voiceOn = !!on;
    if (!on) DSVoice.stop();
  },
  setPlatform(platform) {
    DSVoice._platform = platform;
  },
  setApiKey(key) {
    DSVoice._apiKey = key;
  },

  // ── VOICE NAME GETTER ──
  getVoiceName(lang, mode) {
    return VoiceRecommender.get(lang, mode, DSVoice._platform);
  },

  // ── MAIN SPEAK FUNCTION ──
  speak(text, options = {}) {
    if (!DSVoice._voiceOn || !text) return;

    const mode = options.mode || 'teaching';
    const lang = options.lang || LangDetect.detect(text);
    const level = options.level || DSVoice._level;

    // Build SSML
    let ssml;
    if (lang === 'mixed') {
      ssml = SSMLBuilder.buildMixed(text, mode, level);
    } else {
      ssml = SSMLBuilder.buildMono(text, mode, lang, level);
    }

    options._ssml = ssml;
    options._lang = lang;
    options._mode = mode;

    // Use Google/Azure API if configured
    if (DSVoice._platform === 'google' && DSVoice._apiKey) {
      DSVoice._speakGoogle(ssml, lang, mode);
      return;
    }
    if (DSVoice._platform === 'azure' && DSVoice._apiKey) {
      DSVoice._speakAzure(ssml, lang, mode);
      return;
    }

    // Fallback: Browser Web Speech API
    DSVoice._speakBrowser(text, mode, lang, level, ssml);
  },

  // ── SPEAK MATH ──
  speakMath(equation, options = {}) {
    const spoken = MathTTS.convert(equation);
    const opts = Object.assign({ mode: 'teaching' }, options);
    DSVoice.speak(spoken, opts);
    return spoken;
  },

  // ── SPEAK SEQUENCE (multiple parts with pauses) ──
  speakSequence(parts, options = {}) {
    let delay = 0;
    parts.forEach((part, i) => {
      setTimeout(() => {
        const text = typeof part === 'string' ? part : part.text;
        const partOpts = Object.assign({}, options, typeof part === 'object' ? part : {});
        DSVoice.speak(text, partOpts);
      }, delay);

      // Calculate delay for next part
      const pauseAfter = typeof part === 'object' && part.pause ? part.pause : 800;
      // Rough estimate: ~100ms per char
      const speakTime = Math.min((typeof part === 'string' ? part : part.text).length * 65, 6000);
      delay += speakTime + pauseAfter;
    });
  },

  // ── STOP ──
  stop() {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }
    DSVoice._speaking = false;
  },

  // ── BROWSER TTS (Fallback) ──
  _speakBrowser(text, mode, lang, level, ssml) {
    speechSynthesis.cancel();

    const profile = VOICE_MODES[mode] || VOICE_MODES.teaching;
    const levelFactor = LEVEL_SPEED[level] || 1.0;

    // For mixed language, split and speak sequentially
    if (lang === 'mixed') {
      const segments = LangDetect.splitSegments(text);
      const utterances = segments.map(seg => {
        const mathConverted = MathTTS.convert(seg.text);
        const utt = new SpeechSynthesisUtterance(mathConverted);
        const voice = VoiceRecommender.getBrowserVoice(DSVoice._voices, seg.lang, mode);
        if (voice) utt.voice = voice;
        utt.rate = profile.rate * levelFactor;
        utt.pitch = profile.pitch;
        utt.lang = seg.lang === 'tamil' ? 'ta-IN' : 'en-IN';
        return utt;
      });

      // Chain utterances
      DSVoice._chainUtterances(utterances);
      return;
    }

    // Single language
    const mathConverted = MathTTS.convert(text);
    const utt = new SpeechSynthesisUtterance(mathConverted);
    const voice = VoiceRecommender.getBrowserVoice(DSVoice._voices, lang, mode);
    if (voice) utt.voice = voice;
    utt.rate = profile.rate * levelFactor;
    utt.pitch = profile.pitch;
    utt.lang = lang === 'tamil' ? 'ta-IN' : 'en-IN';
    speechSynthesis.speak(utt);
  },

  _chainUtterances(utterances, index = 0) {
    if (index >= utterances.length) return;
    const utt = utterances[index];
    utt.onend = () => {
      setTimeout(() => DSVoice._chainUtterances(utterances, index + 1), 120);
    };
    speechSynthesis.speak(utt);
  },

  // ── GOOGLE CLOUD TTS ──
  async _speakGoogle(ssml, lang, mode) {
    try {
      const voiceName = VoiceRecommender.get(lang, mode, 'google');
      const body = {
        input: { ssml },
        voice: {
          languageCode: lang === 'tamil' ? 'ta-IN' : 'en-IN',
          name: voiceName,
          ssmlGender: voiceName.includes('-A') || voiceName.includes('-C') ? 'FEMALE' : 'MALE'
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: VOICE_MODES[mode]?.rate || 0.85,
          pitch: (VOICE_MODES[mode]?.pitch - 1) * 20 || 0,
          effectsProfileId: ['headphone-class-device']
        }
      };

      const resp = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${DSVoice._apiKey}`,
        { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) }
      );
      const data = await resp.json();
      if (data.audioContent) {
        const audio = new Audio('data:audio/mp3;base64,' + data.audioContent);
        audio.play();
      }
    } catch (e) {
      console.warn('Google TTS failed, falling back to browser:', e.message);
      DSVoice._speakBrowser(ssml.replace(/<[^>]+>/g, ' ').trim(), mode, lang, DSVoice._level);
    }
  },

  // ── MICROSOFT AZURE TTS ──
  async _speakAzure(ssml, lang, mode) {
    try {
      const voiceName = VoiceRecommender.get(lang, mode, 'azure');
      const region = DSVoice._azureRegion || 'eastus';
      const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

      // Azure SSML needs to reference the voice inline
      const azureSSML = ssml.replace(/<voice name="[^"]*">/g, `<voice name="${voiceName}">`)
                            .replace(/<voice name='[^']*'>/g, `<voice name='${voiceName}'>`);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': DSVoice._apiKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3'
        },
        body: azureSSML
      });

      if (resp.ok) {
        const blob = await resp.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play();
      }
    } catch (e) {
      console.warn('Azure TTS failed, falling back to browser:', e.message);
      DSVoice._speakBrowser(ssml.replace(/<[^>]+>/g, ' ').trim(), mode, lang, DSVoice._level);
    }
  },

  // ── GENERATE FULL REPORT ──
  // Returns SSML, voice recommendation, math conversion
  generateReport(text, mode = 'teaching') {
    const lang = LangDetect.detect(text);
    const mathConverted = MathTTS.convert(text);
    const ssml = lang === 'mixed'
      ? SSMLBuilder.buildMixed(text, mode, DSVoice._level)
      : SSMLBuilder.buildMono(text, mode, lang, DSVoice._level);
    const recommendation = VoiceRecommender.recommend(text, mode);

    return {
      original: text,
      language_detected: lang,
      math_converted: mathConverted !== text ? mathConverted : null,
      ssml,
      recommendation,
      mode,
      level: DSVoice._level
    };
  },

  // ── HELPERS ──
  // Convenience wrappers for common teaching contexts
  teachConcept(text)  { return DSVoice.speak(text, { mode: 'teaching' }); },
  tellStory(text)     { return DSVoice.speak(text, { mode: 'storytelling' }); },
  giveInstruction(text){ return DSVoice.speak(text, { mode: 'instruction' }); },
  giveFeedback(text)  { return DSVoice.speak(text, { mode: 'feedback' }); },
  readRevision(text)  { return DSVoice.speak(text, { mode: 'revision' }); },
  askQuestion(text, opts=[]) {
    const ssml = SSMLBuilder.buildQuestion(text, opts, 'quiz');
    DSVoice._speakBrowser(
      MathTTS.convert(text) + ' ' + opts.join('. '),
      'quiz', LangDetect.detect(text), DSVoice._level, ssml
    );
  },
  speakCorrect(msg)   { DSVoice._speakBrowser(MathTTS.convert(msg), 'feedback', 'english', DSVoice._level); },
  speakWrong(msg)     { DSVoice._speakBrowser(MathTTS.convert(msg), 'feedback', 'english', DSVoice._level); },

  // Expose sub-modules
  Math: MathTTS,
  SSML: SSMLBuilder,
  Lang: LangDetect,
  Voices: VoiceRecommender,
  Modes: VOICE_MODES
};

// ── AUTO-INIT ──
if (typeof window !== 'undefined') {
  window.DSVoice = DSVoice;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => DSVoice.init());
  } else {
    DSVoice.init();
  }
}

// ── NODE.JS EXPORT ──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DSVoice, MathTTS, SSMLBuilder, LangDetect, VoiceRecommender };
}

})(typeof window !== 'undefined' ? window : global);
