/* «Пыль и чернила» — движок литературных квестов */
(function(){
'use strict';

var LS = 'pc.v2';
var SUSP_MAX = 9, CATCH_AT = 7, REL_MIN = -5, REL_MAX = 5;

var app = document.getElementById('app');
var overlay = document.getElementById('overlay');
var toastEl = document.getElementById('toast');

var BOOKS = (window.PC_BOOKS || []).slice();
var RX = window.PC_RX || {};
var DOORS = window.PC_DOORS || {};
function doorCfg(b, si){ var p = DOORS[b.id]; return p && p.de ? p.de[si] : null; }
function extraOf(b, si, r){
  var p = DOORS[b.id];
  var arr = p && p.extra ? p.extra[si] : null;
  if (!arr) return [];
  return arr.filter(function(e){ var n = e.need; if (!n) return true; return relOf(r, n.ci|0) >= (n.rel|0); });
}
var byId = {};
BOOKS.forEach(function(b){ byId[b.id] = b; });

var st = load();
function load(){
  try {
    var o = JSON.parse(localStorage.getItem(LS));
    if (o && o.runs && typeof o.runs === 'object') return o;
  } catch(e){}
  return { runs:{}, last:null, v:3, modes:{} };
}
function save(){ try { localStorage.setItem(LS, JSON.stringify(st)); } catch(e){} }
function modeOf(id){ return st.modes && st.modes[id] === 'free' ? 'free' : 'classic'; }
function setMode(id, m){ st.modes = st.modes || {}; st.modes[id] = m === 'free' ? 'free' : 'classic'; save(); }
function rxOf(b, scIdx, optIdx, roleIdx){
  var pack = RX[b.id];
  if (!pack || !pack.rx) return null;
  var arr = pack.rx[scIdx];
  if (!arr) return null;
  var cell = arr[optIdx];
  if (typeof cell === 'string') return cell;
  if (cell && typeof cell[roleIdx] === 'string') return cell[roleIdx];
  return null;
}
function branchOf(b){ var pack = RX[b.id]; return pack && pack.br ? pack.br : null; }
function finOf(b, br){
  var pack = RX[b.id];
  if (!pack || !pack.fin) return null;
  return pack.fin[br] || pack.fin.none || null;
}
function sceneTextOf(b, si, br){
  var pack = RX[b.id];
  if (!pack || !pack.bt) return null;
  var row = pack.bt[si];
  if (!row) return null;
  return row[br] || null;
}
function exOf(b, ci){
  var pack = RX[b.id];
  if (!pack || !pack.ex) return null;
  return typeof pack.ex[ci] === 'string' ? pack.ex[ci] : null;
}

var cur = null; // { book, run, phase, react }

/* ───────── helpers ───────── */
function esc(s){
  return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; });
}
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function hash(str){ var h=0; for(var i=0;i<str.length;i++){ h=(h*31+str.charCodeAt(i))|0; } return Math.abs(h); }
function pickOne(arr, seed){ return arr[seed % arr.length]; }
function num(n){ return n>0 ? '+'+n : String(n); }
function fill(tpl, name){ return String(tpl).replace('{n}', name || 'кто-то'); }

function freshRun(role){
  return { i:0, susp:0, rel:{}, last:{}, found:false, out:'', done:false, caught:0, burned:{}, seen:0, role: role|0, lastName:'', branch:'', told:0, hot:0, doors:0, doorX:null, echo:null };
}
function relOf(run, idx){
  var k = String(idx);
  return typeof run.rel[k] === 'number' ? run.rel[k] : 0;
}
function addRel(run, idx, d){
  run.rel[String(idx)] = clamp(relOf(run, idx) + d, REL_MIN, REL_MAX);
}

var RE = {
  0: ['{n} смотрит мягче — и кивает.','{n} тихо благодарит, пряча улыбку.','{n} запоминает это надолго, хоть и молчит.','{n} отвечает теплее, чем ждала.'],
  1: ['{n} пожимает плечами: «Как знаете».','{n} кивает, но не отводит глаз.','{n} молчит чуть дольше, чем нужно.','{n} делает вид, что не расслышал.'],
  2: ['{n} резко оборачивается: «Что вы себе позволяете?»','{n} поджимает губы и отступает на шаг.','{n} смотрит так, будто её ударили.','{n} цедит сквозь зубы: «Любопытно».'],
  3: ['{n} замирает: «Повторите?»','{n} медленно переводит взгляд на твои руки.','{n} отшатывается: «Вы... откуда вы это знаете?»','{n} щурится: «Так в наше время не говорят».']
};
var SUSP_D = {0:-1, 1:1, 2:2, 3:3};
var REL_D  = {0:2, 1:0, 2:-2, 3:-1};

