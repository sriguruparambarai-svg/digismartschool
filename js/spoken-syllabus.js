/* DigiSmart Spoken English syllabus (Oct 2026) — used by the Term Planner.
   Built on the Speaking Ladder (js/speaking-ladder.js): 14 topics × 5 levels.

   Every class starts at Level 1 (most children cannot yet say English words).
   The syllabus is ONE ordered ladder of units per class group, not "Term 2 = Level 3":
   each new Term Plan carries on from the units the class has already done.
   Older classes move faster (fewer periods per unit).

   A unit = one topic at one level. All topics are done at a level before moving up,
   so children have many words before they make sentences.

   Each period is run with the Speaking Class on the projector (Robo teaches);
   the class teacher runs the mic line and the pair practice. No homework —
   only the finished "trophy" clip goes home, so parents never hear early mistakes. */

(function(){
  // easiest, most everyday topics first
  var ORDER = ["body","family","school","food","colours","numbers","animals","clothes",
               "home","birds","actions","manners","nature","travel"];

  // [level, periods per unit]
  var BANDS = {
    small:   {name:"Pre KG – UKG",  plan:[[1,3],[2,3]]},
    primary: {name:"Class 1 – 2",   plan:[[1,2],[2,2],[3,3]]},
    middle:  {name:"Class 3 – 5",   plan:[[1,1],[2,1],[3,2],[4,2],[5,2]]},
    upper:   {name:"Class 6 – 12",  plan:[[1,1],[2,1],[3,1],[4,2],[5,2]]}
  };
  function bandOf(cls){
    var m = /Class (\d+)/.exec(cls || ""), n = m ? +m[1] : 0;
    if (!n) return "small";
    if (n <= 2) return "primary";
    if (n <= 5) return "middle";
    return "upper";
  }
  function ladder(){ return window.SPEAKING_LADDER || null; }
  function topic(id){ var L = ladder(); return L ? L.topics.filter(function(t){ return t.id === id; })[0] : null; }

  // The whole ordered list of units for a class
  function units(cls){
    var L = ladder(); if (!L) return [];
    var b = BANDS[bandOf(cls)], out = [], n = 0;
    b.plan.forEach(function(p){
      var lv = p[0], lvName = (L.levels[lv - 1] || {}).name || "";
      ORDER.forEach(function(id){
        var t = topic(id); if (!t || !t.levels[lv] || !t.levels[lv].length) return;
        n++;
        out.push({ key:"S:" + id + ":" + lv, no:n, topic:id, level:lv, periods:p[1],
                   title:"Unit " + n + ". " + t.title + " — Level " + lv + ": " + lvName });
      });
    });
    return out;
  }

  // What is said in a unit, as a short list for the plan
  function sayList(t, lv){
    var it = t.levels[lv] || [];
    if (lv === 5) return it.map(function(c){ return "“" + c.title + "”"; }).join(", ");
    return it.map(function(x){ return x.t; }).join(", ");
  }
  var WHAT = {1:"word", 2:"pair of words", 3:"sentence", 4:"sentence", 5:"conversation"};

  // The periods of one unit: [{teach}]
  function lessons(u){
    var t = topic(u.topic); if (!t) return [];
    var lv = u.level, list = sayList(t, lv), cnt = (t.levels[lv] || []).length, P = u.periods;
    var head = "🗣 Speaking Class on the projector → " + t.title + ", Level " + lv + ". ";
    var who = " (Robo teaches; the class teacher runs the mic line and keeps order.)";
    var intro = "1. Revise the last unit together (3 minutes). 2. Robo says each " + WHAT[lv] +
      "; the whole class repeats, then row by row. 3. Each child comes to the mic and says them: " + list +
      ". 4. Write down the children who could not say them yet.";
    var practise = "1. Quick revise all together. 2. The children written down last time go to the mic first. " +
      "3. Pair practice (the Speaking Class pair screen): partners say them to each other in turns." +
      (lv === 5 ? " 4. Talk with Robo: each pair answers Robo's questions." : "");
    var alone = "Say-it-alone round: every child says all " + cnt + " at the mic without help. " +
      "🏆 Trophy round: write down the children who say them all clearly — their best clip is the one that goes to parents.";
    var out = [];
    for (var j = 0; j < P; j++){
      var txt;
      if (P === 1) txt = head + intro + " 5. " + alone;
      else if (j === 0) txt = head + intro;
      else if (j === P - 1) txt = head + "1. Quick revise all together. 2. " + alone;
      else txt = head + practise;
      out.push({ teach: txt + who });
    }
    return out;
  }

  // A spare period at the end of a term, when every ticked unit is done
  function revisePeriod(){
    return { teach: "🗣 Speaking Class → revise: each child picks a topic already learnt and says it at the mic; " +
      "pair practice on the units the class found hardest. (Robo teaches; the class teacher runs the mic line.)" };
  }

  window.SPOKEN_SYLLABUS = { version:1, bands:BANDS, order:ORDER, bandOf:bandOf, units:units, lessons:lessons, revisePeriod:revisePeriod };
})();
