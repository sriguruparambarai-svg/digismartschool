/* DigiSmart Handwriting syllabus (Oct 2026) — English Handwriting and Tamil Handwriting
   in the Term Planner. No book: one ordered ladder of units per class group; each new
   Term Plan carries on from the units the class has already done.

   English uses the Spoken English words and sentences (js/speaking-ladder.js), so children
   write what they are learning to say. The school picks Print, or Cursive from Class 3.
   Tamil: uyir → mei → uyirmei rows → words → short sentences.

   Ruling: four-line up to Class 2, single lines after.
   Each period: half the sheet in class, the rest as homework.
   Every period opens Today's Worksheet with its letters / words already filled in.      */

(function(){
  function classNo(cls){ var m = /Class (\d+)/.exec(cls || ""); return m ? +m[1] : 0; }
  function bandOf(cls){ var n = classNo(cls); if (!n) return "small"; if (n <= 2) return "primary"; if (n <= 5) return "middle"; return "upper"; }
  var BAND_NAME = { small:"Pre KG – UKG", primary:"Class 1 – 2", middle:"Class 3 – 5", upper:"Class 6 – 12" };
  function ruling(cls){ return classNo(cls) <= 2 ? "four" : "single"; }
  function chunk(a, n){ var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }

  // ---------- English ----------
  var ORDER = ["body","family","school","food","colours","numbers","animals","clothes",
               "home","birds","actions","manners","nature","travel"];
  var CAPS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""), SMALL = "abcdefghijklmnopqrstuvwxyz".split("");
  function ladder(){ return window.SPEAKING_LADDER || null; }
  function topic(id){ var L = ladder(); return L ? L.topics.filter(function(t){ return t.id === id; })[0] : null; }
  function lines(t, lv){
    if (lv === 5) { var o = []; (t.levels[5] || []).forEach(function(c){ c.turns.forEach(function(x){ o.push(x.child); }); }); return o; }
    return (t.levels[lv] || []).map(function(x){ return x.t; });
  }
  var LVNAME = {1:"words", 2:"two words", 3:"short sentences", 4:"sentences", 5:"conversation sentences"};

  // kind: letters | words | sentences ; per = items in one period ; times = write each how many times
  function letterUnits(list, groups, label, per, times, font){
    return chunk(list, Math.ceil(list.length / groups)).map(function(g){
      return { kind:"letters", font:font, label:label + " " + g[0] + "–" + g[g.length - 1], items:g, per:per, times:times };
    });
  }
  function topicUnits(lv, per, times, font){
    var out = [];
    ORDER.forEach(function(id){ var t = topic(id); if (!t) return; var it = lines(t, lv); if (!it.length) return;
      out.push({ kind: lv >= 3 ? "sentences" : "words", font:font, label: t.title + " — " + LVNAME[lv] + " (Spoken English Level " + lv + ")",
                 items:it, per:per, times:times }); });
    return out;
  }
  function englishPlan(cls, style){
    var b = bandOf(cls), cur = style === "cursive" && classNo(cls) >= 3, f = cur ? "cursive" : "print";
    if (b === "small") return [].concat(
      letterUnits(CAPS, 5, "Capital letters", 3, 6, "print"),
      letterUnits(SMALL, 5, "Small letters", 3, 6, "print"),
      topicUnits(1, 4, 4, "print").slice(0, 6));
    if (b === "primary") return [].concat(
      letterUnits(SMALL, 4, "Small letters", 7, 6, "print"),
      letterUnits(CAPS, 4, "Capital letters", 7, 6, "print"),
      topicUnits(1, 5, 5, "print"),
      topicUnits(2, 4, 4, "print"));
    if (b === "middle") return cur ? [].concat(
      letterUnits(SMALL, 4, "Cursive small letters", 7, 6, "cursive"),
      letterUnits(CAPS, 4, "Cursive capital letters", 7, 5, "cursive"),
      topicUnits(1, 6, 4, "cursive"),
      topicUnits(3, 4, 2, "cursive"),
      topicUnits(4, 3, 2, "cursive")) : [].concat(
      topicUnits(1, 10, 3, "print"),
      topicUnits(2, 8, 3, "print"),
      topicUnits(3, 4, 2, "print"),
      topicUnits(4, 3, 2, "print"));
    return cur ? [].concat(
      letterUnits(SMALL, 2, "Cursive small letters", 13, 5, "cursive"),
      letterUnits(CAPS, 2, "Cursive capital letters", 13, 4, "cursive"),
      topicUnits(2, 8, 3, "cursive"),
      topicUnits(4, 4, 2, "cursive"),
      topicUnits(5, 4, 2, "cursive")) : [].concat(
      topicUnits(3, 5, 2, "print"),
      topicUnits(4, 4, 2, "print"),
      topicUnits(5, 4, 2, "print"));
  }

  // ---------- Tamil ----------
  var UYIR = ["அ","ஆ","இ","ஈ","உ","ஊ","எ","ஏ","ஐ","ஒ","ஓ","ஔ","ஃ"];
  var CONS = ["க","ங","ச","ஞ","ட","ண","த","ந","ப","ம","ய","ர","ல","வ","ழ","ள","ற","ன"];
  var MEI = CONS.map(function(c){ return c + "்"; });
  var SIGNS = ["","ா","ி","ீ","ு","ூ","ெ","ே","ை","ொ","ோ","ௌ"];
  function row(c){ return SIGNS.map(function(s){ return c + s; }); }
  var TA_WORDS = [
    { name:"Family and home", items:["அம்மா","அப்பா","அண்ணன்","அக்கா","தம்பி","தங்கை","பாட்டி","தாத்தா","வீடு","கதவு"] },
    { name:"My body",         items:["கண்","காது","மூக்கு","வாய்","பல்","கை","கால்","தலை","முடி","விரல்"] },
    { name:"Animals and birds", items:["பசு","ஆடு","மாடு","நாய்","பூனை","யானை","புலி","கிளி","மயில்","கோழி"] },
    { name:"Food",            items:["பால்","சோறு","இட்லி","தோசை","பழம்","மாம்பழம்","வாழைப்பழம்","தண்ணீர்","மீன்","முட்டை"] },
    { name:"Nature",          items:["மரம்","இலை","பூ","தாமரை","மழை","மலை","கல்","நிலா","சூரியன்","வானம்"] },
    { name:"School",          items:["பள்ளி","புத்தகம்","பேனா","பென்சில்","பை","மேசை","நாற்காலி","ஆசிரியர்","பாடம்","படம்"] }
  ];
  var TA_SENT = ["இது ஒரு பூனை.","இது என் வீடு.","மழை பெய்கிறது.","நாய் குரைக்கிறது.","நான் பால் குடிக்கிறேன்.",
    "நான் புத்தகம் படிக்கிறேன்.","நான் பள்ளிக்குச் செல்கிறேன்.","அம்மா சோறு சமைக்கிறார்.","அப்பா வேலைக்குச் செல்கிறார்.",
    "மயில் அழகாக ஆடுகிறது.","வானத்தில் நிலா தெரிகிறது.","ஆசிரியர் பாடம் நடத்துகிறார்.","நாங்கள் விளையாடுகிறோம்.",
    "நான் தினமும் பல் துலக்குகிறேன்.","கிளி பச்சை நிறத்தில் இருக்கும்."];
  function taLetters(label, list, per, times){ return { kind:"letters", font:"print", label:label, items:list, per:per, times:times }; }
  function taRows(cs, per, times){ return cs.map(function(c){ return taLetters("உயிர்மெய் — " + c + " row (" + c + " " + c + "ா " + c + "ி …)", row(c), per, times); }); }
  function taWords(per, times){ return TA_WORDS.map(function(g){ return { kind:"words", font:"print", label:"Tamil words — " + g.name, items:g.items, per:per, times:times }; }); }
  function taSent(per, times){ return chunk(TA_SENT, 5).map(function(g, i){ return { kind:"sentences", font:"print", label:"Tamil sentences " + (i + 1), items:g, per:per, times:times }; }); }
  function tamilPlan(cls){
    var b = bandOf(cls);
    if (b === "small") return [].concat(
      [taLetters("உயிர் எழுத்து அ – ஈ", UYIR.slice(0, 4), 2, 6), taLetters("உயிர் எழுத்து உ – ஏ", UYIR.slice(4, 8), 2, 6),
       taLetters("உயிர் எழுத்து ஐ – ஔ, ஃ", UYIR.slice(8), 2, 6)],
      chunk(MEI, 6).map(function(g){ return taLetters("மெய் எழுத்து " + g[0] + " – " + g[g.length - 1], g, 3, 6); }),
      taRows(["க","ச","ட","த","ப","ம"], 4, 5));
    if (b === "primary") return [].concat(
      [taLetters("உயிர் எழுத்து (all)", UYIR, 7, 5), taLetters("மெய் எழுத்து (all)", MEI, 9, 5)],
      taRows(CONS, 6, 4), taWords(5, 4), taSent(3, 2));
    if (b === "middle") return [].concat(
      [taLetters("உயிர் எழுத்து — revise", UYIR, 13, 3), taLetters("மெய் எழுத்து — revise", MEI, 18, 3)],
      taRows(CONS, 12, 3), taWords(10, 3), taSent(5, 2));
    return [].concat(
      chunk(CONS, 3).map(function(g){ return taLetters("உயிர்மெய் revise — " + g.join(", ") + " rows", [].concat(row(g[0]), row(g[1]), row(g[2])), 36, 2); }),
      taWords(10, 2), taSent(5, 2));
  }

  // ---------- shared ----------
  function units(cls, subject, style){
    var raw = /tamil/i.test(subject) ? tamilPlan(cls) : englishPlan(cls, style);
    var pre = /tamil/i.test(subject) ? "T" : (style === "cursive" && classNo(cls) >= 3 ? "C" : "P");
    return raw.map(function(u, i){
      var periods = Math.max(1, Math.ceil(u.items.length / u.per));
      return { key:"H" + pre + ":" + i + ":" + u.label, no:i + 1, kind:u.kind, font:u.font, items:u.items, per:u.per,
               times:u.times, periods:periods, title:"Unit " + (i + 1) + ". " + u.label };
    });
  }
  function short(items){ var s = items.join(", "); return s.length > 160 ? s.slice(0, 157) + "…" : s; }
  var HOW = {
    letters: function(items, n, f){ return "1. Write each letter big on the board — show where to start and the order of the strokes" +
      (f === "cursive" ? " and how it joins" : "") + "; children trace it in the air. 2. On the sheet (📝): each letter " + n + " times, neatly between the lines: " +
      items.join(" ") + ". 3. Walk round and correct pencil grip, letter size and spacing."; },
    words: function(items, n, f){ return "1. Read the words together (this term's Spoken English words). 2. Write two of them on the board — letter size and a finger gap between letters" +
      (f === "cursive" ? ", letters joined" : "") + ". 3. On the sheet (📝): each word " + n + " times: " + short(items) + ". 4. Walk round and correct."; },
    sentences: function(items, n, f){ return "1. Read the sentences together. 2. On the board: capital letter at the start, a finger gap between words, full stop at the end" +
      (f === "cursive" ? ", letters joined" : "") + ". 3. On the sheet (📝): each sentence " + n + " times: " + short(items) + ". 4. Walk round and correct."; }
  };
  function lessons(u, cls, subject){
    var out = [], parts = chunk(u.items, u.per), ta = /tamil/i.test(subject);
    parts.forEach(function(items, j){
      var head = "✍️ " + (ta ? "Tamil" : "English") + " handwriting" + (u.font === "cursive" ? " (cursive)" : "") + " — " + u.title.replace(/^Unit \d+\. /, "") +
        (parts.length > 1 ? " (part " + (j + 1) + " of " + parts.length + ")" : "") + ". ";
      out.push({
        teach: head + HOW[u.kind](items, u.times, u.font) + " Half the sheet in class — the rest is homework.",
        homework: "Finish today's handwriting sheet at home — " + (u.kind === "letters" ? "each letter" : u.kind === "words" ? "each word" : "each sentence") + " " + u.times + " times, neatly.",
        write: { items:items, times:u.times, kind:u.kind, font:u.font, rule:ruling(cls) }
      });
    });
    return out;
  }
  window.HANDWRITING_SYLLABUS = { version:1, bandOf:bandOf, bandName:function(c){ return BAND_NAME[bandOf(c)]; }, ruling:ruling,
    classNo:classNo, units:units, lessons:lessons };
})();