/* ───────── dust ───────── */
(function dust(){
  var el = document.getElementById('dust');
  if (!el) return;
  var html = '';
  for (var i=0;i<24;i++){
    var l = Math.random()*100, d = 14+Math.random()*22, dl = -Math.random()*26, o = .25+Math.random()*.5, s = .7+Math.random()*1.6;
    html += '<i style="left:'+l.toFixed(1)+'%;bottom:-6vh;opacity:'+o.toFixed(2)+';animation-duration:'+d.toFixed(1)+'s;animation-delay:'+dl.toFixed(1)+'s;transform:scale('+s.toFixed(2)+')"></i>';
  }
  el.innerHTML = html;
})();

/* ───────── toast ───────── */
var toastTimer = null;
function toast(parts){
  if (!toastEl) return;
  toastEl.innerHTML = parts.map(function(p){
    return '<span>'+(p.up ? '<b>'+esc(p.n)+' +'+p.d+'</b>' : '<b>'+esc(p.n)+' '+p.d+'</b>')+'</span>';
  }).join('');
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ toastEl.classList.remove('on'); }, 2600);
}

/* ───────── shelf ───────── */
function progressOf(b){
  var r = st.runs[b.id];
  if (!r) return null;
  if (r.done) return 'done';
  return 'prog';
}
function renderShelf(){
  cur = null;
  var groups = {};
  BOOKS.forEach(function(b){ (groups[b.cat] = groups[b.cat] || []).push(b); });
  var cats = Object.keys(groups);
  var totalScenes = BOOKS.reduce(function(a,b){ return a + b.scenes.length; }, 0);
  var doneCount = BOOKS.filter(function(b){ var r=st.runs[b.id]; return r && r.done; }).length;

  var html = '<section class="shelf-head">' +
    '<div class="kicker brand-sub">библиотека литературных квестов</div>' +
    '<h1 class="brand">Пыль и чернила</h1>' +
    '<p class="brand-lead">Ты открываешь книгу — и оказываешься <em>внутри</em>. Сначала выбери, <b>кто ты в этом мире</b>: от этого зависит, как тебя встретят. Потом найди закладку и уйди так, чтобы никто не догадался, что ты из будущего.</p>' +
    '<div class="brand-stats"><span><b>'+BOOKS.length+'</b> книг</span><span><b>'+totalScenes+'</b> сцен</span><span><b>'+doneCount+'</b> пройдено</span></div>' +
    '<div class="modebox"><span class="kicker">режим игры</span><div class="modes">' +
      '<button class="modebtn'+(modeOf()==='classic'?' on':'')+'" data-act="mode" data-m="classic"><b>Классический</b><span>прокол — и тебя вернут на шаг назад</span></button>' +
      '<button class="modebtn'+(modeOf()==='free'?' on':'')+'" data-act="mode" data-m="free"><b>Свободный</b><span>тебя раскрыли — играешь дальше без маски</span></button>' +
    '</div></div>' +
    '<details class="howto"><summary>Как это играется</summary><ul>' +
      '<li>Перед входом ты выбираешь <b>роль</b> — кто ты в этом мире. Роль меняет начало, отношение к тебе и то, какие поступки тебе доступны.</li>' +
      '<li>История идёт одним путём: каждая сцена <b>вытекает из предыдущей</b>, а не начинается с чистого листа.</li>' +
      '<li>В каждой сцене — три варианта. Мягкий почти не вызывает подозрений, резкий вызывает, а неосторожная фраза из будущего — сильно.</li>' +
      '<li>Подозрение видно по <b>глазу</b> в углу. Переполнилось — тебя раскусили: в <b>классическом</b> режиме вернут на шаг назад, в <b>свободном</b> маска спадает, и каждый персонаж реагирует по-своему — но игра идёт дальше.</li>' +
      '<li>Ближе к середине книги спрятана <b>закладка</b>. С ней появляется кнопка «уйти» — тихо получится, только если подозрение низкое.</li>' +
      '<li>Можно уйти сразу, а можно <b>доиграть книгу до конца</b> — в финале будет видно, кто тебя запомнил.</li>' +
    '</ul></details>' +
  '</section>';

  if (st.last && byId[st.last] && st.runs[st.last] && !st.runs[st.last].done){
    var lb = byId[st.last], lr = st.runs[st.last];
    html += '<div style="max-width:760px;margin:26px auto 0;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:14px 18px;border:1px solid rgba(201,162,39,.22);background:rgba(201,162,39,.04)">' +
      '<span style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)">остановилась на «'+esc(lb.title)+'», стр. '+(lr.i+1)+'</span>' +
      '<button class="btn" data-act="open" data-id="'+esc(lb.id)+'" data-go="1">Продолжить</button></div>';
  }

  cats.forEach(function(cat){
    html += '<section class="case"><div class="shelf-label"><span>'+esc(cat)+'</span><i></i><em>'+groups[cat].length+' книг</em></div><div class="grid">';
    groups[cat].forEach(function(b){
      var p = progressOf(b), badge = '';
      if (p === 'done') badge = '<span class="badge done">пройдено</span>';
      else if (p === 'prog') badge = '<span class="badge prog">стр. '+(st.runs[b.id].i+1)+'</span>';
      html += '<button class="cover" data-act="open" data-id="'+esc(b.id)+'" style="--c1:'+b.c1+';--c2:'+b.c2+'">' +
        '<span class="cy">'+esc(b.year)+'</span>' +
        '<span class="ct">'+esc(b.title)+'</span>' +
        '<span class="orn"></span>' +
        '<span class="ca">'+esc(b.author)+'</span>' + badge + '</button>';
    });
    html += '</div></section>';
  });

  html += '<p style="text-align:center;color:var(--muted);font-size:12px;letter-spacing:.14em;text-transform:uppercase;margin-top:48px">книги из каталога «Между строк» · прогресс хранится в браузере</p>';
  app.innerHTML = html;
  window.scrollTo(0,0);
}

