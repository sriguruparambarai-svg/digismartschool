// Shared chapter detector, used by admin.html (Samacheer library) and
// learnbot.html (private / CBSE school books). One copy, so tuning the
// detector improves both at once.

// Samacheer prints unit headings as "Unit - 10", "Unit-10", "UNIT \u2013 10".
// The old pattern required the number to follow "Unit" immediately, so the
// hyphen made every unit invisible and books fell back to 15-page chunks
// named "Section 1..9". This pattern allows the separator.
var TBL_HEAD = /\b(?:Unit|UNIT|Chapter|CHAPTER|Lesson|LESSON)\s*[-\u2010\u2011\u2012\u2013\u2014:.]?\s*(\d{1,2})\b/;

function tblPageBlocks(raw) {
  var pageNums = [], m, re = /\[Page (\d+)\]/g;
  while ((m = re.exec(raw)) !== null) pageNums.push(parseInt(m[1], 10));
  var texts = raw.split(/\[Page \d+\]/).slice(1);
  return texts.map(function(t, i) {
    return { page: pageNums[i] || (i + 1), text: (t || '').replace(/\s+/g, ' ').trim() };
  });
}

// Pull the unit name out of the words that follow the heading, stopping at
// the boxes Samacheer always puts next ("Learning Objectives", "Introduction").
function tblHeadTitle(headText) {
  var after = headText.replace(TBL_HEAD, '');
  after = after.replace(/^\s*(?:Unit|UNIT|Chapter|CHAPTER|Lesson|LESSON)?\s*[-\u2010-\u2014:.]?\s*/, '');
  var cut = after.search(/Learning\s*Objectives|Introduction|To\s+acquaint|Objectives|Let\s+us|We\s+will/i);
  if (cut > 2) after = after.slice(0, cut);
  after = after.replace(/[^A-Za-z0-9 ,'&()\-\u0B80-\u0BFF]/g, ' ').replace(/\s+/g, ' ').trim();
  after = after.replace(/^[\d\s.\-]+/, '').trim();
  if (after.length > 70) after = after.slice(0, 70).trim();
  return after;
}

function tblDetectChapters(raw) {
  var blocks = tblPageBlocks(raw);
  if (!blocks.length) return [];
  var starts = [], expect = 1;
  var gre = new RegExp(TBL_HEAD.source, 'g');
  for (var i = 0; i < blocks.length; i++) {
    var head = blocks[i].text.slice(0, 320);
    // A contents page mentions many units at once - never a real unit start.
    gre.lastIndex = 0;
    var hits = blocks[i].text.match(gre) || [];
    if (hits.length > 2) continue;
    var mm = head.match(TBL_HEAD);
    if (!mm) continue;
    // A real unit banner leads the page. "as we saw in Unit 3" sits mid
    // sentence, so anything far into the page is a back-reference.
    if (mm.index > 100) continue;
    var num = parseInt(mm[1], 10);
    // Units run in strict order. Anything out of sequence is a reference.
    if (num !== expect) continue;
    var title = tblHeadTitle(head);
    starts.push({ num: num, page: blocks[i].page, idx: i, title: title || ('Unit ' + num) });
    expect = num + 1;
  }
  return tblStartsToChapters(starts, blocks);
}

function tblStartsToChapters(starts, blocks) {
  var out = [];
  for (var s = 0; s < starts.length; s++) {
    var from = starts[s].page;
    var to = (s + 1 < starts.length) ? (starts[s + 1].page - 1) : blocks[blocks.length - 1].page;
    if (to < from) to = from;
    var text = blocks.filter(function(b) { return b.page >= from && b.page <= to; })
                     .map(function(b) { return b.text; }).join('\n\n');
    out.push({ number: starts[s].num, title: starts[s].title, pageFrom: from, pageTo: to, text: text });
  }
  return out;
}

// Only runs when the pattern finds nothing. One Claude call per book, and the
// result is stored as chapter rows, so it never runs again for that book.
async function tblAiChapters(raw) {
  var blocks = tblPageBlocks(raw);
  if (!blocks.length) return [];
  var digest = blocks.map(function(b) {
    return '[p' + b.page + '] ' + b.text.slice(0, 260);
  }).join('\n');
  if (digest.length > 90000) digest = digest.slice(0, 90000);
  var sys = 'You find chapter and unit starts in a school textbook. '
    + 'You are given the first few lines of every page, tagged with its page number. '
    + 'Return ONLY a JSON array, no prose and no code fences. '
    + 'Each item: {"n": <chapter number printed in the book>, "title": "<chapter name>", "from": <page number where it starts>}. '
    + 'Use the page number in the [pN] tag. Ignore the contents page, which lists many chapters at once. '
    + 'Ignore back-references inside body text. If you find no chapters, return [].';
  var r = await fetch('/api/ai', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_tokens: 2000, system: sys,
      messages: [{ role: 'user', content: digest }] })
  });
  var d = await r.json();
  var txt = (d && d.content && d.content[0] && d.content[0].text) ? d.content[0].text : '';
  txt = txt.replace(/```json|```/g, '').trim();
  var first = txt.indexOf('['), last = txt.lastIndexOf(']');
  if (first < 0 || last < first) return [];
  var arr;
  try { arr = JSON.parse(txt.slice(first, last + 1)); } catch (e) { return []; }
  if (!Array.isArray(arr) || !arr.length) return [];
  var starts = [];
  arr.forEach(function(a, i) {
    var p = parseInt(a.from, 10);
    if (!p) return;
    starts.push({ num: parseInt(a.n, 10) || (i + 1), page: p, idx: i,
                  title: String(a.title || '').trim() || ('Chapter ' + (i + 1)) });
  });
  starts.sort(function(x, y) { return x.page - y.page; });
  return tblStartsToChapters(starts, blocks);
}

// Pattern first (free, instant). AI only if the pattern finds nothing.
// Even chunks only if both fail, so a book is never left with no chapters.
function tblLooksTruncated(chapters, totalPages) {
  if (!chapters.length || !totalPages) return true;
  // Strict sequencing can stop early if one heading page extracts badly.
  // The tell is a final chapter that swallows a third of the book.
  for (var i = 0; i < chapters.length; i++) {
    var span = (chapters[i].pageTo - chapters[i].pageFrom + 1) / totalPages;
    if (span > 0.35) return true;
  }
  return false;
}

async function tblBuildChapters(raw, prog) {
  var total = tblPageBlocks(raw).length;
  var chapters = tblDetectChapters(raw);
  if (chapters.length >= 2 && !tblLooksTruncated(chapters, total)) return chapters;
  if (prog) prog(chapters.length ? 'Checking with AI...' : 'No headings matched - asking AI...');
  try {
    var ai = await tblAiChapters(raw);
    if (ai.length >= 2 && ai.length >= chapters.length) return ai;
  } catch (e) { }
  if (chapters.length >= 2) return chapters;
  if (prog) prog('Splitting into sections...');
  var blocks = tblPageBlocks(raw);
  var out = [], sz = 15;
  for (var s = 0; s < blocks.length; s += sz) {
    var chunk = blocks.slice(s, s + sz);
    if (!chunk.length) break;
    out.push({ number: out.length + 1, title: 'Section ' + (out.length + 1),
               pageFrom: chunk[0].page, pageTo: chunk[chunk.length - 1].page,
               text: chunk.map(function(b) { return b.text; }).join('\n\n') });
  }
  return out;
}
