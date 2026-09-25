/* DigiSmart Speaking Ladder — shared by TeachBot (classroom) and GLM (home practice).
   English only. Children are placed by LEVEL, not by class.

   Each line is "sentence|picture". The picture is the word's name in the
   Super Admin Picture Library (kg_pictures.word). Leave it blank for no picture.
   Colours use a colour swatch and numbers show the digit instead of a picture.

   Level 1  Single words
   Level 2  Two words
   Level 3  Short sentences (3–4 words) built on simple patterns
   Level 4  Longer sentences (5–8 words) from daily life
   Level 5  Small conversations with Robo (robo speaks, child answers)       */

(function(){
  var LEVELS = [
    {n:1, name:"Single words",     goal:"Say the word for the picture."},
    {n:2, name:"Two words",        goal:"Join two words together."},
    {n:3, name:"Short sentences",  goal:"Make a short sentence with a pattern."},
    {n:4, name:"Longer sentences", goal:"Talk about daily life in one sentence."},
    {n:5, name:"Conversations",    goal:"Answer Robo in a small conversation."}
  ];

  // Sentence patterns used in Level 3. Children learn one pattern and reuse it with known words.
  var PATTERNS = ["This is a ___.", "I have a ___.", "I like ___.", "I can ___.", "I see a ___.",
                  "I want ___.", "The ___ is ___.", "I am ___."];

  var T = [
  {id:"food", title:"Fruits and food",
   l1:["apple|apple","banana|banana","mango|mango","orange|orange","grapes|grapes","egg|egg","milk|milk","rice|rice","idli|idli","water|water"],
   l2:["red apple|apple","yellow banana|banana","sweet mango|mango","hot idli|idli","cold water|water","one egg|egg","a glass of milk|milk","big orange|orange"],
   l3:["I like mango.|mango","This is an apple.|apple","I want water.|water","I eat idli.|idli","I drink milk.|milk","I have a banana.|banana","I like rice.|rice","This is an egg.|egg"],
   l4:["I eat idli for breakfast.|idli","My mother makes hot idli.|idli","I drink milk every morning.|milk","Mango is my favourite fruit.|mango","I want a glass of water.|water","We eat rice for lunch.|rice"],
   l5:[{title:"My favourite fruit", pic:"mango", turns:[
        {robo:"What is this?", child:"This is a mango."},
        {robo:"Do you like mango?", child:"Yes, I like mango."},
        {robo:"What colour is it?", child:"It is yellow."}]},
       {title:"Breakfast", pic:"idli", turns:[
        {robo:"What did you eat today?", child:"I ate idli."},
        {robo:"Was it hot?", child:"Yes, it was hot."},
        {robo:"Who made it?", child:"My mother made it."}]}]},

  {id:"animals", title:"Animals",
   l1:["cat|cat","dog|dog","cow|cow","goat|goat","hen|hen","duck|duck","fish|fish","elephant|elephant","rabbit|rabbit","monkey|monkey"],
   l2:["black cat|cat","big dog|dog","white cow|cow","small fish|fish","my dog|dog","two ducks|duck","little rabbit|rabbit","big elephant|elephant"],
   l3:["This is a cat.|cat","I see a dog.|dog","The cow is big.|cow","I like rabbits.|rabbit","The fish can swim.|fish","The duck can swim.|duck","I have a dog.|dog","The elephant is big.|elephant"],
   l4:["The cow gives us milk.|cow","My dog runs very fast.|dog","The monkey is on the tree.|monkey","The hen lays eggs every day.|hen","I saw an elephant at the temple.|elephant","The fish lives in water.|fish"],
   l5:[{title:"My pet", pic:"dog", turns:[
        {robo:"Do you have a pet?", child:"Yes, I have a dog."},
        {robo:"What colour is your dog?", child:"My dog is black."},
        {robo:"What does your dog do?", child:"My dog runs and plays."}]},
       {title:"The cow", pic:"cow", turns:[
        {robo:"Which animal gives us milk?", child:"The cow gives us milk."},
        {robo:"What colour is the cow?", child:"The cow is white."},
        {robo:"How many legs does a cow have?", child:"A cow has four legs."}]}]},

  {id:"birds", title:"Birds and small creatures",
   l1:["bird|bird","parrot|parrot","crow|crow","peacock|peacock","butterfly|butterfly","ant|ant","bee|bee","frog|frog","snake|snake","squirrel|squirrel"],
   l2:["green parrot|parrot","black crow|crow","blue peacock|peacock","small ant|ant","yellow butterfly|butterfly","big frog|frog","long snake|snake","busy bee|bee"],
   l3:["The bird can fly.|bird","I see a crow.|crow","The parrot is green.|parrot","The bee makes honey.|bee","The frog can jump.|frog","The ant is small.|ant","I like butterflies.|butterfly","The peacock can dance.|peacock"],
   l4:["The crow is sitting on the wall.|crow","The parrot can talk.|parrot","A butterfly is on the flower.|butterfly","The squirrel is eating a nut.|squirrel","Ants walk in a line.|ant","The peacock is our national bird.|peacock"],
   l5:[{title:"Can you fly?", pic:"bird", turns:[
        {robo:"What can a bird do?", child:"A bird can fly."},
        {robo:"Can you fly?", child:"No, I cannot fly."},
        {robo:"What can you do?", child:"I can run."}]},
       {title:"In the garden", pic:"butterfly", turns:[
        {robo:"What do you see in the garden?", child:"I see a butterfly."},
        {robo:"Where is it?", child:"It is on the flower."},
        {robo:"What colour is it?", child:"It is yellow."}]}]},

  {id:"body", title:"My body",
   l1:["head|head","eyes|eye","ears|ear","nose|nose","mouth|mouth","hand|hand","leg|leg","hair|hair","teeth|teeth","fingers|finger"],
   l2:["my head|head","two eyes|eye","two ears|ear","my nose|nose","small hand|hand","long hair|hair","white teeth|teeth","ten fingers|finger"],
   l3:["This is my nose.|nose","I have two eyes.|eye","I see with my eyes.|eye","I hear with my ears.|ear","I have ten fingers.|finger","I brush my teeth.|teeth","My hair is black.|hair","I clap my hands.|hand"],
   l4:["I wash my hands before eating.|hand","I brush my teeth every morning.|teeth","I comb my hair before school.|hair","I smell flowers with my nose.|nose","I walk with my legs.|leg","I touch my head with my hand.|head"],
   l5:[{title:"Show me", pic:"nose", turns:[
        {robo:"Show me your nose.", child:"This is my nose."},
        {robo:"How many eyes do you have?", child:"I have two eyes."},
        {robo:"What do you do with your eyes?", child:"I see with my eyes."}]},
       {title:"Clean hands", pic:"hand", turns:[
        {robo:"What do you do before eating?", child:"I wash my hands."},
        {robo:"Why?", child:"To keep them clean."},
        {robo:"Very good! Do you brush your teeth?", child:"Yes, I brush every morning."}]}]},

  {id:"family", title:"My family",
   l1:["mother|mother","father|father","sister|sister","brother|brother","grandmother|grandmother","grandfather|grandfather","baby|baby","uncle|uncle","aunt|aunt","family|family"],
   l2:["my mother|mother","my father|father","big sister|sister","little brother|brother","my grandmother|grandmother","small baby|baby","my uncle|uncle","my family|family"],
   l3:["This is my mother.|mother","I love my father.|father","I have a sister.|sister","My brother is small.|brother","My grandmother tells stories.|grandmother","The baby is sleeping.|baby","I love my family.|family","My father goes to work.|father"],
   l4:["There are five people in my family.|family","My mother cooks tasty food.|mother","My father drops me at school.|father","I play with my little brother.|brother","My grandmother tells me stories at night.|grandmother","My sister helps me with homework.|sister"],
   l5:[{title:"My family", pic:"family", turns:[
        {robo:"Who is in your family?", child:"My mother, father and sister."},
        {robo:"Who cooks at home?", child:"My mother cooks at home."},
        {robo:"Do you love your family?", child:"Yes, I love my family."}]},
       {title:"Story time", pic:"grandmother", turns:[
        {robo:"Who tells you stories?", child:"My grandmother tells me stories."},
        {robo:"When?", child:"At night."},
        {robo:"Do you like her stories?", child:"Yes, I like them very much."}]}]},

  {id:"school", title:"My school",
   l1:["school|school","book|book","pen|pen","pencil|pencil","bag|bag","box|box","teacher|teacher","bench|bench","board|board","eraser|eraser"],
   l2:["my bag|bag","red pen|pen","new book|book","blue pencil|pencil","big board|board","my teacher|teacher","small eraser|eraser","lunch box|box"],
   l3:["This is my bag.|bag","I have a pencil.|pencil","I read a book.|book","I write with a pen.|pen","My teacher is kind.|teacher","I sit on the bench.|bench","I go to school.|school","I like my school.|school"],
   l4:["I go to school by van.|van","My teacher writes on the board.|board","I keep my books in my bag.|bag","I bring my lunch box every day.|box","I sit with my friend in class.|bench","Please give me your eraser.|eraser"],
   l5:[{title:"Can I borrow?", pic:"pencil", turns:[
        {robo:"Can I borrow your pencil?", child:"Yes, here it is."},
        {robo:"Thank you!", child:"You are welcome."},
        {robo:"Do you have an eraser?", child:"Yes, I have an eraser."}]},
       {title:"My bag", pic:"bag", turns:[
        {robo:"What is in your bag?", child:"My books and my pencil box."},
        {robo:"Is your lunch box in the bag?", child:"Yes, it is in my bag."},
        {robo:"What colour is your bag?", child:"My bag is blue."}]}]},

  {id:"colours", title:"Colours and shapes",
   l1:["red|#D32F2F","blue|#1E63C8","green|#2E8B3E","yellow|#F2C200","black|#111111","white|#FFFFFF","pink|#F06292","brown|#7B4A2A","circle|circle","square|square"],
   l2:["red ball|ball","blue sky|sky","green leaf|leaf","yellow sun|sun","black cat|cat","white milk|milk","pink flower|flower","brown box|box"],
   l3:["The sky is blue.|sky","The leaf is green.|leaf","The sun is yellow.|sun","My bag is red.|bag","This is a circle.|circle","I like pink.|#F06292","The crow is black.|crow","Milk is white.|milk"],
   l4:["My favourite colour is blue.|#1E63C8","The sky is blue and the clouds are white.|cloud","I have a red and yellow ball.|ball","The parrot is green with a red beak.|parrot","Draw a big circle on the board.|circle","I am wearing a blue shirt.|shirt"],
   l5:[{title:"Favourite colour", pic:"#D32F2F", turns:[
        {robo:"What is your favourite colour?", child:"My favourite colour is red."},
        {robo:"What is red?", child:"An apple is red."},
        {robo:"What colour is the sky?", child:"The sky is blue."}]},
       {title:"Shapes", pic:"circle", turns:[
        {robo:"What shape is this?", child:"It is a circle."},
        {robo:"What is round like a circle?", child:"A ball is round."},
        {robo:"Can you draw a square?", child:"Yes, I can draw a square."}]}]},

  {id:"numbers", title:"Numbers",
   l1:["one|1","two|2","three|3","four|4","five|5","six|6","seven|7","eight|8","nine|9","ten|10"],
   l2:["one apple|apple","two eyes|eye","three balls|ball","four legs|cow","five fingers|hand","six eggs|egg","seven days|7","ten fingers|finger"],
   l3:["I have two hands.|hand","I am five years old.|5","I see three birds.|bird","A cow has four legs.|cow","I have ten fingers.|finger","Give me one pencil.|pencil","A week has seven days.|7","I want two bananas.|banana"],
   l4:["I am in class three.|3","There are twenty children in my class.|school","I wake up at six o'clock.|6","I have two brothers and one sister.|family","I can count from one to ten.|10","My van comes at eight o'clock.|van"],
   l5:[{title:"How old are you?", pic:"6", turns:[
        {robo:"How old are you?", child:"I am six years old."},
        {robo:"How many fingers do you have?", child:"I have ten fingers."},
        {robo:"Can you count to five?", child:"One, two, three, four, five."}]},
       {title:"At the shop", pic:"banana", turns:[
        {robo:"How many bananas do you want?", child:"I want two bananas."},
        {robo:"Here you are.", child:"Thank you."},
        {robo:"Do you want anything else?", child:"No, thank you."}]}]},

  {id:"home", title:"My home",
   l1:["house|house","door|door","window|window","fan|fan","light|light","bed|bed","chair|chair","table|table","cup|cup","television|television"],
   l2:["my house|house","big door|door","open window|window","new fan|fan","soft bed|bed","small chair|chair","round table|table","cup of tea|cup"],
   l3:["This is my house.|house","Open the door.|door","Close the window.|window","Switch on the fan.|fan","I sleep on the bed.|bed","Sit on the chair.|chair","The cup is on the table.|cup","I watch television.|television"],
   l4:["My house is near the temple.|house","Please switch on the light.|light","I sleep on my bed at night.|bed","We eat food at the table.|table","My grandfather sits on the chair.|chair","I watch cartoons on television.|television"],
   l5:[{title:"A hot day", pic:"fan", turns:[
        {robo:"Is it hot today?", child:"Yes, it is very hot."},
        {robo:"What should we switch on?", child:"Switch on the fan."},
        {robo:"Good idea! Should we open the window?", child:"Yes, please open the window."}]},
       {title:"My house", pic:"house", turns:[
        {robo:"Is your house big or small?", child:"My house is big."},
        {robo:"Where do you sleep?", child:"I sleep on my bed."},
        {robo:"Where do you eat?", child:"I eat at the table."}]}]},

  {id:"clothes", title:"Clothes",
   l1:["shirt|shirt","pant|pant","dress|dress","shoes|shoes","socks|socks","cap|hat","uniform|uniform","saree|saree","tie|tie","belt|belt"],
   l2:["white shirt|shirt","blue pant|pant","new dress|dress","black shoes|shoes","my socks|socks","red cap|hat","school uniform|uniform","silk saree|saree"],
   l3:["I wear a shirt.|shirt","These are my shoes.|shoes","My dress is new.|dress","I wear a cap.|hat","My mother wears a saree.|saree","I wear my uniform.|uniform","Put on your socks.|socks","I tie my shoes.|shoes"],
   l4:["I wear my uniform to school.|uniform","My mother wears a silk saree to the temple.|saree","I wear a new dress for Deepavali.|dress","Please take off your shoes outside.|shoes","I wear a cap when it is hot.|hat","My tie is blue and white.|tie"],
   l5:[{title:"Getting ready", pic:"uniform", turns:[
        {robo:"What are you wearing?", child:"I am wearing my uniform."},
        {robo:"What colour is your shirt?", child:"My shirt is white."},
        {robo:"Where are your shoes?", child:"My shoes are on my feet."}]},
       {title:"Festival day", pic:"dress", turns:[
        {robo:"What do you wear for Deepavali?", child:"I wear a new dress."},
        {robo:"What colour is it?", child:"It is pink."},
        {robo:"Do you like it?", child:"Yes, I like it very much."}]}]},

  {id:"travel", title:"Going places",
   l1:["bus|bus","car|car","van|van","bike|bike","cycle|cycle","train|train","boat|boat","auto|auto","road|road","temple|temple"],
   l2:["school van|van","red car|car","fast train|train","small boat|boat","my cycle|cycle","big bus|bus","busy road|road","old temple|temple"],
   l3:["I go by van.|van","This is a bus.|bus","The train is long.|train","I ride my cycle.|cycle","The boat is on the water.|boat","My father has a bike.|bike","We go to the temple.|temple","Cross the road carefully.|road"],
   l4:["I go to school in the school van.|van","We went to the temple by car.|car","The train is very long and fast.|train","My father takes me on his bike.|bike","Look both sides before crossing the road.|road","We went to the market by auto.|auto"],
   l5:[{title:"Coming to school", pic:"van", turns:[
        {robo:"How do you come to school?", child:"I come by van."},
        {robo:"Who drives the van?", child:"The driver drives the van."},
        {robo:"Do you like the van?", child:"Yes, I like it."}]},
       {title:"Temple visit", pic:"temple", turns:[
        {robo:"Where did you go on Sunday?", child:"I went to the temple."},
        {robo:"Who went with you?", child:"My family went with me."},
        {robo:"How did you go?", child:"We went by car."}]}]},

  {id:"nature", title:"Nature and weather",
   l1:["sun|sun","moon|moon","star|star","tree|tree","flower|flower","leaf|leaf","rain|rain","cloud|cloud","sky|sky","river|river"],
   l2:["hot sun|sun","full moon|moon","tall tree|tree","red flower|flower","green leaf|leaf","heavy rain|rain","dark cloud|cloud","blue sky|sky"],
   l3:["The sun is hot.|sun","I see the moon.|moon","It is raining.|rain","The tree is tall.|tree","The flower is red.|flower","Stars shine at night.|star","The sky is blue.|sky","The river is long.|river"],
   l4:["The sun rises in the morning.|sun","I can see stars at night.|star","It is raining, take your umbrella.|umbrella","We must plant more trees.|tree","Birds live on the tree.|nest","The river flows near our town.|river"],
   l5:[{title:"Today's weather", pic:"sun", turns:[
        {robo:"How is the weather today?", child:"It is sunny today."},
        {robo:"Is it raining?", child:"No, it is not raining."},
        {robo:"Do you like rain?", child:"Yes, I like rain."}]},
       {title:"At night", pic:"moon", turns:[
        {robo:"What do you see in the sky at night?", child:"I see the moon and stars."},
        {robo:"What shape is the moon today?", child:"It is round."},
        {robo:"When do you sleep?", child:"I sleep at nine o'clock."}]}]},

  {id:"actions", title:"Things I do",
   l1:["run|run","jump|jump","walk|walk","sit|sit","stand|stand","eat|eat","drink|drink","sleep|sleep","read|read","write|write"],
   l2:["run fast|run","jump high|jump","walk slowly|walk","sit down|sit","stand up|stand","eat food|eat","drink water|drink","read books|read"],
   l3:["I can run.|run","I can jump.|jump","Please sit down.|sit","Stand up, please.|stand","I eat rice.|eat","I read a book.|read","I write my name.|write","I sleep at night.|sleep"],
   l4:["I run fast on the playground.|run","I read a story book every day.|read","I write my homework neatly.|write","Please stand in a line.|stand","I sleep early and wake up early.|sleep","We play games in the evening.|ball"],
   l5:[{title:"What can you do?", pic:"jump", turns:[
        {robo:"What can you do?", child:"I can run and jump."},
        {robo:"Can you jump high?", child:"Yes, I can jump high."},
        {robo:"Show me! Jump!", child:"I am jumping."}]},
       {title:"After school", pic:"read", turns:[
        {robo:"What do you do after school?", child:"I play with my friends."},
        {robo:"Do you do homework?", child:"Yes, I do my homework."},
        {robo:"When do you sleep?", child:"I sleep at night."}]}]},

  {id:"manners", title:"Feelings and good manners",
   l1:["happy|happy","sad|sad","angry|angry","hungry|hungry","thirsty|thirsty","tired|tired","sorry|sorry","please|please","thank you|thankyou","hello|hello"],
   l2:["very happy|happy","so sad|sad","very hungry|hungry","good morning|sun","thank you|thankyou","excuse me|please","good night|moon","see you|hello"],
   l3:["I am happy.|happy","I am hungry.|hungry","I am thirsty.|thirsty","I am tired.|tired","Good morning, teacher.|teacher","Thank you very much.|thankyou","I am sorry.|sorry","May I come in?|door"],
   l4:["Good morning teacher, may I come in?|door","I am hungry, can I eat now?|hungry","I am sorry, I forgot my book.|sorry","Thank you for helping me.|thankyou","May I go and drink water?|water","I feel happy when I play with friends.|happy"],
   l5:[{title:"Good morning", pic:"happy", turns:[
        {robo:"Good morning!", child:"Good morning!"},
        {robo:"How are you today?", child:"I am fine, thank you."},
        {robo:"Are you happy today?", child:"Yes, I am very happy."}]},
       {title:"Late to class", pic:"door", turns:[
        {robo:"You are late!", child:"Sorry teacher, may I come in?"},
        {robo:"Yes, come in.", child:"Thank you, teacher."},
        {robo:"Why are you late?", child:"My van was late."}]}]}
  ];

  function split(s){
    var i = s.lastIndexOf("|");
    var text = i > -1 ? s.slice(0, i) : s, pic = i > -1 ? s.slice(i + 1) : "";
    var item = {t:text};
    if (/^#[0-9a-f]{6}$/i.test(pic)) item.swatch = pic;
    else if (/^\d+$/.test(pic)) item.digit = pic;
    else if (pic) item.pic = pic;
    return item;
  }

  var topics = T.map(function(tp){
    var l5 = tp.l5.map(function(c){
      var head = split(" |" + (c.pic || ""));
      var out = {title:c.title, turns:c.turns};
      if (head.pic) out.pic = head.pic; if (head.swatch) out.swatch = head.swatch; if (head.digit) out.digit = head.digit;
      return out;
    });
    return {id:tp.id, title:tp.title,
      levels:{1:tp.l1.map(split), 2:tp.l2.map(split), 3:tp.l3.map(split), 4:tp.l4.map(split), 5:l5}};
  });

  // Every picture word the ladder uses — for checking against the Picture Library.
  function pictureWords(){
    var seen = {}, list = [];
    topics.forEach(function(tp){
      [1,2,3,4,5].forEach(function(n){
        tp.levels[n].forEach(function(it){ if (it.pic && !seen[it.pic]){ seen[it.pic] = 1; list.push(it.pic); } });
      });
    });
    return list.sort();
  }

  window.SPEAKING_LADDER = {version:1, levels:LEVELS, patterns:PATTERNS, topics:topics, pictureWords:pictureWords};
})();