/* ───────── intro ───────── */
function roleHint(r){
  if (r.s >= 2) return 'на тебя посмотрят с первого шага';
  if (r.s === 1) return 'тебя заметят, но не сразу';
  return 'тебя почти не замечают';
}
function renderIntro(id, startNow){
  var b = byId[id];
  if (!b) return renderShelf();
  cur = null;
  var r = st.runs[id];
  var canContinue = r && !r.done;
  var html = '<section class="intro">' +
    '<div class="intro-cover" style="--c1:'+b.c1+';--c2:'+b.c2+'">' +
      '<div class="ct">'+esc(b.title)+'</div>' +
      '<div class="ca">'+esc(b.author)+'</div>' +
    '</div>' +
    '<div class="intro-body">' +
      '<button class="back" data-act="shelf">← в библиотеку</button>' +
      '<h2>'+esc(b.title)+'</h2>' +
      '<div class="by">'+esc(b.author)+' · '+esc(b.year)+' · '+esc(b.tone)+'</div>' +
      '<p class="about">'+esc(b.about)+'</p>' +
      '<div class="who"><span>кто ты здесь</span>три роли на выбор — выберешь перед входом</div>' +
      '<div class="chips"><span class="chip">'+b.scenes.length+' сцен</span><span class="chip">'+b.cast.length+' персонажа</span><span class="chip">3 роли</span><span class="chip">закладка спрятана</span></div>' +
      '<div class="intro-actions">' +
        (canContinue
          ? '<button class="btn" data-act="resume" data-id="'+esc(id)+'">Продолжить со стр. '+(r.i+1)+'</button><button class="btn ghost" data-act="roles" data-id="'+esc(id)+'">Начать заново</button>'
          : '<button class="btn" data-act="roles" data-id="'+esc(id)+'">Выбрать, кто ты →</button>') +
      '</div>' +
    '</div></section>';
  app.innerHTML = html;
  window.scrollTo(0,0);
  if (startNow && canContinue) resume(id);
}

