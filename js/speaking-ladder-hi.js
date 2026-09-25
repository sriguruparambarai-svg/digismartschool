/* DigiSmart Speaking Ladder — HINDI.
   Same 14 topics, 5 levels and pictures as the English ladder (js/speaking-ladder.js).
   Sentences are chosen so boys and girls say exactly the same words
   (मुझे … पसंद है, मेरे पास … है, यह … है, commands, हम …).

   Each line is "Hindi|picture" or "Hindi|picture|Tamil letters".
   Tamil letters are made automatically from the Hindi (see toTamil below);
   add a third part only when the automatic version needs correcting.         */

(function(){

  // ───────────── Hindi script → Tamil letters ─────────────
  var CONS = {"क":"க","ख":"க","ग":"க","घ":"க","ङ":"ங","च":"ச","छ":"ச","ज":"ஜ","झ":"ஜ","ञ":"ஞ",
    "ट":"ட","ठ":"ட","ड":"ட","ढ":"ட","ण":"ண","त":"த","थ":"த","द":"த","ध":"த","न":"ன",
    "प":"ப","फ":"ப","ब":"ப","भ":"ப","म":"ம","य":"ய","र":"ர","ल":"ல","व":"வ",
    "श":"ஷ","ष":"ஷ","स":"ஸ","ह":"ஹ","ळ":"ள"};
  var NUKTA = {"फ":"ஃப","ज":"ஜ","ड":"ட","ढ":"ட","क":"க","ख":"க","ग":"க"};
  var VOW = {"अ":"அ","आ":"ஆ","इ":"இ","ई":"ஈ","उ":"உ","ऊ":"ஊ","ए":"ஏ","ऐ":"ஐ","ओ":"ஓ","औ":"ஔ","ऑ":"ஆ","ऋ":"ரி"};
  var SIGN = {"ा":"ா","ि":"ி","ी":"ீ","ु":"ு","ू":"ூ","े":"ே","ै":"ை","ो":"ோ","ौ":"ௌ","ॉ":"ா","ॅ":"ே"};
  var VK = {"ा":"aa","ि":"i","ी":"ii","ु":"u","ू":"uu","े":"e","ै":"ai","ो":"o","ौ":"au","ॉ":"aa","ॅ":"e",
            "अ":"a","आ":"aa","इ":"i","ई":"ii","उ":"u","ऊ":"uu","ए":"e","ऐ":"ai","ओ":"o","औ":"au","ऑ":"aa","ऋ":"i"};
  var VEL = "कखगघ", PAL = "चछजझ", RET = "टठडढण", DEN = "तथदधन", LAB = "पफबभम";

  function nasalBefore(nextBase, prevV, candra){
    if(!nextBase){ return (prevV==="aa"||prevV==="uu"||prevV==="o"||prevV==="au"||prevV==="a") ? "ம்" : "ன்"; }
    if(VEL.indexOf(nextBase)>-1) return "ங்";
    if(PAL.indexOf(nextBase)>-1) return "ஞ்";
    if(RET.indexOf(nextBase)>-1) return "ண்";
    if(nextBase === "न") return "";
    if(DEN.indexOf(nextBase)>-1) return "ந்";
    if(nextBase === "म") return "";
    if(LAB.indexOf(nextBase)>-1) return "ம்";
    return candra ? "" : "ன்";
  }

  function word2ta(w){
    // 1. split into units: {c:consonant or null, v:vowel-key or "a" or "" (none), sign, nasal}
    var u = [], i = 0, ch;
    while(i < w.length){
      ch = w[i];
      if(CONS[ch]){
        var unit = {c:ch, nk:false, v:"a", sign:"", nasal:""};
        i++;
        if(w[i] === "़"){ unit.nk = true; i++; }
        if(w[i] === "्"){ unit.v = ""; i++; }
        else if(w[i] === "ृ"){ unit.v = "ri"; i++; }
        else if(SIGN[w[i]]){ unit.v = VK[w[i]]; unit.sign = w[i]; i++; }
        if(w[i] === "ं" || w[i] === "ँ"){ unit.nasal = w[i]; i++; }
        u.push(unit);
      } else if(VOW[ch]){
        var vu = {c:null, v:VK[ch], ind:ch, nasal:""}; i++;
        if(w[i] === "ं" || w[i] === "ँ"){ vu.nasal = w[i]; i++; }
        u.push(vu);
      } else { u.push({raw:ch}); i++; }
    }
    // 2. drop the silent "a" (Hindi schwa deletion), right to left
    for(var k = u.length-1; k >= 0; k--){
      var x = u[k];
      if(!x.c || x.v !== "a" || x.nasal) continue;
      if(k === 0) continue;
      var prev = u[k-1], nxt = u[k+1];
      if(k === u.length-1){ x.v = ""; x.dropped = true; continue; }
      if(prev && (prev.c || prev.ind) && prev.v && !prev.dropped && nxt && nxt.c && nxt.v){ x.v = ""; x.dropped = true; }
    }
    // 3. write Tamil
    var out = "";
    for(var j = 0; j < u.length; j++){
      var t = u[j], next = u[j+1], nextBase = next && next.c ? next.c : null;
      if(t.raw !== undefined){ out += t.raw; continue; }
      if(t.c){
        var base = t.nk && NUKTA[t.c] ? NUKTA[t.c] : CONS[t.c];
        if(t.c === "न" && (j === 0 || (t.v === "" && nextBase && "तथदध".indexOf(nextBase) > -1))) base = "ந";
        if(t.v === "") out += base + "்";
        else if(t.v === "ri") out += base + "்ரு";
        else if(t.v === "a") out += base;
        else out += base + SIGN[t.sign];
      } else {
        out += VOW[t.ind];
      }
      if(t.nasal){
        var pv = t.v === "" ? "a" : t.v;
        out += nasalBefore(nextBase, pv, t.nasal === "ँ");
      }
    }
    return out;
  }
  function toTamil(s){
    return String(s).replace(/।/g, ".").replace(/[\u0900-\u097F]+/g, function(w){ return word2ta(w); });
  }

  // ───────────── content ─────────────
  var T = [
  {id:"food", title:"Fruits and food · फल और खाना",
   l1:["सेब|apple","केला|banana","आम|mango","संतरा|orange","अंगूर|grapes","अंडा|egg","दूध|milk","चावल|rice","इडली|idli","पानी|water"],
   l2:["लाल सेब|apple","पीला केला|banana","मीठा आम|mango","गरम इडली|idli","ठंडा पानी|water","एक अंडा|egg","एक गिलास दूध|milk","बड़ा संतरा|orange"],
   l3:["मुझे आम पसंद है।|mango","यह सेब है।|apple","मुझे पानी चाहिए।|water","मुझे इडली पसंद है।|idli","यह दूध है।|milk","मेरे पास केला है।|banana","मुझे चावल पसंद है।|rice","यह अंडा है।|egg"],
   l4:["मेरी माँ गरम इडली बनाती हैं।|idli","आम मेरा पसंदीदा फल है।|mango","मुझे एक गिलास पानी चाहिए।|water","दोपहर में हम चावल खाते हैं।|rice","मुझे सुबह दूध पीना पसंद है।|milk","सेब लाल और मीठा है।|apple"],
   l5:[{title:"My favourite fruit", pic:"mango", turns:[
        {robo:"यह क्या है?", child:"यह आम है।"},
        {robo:"क्या तुम्हें आम पसंद है?", child:"हाँ, मुझे आम पसंद है।"},
        {robo:"आम किस रंग का है?", child:"आम पीला है।"}]},
       {title:"Breakfast", pic:"idli", turns:[
        {robo:"आज नाश्ते में क्या था?", child:"आज इडली थी।"},
        {robo:"क्या इडली गरम थी?", child:"हाँ, इडली गरम थी।"},
        {robo:"इडली किसने बनाई?", child:"मेरी माँ ने बनाई।"}]}]},

  {id:"animals", title:"Animals · जानवर",
   l1:["बिल्ली|cat","कुत्ता|dog","गाय|cow","बकरी|goat","मुर्गी|hen","बतख|duck","मछली|fish","हाथी|elephant","खरगोश|rabbit","बंदर|monkey"],
   l2:["काली बिल्ली|cat","बड़ा कुत्ता|dog","सफ़ेद गाय|cow","छोटी मछली|fish","मेरा कुत्ता|dog","दो बतख|duck","छोटा खरगोश|rabbit","बड़ा हाथी|elephant"],
   l3:["यह बिल्ली है।|cat","यह कुत्ता है।|dog","गाय बड़ी है।|cow","मुझे खरगोश पसंद है।|rabbit","मछली पानी में है।|fish","बतख तैरती है।|duck","मेरे पास कुत्ता है।|dog","हाथी बहुत बड़ा है।|elephant"],
   l4:["गाय हमें दूध देती है।|cow","मेरा कुत्ता बहुत तेज़ दौड़ता है।|dog","बंदर पेड़ पर है।|monkey","मुर्गी रोज़ अंडा देती है।|hen","मंदिर में एक हाथी है।|elephant","मछली पानी में रहती है।|fish"],
   l5:[{title:"My pet", pic:"dog", turns:[
        {robo:"क्या तुम्हारे पास कुत्ता है?", child:"हाँ, मेरे पास कुत्ता है।"},
        {robo:"तुम्हारा कुत्ता किस रंग का है?", child:"मेरा कुत्ता काला है।"},
        {robo:"उसका नाम क्या है?", child:"उसका नाम मोती है।"}]},
       {title:"The cow", pic:"cow", turns:[
        {robo:"हमें दूध कौन देता है?", child:"गाय हमें दूध देती है।"},
        {robo:"गाय किस रंग की है?", child:"गाय सफ़ेद है।"},
        {robo:"गाय के कितने पैर हैं?", child:"गाय के चार पैर हैं।"}]}]},

  {id:"birds", title:"Birds and small creatures · पक्षी और छोटे जीव",
   l1:["चिड़िया|bird","तोता|parrot","कौआ|crow","मोर|peacock","तितली|butterfly","चींटी|ant","मधुमक्खी|bee","मेंढक|frog","साँप|snake","गिलहरी|squirrel"],
   l2:["हरा तोता|parrot","काला कौआ|crow","नीला मोर|peacock","छोटी चींटी|ant","पीली तितली|butterfly","बड़ा मेंढक|frog","लंबा साँप|snake","छोटी गिलहरी|squirrel"],
   l3:["चिड़िया उड़ती है।|bird","यह कौआ है।|crow","तोता हरा है।|parrot","मधुमक्खी शहद बनाती है।|bee","मेंढक कूदता है।|frog","चींटी छोटी है।|ant","मुझे तितली पसंद है।|butterfly","मोर नाचता है।|peacock"],
   l4:["कौआ दीवार पर बैठा है।|crow","तोता बोल सकता है।|parrot","तितली फूल पर है।|butterfly","गिलहरी पेड़ पर चढ़ती है।|squirrel","चींटियाँ लाइन में चलती हैं।|ant","मोर हमारा राष्ट्रीय पक्षी है।|peacock"],
   l5:[{title:"The parrot", pic:"parrot", turns:[
        {robo:"चिड़िया क्या करती है?", child:"चिड़िया उड़ती है।"},
        {robo:"क्या तोता बोल सकता है?", child:"हाँ, तोता बोल सकता है।"},
        {robo:"तोता किस रंग का है?", child:"तोता हरा है।"}]},
       {title:"In the garden", pic:"butterfly", turns:[
        {robo:"बगीचे में क्या है?", child:"बगीचे में तितली है।"},
        {robo:"तितली कहाँ है?", child:"तितली फूल पर है।"},
        {robo:"तितली किस रंग की है?", child:"तितली पीली है।"}]}]},

  {id:"body", title:"My body · मेरा शरीर",
   l1:["सिर|head","आँखें|eye","कान|ear","नाक|nose","मुँह|mouth","हाथ|hand","पैर|leg","बाल|hair","दाँत|teeth","उंगली|finger"],
   l2:["मेरा सिर|head","दो आँखें|eye","दो कान|ear","मेरी नाक|nose","छोटा हाथ|hand","लंबे बाल|hair","सफ़ेद दाँत|teeth","दस उंगलियाँ|finger"],
   l3:["यह मेरी नाक है।|nose","मेरी दो आँखें हैं।|eye","हम आँखों से देखते हैं।|eye","हम कानों से सुनते हैं।|ear","मेरी दस उंगलियाँ हैं।|finger","मेरे बाल काले हैं।|hair","यह मेरा हाथ है।|hand","मेरे दाँत सफ़ेद हैं।|teeth"],
   l4:["खाने से पहले हाथ धोओ।|hand","रोज़ सुबह दाँत साफ़ करो।|teeth","स्कूल से पहले बाल बनाओ।|hair","हम नाक से फूल सूँघते हैं।|nose","हम पैरों से चलते हैं।|leg","अपने सिर को हाथ से छुओ।|head"],
   l5:[{title:"Show me", pic:"nose", turns:[
        {robo:"अपनी नाक दिखाओ।", child:"यह मेरी नाक है।"},
        {robo:"तुम्हारी कितनी आँखें हैं?", child:"मेरी दो आँखें हैं।"},
        {robo:"हम आँखों से क्या करते हैं?", child:"हम आँखों से देखते हैं।"}]},
       {title:"Clean hands", pic:"hand", turns:[
        {robo:"खाने से पहले क्या करना चाहिए?", child:"हाथ धोने चाहिए।"},
        {robo:"क्यों?", child:"हाथ साफ़ रखने के लिए।"},
        {robo:"दाँत कब साफ़ करते हैं?", child:"रोज़ सुबह।"}]}]},

  {id:"family", title:"My family · मेरा परिवार",
   l1:["माँ|mother","पिताजी|father","बहन|sister","भाई|brother","दादी|grandmother","दादा|grandfather","बच्चा|baby","चाचा|uncle","चाची|aunt","परिवार|family"],
   l2:["मेरी माँ|mother","मेरे पिताजी|father","बड़ी बहन|sister","छोटा भाई|brother","मेरी दादी|grandmother","छोटा बच्चा|baby","मेरे चाचा|uncle","मेरा परिवार|family"],
   l3:["यह मेरी माँ हैं।|mother","ये मेरे पिताजी हैं।|father","मेरी एक बहन है।|sister","मेरा भाई छोटा है।|brother","दादी कहानी सुनाती हैं।|grandmother","बच्चा सो रहा है।|baby","मेरा परिवार बहुत अच्छा है।|family","पिताजी काम पर जाते हैं।|father"],
   l4:["मेरे परिवार में पाँच लोग हैं।|family","मेरी माँ स्वादिष्ट खाना बनाती हैं।|mother","पिताजी मुझे स्कूल छोड़ते हैं।|father","मुझे छोटे भाई के साथ खेलना पसंद है।|brother","दादी रात को कहानी सुनाती हैं।|grandmother","बहन होमवर्क में मेरी मदद करती है।|sister"],
   l5:[{title:"My family", pic:"family", turns:[
        {robo:"तुम्हारे परिवार में कौन-कौन है?", child:"माँ, पिताजी और बहन।"},
        {robo:"घर में खाना कौन बनाता है?", child:"मेरी माँ खाना बनाती हैं।"},
        {robo:"क्या तुम्हें अपना परिवार पसंद है?", child:"हाँ, मुझे अपना परिवार बहुत पसंद है।"}]},
       {title:"Story time", pic:"grandmother", turns:[
        {robo:"तुम्हें कहानी कौन सुनाता है?", child:"मेरी दादी कहानी सुनाती हैं।"},
        {robo:"कब?", child:"रात को।"},
        {robo:"क्या तुम्हें कहानियाँ पसंद हैं?", child:"हाँ, बहुत पसंद हैं।"}]}]},

  {id:"school", title:"My school · मेरा स्कूल",
   l1:["स्कूल|school","किताब|book","पेन|pen","पेंसिल|pencil","बस्ता|bag","डिब्बा|box","शिक्षक|teacher","बेंच|bench","बोर्ड|board","रबड़|eraser"],
   l2:["मेरा बस्ता|bag","लाल पेन|pen","नई किताब|book","नीली पेंसिल|pencil","बड़ा बोर्ड|board","मेरे शिक्षक|teacher","छोटा रबड़|eraser","टिफ़िन का डिब्बा|box"],
   l3:["यह मेरा बस्ता है।|bag","मेरे पास पेंसिल है।|pencil","यह मेरी किताब है।|book","यह लाल पेन है।|pen","मेरे शिक्षक अच्छे हैं।|teacher","यह मेरी बेंच है।|bench","यह मेरा स्कूल है।|school","मुझे अपना स्कूल पसंद है।|school"],
   l4:["स्कूल वैन मुझे स्कूल ले जाती है।|van","शिक्षक बोर्ड पर लिखते हैं।|board","मेरी किताबें बस्ते में हैं।|bag","मेरे पास रोज़ टिफ़िन होता है।|box","मेरा दोस्त मेरे पास बैठता है।|bench","कृपया अपना रबड़ दो।|eraser"],
   l5:[{title:"Can I borrow?", pic:"pencil", turns:[
        {robo:"क्या मुझे पेंसिल मिलेगी?", child:"हाँ, यह लो।"},
        {robo:"धन्यवाद!", child:"कोई बात नहीं।"},
        {robo:"क्या तुम्हारे पास रबड़ है?", child:"हाँ, मेरे पास रबड़ है।"}]},
       {title:"My bag", pic:"bag", turns:[
        {robo:"तुम्हारे बस्ते में क्या है?", child:"किताबें और पेंसिल।"},
        {robo:"क्या टिफ़िन भी है?", child:"हाँ, टिफ़िन भी है।"},
        {robo:"बस्ता किस रंग का है?", child:"मेरा बस्ता नीला है।"}]}]},

  {id:"colours", title:"Colours and shapes · रंग और आकार",
   l1:["लाल|#D32F2F","नीला|#1E63C8","हरा|#2E8B3E","पीला|#F2C200","काला|#111111","सफ़ेद|#FFFFFF","गुलाबी|#F06292","भूरा|#7B4A2A","गोला|circle","चौकोर|square"],
   l2:["लाल गेंद|ball","नीला आसमान|sky","हरा पत्ता|leaf","पीला सूरज|sun","काली बिल्ली|cat","सफ़ेद दूध|milk","गुलाबी फूल|flower","भूरा डिब्बा|box"],
   l3:["आसमान नीला है।|sky","पत्ता हरा है।|leaf","सूरज पीला है।|sun","मेरा बस्ता लाल है।|bag","यह गोला है।|circle","मुझे गुलाबी रंग पसंद है।|#F06292","कौआ काला है।|crow","दूध सफ़ेद है।|milk"],
   l4:["मेरा पसंदीदा रंग नीला है।|#1E63C8","आसमान नीला और बादल सफ़ेद हैं।|cloud","मेरे पास लाल और पीली गेंद है।|ball","तोता हरा है और उसकी चोंच लाल है।|parrot","बोर्ड पर एक बड़ा गोला बनाओ।|circle","मेरी कमीज़ नीली है।|shirt"],
   l5:[{title:"Favourite colour", pic:"#D32F2F", turns:[
        {robo:"तुम्हारा पसंदीदा रंग कौन सा है?", child:"मेरा पसंदीदा रंग लाल है।"},
        {robo:"क्या चीज़ लाल होती है?", child:"सेब लाल होता है।"},
        {robo:"आसमान किस रंग का है?", child:"आसमान नीला है।"}]},
       {title:"Shapes", pic:"circle", turns:[
        {robo:"यह कौन सा आकार है?", child:"यह गोला है।"},
        {robo:"क्या चीज़ गोल होती है?", child:"गेंद गोल होती है।"},
        {robo:"बोर्ड पर चौकोर बनाओ।", child:"यह चौकोर है।"}]}]},

  {id:"numbers", title:"Numbers · गिनती",
   l1:["एक|1","दो|2","तीन|3","चार|4","पाँच|5","छह|6","सात|7","आठ|8","नौ|9","दस|10"],
   l2:["एक सेब|apple","दो आँखें|eye","तीन गेंदें|ball","चार पैर|cow","पाँच उंगलियाँ|hand","छह अंडे|egg","सात दिन|7","दस उंगलियाँ|finger"],
   l3:["मेरे दो हाथ हैं।|hand","मेरी उम्र पाँच साल है।|5","तीन चिड़ियाँ हैं।|bird","गाय के चार पैर हैं।|cow","मेरी दस उंगलियाँ हैं।|finger","मुझे एक पेंसिल दो।|pencil","हफ़्ते में सात दिन होते हैं।|7","मुझे दो केले चाहिए।|banana"],
   l4:["मैं कक्षा तीन में हूँ।|3","मेरी कक्षा में बीस बच्चे हैं।|school","मेरी वैन आठ बजे आती है।|van","मेरे दो भाई और एक बहन है।|family","हम एक से दस तक गिन सकते हैं।|10","स्कूल नौ बजे शुरू होता है।|9"],
   l5:[{title:"How old are you?", pic:"6", turns:[
        {robo:"तुम्हारी उम्र क्या है?", child:"मेरी उम्र छह साल है।"},
        {robo:"तुम्हारी कितनी उंगलियाँ हैं?", child:"मेरी दस उंगलियाँ हैं।"},
        {robo:"पाँच तक गिनो।", child:"एक, दो, तीन, चार, पाँच।"}]},
       {title:"At the shop", pic:"banana", turns:[
        {robo:"तुम्हें कितने केले चाहिए?", child:"मुझे दो केले चाहिए।"},
        {robo:"यह लो।", child:"धन्यवाद।"},
        {robo:"और कुछ चाहिए?", child:"नहीं, धन्यवाद।"}]}]},

  {id:"home", title:"My home · मेरा घर",
   l1:["घर|house","दरवाज़ा|door","खिड़की|window","पंखा|fan","बत्ती|light","पलंग|bed","कुर्सी|chair","मेज़|table","कप|cup","टीवी|television"],
   l2:["मेरा घर|house","बड़ा दरवाज़ा|door","खुली खिड़की|window","नया पंखा|fan","नरम पलंग|bed","छोटी कुर्सी|chair","गोल मेज़|table","चाय का कप|cup"],
   l3:["यह मेरा घर है।|house","दरवाज़ा खोलो।|door","खिड़की बंद करो।|window","पंखा चलाओ।|fan","यह मेरा पलंग है।|bed","कुर्सी पर बैठो।|chair","कप मेज़ पर है।|cup","टीवी बंद करो।|television"],
   l4:["मेरा घर मंदिर के पास है।|house","कृपया बत्ती जलाओ।|light","रात को हम पलंग पर सोते हैं।|bed","हम मेज़ पर खाना खाते हैं।|table","दादाजी कुर्सी पर बैठे हैं।|chair","मुझे टीवी पर कार्टून देखना पसंद है।|television"],
   l5:[{title:"A hot day", pic:"fan", turns:[
        {robo:"क्या आज गरमी है?", child:"हाँ, बहुत गरमी है।"},
        {robo:"क्या चलाएँ?", child:"पंखा चलाओ।"},
        {robo:"क्या खिड़की खोलें?", child:"हाँ, खिड़की खोलो।"}]},
       {title:"My house", pic:"house", turns:[
        {robo:"तुम्हारा घर बड़ा है या छोटा?", child:"मेरा घर बड़ा है।"},
        {robo:"तुम्हारा घर कहाँ है?", child:"मेरा घर मंदिर के पास है।"},
        {robo:"घर में कौन रहता है?", child:"मेरा परिवार रहता है।"}]}]},

  {id:"clothes", title:"Clothes · कपड़े",
   l1:["कमीज़|shirt","पैंट|pants","फ़्रॉक|dress","जूते|shoe","मोज़े|sock","टोपी|hat","वर्दी|uniform","साड़ी|saree","टाई|tie","बेल्ट|belt"],
   l2:["सफ़ेद कमीज़|shirt","नीली पैंट|pants","नई फ़्रॉक|dress","काले जूते|shoe","मेरे मोज़े|sock","लाल टोपी|hat","स्कूल की वर्दी|uniform","रेशमी साड़ी|saree"],
   l3:["यह मेरी कमीज़ है।|shirt","ये मेरे जूते हैं।|shoe","मेरी फ़्रॉक नई है।|dress","यह मेरी टोपी है।|hat","माँ साड़ी पहनती हैं।|saree","यह मेरी वर्दी है।|uniform","मोज़े पहनो।|sock","जूते पहनो।|shoe"],
   l4:["स्कूल में हम वर्दी पहनते हैं।|uniform","माँ मंदिर में रेशमी साड़ी पहनती हैं।|saree","दीवाली पर हम नए कपड़े पहनते हैं।|dress","जूते बाहर उतारो।|shoe","धूप में टोपी पहनो।|hat","मेरी टाई नीली और सफ़ेद है।|tie"],
   l5:[{title:"Getting ready", pic:"uniform", turns:[
        {robo:"तुमने क्या पहना है?", child:"मैंने वर्दी पहनी है।"},
        {robo:"तुम्हारी कमीज़ किस रंग की है?", child:"मेरी कमीज़ सफ़ेद है।"},
        {robo:"तुम्हारे जूते कहाँ हैं?", child:"मेरे जूते पैरों में हैं।"}]},
       {title:"Festival day", pic:"dress", turns:[
        {robo:"दीवाली पर क्या पहनते हैं?", child:"नए कपड़े पहनते हैं।"},
        {robo:"किस रंग के?", child:"गुलाबी रंग के।"},
        {robo:"क्या तुम्हें नए कपड़े पसंद हैं?", child:"हाँ, बहुत पसंद हैं।"}]}]},

  {id:"travel", title:"Going places · सफ़र",
   l1:["बस|bus","कार|car","वैन|van","मोटरसाइकिल|bike","साइकिल|cycle","रेलगाड़ी|train","नाव|boat","ऑटो|auto","सड़क|road","मंदिर|temple"],
   l2:["स्कूल वैन|van","लाल कार|car","तेज़ रेलगाड़ी|train","छोटी नाव|boat","मेरी साइकिल|cycle","बड़ी बस|bus","लंबी सड़क|road","पुराना मंदिर|temple"],
   l3:["यह बस है।|bus","रेलगाड़ी लंबी है।|train","यह मेरी साइकिल है।|cycle","नाव पानी में है।|boat","पिताजी के पास मोटरसाइकिल है।|bike","हम मंदिर जाते हैं।|temple","सड़क ध्यान से पार करो।|road","यह स्कूल वैन है।|van"],
   l4:["हम स्कूल वैन से स्कूल जाते हैं।|van","हम कार से मंदिर गए।|car","रेलगाड़ी बहुत लंबी और तेज़ है।|train","पिताजी मुझे मोटरसाइकिल पर ले जाते हैं।|bike","सड़क पार करने से पहले दोनों तरफ़ देखो।|road","हम ऑटो से बाज़ार गए।|auto"],
   l5:[{title:"Coming to school", pic:"van", turns:[
        {robo:"तुम स्कूल कैसे आते हो?", child:"वैन से।"},
        {robo:"वैन कौन चलाता है?", child:"ड्राइवर चलाते हैं।"},
        {robo:"क्या तुम्हें वैन पसंद है?", child:"हाँ, पसंद है।"}]},
       {title:"Temple visit", pic:"temple", turns:[
        {robo:"रविवार को कहाँ गए थे?", child:"हम मंदिर गए थे।"},
        {robo:"किसके साथ?", child:"परिवार के साथ।"},
        {robo:"कैसे गए?", child:"कार से गए।"}]}]},

  {id:"nature", title:"Nature and weather · प्रकृति और मौसम",
   l1:["सूरज|sun","चाँद|moon","तारा|star","पेड़|tree","फूल|flower","पत्ता|leaf","बारिश|rain","बादल|cloud","आसमान|sky","नदी|river"],
   l2:["गरम सूरज|sun","पूरा चाँद|moon","ऊँचा पेड़|tree","लाल फूल|flower","हरा पत्ता|leaf","तेज़ बारिश|rain","काला बादल|cloud","नीला आसमान|sky"],
   l3:["सूरज गरम है।|sun","वह चाँद है।|moon","बारिश हो रही है।|rain","पेड़ ऊँचा है।|tree","फूल लाल है।|flower","रात को तारे चमकते हैं।|star","आसमान नीला है।|sky","नदी लंबी है।|river"],
   l4:["सूरज सुबह निकलता है।|sun","रात को आसमान में तारे होते हैं।|star","बारिश हो रही है, छाता ले लो।|umbrella","हमें और पेड़ लगाने चाहिए।|tree","चिड़िया पेड़ पर रहती है।|nest","हमारे शहर के पास नदी बहती है।|river"],
   l5:[{title:"Today's weather", pic:"sun", turns:[
        {robo:"आज मौसम कैसा है?", child:"आज धूप है।"},
        {robo:"क्या बारिश हो रही है?", child:"नहीं, बारिश नहीं हो रही।"},
        {robo:"क्या तुम्हें बारिश पसंद है?", child:"हाँ, मुझे बारिश पसंद है।"}]},
       {title:"At night", pic:"moon", turns:[
        {robo:"रात को आसमान में क्या दिखता है?", child:"चाँद और तारे।"},
        {robo:"चाँद कैसा है?", child:"चाँद गोल है।"},
        {robo:"तुम कब सोते हो?", child:"नौ बजे।"}]}]},

  {id:"actions", title:"Things I do · काम",
   l1:["दौड़ो|run","कूदो|jump","चलो|walk","बैठो|sit","खड़े हो|stand","खाओ|eat","पियो|drink","सो जाओ|sleep","पढ़ो|read","लिखो|write"],
   l2:["तेज़ दौड़ो|run","ऊँचा कूदो|jump","धीरे चलो|walk","नीचे बैठो|sit","खड़े हो जाओ|stand","खाना खाओ|eat","पानी पियो|drink","किताब पढ़ो|read"],
   l3:["मुझे दौड़ना पसंद है।|run","मुझे कूदना पसंद है।|jump","कृपया बैठ जाओ।|sit","कृपया खड़े हो जाओ।|stand","मुझे चावल खाना पसंद है।|eat","मुझे किताब पढ़ना पसंद है।|read","अपना नाम लिखो।|write","रात को सो जाओ।|sleep"],
   l4:["मैदान में तेज़ दौड़ो।|run","रोज़ एक कहानी की किताब पढ़ो।|read","होमवर्क साफ़-साफ़ लिखो।|write","कृपया लाइन में खड़े हो जाओ।|stand","जल्दी सोओ और जल्दी उठो।|sleep","शाम को हम खेलते हैं।|ball"],
   l5:[{title:"Playtime", pic:"jump", turns:[
        {robo:"तुम्हें क्या करना पसंद है?", child:"मुझे दौड़ना और कूदना पसंद है।"},
        {robo:"क्या तुम्हें खेलना पसंद है?", child:"हाँ, मुझे खेलना पसंद है।"},
        {robo:"कौन सा खेल?", child:"मुझे क्रिकेट पसंद है।"}]},
       {title:"After school", pic:"read", turns:[
        {robo:"स्कूल के बाद क्या करते हो?", child:"हम दोस्तों के साथ खेलते हैं।"},
        {robo:"होमवर्क कब करते हो?", child:"शाम को।"},
        {robo:"कब सोते हो?", child:"रात को।"}]}]},

  {id:"manners", title:"Feelings and good manners · भावनाएँ और अच्छी आदतें",
   l1:["खुश|happy","उदास|sad","गुस्सा|angry","भूख|hungry","प्यास|thirsty","थकान|tired","माफ़ कीजिए|sorry","कृपया|please","धन्यवाद|thankyou","नमस्ते|hello"],
   l2:["बहुत खुश|happy","थोड़ा उदास|sad","बहुत भूख|hungry","सुप्रभात|sun","बहुत धन्यवाद|thankyou","ज़रा सुनिए|please","शुभ रात्रि|moon","फिर मिलेंगे|hello"],
   l3:["मैं खुश हूँ।|happy","मुझे भूख लगी है।|hungry","मुझे प्यास लगी है।|thirsty","मुझे नींद आ रही है।|tired","नमस्ते, शिक्षक जी।|teacher","बहुत-बहुत धन्यवाद।|thankyou","मुझे माफ़ कीजिए।|sorry","क्या मैं अंदर आऊँ?|door"],
   l4:["नमस्ते शिक्षक जी, क्या मैं अंदर आऊँ?|door","मुझे भूख लगी है, क्या अब खाना खाएँ?|hungry","माफ़ कीजिए, मेरी किताब घर पर रह गई।|sorry","मदद के लिए धन्यवाद।|thankyou","क्या मैं पानी पीने जाऊँ?|water","दोस्तों के साथ खेलकर मुझे ख़ुशी होती है।|happy"],
   l5:[{title:"Good morning", pic:"happy", turns:[
        {robo:"नमस्ते!", child:"नमस्ते!"},
        {robo:"तुम कैसे हो?", child:"मैं ठीक हूँ, धन्यवाद।"},
        {robo:"क्या आज तुम खुश हो?", child:"हाँ, मैं बहुत खुश हूँ।"}]},
       {title:"Late to class", pic:"door", turns:[
        {robo:"आज देर हो गई!", child:"माफ़ कीजिए, क्या मैं अंदर आऊँ?"},
        {robo:"हाँ, आओ।", child:"धन्यवाद।"},
        {robo:"देर क्यों हुई?", child:"मेरी वैन देर से आई।"}]}]}
  ];

  var LEVELS = [
    {n:1, name:"Single words",     goal:"Say the word for the picture."},
    {n:2, name:"Two words",        goal:"Join two words together."},
    {n:3, name:"Short sentences",  goal:"Make a short sentence with a pattern."},
    {n:4, name:"Longer sentences", goal:"Talk about daily life in one sentence."},
    {n:5, name:"Conversations",    goal:"Answer Robo in a small conversation."}
  ];
  var PATTERNS = ["यह ___ है।","मेरे पास ___ है।","मुझे ___ पसंद है।","मुझे ___ चाहिए।","___ करो।"];

  function split(s){
    var p = s.split("|"), text = p[0], pic = p[1] || "", ta = p[2] || toTamil(text);
    var item = {t:text, ta:ta};
    if (/^#[0-9a-f]{6}$/i.test(pic)) item.swatch = pic;
    else if (/^\d+$/.test(pic)) item.digit = pic;
    else if (pic) item.pic = pic;
    return item;
  }
  function turn(t){ return {robo:t.robo, child:t.child, robo_ta:t.robo_ta || toTamil(t.robo), child_ta:t.child_ta || toTamil(t.child)}; }

  var topics = T.map(function(tp){
    var l5 = tp.l5.map(function(c){
      var head = split(" |" + (c.pic || ""));
      var out = {title:c.title, turns:c.turns.map(turn)};
      if (head.pic) out.pic = head.pic; if (head.swatch) out.swatch = head.swatch; if (head.digit) out.digit = head.digit;
      return out;
    });
    return {id:tp.id, title:tp.title,
      levels:{1:tp.l1.map(split), 2:tp.l2.map(split), 3:tp.l3.map(split), 4:tp.l4.map(split), 5:l5}};
  });

  function pictureWords(){
    var seen = {}, list = [];
    topics.forEach(function(tp){ [1,2,3,4,5].forEach(function(n){
      tp.levels[n].forEach(function(it){ if (it.pic && !seen[it.pic]){ seen[it.pic] = 1; list.push(it.pic); } }); }); });
    return list.sort();
  }

  window.SPEAKING_LADDER_HI = {
    version:1, lang:"hi", levels:LEVELS, patterns:PATTERNS, topics:topics, pictureWords:pictureWords, toTamil:toTamil,
    talkQ:{ what:"यह क्या है?", colour:"यह कौन सा रंग है?", number:"यह कौन सी संख्या है?" }
  };
})();
