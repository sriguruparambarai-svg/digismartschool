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
              || fromHeadings(pages, map, totalPages, say)
              || fromBlocks(pages, map, totalPages, say);

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
  window.tblChapterDetectVersion = 'v2';
})();