/* ───────── roles ───────── */
function renderRoles(id){
  var b = byId[id];
  if (!b) return renderShelf();
  cur = null;
  var cards = b.roles.map(function(r, i){
    return '<button class="rolecard" data-act="role" data-id="'+esc(id)+'" data-r="'+i+'">' +
      '<span class="rn">'+esc(r.n)+'</span>' +
      '<span class="rd">'+esc(r.d)+'</span>' +
      '<span class="rs">'+esc(roleHint(r))+'</span>' +
    '</button>';
  }).join('');
  app.innerHTML = '<section class="intro roles-screen">' +
    '<div class="intro-body" style="max-width:820px">' +
      '<button class="back" data-act="open" data-id="'+esc(id)+'">← к книге</button>' +
      '<div class="kicker">перед входом в «'+esc(b.title)+'»</div>' +
      '<h2>Кто ты в этом мире?</h2>' +
      '<p class="about">Роль — это не маска на минуту. От неё зависит, с чего начнётся история, как к тебе отнесутся и какие слова тебе вообще можно говорить. Обратно поменять нельзя.</p>' +
      '<div class="modebox"><span class="kicker">режим для этой книги</span><div class="modes">' +
        '<button class="modebtn'+(modeOf(id)==='classic'?' on':'')+'" data-act="bmode" data-id="'+esc(id)+'" data-m="classic"><b>Классический</b><span>поймали — вернут на страницу назад</span></button>' +
        '<button class="modebtn'+(modeOf(id)==='free'?' on':'')+'" data-act="bmode" data-id="'+esc(id)+'" data-m="free"><b>Свободный</b><span>поймали — играешь дальше, но относятся иначе</span></button>' +
      '</div></div>' +
      '<div class="roles">'+cards+'</div>' +
    '</div></section>';
  window.scrollTo(0,0);
}

/* ───────── game ───────── */
function begin(id, ri){
  var b = byId[id];
  if (!b) return renderShelf();
  var role = b.roles[ri|0] || b.roles[0];
  var r = freshRun(ri);
  r.susp = clamp(role.s|0, 0, SUSP_MAX);
  st.runs[id] = r;
  st.last = id;
  save();
  cur = { book:b, run:r, phase:'choice' };
  renderScene();
}
function resume(id){
  var b = byId[id];
  if (!b || !st.runs[id]) return renderIntro(id);
  st.last = id; save();
  cur = { book:b, run:st.runs[id], phase:'choice' };
  renderScene();
}

function pipsHtml(susp){
  var filled = Math.round(susp / (SUSP_MAX/6));
  var out = '';
  for (var i=0;i<6;i++){
    var cls = i < filled ? (i>=4 ? 'on hot' : 'on') : '';
    out += '<i class="'+cls+'"></i>';
  }
  return '<div class="pips">'+out+'</div>';
}

function leadOf(b, r, sc){
  var role = b.roles[r.role] || {start:''};
  if (r.i === 0) return role.start || '';
  return sc.b ? fill(sc.b, r.lastName) : '';
}

