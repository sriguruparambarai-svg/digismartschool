// kg-icons.js — the shared picture library
//
// These are the same simple black-line pictures the KG worksheet generator
// uses. They were living inside worksheet-kg.html, where no other page could
// reach them. Lifted here so Math Class can show a real object next to a
// shape instead of naming it in words, which a Class 1 child cannot read.
//
// Each entry: { en, ta, hi, cat, d }  where d is the SVG inside a 64x64 box.
// Some entries also carry:
//   solid  — the 3D shape that object IS, for shape-matching questions.
//            Only set where it is genuinely unambiguous. A pot or a bell is
//            left out on purpose; a child would be right to argue about them.
//
// A school's own drawings still go in kg-icons-extra.js as
// window.KG_ICONS_EXTRA, exactly as before.
//
// worksheet-kg.html is UNTOUCHED and keeps its own copy for now. Pointing it
// at this file is a separate change for a separate day.

window.KG_ICONS = {
apple:{en:"apple",ta:"ஆப்பிள்",hi:"सेब",cat:"fruit",d:'<path d="M32 18c-6-6-18-4-18 10 0 12 8 24 14 24 3 0 3-2 4-2s1 2 4 2c6 0 14-12 14-24 0-14-12-16-18-10z"/><path d="M32 18c0-6 3-9 7-10"/>'},
    banana:{en:"banana",ta:"வாழைப்பழம்",hi:"केला",cat:"fruit",d:'<path d="M12 22c4 16 16 26 34 26 6 0 8-3 6-6-14 2-26-6-32-22-1-3-9-1-8 2z"/>'},
    mango:{en:"mango",ta:"மாம்பழம்",hi:"आम",cat:"fruit",d:'<path d="M18 22c-8 8-6 24 6 28 10 4 26-4 24-20-1-8-8-14-16-12-6 2-9 0-14 4z"/><path d="M34 16c2-4 6-6 10-6"/>'},
    orange:{en:"orange",ta:"ஆரஞ்சு",hi:"संतरा",cat:"fruit",d:'<circle cx="32" cy="36" r="18"/><path d="M32 18c0-4 2-7 6-8"/><path d="M28 16c3-2 8-2 10 0"/>'},
    grapes:{en:"grapes",ta:"திராட்சை",hi:"अंगूर",cat:"fruit",d:'<circle cx="32" cy="22" r="6"/><circle cx="24" cy="32" r="6"/><circle cx="40" cy="32" r="6"/><circle cx="32" cy="42" r="6"/><circle cx="26" cy="51" r="5"/><circle cx="38" cy="51" r="5"/><path d="M32 16v-8M32 10c4-2 8 0 10 4"/>'},
    watermelon:{en:"watermelon",ta:"தர்பூசணி",hi:"तरबूज",cat:"fruit",d:'<path d="M8 28h48a24 24 0 0 1-48 0z"/><path d="M14 30h36a18 18 0 0 1-36 0z"/><circle cx="26" cy="40" r="1.6" fill="#000"/><circle cx="34" cy="44" r="1.6" fill="#000"/><circle cx="40" cy="38" r="1.6" fill="#000"/>'},
    cat:{en:"cat",ta:"பூனை",hi:"बिल्ली",cat:"animal",d:'<circle cx="32" cy="36" r="16"/><path d="M20 26l-4-12 12 6M44 26l4-12-12 6"/><circle cx="26" cy="34" r="2" fill="#000"/><circle cx="38" cy="34" r="2" fill="#000"/><path d="M32 40l-3 3h6z"/><path d="M14 40h10M14 46h10M40 40h10M40 46h10"/>'},
    dog:{en:"dog",ta:"நாய்",hi:"कुत्ता",cat:"animal",d:'<path d="M20 20h24l6 8-4 4v14a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6V32l-4-4z"/><path d="M20 20c-6 2-10 10-6 18M44 20c6 2 10 10 6 18"/><circle cx="26" cy="32" r="2" fill="#000"/><circle cx="38" cy="32" r="2" fill="#000"/><path d="M28 42a4 4 0 0 0 8 0"/><circle cx="32" cy="40" r="2.5" fill="#000"/>'},
    fish:{en:"fish",ta:"மீன்",hi:"मछली",cat:"animal",d:'<path d="M10 32c8-12 20-16 34-8l8-8v32l-8-8c-14 8-26 4-34-8z"/><circle cx="20" cy="30" r="2" fill="#000"/><path d="M30 24c2 4 2 12 0 16"/>'},
    duck:{en:"duck",ta:"வாத்து",hi:"बतख",cat:"bird",d:'<path d="M18 44c-6 0-10-4-10-10 0-8 6-12 14-10 2-8 10-12 16-8 4 4 2 10-2 14l14-2c0 12-10 18-20 18z"/><circle cx="34" cy="20" r="1.8" fill="#000"/><path d="M40 20l8 2-8 3"/>'},
    hen:{en:"hen",ta:"கோழி",hi:"मुर्गी",cat:"bird",d:'<path d="M14 40c-4-6 0-16 10-16 4-10 16-10 20-2l8 4-8 4c2 8-2 14-10 14H22l-4 6z"/><circle cx="36" cy="26" r="1.8" fill="#000"/><path d="M34 16l2-6 3 6 3-6 2 7"/><path d="M28 50v6M36 50v6"/>'},
    rat:{en:"rat",ta:"எலி",hi:"चूहा",cat:"animal",d:'<path d="M14 46c-2-9 6-16 17-16 10 0 17 5 17 11 0 4-3 7-8 7H20c-3 0-5-1-6-2z"/><circle cx="45" cy="26" r="7"/><circle cx="47" cy="31" r="1.6" fill="#000" stroke="none"/><path d="M52 33l7 2-7 2"/><path d="M15 47c-6 2-8 6-6 9"/>'},
    rabbit:{en:"rabbit",ta:"முயல்",hi:"खरगोश",cat:"animal",d:'<circle cx="32" cy="42" r="14"/><path d="M24 30c-6-14-4-24 2-24 4 0 4 12 4 22M40 30c6-14 4-24-2-24-4 0-4 12-4 22"/><circle cx="27" cy="40" r="2" fill="#000"/><circle cx="37" cy="40" r="2" fill="#000"/><path d="M30 48h4M32 48v4"/>'},
    elephant:{en:"elephant",ta:"யானை",hi:"हाथी",cat:"animal",d:'<path d="M12 30c0-12 10-18 22-18 10 0 18 6 18 16v14H42v-8h-6v8h-8v-8h-6v8H12z"/><path d="M52 30c4 6 2 16-6 16"/><circle cx="26" cy="26" r="2" fill="#000"/><path d="M18 18c-8 0-10 12-4 16"/>'},
    ant:{en:"ant",ta:"எறும்பு",hi:"चींटी",cat:"insect",d:'<circle cx="16" cy="34" r="7"/><circle cx="32" cy="32" r="6"/><circle cx="48" cy="34" r="8"/><path d="M23 33h3M38 33h2"/><path d="M28 28l-6-10M32 26v-10M36 28l6-10M28 36l-6 10M32 38v10M36 36l6 10M12 28l-4-8M20 28l4-8"/>'},
    bee:{en:"bee",ta:"தேனீ",hi:"मधुमक्खी",cat:"insect",d:'<ellipse cx="34" cy="38" rx="16" ry="11"/><circle cx="14" cy="36" r="7"/><path d="M28 28v20M36 28v20M44 30v16"/><path d="M28 26c-4-12 10-14 14-4M36 26c2-12 18-10 12 2"/><path d="M10 30l-4-6M18 30l4-6"/>'},
    bird:{en:"bird",ta:"பறவை",hi:"चिड़िया",cat:"bird",d:'<ellipse cx="30" cy="36" rx="16" ry="11"/><circle cx="46" cy="26" r="7"/><path d="M53 26l8 2-8 3"/><circle cx="48" cy="24" r="1.5" fill="#000"/><path d="M14 34l-10-6 6 10"/><path d="M26 47v8M34 47v8"/><path d="M22 32c6-4 12-4 16 0"/>'},
    frog:{en:"frog",ta:"தவளை",hi:"मेंढक",cat:"animal",d:'<ellipse cx="32" cy="40" rx="22" ry="12"/><circle cx="22" cy="26" r="6"/><circle cx="42" cy="26" r="6"/><circle cx="22" cy="26" r="2" fill="#000"/><circle cx="42" cy="26" r="2" fill="#000"/><path d="M22 44c6 4 14 4 20 0"/>'},
    snake:{en:"snake",ta:"பாம்பு",hi:"साँप",cat:"animal",d:'<path d="M46 18c-12-6-28 0-30 12-2 10 6 18 16 18 8 0 13-5 13-11 0-5-4-9-9-9-4 0-7 3-7 6"/><circle cx="49" cy="17" r="6"/><circle cx="51" cy="15" r="1.5" fill="#000" stroke="none"/><path d="M55 19l6 2-6 1"/>'},
    cow:{en:"cow",ta:"பசு",hi:"गाय",cat:"animal",d:'<path d="M16 24h32l4 8v16H12V32z"/><path d="M12 32c-6-4-6-12 0-14M52 32c6-4 6-12 0-14"/><circle cx="24" cy="32" r="2" fill="#000"/><circle cx="40" cy="32" r="2" fill="#000"/><ellipse cx="32" cy="42" rx="8" ry="4"/><path d="M20 48v8M44 48v8"/>'},
    goat:{en:"goat",ta:"ஆடு",hi:"बकरी",cat:"animal",d:'<path d="M22 26h20v14a10 10 0 0 1-10 10 10 10 0 0 1-10-10z"/><path d="M24 26c-5-4-6-10-2-14M40 26c5-4 6-10 2-14"/><circle cx="27" cy="35" r="1.7" fill="#000" stroke="none"/><circle cx="37" cy="35" r="1.7" fill="#000" stroke="none"/><path d="M32 50v6"/>'},
    butterfly:{en:"butterfly",ta:"வண்ணத்துப்பூச்சி",hi:"तितली",cat:"insect",d:'<path d="M32 20v28"/><path d="M32 26c-6-14-24-14-22 0 0 8 10 10 22 4M32 26c6-14 24-14 22 0 0 8-10 10-22 4"/><path d="M32 34c-8-4-20 0-18 8 2 8 12 6 18-2M32 34c8-4 20 0 18 8-2 8-12 6-18-2"/><path d="M30 20l-4-8M34 20l4-8"/>'},
    ball:{en:"ball",ta:"பந்து",hi:"गेंद",cat:"object",d:'<circle cx="32" cy="32" r="20"/><path d="M12 32c10-6 30-6 40 0M32 12c-6 10-6 30 0 40"/>'},
    bell:{en:"bell",ta:"மணி",hi:"घंटी",cat:"object",d:'<path d="M20 44c0-14 4-22 12-22s12 8 12 22l4 4H16z"/><path d="M32 22v-6"/><path d="M26 48a6 6 0 0 0 12 0"/>'},
    book:{en:"book",ta:"புத்தகம்",hi:"किताब",cat:"object",d:'<path d="M12 14h40v38H12z"/><path d="M20 14v38"/><path d="M28 24h16M28 32h16M28 40h10"/>'},
    cup:{en:"cup",ta:"கோப்பை",hi:"कप",cat:"object",d:'<path d="M14 20h32v18a10 10 0 0 1-10 10H24a10 10 0 0 1-10-10z"/><path d="M46 26h6a6 6 0 0 1 0 12h-6"/><path d="M20 52h24"/>'},
    hat:{en:"hat",ta:"தொப்பி",hi:"टोपी",cat:"object",d:'<path d="M8 44h48"/><path d="M18 44V28a14 14 0 0 1 28 0v16"/><path d="M18 36h28"/>'},
    kite:{en:"kite",ta:"பட்டம்",hi:"पतंग",cat:"object",d:'<path d="M32 6l18 20-18 24-18-24z"/><path d="M32 6v44M14 26h36"/><path d="M32 50c-4 6-2 10-8 10"/>'},
    key:{en:"key",ta:"சாவி",hi:"चाबी",cat:"object",d:'<circle cx="20" cy="32" r="10"/><path d="M30 32h26M50 32v8M42 32v6"/>'},
    pen:{en:"pen",ta:"பேனா",hi:"कलम",cat:"object",d:'<path d="M14 50l6-6 28-28 6 6-28 28z"/><path d="M14 50l2-8 6 6z" fill="#000"/><path d="M42 22l6 6"/>'},
    pot:{en:"pot",ta:"பானை",hi:"घड़ा",cat:"object",d:'<path d="M22 14h20v6c10 4 12 14 8 26H18c-4-12-2-22 4-26z"/><path d="M22 20h20"/><path d="M18 46h32"/>'},
    umbrella:{en:"umbrella",ta:"குடை",hi:"छाता",cat:"object",d:'<path d="M8 32a24 24 0 0 1 48 0z"/><path d="M8 32c4-6 8-6 12 0 4-6 8-6 12 0 4-6 8-6 12 0 4-6 8-6 12 0"/><path d="M32 32v20a4 4 0 0 1-8 0"/>'},
    drum:{en:"drum",ta:"மேளம்",hi:"ढोल",cat:"object",d:'<ellipse cx="32" cy="22" rx="20" ry="8"/><path d="M12 22v20a20 8 0 0 0 40 0V22"/><path d="M20 28l8 14M44 28l-8 14"/>'},
    lamp:{en:"lamp",ta:"விளக்கு",hi:"दीया",cat:"object",d:'<path d="M14 40c0 8 8 12 18 12s18-4 18-12z"/><path d="M14 40h36"/><path d="M32 40v-6"/><path d="M32 34c-6-6-2-12 0-14 2 2 6 8 0 14z"/><path d="M20 52h24"/>'},
    box:{en:"box",ta:"பெட்டி",hi:"डिब्बा",cat:"object",d:'<path d="M12 24l20-8 20 8v22l-20 8-20-8z"/><path d="M12 24l20 8 20-8M32 32v22"/>'},
    bag:{en:"bag",ta:"பை",hi:"थैला",cat:"object",d:'<path d="M12 28h40v22a5 5 0 0 1-5 5H17a5 5 0 0 1-5-5z"/><path d="M12 38h40"/><path d="M22 28v-6a10 10 0 0 1 20 0v6"/><rect x="27" y="42" width="10" height="7" rx="2"/>'},
    egg:{en:"egg",ta:"முட்டை",hi:"अंडा",cat:"food",d:'<path d="M32 10c10 0 16 16 16 28a16 16 0 0 1-32 0c0-12 6-28 16-28z"/>'},
    cake:{en:"cake",ta:"கேக்",hi:"केक",cat:"food",d:'<path d="M12 36h40v18H12z"/><path d="M12 36c4-4 8-4 12 0s8 4 12 0 8-4 12 0"/><path d="M32 36V26"/><path d="M32 24c-2-3-2-6 0-8 2 2 2 5 0 8z"/><path d="M12 44h40"/>'},
    icecream:{en:"ice cream",ta:"ஐஸ்கிரீம்",hi:"आइसक्रीम",cat:"food",d:'<circle cx="25" cy="21" r="8"/><circle cx="38" cy="21" r="8"/><circle cx="32" cy="15" r="7"/><path d="M17 28h30L32 56z"/>'},
    sun:{en:"sun",ta:"சூரியன்",hi:"सूरज",cat:"nature",d:'<circle cx="32" cy="32" r="12"/><path d="M32 8v8M32 48v8M8 32h8M48 32h8M15 15l6 6M43 43l6 6M15 49l6-6M43 21l6-6"/>'},
    moon:{en:"moon",ta:"நிலா",hi:"चाँद",cat:"nature",d:'<path d="M40 10a22 22 0 1 0 14 38 18 18 0 0 1-14-38z"/>'},
    tree:{en:"tree",ta:"மரம்",hi:"पेड़",cat:"nature",d:'<circle cx="32" cy="24" r="15"/><path d="M32 39v17"/><path d="M32 46l-7-6M32 49l7-6"/>'},
    leaf:{en:"leaf",ta:"இலை",hi:"पत्ता",cat:"nature",d:'<path d="M12 52C12 24 32 12 52 12c0 20-12 40-40 40z"/><path d="M12 52c10-14 22-24 32-32"/>'},
    flower:{en:"flower",ta:"பூ",hi:"फूल",cat:"nature",d:'<circle cx="32" cy="28" r="6"/><circle cx="32" cy="14" r="6"/><circle cx="45" cy="21" r="6"/><circle cx="45" cy="35" r="6"/><circle cx="32" cy="42" r="6"/><circle cx="19" cy="35" r="6"/><circle cx="19" cy="21" r="6"/><path d="M32 48v12M32 54c-5-1-8 1-10 4M32 54c5-1 8 1 10 4"/>'},
    cloud:{en:"cloud",ta:"மேகம்",hi:"बादल",cat:"nature",d:'<path d="M18 46a10 10 0 0 1 2-20 14 14 0 0 1 26-4 10 10 0 0 1 4 24z"/>'},
    house:{en:"house",ta:"வீடு",hi:"घर",cat:"object",d:'<path d="M10 32L32 12l22 20"/><path d="M16 28v24h32V28"/><path d="M28 52V38h8v14"/><path d="M40 24v-8h6v14"/>'},
    car:{en:"car",ta:"கார்",hi:"कार",cat:"vehicle",d:'<path d="M8 40v-8l8-10h28l8 10v8H8z"/><path d="M8 32h48"/><circle cx="18" cy="42" r="5"/><circle cx="46" cy="42" r="5"/><path d="M20 22v10M40 22v10"/>'},
    bus:{en:"bus",ta:"பேருந்து",hi:"बस",cat:"vehicle",d:'<path d="M10 16h44v30H10z"/><path d="M10 34h44"/><path d="M16 22h8v8h-8zM28 22h8v8h-8zM40 22h8v8h-8z"/><circle cx="18" cy="48" r="4"/><circle cx="46" cy="48" r="4"/>'},
    boat:{en:"boat",ta:"படகு",hi:"नाव",cat:"vehicle",d:'<path d="M8 40h48l-8 12H16z"/><path d="M32 40V12"/><path d="M32 14l18 22H32z"/>'},
    van:{en:"van",ta:"வேன்",hi:"वैन",cat:"vehicle",d:'<path d="M6 40V22h28v18"/><path d="M34 27h11l9 9v4H34z"/><rect x="11" y="26" width="10" height="8"/><circle cx="18" cy="44" r="4.5"/><circle cx="44" cy="44" r="4.5"/><path d="M6 40h4M23 40h16M49 40h5"/>'},
    nest:{en:"nest",ta:"கூடு",hi:"घोंसला",cat:"nature",d:'<path d="M12 36h40c-2 12-10 18-20 18s-18-6-20-18z"/><path d="M12 36c8-4 32-4 40 0"/><circle cx="26" cy="32" r="5"/><circle cx="38" cy="32" r="5"/>'},
    squirrel:{en:"squirrel",ta:"அணில்",hi:"गिलहरी",cat:"animal",d:'<ellipse cx="26" cy="38" rx="11" ry="14"/><circle cx="24" cy="17" r="8"/><path d="M19 10c-2-6 3-9 7-4"/><circle cx="21" cy="16" r="1.6" fill="#000" stroke="none"/><path d="M18 52h14"/><path d="M36 51c17-1 24-14 20-27-3-9-13-11-17-4-3 5 1 10 6 10-7 2-11 10-9 19z"/>'},
    ladder:{en:"ladder",ta:"ஏணி",hi:"सीढ़ी",cat:"object",d:'<path d="M20 8v48M44 8v48"/><path d="M20 16h24M20 26h24M20 36h24M20 46h24"/>'},
    swing:{en:"swing",ta:"ஊஞ்சல்",hi:"झूला",cat:"object",d:'<path d="M8 56L20 8h24l12 48"/><path d="M26 14v26M38 14v26"/><path d="M20 40h24v4H20z"/>'},
    camel:{en:"camel",ta:"ஒட்டகம்",hi:"ऊँट",cat:"animal",d:'<path d="M14 46v-6c0-3 2-6 4-7"/><path d="M18 33a7 7 0 0 1 13 0"/><path d="M31 33a7 7 0 0 1 13 0"/><path d="M44 33c3 2 4 4 4 7v6"/><path d="M46 32c0-8 2-13 6-15"/><path d="M52 17c4-1 6 1 6 4s-2 4-5 4h-5"/><path d="M14 46h34"/><path d="M17 46v10M25 46v10M37 46v10M45 46v10"/><circle cx="55" cy="20" r="1.4" fill="#000" stroke="none"/>'},
  // ── added for shape matching ──
  dice:{en:"dice",ta:"தாயம்",hi:"पासा",cat:"object",solid:"cube",d:'<rect x="12" y="12" width="40" height="40" rx="6"/><circle cx="22" cy="22" r="3" fill="#000"/><circle cx="42" cy="22" r="3" fill="#000"/><circle cx="32" cy="32" r="3" fill="#000"/><circle cx="22" cy="42" r="3" fill="#000"/><circle cx="42" cy="42" r="3" fill="#000"/>'},
  partyhat:{en:"party hat",ta:"பார்ட்டி தொப்பி",hi:"जन्मदिन टोपी",cat:"object",solid:"cone",d:'<path d="M32 10L48 52H16z"/><circle cx="32" cy="7" r="4"/><path d="M21 40h22M25 30h14"/>'},
  tin:{en:"tin",ta:"டின்",hi:"डिब्बा",cat:"object",solid:"cylinder",d:'<ellipse cx="32" cy="18" rx="16" ry="6"/><path d="M16 18v28a16 6 0 0 0 32 0V18"/><path d="M16 26a16 6 0 0 0 32 0"/>'}
};

/* ── which everyday object IS which solid ──
   Added onto the pictures above rather than written out twice. Kept short and
   only where a six year old would agree without argument. */
(function(){
  var pairs = {
    drum:'cylinder', tin:'cylinder', cup:'cylinder', pen:'cylinder',
    watermelon:'sphere', ball:'sphere', orange:'sphere', apple:'sphere',
    icecream:'cone', partyhat:'cone',
    dice:'cube',
    box:'cuboid', book:'cuboid', bus:'cuboid'
  };
  for(var k in pairs){
    if(window.KG_ICONS[k]) window.KG_ICONS[k].solid = pairs[k];
  }
})();

// Every name a picture answers to, in all three languages, so a question can
// be searched for the objects it mentions.
window.KG_ICON_NAMES = (function(){
  var out = [];
  var lib = window.KG_ICONS;
  for(var k in lib){
    var it = lib[k];
    var names = [k];
    if(it.en && names.indexOf(it.en) < 0) names.push(it.en);
    if(it.ta) names.push(it.ta);
    if(it.hi) names.push(it.hi);
    out.push({ key: k, names: names });
  }
  return out;
})();
