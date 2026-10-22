/* DigiSmart Reading Practice and Writing Practice syllabus (Oct 2026)
   Term Planner subjects for Class 1–8:
     English Reading Practice · English Writing Practice · Tamil Reading Practice · Tamil Writing Practice
   No book, no AI: one ordered ladder of units. Every class starts at the Level check and Unit 1,
   because struggling readers are found in every class; older classes move faster (fewer periods a unit).
   A new Term Plan carries on from the units the class has already done.

   Children are grouped by level inside the class:
     A Letters · B Words · C Sentences · D Fluent
   Groups A and B practise this unit's sounds / letters, words and sentences (below).
   Groups C and D read pages of the class's current English / Tamil lesson — the Term Planner fills
   "{{BOOK}}" from that class's English / Tamil term plan.
   Writing practice uses the SAME unit as reading, in the 4-line notebook — no printouts:
   the teacher writes the model on the board (and the first line for Group A).          */

(function(){
  function classNo(cls){ var m = /Class (\d+)/.exec(cls || ""); return m ? +m[1] : 0; }
  function bandOf(cls){ var n = classNo(cls); return n <= 2 ? "primary" : n <= 5 ? "middle" : "upper"; }
  var BAND_NAME = { primary:"Class 1 – 2", middle:"Class 3 – 5", upper:"Class 6 – 8" };
  var PER_UNIT = { primary:4, middle:3, upper:2 };     // periods for one unit (repeated reading of the same unit)
  var SUBJECTS = ["English Reading Practice","English Writing Practice","Tamil Reading Practice","Tamil Writing Practice"];
  function isPractice(subject){ return SUBJECTS.indexOf(subject) !== -1; }
  function isTamil(subject){ return /^Tamil/.test(subject); }
  function isWriting(subject){ return /Writing Practice$/.test(subject); }

  // ---------- English: letter sounds (Jolly Phonics order) + sight words + simple sentences ----------
  var EN = [
    { sounds:"s a t i p n", words:["sat","pat","tap","pin","tin","sip","nap","pit","sit","ant"],
      sight:["the","a","I","is","to"], sents:["Pat sat.","Tap a tin.","I sit on a tin."] },
    { sounds:"c k e h r m d", words:["cat","kit","hen","red","map","man","dip","ham","kid","ten"],
      sight:["and","you","it","in","he"], sents:["The cat is red.","A man and a map.","Ten red hens."] },
    { sounds:"g o u l f b", words:["dog","bug","fun","log","bed","bus","hug","big","fog","lip"],
      sight:["she","we","me","my","was"], sents:["The dog is big.","A bug sat on a log.","We get on the bus."] },
    { sounds:"ai j oa ie ee or", words:["rain","jam","boat","tie","tree","fork","jet","sail","goat","feet"],
      sight:["said","they","are","of","for"], sents:["I see a tree.","The goat is in the rain.","They sail a boat."] },
    { sounds:"z w ng v oo", words:["zip","web","king","van","moon","book","wet","ring","zoo","wing"],
      sight:["have","go","no","so","do"], sents:["The king has a ring.","Look at the moon.","We go to the zoo in a van."] },
    { sounds:"y x ch sh th", words:["yes","box","chip","ship","this","fox","chin","shop","that","six"],
      sight:["here","there","what","where","when"], sents:["This fox is in a box.","Six ships are there.","What is in the shop?"] },
    { sounds:"qu ou oi ue er ar", words:["queen","out","coin","blue","her","car","cloud","soil","farm","letter"],
      sight:["come","some","one","two","all"], sents:["The queen has a blue car.","Her coin fell out.","Come to the farm."] }
  ];
  // short original stories for the last units (A and B now read whole lines)
  var EN_STORY = [
    { title:"Ravi and the red kite", sight:["like","look","see","can","play"],
      words:["kite","wind","high","run","string","sky","tree","stuck","help","smile"],
      sents:["Ravi has a red kite.","The wind takes it up high.","The kite is stuck in a tree.","Dad helps Ravi get it down.","Ravi can play again."] },
    { title:"The thirsty crow", sight:["went","put","want","were","be"],
      words:["crow","pot","water","stone","drop","drink","hot","day","fly","happy"],
      sents:["It was a hot day.","A crow wanted water.","The pot had a little water.","The crow put stones in the pot.","The water came up and the crow had a drink."] },
    { title:"Meena's garden", sight:["her","his","them","then","with"],
      words:["seed","soil","sun","rain","plant","leaf","flower","water","grow","pick"],
      sents:["Meena put a seed in the soil.","The sun and the rain helped it grow.","Then a green leaf came out.","Soon there was a red flower.","Meena was very happy."] },
    { title:"Our school bus", sight:["who","why","which","very","little"],
      words:["bus","stop","driver","seat","friend","road","horn","window","school","wave"],
      sents:["Our bus comes at eight.","The driver says good morning.","I sit with my friend.","We look out of the window.","We wave when we get to school."] }
  ];

  // ---------- Tamil: உயிர் → மெய் → உயிர்மெய் → words → sentences ----------
  var UYIR = ["அ","ஆ","இ","ஈ","உ","ஊ","எ","ஏ","ஐ","ஒ","ஓ","ஔ","ஃ"];
  var CONS = ["க","ங","ச","ஞ","ட","ண","த","ந","ப","ம","ய","ர","ல","வ","ழ","ள","ற","ன"];
  var SIGNS = ["","ா","ி","ீ","ு","ூ","ெ","ே","ை","ொ","ோ","ௌ"];
  function mei(list){ return list.map(function(c){ return c + "்"; }); }
  function rowOf(c){ return SIGNS.map(function(s){ return c + s; }); }
  var TA_WORDS = [
    ["அம்மா","அப்பா","அக்கா","தம்பி","பாட்டி","தாத்தா","வீடு","கதவு","பை","மரம்"],
    ["கண்","காது","மூக்கு","வாய்","பல்","கை","கால்","தலை","முடி","விரல்"],
    ["பசு","ஆடு","மாடு","நாய்","பூனை","யானை","புலி","கிளி","மயில்","கோழி"],
    ["பால்","சோறு","இட்லி","தோசை","பழம்","மாம்பழம்","தண்ணீர்","மீன்","முட்டை","காய்"],
    ["மரம்","இலை","பூ","தாமரை","மழை","மலை","கல்","நிலா","சூரியன்","வானம்"],
    ["பள்ளி","புத்தகம்","பேனா","பென்சில்","மேசை","நாற்காலி","ஆசிரியர்","பாடம்","படம்","மணி"]
  ];
  var TA_SENT = ["இது ஒரு பூனை.","இது என் வீடு.","மழை பெய்கிறது.","நாய் குரைக்கிறது.","நான் பால் குடிக்கிறேன்.",
    "நான் புத்தகம் படிக்கிறேன்.","நான் பள்ளிக்குச் செல்கிறேன்.","அம்மா சோறு சமைக்கிறார்.","அப்பா வேலைக்குச் செல்கிறார்.",
    "மயில் அழகாக ஆடுகிறது.","வானத்தில் நிலா தெரிகிறது.","ஆசிரியர் பாடம் நடத்துகிறார்.","நாங்கள் விளையாடுகிறோம்.",
    "நான் தினமும் பல் துலக்குகிறேன்.","கிளி பச்சை நிறத்தில் இருக்கும்."];
  function taSent(i){ return [TA_SENT[(i * 2) % TA_SENT.length], TA_SENT[(i * 2 + 1) % TA_SENT.length]]; }
  var TA = [
    { label:"உயிர் எழுத்து அ – ஔ, ஃ", letters:UYIR },
    { label:"மெய் எழுத்து க் – ந்", letters:mei(CONS.slice(0, 8)) },
    { label:"மெய் எழுத்து ப் – ன்", letters:mei(CONS.slice(8)) },
    { label:"உயிர்மெய் — க, ச, ட, த வரிசை", letters:[].concat(rowOf("க"), rowOf("ச"), rowOf("ட"), rowOf("த")), show:"க கா கி கீ … ச சா சி … ட டா … த தா …" },
    { label:"உயிர்மெய் — ப, ம, ய, ர வரிசை", letters:[].concat(rowOf("ப"), rowOf("ம"), rowOf("ய"), rowOf("ர")), show:"ப பா பி பீ … ம மா … ய யா … ர ரா …" },
    { label:"உயிர்மெய் — ல, வ, ழ, ள வரிசை", letters:[].concat(rowOf("ல"), rowOf("வ"), rowOf("ழ"), rowOf("ள")), show:"ல லா லி … வ வா … ழ ழா … ள ளா …" },
    { label:"உயிர்மெய் — ற, ன, ண, ந வரிசை", letters:[].concat(rowOf("ற"), rowOf("ன"), rowOf("ண"), rowOf("ந")), show:"ற றா … ன னா … ண ணா … ந நா …" },
    { label:"சொற்கள் படித்தல் — words", letters:null },
    { label:"வாக்கியங்கள் படித்தல் — sentences", letters:null },
    { label:"சிறு பத்தி படித்தல் — short passage", letters:null }
  ];

  function units(cls, subject){
    var b = bandOf(cls), per = PER_UNIT[b], ta = isTamil(subject), wr = isWriting(subject), out = [];
    var pre = (ta ? "T" : "E") + (wr ? "W" : "R");
    out.push({ key:"PR" + pre + ":0:check", no:0, kind:"check", periods:1,
               title:"Level check — sort the children into groups A–D" });
    if (ta) {
      TA.forEach(function(u, i){
        out.push({ key:"PR" + pre + ":" + (i + 1) + ":" + u.label, no:i + 1, kind:"ta", ta:u, words:TA_WORDS[i % TA_WORDS.length],
                   sents:taSent(i), periods:per, title:"Unit " + (i + 1) + ". " + u.label });
      });
    } else {
      EN.forEach(function(u, i){
        out.push({ key:"PR" + pre + ":" + (i + 1) + ":" + u.sounds, no:i + 1, kind:"en", en:u, words:u.words, sents:u.sents, periods:per,
                   title:"Unit " + (i + 1) + ". Sounds " + u.sounds + " · sight words " + u.sight.join(", ") });
      });
      EN_STORY.forEach(function(s, i){
        var n = EN.length + i + 1;
        out.push({ key:"PR" + pre + ":" + n + ":" + s.title, no:n, kind:"story", story:s, words:s.words, sents:s.sents, periods:per,
                   title:"Unit " + n + ". Story: " + s.title + " · sight words " + s.sight.join(", ") });
      });
    }
    return out;
  }

  // which group the teacher sits with: the weaker groups more often
  var SIT = ["A","B","C","A","B","D"];
  function rot(list, j, k){ var o = []; for (var i = 0; i < k; i++) o.push(list[(j * k + i) % list.length]); return o; }
  function q(s){ return "‘" + s + "’"; }

  function readLesson(u, j, n, ta, bookName){
    var sit = SIT[j % SIT.length], head = "📖 " + (ta ? "Tamil" : "English") + " Reading Practice — " + u.title.replace(/^Unit \d+\. /, "") +
      (n > 1 ? " (period " + (j + 1) + " of " + n + " — same reading again: repeated reading builds speed)" : "") + ". ";
    var warm, model, A, B;
    if (u.kind === "en") {
      warm = "sounds " + u.en.sounds + " on the board — say each sound together, then a word that starts with it; sight words " + u.en.sight.join(", ") + " — read them 3 times";
      model = u.sents.map(q).join(" ");
      A = "say and point to the sounds " + u.en.sounds + "; find each sound at the start of a word";
      B = "blend and read the words " + u.words.join(", ");
    } else if (u.kind === "story") {
      warm = "sight words " + u.story.sight.join(", ") + " and the story words " + rot(u.words, j, 5).join(", ") + " — read together 3 times";
      model = "the story " + q(u.story.title) + ": " + u.sents.join(" ");
      A = "read the story words " + u.words.slice(0, 5).join(", ") + " — sound out each one";
      B = "read the first 2–3 lines of the story with a finger under each word";
    } else {
      var L = u.ta.letters;
      warm = L ? "letters " + (u.ta.show || L.join(" ")) + " on the board — say each one together" : "words " + rot(u.words, j, 5).join(", ") + " on the board — read together 3 times";
      model = u.sents.map(q).join(" ");
      A = L ? "say and point to the letters " + (u.ta.show || L.join(" ")) : "say the letters of each word, then read it: " + u.words.slice(0, 5).join(", ");
      B = "read the words " + u.words.join(", ");
    }
    var bookC = bookName ? "read in pairs, taking turns line by line: {{BOOK}}" : "read the sentences above in pairs, taking turns";
    var bookD = bookName ? "read {{BOOK}} in pairs, then tell the story in their own words and answer who / what / where" : "read the sentences above, then make a new sentence with each word";
    return {
      teach: head + "1. Whole class (5 min): " + warm + ". " +
        "2. Teacher reads first (10 min): " + model + " — read with expression; children follow with a finger, then read it together twice. " +
        "3. Groups (15 min) — the teacher sits with Group " + sit + " today and hears EVERY child in it: A (Letters): " + A + ". B (Words): " + B + ". C (Sentences): " + bookC + ". D (Fluent): " + bookD + ". " +
        "4. Read aloud (5 min): 2–3 children read to the class — praise each one. " +
        "5. Questions (5 min): who / what / where from today's reading.",
      homework: "Reading: read this week's " + (u.kind === "ta" && u.ta.letters ? "letters and words" : "words and sentences") + " aloud to a parent."
    };
  }

  function writeLesson(u, j, n, ta){
    var head = "✍️ " + (ta ? "Tamil" : "English") + " Writing Practice — " + u.title.replace(/^Unit \d+\. /, "") +
      (n > 1 ? " (period " + (j + 1) + " of " + n + ")" : "") + ". 4-line notebook — no printout. ";
    var model, A, dict = rot(u.words, j, 5), sent = u.sents[j % u.sents.length];
    if (u.kind === "en") { model = "the letters " + u.en.sounds.replace(/\s+/g, ", "); A = "each letter / sound 5 times: " + u.en.sounds; }
    else if (u.kind === "story") { model = "two story words (" + dict.slice(0, 2).join(", ") + ") — letter size and a finger gap between words"; A = "the story words " + dict.slice(0, 3).join(", ") + ", each 3 times"; }
    else if (u.ta.letters) { var l = rot(u.ta.letters, j, 6); model = "the letters " + l.join(" "); A = "each letter 5 times: " + l.join(" "); }
    else { model = "two words (" + dict.slice(0, 2).join(", ") + ")"; A = "the words " + dict.slice(0, 3).join(", ") + ", each 3 times"; }
    return {
      teach: head + "1. Board (5 min): write " + model + " big on the 4-line strip — show where each letter starts and the order of the strokes; children write it in the air. For Group A, write the first line in each child's notebook to copy. " +
        "2. Copy (10 min): A — " + A + ". B — the words " + dict.join(", ") + ", each 3 times. C and D — copy the sentence " + q(sent) + " neatly (" + (ta ? "even letters, a gap between words, full stop" : "capital letter, finger gaps, full stop") + "). " +
        "3. Dictation (10 min): say " + dict.join(", ") + " — then, for C and D, the sentence " + q(sent) + ". Children write without looking; check together on the board. " +
        "4. Own writing (5 min): A — write the letters again from memory. B — write a word for a picture or object the teacher shows. C — finish: " + (ta ? "‘இது ஒரு ___.’" : "‘I can see a ___.’") + " D — write 3 sentences of their own with this week's words. " +
        "5. Check (5 min): correct a few notebooks on the spot; children rewrite their mistakes.",
      homework: "Homework note: write today's dictation words " + dict.slice(0, 3).join(", ") + " 3 times in the 4-line note."
    };
  }

  function checkLesson(ta, wr){
    return wr ? {
      teach: "📋 " + (ta ? "Tamil" : "English") + " Writing Practice — level check. In the 4-line notebook each child writes: 5 letters the teacher says, 5 simple words (dictation), 1 sentence copied from the board, then 1 sentence of their own. Sort the children: A Letters (cannot form all letters), B Words (letters fine, words wrong), C Sentences (words fine, sentences messy), D Fluent. Write the groups in the class register — the same groups are used every writing period.",
      homework: ""
    } : {
      teach: "📋 " + (ta ? "Tamil" : "English") + " Reading Practice — level check. Hear each child read for 1 minute: letters/sounds → simple words → a sentence → a short passage from the " + (ta ? "Tamil" : "English") + " book. Sort the children: A Letters (does not know all letters/sounds), B Words (knows sounds, cannot read simple words), C Sentences (reads word by word, slowly), D Fluent. Write the groups in the class register — the same groups are used every reading period. Those not heard today are heard while the others read in pairs.",
      homework: ""
    };
  }

  function lessons(u, cls, subject){
    var ta = isTamil(subject), wr = isWriting(subject), out = [];
    if (u.kind === "check") return [checkLesson(ta, wr)];
    for (var j = 0; j < u.periods; j++) out.push(wr ? writeLesson(u, j, u.periods, ta) : readLesson(u, j, u.periods, ta, true));
    return out;
  }
  var MONTHLY = "📋 Monthly level check today: during group time, hear each child for 1 minute and move children up a group when they are ready. Tell parents who moved up. ";

  window.PRACTICE_SYLLABUS = { version:1, subjects:SUBJECTS, isPractice:isPractice, isTamil:isTamil, isWriting:isWriting,
    bandOf:bandOf, bandName:function(c){ return BAND_NAME[bandOf(c)]; }, classNo:classNo, units:units, lessons:lessons,
    monthly:MONTHLY,
    revise:function(subject){ var ta = isTamil(subject), wr = isWriting(subject);
      return wr ? { teach:"✍️ Writing revision: each child rewrites, neatly, the words and sentence they found hardest this term; dictation of 5 words from the term; the teacher checks size, spacing and neatness.", homework:"Homework note: write 5 words from this term neatly in the 4-line note." }
                : { teach:"📖 Reading revision: each group re-reads its favourite unit of the term in pairs; the teacher hears the children who still find it hard; end with 2–3 children reading to the class.", homework:"Reading: read this term's words aloud to a parent." }; } };
})();