function renderScene(){
  var b = cur.book, r = cur.run;
  var sc = b.scenes[r.i];
  var total = b.scenes.length;
  if (sc.bm && !r.found){ r.found = true; save(); }
  var eyeOn = (r.susp > 0 || r.seen > 0);
  var role = b.roles[r.role] || {n:'читательница'};
  var hud = '<div class="hud">' +
      '<button class="back" data-act="shelf">←</button>' +
      '<div><div class="bk">'+esc(b.title)+'</div><div class="pg">'+esc(role.n)+' · стр. '+(r.i+1)+' / '+total+'</div></div>' +
      '<div class="sp"></div>' +
      '<button class="modepill'+(modeOf(b.id)==='free'?' free':'')+'" data-act="bmode" title="Сменить режим">'+(modeOf(b.id)==='free'?'свободный':'классический')+'</button>' +
      '<div class="eye'+(eyeOn?' on':'')+'" title="Подозрение"><span class="gl">👁</span>'+pipsHtml(r.susp)+'</div>' +
      '<button class="leave'+(r.found?' on':'')+'" data-act="leave">Уйти по закладке</button>' +
    '</div>';

  var lead = leadOf(b, r, sc);
  var alt = sceneTextOf(b, r.i, r.branch);
  var dcfg = DOORS[b.id] || {};
  var dcfg0 = doorCfg(b, r.i);
  var keyOn = dcfg.key && dcfg.key.indexOf(r.i) >= 0;
  var keySign = keyOn ? '<div class="keysign">✧ здесь решалась судьба ✧</div>' : '';
  var echoHtml = '';
  if (r.echo && r.echo.at === r.i && !r.echo.shown){
    echoHtml = '<div class="echo"><span>за спиной</span>'+esc(r.echo.text)+'</div>';
    r.echo.shown = 1; save();
  }
  var badP = (dcfg.bad && dcfg.bad.indexOf(r.i) >= 0) ? '<div class="badpaths">Все три пути плохие. Выбирай тот, который сможешь нести.</div>' : '';
  var head = '<div class="place">'+esc(sc.p)+'</div>' +
    (lead ? '<p class="lead">'+esc(lead)+'</p>' : '') +
    '<p class="stext">'+esc(alt || sc.s)+'</p>';

  var body = '';
  if (cur.phase === 'door'){
    var d = cur.door;
    var mini = '';
    if (d.x && !r.doorX){
      mini = '<div class="minix">' + d.x.map(function(m,k){
        return '<button class="choice mini" data-act="mini" data-k="'+k+'"><span class="n">'+(k+1)+'</span><span class="tx">'+esc(m.t)+'</span></button>';
      }).join('') + '</div>';
    } else if (r.doorX && r.doorX.line){
      mini = '<div class="reaction"><div class="who">'+esc(r.doorX.name)+'</div><div class="line">'+esc(r.doorX.line)+'</div></div>';
    }
    body = '<div class="scene door">' +
      (d.p ? '<div class="place">'+esc(d.p)+'</div>' : '') +
      (d.s || []).map(function(t){ return '<p class="stext">'+esc(t)+'</p>'; }).join('') +
      mini +
      (d.x && !r.doorX ? '' : '<div class="nextrow"><button class="btn" data-act="next">Дальше →</button></div>') +
      '</div>';
  }
  else if (cur.phase === 'choice'){
    body = '<div class="scene">' + head +
      (dcfg0 && dcfg0.ask ? '<p class="ask">'+esc(dcfg0.ask)+'</p>' : '') +
      keySign + echoHtml + badP + '<div class="choices">';
    sc.o.forEach(function(o, i){
      if (o[3] !== undefined && (o[3]|0) !== r.role) return;
      var burned = r.burned[r.i+':'+i];
      var mine = o[3] !== undefined;
      body += '<button class="choice'+(mine?' mine':'')+'" data-act="pick" data-i="'+i+'"'+(burned?' disabled':'')+'>' +
        '<span class="n">'+esc(mine ? '★' : (i+1))+'</span><span class="tx">'+esc((dcfg0 && dcfg0.l && dcfg0.l[i]) || o[0])+'</span>' +
        (mine?'<span class="tag role">твоя роль</span>':'') +
        (burned?'<span class="tag">прокол</span>':'') + '</button>';
    });
    extraOf(b, r.i, r).forEach(function(e, k){
      body += '<button class="choice special" data-act="pick" data-i="'+(sc.o.length+k)+'">' +
        '<span class="n">✦</span><span class="tx">'+esc(e.t)+'</span><span class="tag">открылось</span></button>';
    });
    body += '</div></div>';
  } else {
    var x = cur.react;
    body = '<div class="scene">' + head +
      '<div class="reaction"><div class="who">'+esc(x.name)+'</div><div class="line">'+esc(x.line)+'</div>' +
      '<div class="delta">'+ (x.dRel ? '<b class="'+(x.dRel>0?'up':'down')+'">'+esc(x.name)+' '+num(x.dRel)+'</b> · ' : '') + (x.dSusp ? 'подозрение '+num(x.dSusp) : 'подозрение не выросло') + '</div></div>' +
      (x.found ? '<div class="found">✧ Между страницами — закладка. Теперь можно уйти. ✧</div>' : '') +
      '<div class="nextrow"><button class="btn" data-act="next">Дальше →</button></div></div>';
  }
  app.innerHTML = hud + body;
  window.scrollTo({top:0, behavior:'smooth'});
}

