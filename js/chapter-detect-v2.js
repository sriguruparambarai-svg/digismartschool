/* ==============================================================
   DigiSmartSchool - chapter-detect-v2.js
   Overrides tblBuildChapters() with real chapter-name detection.
   Load this AFTER js/chapter-detect.js so it replaces only this
   one function and leaves everything else in the old file alone.

   Input : raw text produced by mbExtractPagesText() - pages
           separated by "[Page N]" markers.
   Output: [{ number, title, pageFrom, pageTo, text, source }]
           pageFrom / pageTo are REAL PDF page numbers.

   Strategy, in order:
     1. Contents / index page  -> chapter names + printed page ranges,
        then auto-correct the printed->PDF page offset.
     2. Chapter headings on the pages themselves
        (Chapter 1 / Unit 1 / Tamil paadam / alagu / "1. Title").
     3. Fixed page blocks - last resort, and labelled honestly
        as "Pages 1-15" instead of a fake "Section 1".
   ============================================================== */
(function () {
  'use strict';

  // -- split raw text back into pages --------------------------
  function splitPages(raw) {
    var pages = [];
    var re = /\[Page\s+(\d+)\]\s*\n?/g;
    var m, marks = [];
    while ((m = re.exec(raw)) !== null) {
      marks.push({ n: parseInt(m[1], 10), start: m.index, end: re.lastIndex });
    }
    for (var i = 0; i < marks.length; i++) {
      var stop = (i + 1 < marks.length) ? marks[i + 1].start : raw.length;
      pages.push({ n: marks[i].n, text: raw.substring(marks[i].end, stop).trim() });
    }
    return pages;
  }

  function pageMap(pages) {
    var map = {};
    pages.forEach(function (p) { map[p.n] = p.text; });
    return map;
  }

  function textOfRange(map, from, to, cap) {
    var out = [];
    for (var p = from; p <= to; p++) {
      if (map[p]) out.push(map[p]);
      if (cap && out.join('\n').length > cap) break;
    }
    return out.join('\n\n');
  }

  function cleanTitle(t) {
    return String(t || '')
      .replace(/\.{2,}/g, ' ')          // dot leaders
      .replace(/\s{2,}/g, ' ')
      .replace(/[\s\-\u2013\u2014:.]+$/, '')
      .trim();
  }

  // -- printed page number -> PDF page number offset ------------
  // Textbooks print "1" on what is really PDF page 7 (covers,
  // symbols, contents come first). We read the running page
  // number off each page and take the most common difference.
  function findOffset(pages) {
    var votes = {}, best = 0, bestN = 0;
    pages.forEach(function (p) {
      if (!p.text) return;
      var lines = p.text.split('\n');
      var firstLine = lines[0];
      var lastLine = lines[lines.length - 1];
      if (lines.length === 1) {              // flat page - use both ends
        firstLine = p.text.substring(0, 40);
        lastLine = p.text.substring(Math.max(0, p.text.length - 40));
      }
      [firstLine, lastLine].forEach(function (line) {
        if (!line) return;
        var a = /^(\d{1,3})\b/.exec(line.trim());
        var b = /\b(\d{1,3})\s*$/.exec(line.trim());
        [a, b].forEach(function (mm) {
          if (!mm) return;
          var printed = parseInt(mm[1], 10);
          if (!printed || printed > 900) return;
          var off = p.n - printed;
          if (off < 0 || off > 60) return;
          votes[off] = (votes[off] || 0) + 1;
          if (votes[off] > bestN) { bestN = votes[off]; best = off; }
        });
      });
    });
    return (bestN >= 5) ? best : 0;   // not enough evidence -> assume none
  }

  // -- STRATEGY 1: contents page -------------------------------
  // Matches lines like:  "3 Algebra 85-160"  /  "1 Relations and Functions 1-35"
  var TOC_LINE = /^\s*(\d{1,2})[.)]?\s+([^\d\n][^\n]*?)\s+(\d{1,3})\s*[---]\s*(\d{1,3})\s*$/;
  // Matches "1 Algebra 85" (start page only, no range)
  var TOC_LINE_START = /^\s*(\d{1,2})[.)]?\s+([^\d\n][^\n]*?)\s+(\d{1,3})\s*$/;
  // Flat version of TOC_LINE for page text that has no line breaks at all
  var TOC_FLAT = /(?:^|\s)(\d{1,2})\s+([A-Za-z\u0B80-\u0BFF][A-Za-z\u0B80-\u0BFF '&,\-]{2,60}?)\s+(\d{1,3})\s*[-\u2013\u2014]\s*(\d{1,3})(?=\s|$)/g;

  function fromContents(pages, map, totalPages, say) {
    var scan = pages.filter(function (p) { return p.n <= Math.min(25, totalPages); });
    var rows = [], usedRange = false;

    // (a) one entry per line - works when the PDF reader kept line breaks
    scan.forEach(function (p) {
      p.text.split('\n').forEach(function (line) {
        var m = TOC_LINE.exec(line);
        if (!m) return;
        var title = cleanTitle(m[2]);
        if (title.length < 3 || title.length > 70) return;
        if (/^\d+\.\d/.test(title)) return;                 // sub-section like 3.2
        rows.push({ number: parseInt(m[1], 10), title: title,
                    pStart: parseInt(m[3], 10), pEnd: parseInt(m[4], 10) });
        usedRange = true;
      });
    });

    // (b) same thing on flat text - some PDF readers return a whole page as
    // one long line with no breaks, so line-by-line above finds nothing
    if (!rows.length) {
      scan.forEach(function (p) {
        var flat = p.text.replace(/\s+/g, ' ');
        var m2;
        TOC_FLAT.lastIndex = 0;
        while ((m2 = TOC_FLAT.exec(flat)) !== null) {
          var t2 = cleanTitle(m2[2]);
          if (t2.length < 3 || t2.length > 70) continue;
          rows.push({ number: parseInt(m2[1], 10), title: t2,
                      pStart: parseInt(m2[3], 10), pEnd: parseInt(m2[4], 10) });
          usedRange = true;
        }
      });
    }

    if (!rows.length) {
      scan.forEach(function (p) {
        if (!/contents|CONTENTS|\u0B89\u0BB3\u0BCD\u0BB3\u0B9F\u0B95\u0BCD\u0B95\u0BAE\u0BCD|\u0BAA\u0BCA\u0BB0\u0BC1\u0BB3\u0B9F\u0B95\u0BCD\u0B95\u0BAE\u0BCD/.test(p.text)) return;
        p.text.split('\n').forEach(function (line) {
          var m = TOC_LINE_START.exec(line);
          if (!m) return;
          var title = cleanTitle(m[2]);
          if (title.length < 3 || title.length > 70) return;
          if (/^\d+\.\d/.test(title)) return;
          rows.push({ number: parseInt(m[1], 10), title: title,
                      pStart: parseInt(m[3], 10), pEnd: 0 });
        });
      });
    }

    if (rows.length < 2) return null;

    // keep one row per chapter number, in order, no gaps backwards
    var seen = {}, list = [];
    rows.sort(function (a, b) { return a.number - b.number || a.pStart - b.pStart; });
    rows.forEach(function (r) {
      if (seen[r.number]) return;
      if (list.length && r.pStart < list[list.length - 1].pStart) return;
      seen[r.number] = 1; list.push(r);
    });
    if (list.length < 2) return null;

    var off = findOffset(pages);
    if (say) say('Found ' + list.length + ' chapters in the contents page\u2026');

    var out = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var from = r.pStart + off;
      var to = r.pEnd ? (r.pEnd + off)
                      : (list[i + 1] ? list[i + 1].pStart + off - 1 : totalPages);
      from = Math.max(1, Math.min(from, totalPages));
      to = Math.max(from, Math.min(to, totalPages));
      out.push({ number: r.number, title: r.title, pageFrom: from, pageTo: to,
                 text: textOfRange(map, from, to, 130000), source: 'contents' });
    }
    return out;
  }

  // -- STRATEGY 1b: contents page written as "Chapter 1 Title 5" --
  // All-in-One term books list chapters as "Chapter 1 Hello, Friends! 5",
  // grouped under subject names (English / Mathematics / EVS / Hindi), and
  // the chapter numbers start again at 1 for every subject. Strategy 1
  // misses these: the line starts with the word "Chapter", there is only a
  // start page, and a repeated "Chapter 1" looked like a duplicate.
  // Oct 2026: Hindi lines too — "पाठ 1 Lesson 1 स्वर (Vowels) 50" or "पाठ 1 स्वर (Vowels) 50"
  var TOC_WORD = /^\s*(?:\u092A\u093E\u0920\s*\d{1,2}\s*[-\u2013\u2014:.]?\s*(?=(?:CHAPTER|Chapter|UNIT|Unit|LESSON|Lesson)\s*[-\u2013\u2014:.]?\s*\d))?(?:CHAPTER|Chapter|UNIT|Unit|LESSON|Lesson|\u0BAA\u0BBE\u0B9F\u0BAE\u0BCD|\u0B85\u0BB2\u0B95\u0BC1|\u092A\u093E\u0920)\s*[-\u2013\u2014:.]?\s*(\d{1,2})\s*[-\u2013\u2014:.]?\s+(.+?)\s+(\d{1,3})\s*$/;

  function plainText(t) {
    return String(t || '').replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s{2,}/g, ' ').trim();
  }

  function fromContentsChapterWord(pages, map, totalPages, say) {
    var scan = pages.filter(function (p) {
      return p.n <= Math.min(25, totalPages) &&
             /contents|CONTENTS|Contents|INDEX|\u0B89\u0BB3\u0BCD\u0BB3\u0B9F\u0B95\u0BCD\u0B95\u0BAE\u0BCD|\u0BAA\u0BCA\u0BB0\u0BC1\u0BB3\u0B9F\u0B95\u0BCD\u0B95\u0BAE\u0BCD/.test(p.text);
    });
    var rows = [];
    scan.forEach(function (p) {
      var subject = '';
      p.text.split('\n').forEach(function (line) {
        var clean = plainText(line);
        if (!clean) return;
        var m = TOC_WORD.exec(clean);
        if (m) {
          var title = cleanTitle(m[2]);
          if (title.length < 2 || title.length > 80) return;
          rows.push({ number: parseInt(m[1], 10), title: title, subject: subject,
                      pStart: parseInt(m[3], 10) });
          return;
        }
        // a short line with no page number is a subject name ("Mathematics")
        if (clean.indexOf('|') !== -1) return;                 // running header
        if (/^\d+$/.test(clean)) return;                      // page number
        if (/^(contents|index|chapter\s+title|title|page|s\.?\s*no)/i.test(clean)) return;
        if (/\d\s*$/.test(clean)) return;
        if (clean.length >= 2 && clean.length <= 40) subject = clean;
      });
    });
    if (rows.length < 2) return null;

    // one row per start page, in page order (numbers may repeat across subjects)
    rows.sort(function (a, b) { return a.pStart - b.pStart; });
    var list = [];
    rows.forEach(function (r) {
      if (list.length && r.pStart <= list[list.length - 1].pStart) return;
      list.push(r);
    });
    if (list.length < 2) return null;
    var subjects = {};
    list.forEach(function (r) { if (r.subject) subjects[r.subject] = 1; });
    var manySubjects = Object.keys(subjects).length > 1;

    var off = findOffset(pages);
    if (say) say('Found ' + list.length + ' chapters in the contents page\u2026');
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var from = Math.max(1, Math.min(r.pStart + off, totalPages));
      var to = list[i + 1] ? list[i + 1].pStart + off - 1 : totalPages;
      // leave out a subject cover page (just a list of chapter names)
      // sitting right before the next chapter
      if (list[i + 1] && to > from) {
        var lastTxt = map[to] || '';
        if (lastTxt.length < 300 && /Chapter|CHAPTER|Unit|UNIT|Lesson|LESSON/.test(lastTxt)) to = to - 1;
      }
      to = Math.max(from, Math.min(to, totalPages));
      var title = (manySubjects && r.subject) ? (r.subject + ' \u2013 ' + r.title) : r.title;
      out.push({ number: r.number, title: title, pageFrom: from, pageTo: to,
                 text: textOfRange(map, from, to, 130000), source: 'contents' });
    }
    return out;
  }

  // -- STRATEGY 2: headings on the pages -----------------------
  var HEAD_PATTERNS = [
    /^\s*(?:CHAPTER|Chapter|UNIT|Unit|LESSON|Lesson)\s*[--:]?\s*(\d{1,2})\s*[--:.]?\s*(.{0,70})$/,
    /^\s*(?:\u0BAA\u0BBE\u0B9F\u0BAE\u0BCD|\u0B85\u0BB2\u0B95\u0BC1|\u0B87\u0BAF\u0BB2\u0BCD)\s*[--:]?\s*(\d{1,2})\s*[--:.]?\s*(.{0,70})$/,
    /^\s*(\d{1,2})\s*[.)]\s+([A-Z\u0B80-\u0BFF][A-Za-z\u0B80-\u0BFF \t&,\-]{2,45})$/
  ];

  function fromHeadings(pages, map, totalPages, say) {
    var hits = [];
    pages.forEach(function (p) {
      var lines = p.text.split('\n').slice(0, 6);   // headings sit at the top
      for (var li = 0; li < lines.length; li++) {
        var line = lines[li].trim();
        if (!line || line.length > 90) continue;
        for (var k = 0; k < HEAD_PATTERNS.length; k++) {
          var m = HEAD_PATTERNS[k].exec(line);
          if (!m) continue;
          var num = parseInt(m[1], 10);
          if (!num || num > 40) continue;
          var title = cleanTitle(m[2]);
          if (!title && lines[li + 1]) title = cleanTitle(lines[li + 1]);
          hits.push({ number: num, title: title || ('Chapter ' + num), page: p.n });
          return;                                   // one hit per page
        }
      }
    });
    if (hits.length < 2) return null;

    // keep the first appearance of each chapter number, ascending
    var seen = {}, list = [];
    hits.forEach(function (h) {
      if (seen[h.number]) return;
      if (list.length && h.page <= list[list.length - 1].page) return;
      if (list.length && h.number !== list[list.length - 1].number + 1) return;
      seen[h.number] = 1; list.push(h);
    });
    if (list.length < 2) return null;

    // sanity check - exercise questions can look like headings, so reject
    // anything that does not divide the book into believable chapters
    if (list.length > 30) return null;
    var spans = list.map(function (h, i) {
      var to = list[i + 1] ? list[i + 1].page - 1 : totalPages;
      return to - h.page + 1;
    });
    var biggest = Math.max.apply(null, spans);
    if (biggest > totalPages * 0.45) return null;
    if (Math.min.apply(null, spans) < 2) return null;

    if (say) say('Found ' + list.length + ' chapter headings\u2026');
    return list.map(function (h, i) {
      var from = h.page;
      var to = list[i + 1] ? list[i + 1].page - 1 : totalPages;
      return { number: h.number, title: h.title, pageFrom: from, pageTo: to,
               text: textOfRange(map, from, to, 130000), source: 'headings' };
    });
  }

  // -- STRATEGY 3: fixed blocks (last resort) ------------------
  function fromBlocks(pages, map, totalPages, say) {
    var size = 15;
    if (say) say('No chapter names found \u2014 splitting into page blocks\u2026');
    var out = [], n = 1;
    for (var from = 1; from <= totalPages; from += size) {
      var to = Math.min(from + size - 1, totalPages);
      out.push({ number: n++, title: 'Pages ' + from + '-' + to,
                 pageFrom: from, pageTo: to,
                 text: textOfRange(map, from, to, 130000), source: 'blocks' });
    }
    return out;
  }

  // -- STRATEGY 1c: language books (Oct 2026) ------------------
  // Samacheer English books have no "Chapter 1, 2, 3". Each unit holds a
  // Prose, a Poem and a Supplementary lesson, so the old detector found
  // nothing and cut the book into fixed 15-page blocks. Here every Prose /
  // Poem / Supplementary banner at the top of a page starts a new lesson.
  // PDF text usually arrives as one flat line per page, so we look at the
  // first characters of the page rather than at separate lines.
  var LESSON_TYPE = /(?:^|[^A-Za-z])(PROSE|Prose|POEM|Poem|POETRY|Poetry|SUPPLEMENTARY|Supplementary)(?![A-Za-z])/;
  var LESSON_TYPE_G = /(?:^|[^A-Za-z])(PROSE|Prose|POEM|Poem|POETRY|Poetry|SUPPLEMENTARY|Supplementary)(?![A-Za-z])/g;
  function lessonKind(w) {
    w = w.toLowerCase();
    if (w === 'prose') return { k: 0, name: 'Prose' };
    if (w === 'poem' || w === 'poetry') return { k: 1, name: 'Poem' };
    return { k: 2, name: 'Supplementary' };
  }

  function guessLessonTitle(flat, after) {
    var t = flat.substring(after, after + 90)
      .replace(/^[\s:.\-–—|\d]+/, '');
    var cut = t.search(/Warm\s*up|Warm-up|WARM|Learning|Objectives|Introduction|Read|Before|Listen|Look|\d|[|–—]|\s-\s/);
    if (cut > 0) t = t.substring(0, cut);
    t = t.replace(/[^A-Za-z ,'&!?\-]/g, ' ').replace(/\s+/g, ' ').trim();
    var words = t.split(' ').filter(Boolean);
    if (!words.length || words.length > 8) return '';
    return words.join(' ');
  }

  function fromLanguageLessons(pages, map, totalPages, say) {
    var hits = [], last = null, unit = 0;
    pages.forEach(function (p) {
      var flat = p.text.replace(/\s+/g, ' ');
      if (!flat) return;
      // A contents page names many lessons at once - never a lesson start.
      var all = flat.match(LESSON_TYPE_G) || [];
      if (all.length >= 4) return;
      var head = flat.substring(0, 160);
      var m = LESSON_TYPE.exec(head);
      if (!m) return;
      var kind = lessonKind(m[1]);
      // A running header repeats the same word on every page of a lesson,
      // so only a change of type counts as a new lesson.
      if (last && last.k === kind.k) return;
      if (!last || kind.k <= last.k) unit++;
      var after = m.index + m[0].length;
      hits.push({ unit: unit, kind: kind, page: p.n,
                  guess: guessLessonTitle(flat, after),
                  peek: flat.substring(0, 500) });
      last = kind;
    });
    if (hits.length < 4) return null;
    var poems = hits.filter(function (h) { return h.kind.k === 1; }).length;
    if (!poems) return null;
    var spans = hits.map(function (h, i) {
      var to = hits[i + 1] ? hits[i + 1].page - 1 : totalPages;
      return to - h.page + 1;
    });
    if (Math.max.apply(null, spans) > totalPages * 0.45) return null;
    if (say) say('Found ' + hits.length + ' Prose / Poem / Supplementary lessons…');
    return hits.map(function (h, i) {
      var from = h.page;
      var to = hits[i + 1] ? hits[i + 1].page - 1 : totalPages;
      var label = 'Unit ' + h.unit + ' · ' + h.kind.name;
      return { number: i + 1, title: label + (h.guess ? ': ' + h.guess : ''),
               pageFrom: from, pageTo: to, text: textOfRange(map, from, to, 130000),
               source: 'lessons', _label: label, _peek: h.peek };
    });
  }

  // One small AI call to read the real lesson names off each lesson's first
  // page ("His First Flight", "Life"...). If it fails, the Unit / type labels
  // and best-guess names stay, and the admin can still edit them by hand.
  async function nameLessons(list, say) {
    if (say) say('Reading lesson names…');
    var digest = list.map(function (c, i) {
      return '[' + (i + 1) + '] ' + c._label + ' | ' + c._peek;
    }).join('\n');
    var sys = 'You are given the start of the first page of each lesson in a school English textbook. '
      + 'For each numbered lesson give its title exactly as printed (the lesson or poem name, not the author, not "Warm up"). '
      + 'Return ONLY a JSON array of strings, one per lesson, in the same order. No prose, no code fences.';
    try {
      var r = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_tokens: 1500, system: sys,
          messages: [{ role: 'user', content: digest }] })
      });
      var d = await r.json();
      if (!r.ok) throw new Error((d && (d.message || d.error)) || ('status ' + r.status));
      var txt = (d && d.content && d.content[0] && d.content[0].text) || '';
      var a = txt.indexOf('['), b = txt.lastIndexOf(']');
      var arr = JSON.parse(txt.slice(a, b + 1));
      if (!Array.isArray(arr) || arr.length !== list.length) throw new Error('names did not match the lessons');
      list.forEach(function (c, i) {
        var nm = plainText(arr[i]).substring(0, 70);
        if (nm) c.title = c._label + ': ' + nm;
      });
    } catch (e) {
      if (say) say('Could not read lesson names (' + e.message + ') — keeping Unit / Prose / Poem labels…');
    }
    list.forEach(function (c) { delete c._label; delete c._peek; });
    return list;
  }

  // -- STRATEGY 2b: old flat-text headings ("Unit - 10") ----------
  // fromHeadings() reads line by line, but most PDFs here arrive as one
  // flat line per page, so it never matched. The older detector in
  // chapter-detect.js reads flat text; use it before asking the AI.
  function fromFlatHeadings(pages, map, totalPages, say) {
    if (typeof window.tblDetectChapters !== 'function') return null;
    var raw = pages.map(function (p) { return '[Page ' + p.n + ']\n' + p.text; }).join('\n\n');
    var ch = window.tblDetectChapters(raw) || [];
    if (ch.length < 2) return null;
    for (var i = 0; i < ch.length; i++) {
      if ((ch[i].pageTo - ch[i].pageFrom + 1) / totalPages > 0.35) return null;
    }
    if (say) say('Found ' + ch.length + ' unit headings…');
    return ch.map(function (c) {
      return { number: c.number, title: plainText(c.title), pageFrom: c.pageFrom, pageTo: c.pageTo,
               text: textOfRange(map, c.pageFrom, c.pageTo, 130000), source: 'headings' };
    });
  }

  // AI chapter finder with the real error shown (the older one hid failures
  // and silently fell back to page blocks). Language books: each Prose,
  // Poem and Supplementary piece is its own lesson.
  async function aiChapters(pages, map, totalPages, say) {
    var digest = pages.map(function (p) {
      return '[p' + p.n + '] ' + p.text.replace(/\s+/g, ' ').slice(0, 260);
    }).join('\n');
    if (digest.length > 90000) digest = digest.slice(0, 90000);
    var sys = 'You find chapter and lesson starts in a school textbook. '
      + 'You are given the first few words of every page, tagged with its page number. '
      + 'Return ONLY a JSON array, no prose and no code fences. '
      + 'Each item: {"title": "<chapter name>", "from": <page number where it starts>}. '
      + 'Use the page number in the [pN] tag. Ignore the contents page, which lists many chapters at once. '
      + 'Ignore back-references inside body text. '
      + 'In language books (English, Tamil, Hindi) where each unit has several pieces such as Prose, Poem and Supplementary, '
      + 'make EACH piece its own item, titled like "Unit 1 · Prose: His First Flight". '
      + 'If you find no chapters, return [].';
    var r = await fetch('/api/ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_tokens: 4000, system: sys,
        messages: [{ role: 'user', content: digest }] })
    });
    var d = null;
    try { d = await r.json(); } catch (e) { throw new Error('server reply could not be read (status ' + r.status + ')'); }
    if (!r.ok || (d && d.type === 'error')) throw new Error((d && (d.message || (d.error && d.error.message) || d.error)) || ('status ' + r.status));
    var txt = (d && d.content && d.content[0] && d.content[0].text) || '';
    var a = txt.indexOf('['), b = txt.lastIndexOf(']');
    if (a < 0 || b < a) throw new Error('AI gave no chapter list');
    var arr = JSON.parse(txt.slice(a, b + 1));
    var starts = [];
    (arr || []).forEach(function (it) {
      var pg = parseInt(it.from, 10);
      if (pg >= 1 && pg <= totalPages) starts.push({ page: pg, title: plainText(it.title) });
    });
    starts.sort(function (x, y) { return x.page - y.page; });
    starts = starts.filter(function (s, i) { return !i || s.page > starts[i - 1].page; });
    if (starts.length < 2) throw new Error('AI found fewer than 2 chapters');
    return starts.map(function (s, i) {
      var to = starts[i + 1] ? starts[i + 1].page - 1 : totalPages;
      return { number: i + 1, title: s.title || ('Chapter ' + (i + 1)), pageFrom: s.page, pageTo: to,
               text: textOfRange(map, s.page, to, 130000), source: 'ai' };
    });
  }

  // -- public: same name + signature as before -----------------
  window.tblBuildChapters = async function (raw, say) {
    var pages = splitPages(raw);
    if (!pages.length) {
      // no [Page N] markers - treat the whole thing as one chapter
      return [{ number: 1, title: 'Full book', pageFrom: 1, pageTo: 1,
                text: String(raw || '').substring(0, 130000), source: 'single' }];
    }
    var map = pageMap(pages);
    var totalPages = pages[pages.length - 1].n;

    var result = fromContents(pages, map, totalPages, say)
              || fromContentsChapterWord(pages, map, totalPages, say);
    if (!result) {
      var lessons = fromLanguageLessons(pages, map, totalPages, say);
      if (lessons) result = await nameLessons(lessons, say);
    }
    if (!result) result = fromHeadings(pages, map, totalPages, say)
                       || fromFlatHeadings(pages, map, totalPages, say);

    // Free methods failed - ask AI once (the result is saved, so it never
    // runs again for this book). Only then fall back to page blocks.
    if (!result) {
      var chars = pages.reduce(function (n, p) { return n + p.text.length; }, 0);
      if (chars / Math.max(1, pages.length) < 40) {
        if (say) say('This PDF has very little readable text (it may be scanned pictures) \u2014 splitting into page blocks\u2026');
      } else {
        if (say) say('No chapter names found \u2014 asking AI\u2026');
        try {
          var ai = await aiChapters(pages, map, totalPages, say);
          if (ai && ai.length >= 2) {
            result = ai.map(function (c) {
              return { number: c.number, title: plainText(c.title), pageFrom: c.pageFrom,
                       pageTo: c.pageTo, text: c.text, source: 'ai' };
            });
          }
        } catch (e) {
          if (say) say('AI could not read the chapters (' + e.message + ') \u2014 splitting into page blocks\u2026');
        }
      }
    }
    if (!result) result = fromBlocks(pages, map, totalPages, say);

    // drop chapters that came out empty of text
    result = result.filter(function (c) { return c.pageTo >= c.pageFrom; });
    return result;
  };

  /* ============================================================
     EXERCISES INSIDE A CHAPTER
     tblBuildSections(raw, chapter) where chapter is
     { number, pageFrom, pageTo } - the same numbers already saved
     in textbook_chapters / school_book_chapters.

     Returns, in book order:
       [{ kind, label, sort_order, page_from, page_to, text }]
     kind is 'exercise' | 'example' | 'unit_exercise' | 'mcq'
     Thinking Corner, Activity, Progress Check and Points to
     Remember are deliberately ignored.
     ============================================================ */

  // "Exercise 6.2" often arrives as "Exercise \n6.2", so \s* is needed
  // between the word and the number. Capital E on Example keeps out
  // ordinary sentences like "for example, the height of a tower".
  var RE_EXERCISE = /Exercise\s*(\d{1,2})\s*\.\s*(\d{1,2})/g;
  var RE_EXERCISE_BARE = /Exercise\b/g;
  var RE_EXAMPLE  = /Example\s*(\d{1,2})\s*\.\s*(\d{1,3})/g;
  var RE_UNIT     = /Unit\s*Exercise/gi;
  var RE_MCQ      = /Multiple\s*choice\s*questions?/gi;

  function collectMarkers(map, from, to) {
    var marks = [];
    function scan(re, fn) {
      for (var pg = from; pg <= to; pg++) {
        var t = map[pg]; if (!t) continue;
        re.lastIndex = 0;
        var m;
        while ((m = re.exec(t)) !== null) {
          var got = fn(m, pg, t);
          if (got) { got.page = pg; got.pos = m.index; marks.push(got); }
        }
      }
    }
    scan(RE_UNIT, function () { return { kind: 'unit_exercise' }; });
    scan(RE_MCQ, function () { return { kind: 'mcq' }; });
    scan(RE_EXERCISE, function (m) {
      return { kind: 'exercise', major: m[1], minor: m[2] };
    });
    scan(RE_EXAMPLE, function (m) {
      return { kind: 'example', major: m[1], minor: m[2] };
    });
    // "Exercise" with the number lost by the PDF reader. Only kept when
    // no numbered exercise marker was found at that spot already.
    scan(RE_EXERCISE_BARE, function (m, pg, t) {
      var tail = t.substring(m.index, m.index + 24);
      if (/Unit\s*Exercise/i.test(t.substring(Math.max(0, m.index - 6), m.index + 9))) return null;
      if (/Exercise\s*\d{1,2}\s*\.\s*\d{1,2}/.test(tail)) return null;
      return { kind: 'exercise', bare: true };
    });
    marks.sort(function (a, b) { return (a.page - b.page) || (a.pos - b.pos); });
    // drop a bare Exercise sitting on top of a numbered one
    return marks.filter(function (mk, i) {
      if (!mk.bare) return true;
      for (var j = 0; j < marks.length; j++) {
        if (j !== i && marks[j].kind === 'exercise' && !marks[j].bare
            && marks[j].page === mk.page && Math.abs(marks[j].pos - mk.pos) < 4) return false;
      }
      return true;
    });
  }

  window.tblBuildSections = function (raw, chapter) {
    if (!chapter || !chapter.pageFrom || !chapter.pageTo) return [];
    var pages = splitPages(raw);
    if (!pages.length) return [];
    var map = pageMap(pages);
    var chNo = parseInt(chapter.number, 10) || 0;
    var from = parseInt(chapter.pageFrom, 10);
    var to = parseInt(chapter.pageTo, 10);

    var marks = collectMarkers(map, from, to);
    if (!marks.length) return [];

    var blocks = [], exCount = 0, lastWasExample = false;

    marks.forEach(function (mk) {
      var prev = blocks.length ? blocks[blocks.length - 1] : null;

      if (mk.kind === 'example') {
        if (lastWasExample && prev && prev.kind === 'example') {
          prev.lastNo = mk.minor || prev.lastNo;      // same run of examples
          return;
        }
        blocks.push({ kind: 'example', firstNo: mk.minor, lastNo: mk.minor,
                      major: mk.major || String(chNo), page: mk.page, pos: mk.pos });
        lastWasExample = true;
        return;
      }

      lastWasExample = false;

      if (mk.kind === 'mcq') {
        // In Samacheer maths the last exercise IS the MCQ set, printed as
        // "Exercise 6.5" then "Multiple choice questions" right under it.
        if (prev && prev.kind === 'exercise' && prev.page === mk.page
            && mk.pos - prev.pos < 400) {
          prev.mcq = true;
          return;
        }
        blocks.push({ kind: 'mcq', page: mk.page, pos: mk.pos });
        return;
      }

      if (mk.kind === 'unit_exercise') {
        blocks.push({ kind: 'unit_exercise', major: String(chNo), page: mk.page, pos: mk.pos });
        return;
      }

      // exercise
      exCount++;
      var minor = mk.minor ? parseInt(mk.minor, 10) : exCount;
      if (mk.minor) exCount = minor;                  // keep the counter honest
      blocks.push({ kind: 'exercise', major: mk.major || String(chNo),
                    minor: minor, page: mk.page, pos: mk.pos });
    });

    // page ranges + text, each block running up to the next one
    var out = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i], nx = blocks[i + 1];
      var pFrom = b.page;
      var pTo = nx ? Math.max(pFrom, nx.page - (nx.page > b.page ? 1 : 0)) : to;
      if (pTo > to) pTo = to;

      var txt = '';
      for (var pg = pFrom; pg <= pTo; pg++) {
        var t = map[pg] || '';
        if (pg === pFrom) t = t.substring(b.pos);
        if (nx && pg === pTo && nx.page === pg && nx.pos > (pg === pFrom ? b.pos : 0)) {
          var cut = nx.pos - (pg === pFrom ? b.pos : 0);
          if (cut > 0) t = t.substring(0, cut);
        }
        txt += (txt ? '\n' : '') + t;
      }

      var label;
      if (b.kind === 'exercise') {
        label = 'Exercise ' + b.major + '.' + b.minor + (b.mcq ? ' - Multiple Choice' : '');
      } else if (b.kind === 'example') {
        label = (b.firstNo === b.lastNo)
          ? ('Example ' + b.major + '.' + b.firstNo)
          : ('Examples ' + b.major + '.' + b.firstNo + ' to ' + b.major + '.' + b.lastNo);
      } else if (b.kind === 'unit_exercise') {
        label = 'Unit Exercise - ' + b.major;
      } else {
        label = 'Multiple Choice Questions';
      }

      out.push({ kind: b.kind, label: label, sort_order: i + 1,
                 page_from: pFrom, page_to: pTo,
                 text: txt.substring(0, 60000) });
    }
    return out;
  };

  // handy for debugging from the browser console
  window.tblChapterDetectVersion = 'v2.1';
})();