function pick(i){
  if (!cur || cur.phase !== 'choice') return;
  var b = cur.book, r = cur.run, sc = b.scenes[r.i];
  var dcfg0 = doorCfg(b, r.i);
  if (dcfg0 && dcfg0.lead) cur.lead = dcfg0.lead;
  var o, risk, ci, text, door = null;
  if (i < sc.o.length){
    o = sc.o[i];
    if (!o) return;
    if (o[3] !== undefined && (o[3]|0) !== r.role) return;
    risk = o[1] | 0; ci = o[2] | 0; text = o[0];
    if (dcfg0 && dcfg0.o && dcfg0.o[i]) door = dcfg0.o[i];
    if (door && door.ci != null) ci = door.ci | 0;
  } else {
    var exArr = extraOf(b, r.i, r);
    var e = exArr[i - sc.o.length];
    if (!e) return;
    risk = 1; ci = e.ci | 0; text = e.t; door = e;
  }
  var name = b.cast[ci] ? b.cast[ci].n : 'Кто-то';

  var dS = (door && typeof door.dSusp === 'number') ? door.dSusp : SUSP_D[risk];
  var dR = (door && typeof door.dRel === 'number') ? door.dRel : REL_D[risk];
  var before = r.susp;
  r.susp = clamp(r.susp + dS, 0, SUSP_MAX);
  dS = r.susp - before;
  addRel(r, ci, dR);
  r.seen++;
  r.lastName = name;
  r.last[String(ci)] = { d:dR, text:text };

  var line = rxOf(b, r.i, i, r.role) || pickOne(RE[risk], hash(b.id + r.i + i + name));
  line = line.replace('{n}', name);

  r.burned[r.i+':'+i] = 1;
  applyBranch(b, r, r.i, i, text);

  if (door && (door.p || door.s)){
    if (modeOf(b.id) === 'classic' && r.susp >= CATCH_AT){
      r.caught++;
      cur.phase = 'react';
      cur.react = { name:name, line:line, dRel:dR, dSusp:dS, found:false };
      save();
      showCaught(b, r, name, line, i);
      return;
    }
    r.doors = (r.doors|0) + 1;
    if (door.echo) r.echo = { at: r.i + 1, text: door.echo, shown: 0 };
    r.doorX = null;
    cur.phase = 'door'; cur.door = door; save();
    renderScene();
    if (dR) toast([{ n:name, d:dR, up:dR>0 }]);
    return;
  }

  // caught? — только в классическом режиме
  if (modeOf(b.id) === 'classic' && r.susp >= CATCH_AT){
    r.caught++;
    cur.phase = 'react';
    cur.react = { name:name, line:line, dRel:dR, dSusp:dS, found:false };
    save();
    showCaught(b, r, name, line, i);
    return;
  }
  // свободный режим: подозрение упирается в потолок, но игра идёт дальше
  if (modeOf(b.id) === 'free' && r.susp >= CATCH_AT){
    r.hot = (r.hot|0) + 1;
    addRel(r, ci, -1);
    dR = dR - 1;
  }

  cur.phase = 'react';
  cur.react = { name:name, line:line, dRel:dR, dSusp:dS, found:false };
  save();
  renderScene();
  var parts = [];
  if (dR) parts.push({ n:name, d:dR, up:dR>0 });
  if (parts.length) toast(parts);
}

function pickMini(k){
  if (!cur || cur.phase !== 'door' || !cur.door || !cur.door.x) return;
  var r = cur.run, b = cur.book;
  if (r.doorX) return;
  var m = cur.door.x[k];
  if (!m) return;
  var ci = m.ci|0;
  var name = b.cast[ci] ? b.cast[ci].n : 'Кто-то';
  if (m.dSusp) r.susp = clamp(r.susp + m.dSusp, 0, SUSP_MAX);
  if (m.dRel) addRel(r, ci, m.dRel);
  r.doorX = { k:k, line: m.r || '', name: name };
  save();
  renderScene();
}

function applyBranch(b, r, si, oi, text){
  var row = branchOf(b);
  var flag = row && row[si] ? row[si][oi] : null;
  if (flag){
    r.bs = r.bs || {};
    r.bs[flag] = (r.bs[flag]|0) + 1;
    var best = '', n = -1;
    Object.keys(r.bs).forEach(function(k){ if (r.bs[k] > n){ n = r.bs[k]; best = k; } });
    r.branch = best;
  }
  if (/будущ|в моё время|в моём времени|в нашем веке|через двести лет|я не отсюда|из другого времени/i.test(text)) r.told = 1;
}
function showCaught(b, r, name, line, i){
  overlay.hidden = false;
  overlay.innerHTML = '<div class="modal">' +
    '<div class="kicker">тебя раскусили</div>' +
    '<h3>«Откуда вы это знаете?»</h3>' +
    '<p>'+esc(name)+' смотрит в упор. Ты сказала лишнее — и это заметили. Но страница ещё не перевёрнута: можно вернуться и сыграть иначе.</p>' +
    '<button class="btn" data-act="retry" data-i="'+i+'">Вернуться на шаг назад</button>' +
  '</div>';
}
function showExposed(b, r, name, ci){
  var line = exOf(b, ci) || esc(name)+' больше не сводит с тебя глаз: «Вы не та, за кого себя выдаёте».';
  overlay.hidden = false;
  overlay.innerHTML = '<div class="modal">' +
    '<div class="kicker">тебя раскрыли</div>' +
    '<h3>Маска спала</h3>' +
    '<p style="font-family:var(--serif);font-size:18px;line-height:1.65;color:var(--paper)">'+esc(line)+'</p>' +
    '<p>Ты не отступила — и теперь все знают, что ты чужая. Книга не закрылась: играй дальше такой, какая ты есть.</p>' +
    '<button class="btn" data-act="keepgoing">Играть дальше</button>' +
  '</div>';
}
function keepGoing(){
  overlay.hidden = true;
  overlay.innerHTML = '';
  renderScene();
}
function retry(){
  overlay.hidden = true;
  overlay.innerHTML = '';
  var r = cur.run;
  var role = cur.book.roles[r.role] || {s:0};
  r.susp = clamp((role.s|0) + 2, 2, 4);
  Object.keys(r.burned).forEach(function(k){ if (k.indexOf(r.i + ':') === 0) delete r.burned[k]; });
  cur.phase = 'choice';
  cur.react = null;
  save();
  renderScene();
}

function next(){
  if (!cur) return;
  var b = cur.book, r = cur.run;
  if (cur.phase === 'door' && cur.door && cur.door.x && !r.doorX) return;
  if (r.i + 1 >= b.scenes.length){
    r.done = true; r.out = 'end';
    save();
    renderFinal();
    return;
  }
  r.i++;
  cur.phase = 'choice';
  cur.react = null;
  cur.door = null;
  r.doorX = null;
  save();
  renderScene();
}

function leave(){
  if (!cur || !cur.run.found) return;
  var r = cur.run;
  var clean = r.susp <= 3 && !r.exposed;
  r.out = r.exposed ? 'exposed' : (clean ? 'quiet' : 'noticed');
  r.done = true;
  if (!clean){
    cur.book.cast.forEach(function(c, idx){ addRel(r, idx, -1); });
  }
  save();
  renderFinal();
}

/* ───────── final ───────── */
function toldLine(b, r){
  var pack = RX[b.id];
  if (pack && pack.told) return pack.told;
  return 'Ты рассказала, откуда ты, — и тебя сочли странной. Но запомнили именно такой.';
}
function tier(v){
  if (v >= 4) return { t:'скучает по тебе', c:'warm' };
  if (v >= 2) return { t:'относится тепло', c:'warm' };
  if (v >= 0) return { t:'нейтрально', c:'calm' };
  if (v >= -2) return { t:'настороже', c:'cold' };
  return { t:'злится', c:'angry' };
}
function renderFinal(){
  var b = cur.book, r = cur.run;
  var total = b.scenes.length;
  var role = b.roles[r.role] || {n:'читательница', out:''};
  var outLine = r.out === 'quiet' ? 'Ты ушла тихо. Никто не обернулся — только пыль осела на полке.'
    : r.out === 'noticed' ? 'Ты ушла, но тебя хватились. Кто-то долго смотрел на пустое место между страницами.'
    : r.out === 'exposed' ? 'Ты ушла, не прячась. За тобой смотрели все — и никто не посмел остановить.'
    : 'Ты дочитала книгу до последней страницы. Персонажи остались там, где им и место.';
  var fin = finOf(b, r.branch);
  var modeLine = modeOf(b.id) === 'free'
    ? (r.hot ? 'Тебя подозревали — а ты не отступила ни разу.' : 'Ты прошла книгу, ни разу не попавшись.')
    : '';

  var rows = b.cast.map(function(c, idx){
    var v = relOf(r, idx), t = tier(v), last = r.last[String(idx)];
    var w = clamp(Math.abs(v) * 10, 4, 50);
    var left = v >= 0 ? 50 : 50 - w;
    return '<div class="rel"><div class="nm">'+esc(c.n)+'</div><div class="tier '+t.c+'">'+t.t+'</div>' +
      '<div class="bar"><i style="--v:'+Math.abs(v)+';left:'+left+'%;width:'+w+'%"></i></div>' +
      (last ? '<div class="why">после «'+esc(last.text)+'»</div>' : '<div class="why">вы почти не пересекались</div>') +
      '</div>';
  }).join('');

  app.innerHTML = '<section class="final">' +
    '<button class="back" data-act="shelf">← в библиотеку</button>' +
    '<div class="kicker">книга закрыта</div>' +
    '<h2>'+esc(b.title)+'</h2>' +
    '<div class="by">ты была здесь: '+esc(role.n)+'</div>' +
    '<p class="sub">'+esc(role.out)+'</p>' +
    '<p class="sub">'+esc(outLine)+'</p>' +
    (fin ? '<p class="sub final-line">'+esc(fin)+'</p>' : '') +
    (r.told ? '<p class="sub mode-note">'+esc(toldLine(b, r))+'</p>' : '') +
    (modeLine ? '<p class="sub mode-note">'+esc(modeLine)+'</p>' : '') +
    '<div class="fstats">' +
      '<div><b>'+(r.i+1)+' / '+total+'</b>сцен</div>' +
      '<div><b>'+r.caught+'</b>'+(r.caught===1?'прокол':'проколов')+'</div>' +
      '<div><b>'+(r.found?'найдена':'—')+'</b>закладка</div>' +
      '<div><b>'+(r.told?'говорила':'молчала')+'</b>о будущем</div>' +
      '<div><b>'+(r.doors|0)+'</b>развилок</div>' +
    '</div>' +
    '<div class="kicker" style="margin-bottom:12px">кто как к тебе относится</div>' +
    '<div class="rels">'+rows+'</div>' +
    '<div class="intro-actions"><button class="btn" data-act="shelf">В библиотеку</button><button class="btn ghost" data-act="roles" data-id="'+esc(b.id)+'">Пройти в другой роли</button></div>' +
  '</section>';
  window.scrollTo(0,0);
}

/* ───────── events ───────── */
document.addEventListener('click', function(e){
  var el = e.target.closest ? e.target.closest('[data-act]') : null;
  if (!el || el.disabled) return;
  var act = el.getAttribute('data-act');
  if (act === 'open'){ renderIntro(el.getAttribute('data-id'), el.getAttribute('data-go') === '1'); }
  else if (act === 'shelf'){ renderShelf(); }
  else if (act === 'roles'){ renderRoles(el.getAttribute('data-id')); }
  else if (act === 'role'){ begin(el.getAttribute('data-id'), parseInt(el.getAttribute('data-r'),10)); }
  else if (act === 'resume'){ resume(el.getAttribute('data-id')); }
  else if (act === 'pick'){ pick(parseInt(el.getAttribute('data-i'),10)); }
  else if (act === 'mini'){ pickMini(parseInt(el.getAttribute('data-k'),10)); }
  else if (act === 'next'){ next(); }
  else if (act === 'leave'){ leave(); }
  else if (act === 'retry'){ retry(); }
  else if (act === 'keepgoing'){ keepGoing(); }
  else if (act === 'bmode'){
    var bid = el.getAttribute('data-id') || (cur ? cur.book.id : null);
    if (bid){ setMode(bid, el.getAttribute('data-m')); if (cur && cur.book.id === bid) renderScene(); else if (el.getAttribute('data-id')) renderRoles(bid); else renderShelf(); }
  }
});
document.addEventListener('keydown', function(e){
  if (!cur || cur.phase !== 'choice') return;
  var k = e.key;
  if (k === '1' || k === '2' || k === '3' || k === '4'){
    var idx = parseInt(k,10) - 1;
    var btns = document.querySelectorAll('.choice');
    var btn = btns[idx];
    if (btn && !btn.disabled) pick(parseInt(btn.getAttribute('data-i'),10));
  }
});

renderShelf();

window.PC = { shelf: renderShelf, open: renderIntro, begin: begin, pick: pick, next: next, leave: leave, retry: retry, state: function(){ return st; } };
})();
