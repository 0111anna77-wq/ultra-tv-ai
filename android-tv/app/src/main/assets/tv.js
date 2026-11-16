/* Ultra TV AI for Android TV. Distinct 10-foot client, shared catalog with web. */
(() => {
'use strict';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tags={super:'Супергерои',scifi:'Фантастика',fantasy:'Фэнтези',horror:'Мистика',thriller:'Триллеры',crime:'Криминал',action:'Боевики',drama:'Драмы',comedy:'Комедии',animation:'Анимация'};
const store=(k,def)=>{try{return JSON.parse(localStorage.getItem(k))||def}catch{return def}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const S={shows:store('tv-catalog-cache',[]),opts:store('tv-options-cache',{embeds:{},episodes:{}}),
  releases:store('tv-release-cache',[]),meta:store('tv-meta-cache',{}),
  tracked:store('tv-tracked',{}),recent:store('tv-recent',[]),
  page:'home',show:null,season:1,episode:1,source:0,search:'',loading:false,
  cursor:false,cx:.5,cy:.5,cursorFocus:null};
const root=$('#content');
let navBtn=null,focusKey=null,lastNav=0,refreshTimer=0;
const items=()=>S.shows.filter(x=>x&&x.key&&x.ru);
const item=key=>items().find(x=>x.key===key);
const meta=key=>S.meta[key]||{};
const poster=x=>meta(x.key).image||x.image||'';
const imdb=x=>meta(x.key).imdb||x.imdb||'';
const latest=()=>items().filter(x=>S.tracked[x.key]!==false);
function navigate(page,key){
  if(S.cursor)stopCursor();
  S.page=page; S.show=key||null;
  focusKey=null; render();
  window.scrollTo(0,0);
  const selector=page==='player'?'[data-act="cursor"]':page==='detail'?'[data-act="play"]':
    page==='search'?'[data-focus="search-field"]':'#nav .nav-active';
  const first=$(selector)||$('#content button');
  if(first)first.focus({preventScroll:true});
}
function notify(text){
  const el=$('#toast');el.textContent=text;el.classList.add('show');
  clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>el.classList.remove('show'),3800);
}
const category=x=>(x.genres||[]).map(g=>tags[g]||g).slice(0,2).join(' · ');
const thumb=x=>{
  const url=poster(x);
  return '<div class="art" data-poster="'+esc(x.key)+'">'+
    (url?'<img src="'+esc(url)+'" alt="" loading="lazy">':'<span class="no-art">▶</span>')+
    ((S.recent||[]).some(a=>a.key===x.key)?'<span class="pill">Продолжить</span>':'')+'</div>';
};
const card=x=>'<button class="card" data-act="detail" data-key="'+esc(x.key)+'" data-focus="show:'+esc(x.key)+'">'+
  thumb(x)+'<span class="card-title">'+esc(x.ru)+'</span><small class="card-sub">'+esc(x.year)+' · '+esc(category(x))+'</small></button>';
const rail=(title,xs)=>xs.length?'<section class="rail"><h2>'+esc(title)+'</h2><div class="strip">'+xs.map(card).join('')+'</div></section>':'';
function hero(){
 const key=S.recent[0]?.key;
 const x=item(key)||item('mobland')||items()[0];
 if(!x)return '<section class="hero"><div class="hero-inner"><h1>Ultra TV AI</h1><p>Загружаем общий каталог сериалов…</p></div></section>';
 const image=poster(x);
 return '<section class="hero">'+(image?'<img class="hero-art" src="'+esc(image)+'" alt="">':'')+
   '<div class="hero-inner"><div class="eyebrow">Твоя коллекция сериалов</div><h1>'+esc(x.ru)+'</h1>'+
   '<p>'+esc(category(x))+' · '+esc(x.year)+' · Выбор серии и озвучки</p>'+
   '<div class="hero-actions"><button class="primary" data-act="play" data-key="'+esc(x.key)+'">▶ Смотреть</button>'+
   '<button class="secondary" data-act="detail" data-key="'+esc(x.key)+'">Подробнее</button></div></div></section>';
}
function home(){
 const data=latest(),rec=S.recent.map(r=>item(r.key)).filter(Boolean);
 return hero()+rail('▶ Продолжить просмотр',rec)+rail('Мои сериалы',data)+
   rail('Фантастика и фэнтези',data.filter(x=>x.genres.some(g=>['scifi','fantasy','super'].includes(g))))+
   rail('Криминал и триллеры',data.filter(x=>x.genres.some(g=>['crime','thriller'].includes(g))))+
   rail('Драмы и комедии',data.filter(x=>x.genres.some(g=>['drama','comedy'].includes(g))))+
   '<p class="subtle">Каталог и источники обновляются автоматически. Новые сериалы появляются без переустановки APK.</p>';
}
function catalog(){
 const data=items();return '<div class="section-title">Все сериалы · '+data.length+'</div>'+
 (data.length?'<div class="cards-grid">'+data.map(card).join('')+'</div>':'<div class="empty">Каталог недоступен. Откройте «Настройки → Обновить каталог».</div>');
}
function newShows(){
 return '<div class="section-title">Новинки и свежие сериалы</div>'+
 '<div class="cards-grid">'+items().slice().sort((a,b)=>b.year-a.year||a.ru.localeCompare(b.ru)).map(card).join('')+'</div>';
}
function searchUI(){
 return '<h1 class="section-title">Поиск по каталогу</h1><p class="hint">Выдели строку стрелками, нажми OK — только тогда откроется клавиатура.</p>'+
 '<input id="tv-search" class="field" data-focus="search-field" type="text" readonly autocomplete="off"'+
 ' placeholder="Название сериала…" value="'+esc(S.search)+'">'+
 '<div class="search-results cards-grid" id="search-results">'+searchMatches()+'</div>';
}
function searchMatches(){
 const q=S.search.toLocaleLowerCase('ru-RU').trim();
 const found=items().filter(x=>!q||(x.ru+' '+x.en).toLocaleLowerCase('ru-RU').includes(q));
 return found.length?found.map(card).join(''):'<div class="empty">Совпадений нет. Новые сериалы добавляются в общий каталог на сайте.</div>';
}
function settings(){
 return '<h1 class="section-title">Настройки Ultra TV</h1>'+
 '<section class="settings-box"><h2>Каталог и источники</h2><p>Список сериалов, информация о просмотре и ссылки на плееры берутся из нашего сайта.</p>'+
 '<button class="primary" data-act="refresh" data-focus="refresh">↻ Обновить каталог</button>'+
 '<p class="subtle">Проверка при запуске и каждые 30 минут. Кнопка обновляет данные без установки новой версии APK.</p>'+
 '<div class="line"></div><h2>Блокировка рекламы</h2>'+
 '<p>Фильтр является экспериментальным. При проблемах с видео отключи его для проверки. Изменение требует перезагрузки страницы.</p>'+
 '<button class="action" data-act="adsettings">Настройки AdBlock</button>'+
 '<p class="subtle">Также можно удерживать кнопку «Назад» около 2 секунд.</p>'+
 '<div class="line"></div><h2>Управление пультом</h2>'+
 '<p>Стрелки — перемещение; OK — действие. Поле поиска открывает клавиатуру только после OK. В плеере выбери «Управлять видео»: стрелки перемещают курсор, OK нажимает на экран, «Назад» завершает управление.</p>'+
 '<p class="subtle">Версия интерфейса TV 0.5. Персональная история хранится на этой приставке; общий каталог не требует аккаунта.</p></section>';
}
function detail(){
 const x=item(S.show);if(!x)return catalog();
 const m=meta(x.key),img=poster(x);
 const genres=(x.genres||[]).map(v=>'<span class="badge">'+esc(tags[v]||v)+'</span>').join('');
 return '<button class="action" data-act="back">← Назад</button><section class="detail">'+
 '<div>'+(img?'<img class="detail-art" src="'+esc(img)+'" alt="">':'<div class="detail-art"></div>')+'</div>'+
 '<div><div class="eyebrow">Ultra TV · сериал</div><h1>'+esc(x.ru)+'</h1>'+
 '<p>'+esc(x.en)+' · '+esc(x.year)+(m.rating?' · ★ '+esc(m.rating):'')+'</p>'+
 '<div>'+genres+'</div><p>'+esc(m.summary||'Выбирай серию, озвучку и запускай просмотр в телевизионном плеере.')+'</p>'+
 '<div class="actions"><button class="primary" data-act="play">▶ Смотреть</button>'+
 '<button class="secondary" data-act="follow">'+(S.tracked[x.key]===false?'+ В мой каталог':'✓ В моём каталоге')+'</button></div>'+
 '<p class="subtle">Сведения и обложки: TVmaze. Плееры: общий список Ultra TV AI.</p></div></section>';
}
function availableSources(x){
 const sources=[],set=new Set();
 const add=(a)=>{
  if(!a||typeof a.url!=='string'||!/^https:\/\//i.test(a.url)||set.has(a.url))return;
  set.add(a.url);sources.push(a);
 };
 const configured=S.opts.embeds?.[x.key]||[];
 configured.filter(a=>a.platform==='initem').forEach(add);
 const id=imdb(x);
 if(/^tt\d{5,12}$/.test(id))add({name:'Initem · сезоны и озвучки',url:'https://api.initem.ws/embed/imdb/'+id,kind:'embed',platform:'initem'});
 configured.filter(a=>a.platform!=='initem').forEach(add);
 const key=x.key+':S'+String(S.season).padStart(2,'0')+'E'+String(S.episode).padStart(2,'0');
 (S.opts.episodes?.[key]||[]).forEach(add);
 return sources;
}
function sourceMedia(src){
 const url=src?.url;if(!url)return '<div class="empty">Плеер пока не подключён для этого сериала.</div>';
 if(src.kind==='video'||/\.(mp4|webm)(?:\?|$)/i.test(url))return '<video id="tv-video" tabindex="0" src="'+esc(url)+'" controls playsinline></video>';
 return '<iframe id="tv-player-iframe" title="Видеоплеер" loading="eager" src="'+esc(url)+
 '" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen '+
 ' referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-forms allow-scripts allow-same-origin allow-presentation"></iframe>';
}
function player(){
 const x=item(S.show);if(!x)return catalog();
 const sources=availableSources(x),src=sources[S.source]||sources[0]||null;
 const episodeKeys=Object.keys(S.opts.episodes||{}).filter(k=>k.startsWith(x.key+':S'));
 let seasons=new Set(episodeKeys.map(k=>Number((k.match(/:S(\d+)E/)||[])[1])).filter(Boolean));
 if(meta(x.key).episodes){for(const ep of meta(x.key).episodes)if(ep.season)seasons.add(ep.season);}
 if(!seasons.size)seasons.add(1);
 const eps=(meta(x.key).episodes||[]).filter(ep=>ep.season===S.season&&ep.number).map(ep=>ep.number);
 episodeKeys.forEach(k=>{const m=k.match(/:S(\d+)E(\d+)$/);if(m&&Number(m[1])===S.season)eps.push(Number(m[2]))});
 const epNums=[...new Set(eps)].sort((a,b)=>a-b).slice(0,50);
 return '<div class="player-screen"><section class="player-main">'+
 '<div class="player-tools"><button class="secondary" data-act="back">← Назад</button>'+
 '<button class="primary" data-act="cursor" data-focus="player-cursor">🎮 Управлять плеером</button>'+
 '<button class="action" data-act="fullscreen">⛶ Полный экран</button></div>'+
 '<h1>'+esc(x.ru)+' · просмотр</h1>'+
 '<div id="tv-video-frame" class="player-frame">'+sourceMedia(src)+
 '<div id="tv-cursor" style="display:none;position:absolute;width:22px;height:22px;z-index:9;pointer-events:none;border:3px solid #ffe4aa;border-radius:50%;background:#d7b57555;transform:translate(-50%,-50%);box-shadow:0 0 0 5px #0009"></div></div>'+
 '<p class="player-help" id="player-help">Нажми «Управлять плеером», чтобы нажимать на кнопки внутри Initem пультом. «Назад» — выйти из управления.</p>'+
 '<div class="player-tools"><button class="action" data-act="reload">↻ Перезагрузить плеер</button></div>'+
 (src?'<p class="subtle">Источник: '+esc(src.name||'Видео')+'</p>':'<p class="banner">Для этого сериала пока нет источника. Данные обновляются через общий каталог.</p>')+
 '</section><aside class="player-side"><h2>Источники</h2>'+
 (sources.length?sources.map((s,i)=>'<button data-act="source" data-index="'+i+'"'+(i===S.source?' class="active"':'')+'>'+esc(s.name||s.platform||'Видео')+'</button>').join(''):
 '<p class="subtle">Плееров пока нет</p>')+
 '<h2>Сезоны</h2><div class="select-list">'+[...seasons].sort((a,b)=>a-b).map(n=>'<button data-act="season" data-season="'+n+'" class="'+(n===S.season?'selected':'')+'">'+n+'</button>').join('')+'</div>'+
 (epNums.length?'<h2>Серии</h2><div class="select-list">'+epNums.map(n=>'<button data-act="episode" data-episode="'+n+'" class="'+(n===S.episode?'selected':'')+'">'+n+'</button>').join('')+'</div>':'<p class="subtle">Сезон и серии также можно выбирать внутри Initem.</p>')+
 '</aside></div>';
}
function render(){
 const names=['home','catalog','new','search','settings'];
 document.querySelectorAll('#nav button').forEach(b=>{
  const active=b.dataset.nav===S.page||(S.page==='detail'&&b.dataset.nav==='catalog')||(S.page==='player'&&b.dataset.nav==='catalog');
  b.classList.toggle('nav-active',active);
 });
 const html=S.page==='home'?home():S.page==='catalog'?catalog():S.page==='new'?newShows():
   S.page==='search'?searchUI():S.page==='settings'?settings():S.page==='detail'?detail():player();
 const prev=focusKey;
 root.innerHTML=html;
 if(prev){const found=[...document.querySelectorAll('[data-focus]')].find(x=>x.dataset.focus===prev);if(found)found.focus({preventScroll:true});}
}
function record(key){
 S.recent=[{key,date:Date.now()},...S.recent.filter(x=>x.key!==key)].slice(0,12);
 save('tv-recent',S.recent);
}
function openShow(key){if(!item(key))return;navigate('detail',key);loadEpisodes(key);}
function watch(key){
 const x=item(key||S.show);if(!x)return;
 S.show=x.key;S.source=0;S.season=1;S.episode=1;record(x.key);
 navigate('player',x.key);loadEpisodes(x.key);
}
function refreshPlayer(){
 if(S.cursor)stopCursor();
 const key='player-cursor';focusKey=key;render();
 const el=$('[data-act=cursor]');if(el)el.focus({preventScroll:true});
}
function goBack(){
 if(S.cursor){stopCursor();return true;}
 if(S.page==='player'){navigate('detail',S.show);return true;}
 if(S.page==='detail'){navigate('catalog');return true;}
 if(S.page!=='home'){navigate('home');return true;}
 return false;
}
function startCursor(){
 const frame=$('#tv-video-frame'),button=$('[data-act=cursor]');if(!frame||!$('#tv-player-iframe')){notify('Видеоплеер пока не загружен');return;}
 S.cursor=true;S.cx=.5;S.cy=.5;S.cursorFocus=button;
 button.textContent='● Режим курсора активен';
 const help=$('#player-help');if(help)help.textContent='Стрелки перемещают курсор внутри видео. OK нажимает, «Назад» возвращает к кнопкам.';
 updateCursor();button.focus({preventScroll:true});
}
function stopCursor(){
 S.cursor=false;
 const p=$('#tv-cursor');if(p)p.style.display='none';
 const help=$('#player-help');if(help)help.textContent='Нажми «Управлять плеером», чтобы управлять кнопками внутри Initem пультом.';
 const btn=$('[data-act=cursor]');
 if(btn){btn.textContent='🎮 Управлять плеером';btn.focus({preventScroll:true});}
}
function updateCursor(){
 const p=$('#tv-cursor');if(!p)return;
 p.style.display='block';p.style.left=(S.cx*100)+'%';p.style.top=(S.cy*100)+'%';
}
function tapPlayer(){
 const frame=$('#tv-video-frame');if(!frame)return;
 const r=frame.getBoundingClientRect();
 const x=(r.left+S.cx*r.width)/window.innerWidth;
 const y=(r.top+S.cy*r.height)/window.innerHeight;
 if(x<=0||x>=1||y<=0||y>=1)return;
 // Native WebView injects an actual touch at the coordinates, across iframe origin.
 window.location.href='ultratv://tap?x='+x.toFixed(6)+'&y='+y.toFixed(6);
 setTimeout(()=>{if(S.cursor)S.cursorFocus?.focus({preventScroll:true})},180);
}
function getFocusable(){
 return [...document.querySelectorAll('#nav button,#content button:not(:disabled),#content input:not(:disabled)')]
 .filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden'});
}
function nextInDirection(from,key){
 const r=from.getBoundingClientRect(),horizontal=key==='ArrowLeft'||key==='ArrowRight';
 const forward=key==='ArrowDown'||key==='ArrowRight',c=h=>horizontal?(h.left+h.right)/2:(h.top+h.bottom)/2;
 const perp=h=>horizontal?(h.top+h.bottom)/2:(h.left+h.right)/2;
 const aMin=horizontal?r.top:r.left,aMax=horizontal?r.bottom:r.right;
 let best=null,score=Infinity;
 for(const el of getFocusable()){
  if(el===from)continue;
  const b=el.getBoundingClientRect(),primary=(c(b)-c(r))*(forward?1:-1);
  if(primary<=3)continue;
  const bMin=horizontal?b.top:b.left,bMax=horizontal?b.bottom:b.right;
  const gap=Math.max(0,aMin-bMax,bMin-aMax);
  const val=primary+gap*5+Math.abs(perp(b)-perp(r))*.23;
  if(val<score){score=val;best=el;}
 }
 return best;
}
document.addEventListener('focusin',e=>{if(e.target?.dataset?.focus)focusKey=e.target.dataset.focus;},true);
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-nav],[data-act]');if(!b)return;
 if(b.dataset.nav){navigate(b.dataset.nav);return;}
 const act=b.dataset.act,key=b.dataset.key||S.show;
 if(act==='detail')openShow(key);
 if(act==='play')watch(key);
 if(act==='back')goBack();
 if(act==='follow'&&item(S.show)){S.tracked[S.show]=S.tracked[S.show]===false?true:false;save('tv-tracked',S.tracked);render();}
 if(act==='source'){S.source=Number(b.dataset.index)||0;refreshPlayer();}
 if(act==='season'){S.season=Number(b.dataset.season)||1;S.episode=1;S.source=0;refreshPlayer();}
 if(act==='episode'){S.episode=Number(b.dataset.episode)||1;S.source=0;refreshPlayer();}
 if(act==='cursor'){S.cursor?stopCursor():startCursor();}
 if(act==='fullscreen'){
  const frame=$('#tv-video-frame');try{frame?.requestFullscreen?.()}catch{}
 }
 if(act==='reload')refreshPlayer();
 if(act==='refresh')refresh(true);
 if(act==='adsettings')window.location.href='ultratv://settings';
});
document.addEventListener('input',e=>{
 if(e.target?.id==='tv-search'){
  S.search=e.target.value;
  const result=$('#search-results');if(result)result.innerHTML=searchMatches();
 }
});
document.addEventListener('focusout',e=>{
 if(e.target?.id==='tv-search'){
  const input=e.target;setTimeout(()=>{if(document.activeElement!==input)input.readOnly=true;},80);
 }
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();goBack();return;}
 const isOk=e.key==='Enter'||e.key==='NumpadEnter'||e.key===' ';
 if(S.cursor){
   if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
     e.preventDefault();e.stopImmediatePropagation();
     if(e.key==='ArrowLeft')S.cx=Math.max(.025,S.cx-.075);
     if(e.key==='ArrowRight')S.cx=Math.min(.975,S.cx+.075);
     if(e.key==='ArrowUp')S.cy=Math.max(.025,S.cy-.09);
     if(e.key==='ArrowDown')S.cy=Math.min(.975,S.cy+.09);
     updateCursor();return;
   }
   if(isOk){e.preventDefault();e.stopImmediatePropagation();tapPlayer();return;}
 }
 if(e.target?.id==='tv-search'){
  if(isOk&&e.target.readOnly){
    e.preventDefault();e.stopImmediatePropagation();
    const input=e.target;input.readOnly=false;input.blur();input.focus({preventScroll:true});
    window.location.href='ultratv://keyboard';
    return;
  }
  if(!e.target.readOnly){return;}
 }
 if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
 const now=Date.now();if(now-lastNav<110){e.preventDefault();e.stopImmediatePropagation();return;}lastNav=now;
 const from=document.activeElement;
 if(!from||!getFocusable().includes(from))return;
 const best=nextInDirection(from,e.key);
 if(best){e.preventDefault();e.stopImmediatePropagation();
   best.focus({preventScroll:true});
   best.scrollIntoView({behavior:'instant',block:'nearest',inline:'center'});
 }
},true);

async function readShared(file) {
 const safe=file.replace(/[^a-z0-9-.]/g,'');
 try{
  const r=await fetch('/'+safe+'?live=1&t='+Date.now(),{cache:'no-store'});
  if(r.ok)return {data:await r.json(),online:true};
 }catch{}
 try{
  const r=await fetch('/'+safe,{cache:'default'});
  if(r.ok)return {data:await r.json(),online:false};
 }catch{}
 return null;
}
async function refresh(manual=false){
 if(S.loading)return;
 S.loading=true;$('#network').textContent='● Обновление…';
 if(manual)notify('Обновляем список сериалов и плееров…');
 try{
  const responses=await Promise.all([readShared('tv-catalog.json'),readShared('watch-options.json'),readShared('releases.json')]);
  const [c,o,r]=responses;
  if(c?.data?.shows?.length){
   S.shows=c.data.shows.filter(x=>x&&x.key&&x.ru).slice(0,500);
   save('tv-catalog-cache',S.shows);
  }
  if(o?.data?.embeds){S.opts=o.data;save('tv-options-cache',S.opts);}
  if(r?.data){
   const data=r.data;S.releases=Array.isArray(data)?data:(data.releases||data.items||[]);
   save('tv-release-cache',S.releases);
  }
  $('#network').textContent=c?.online?'● Каталог обновлён':'● Каталог сохранён';
  // Replacing an iframe while the user watches would restart video playback.
  // Changes stay in state and take effect when the user leaves the player.
  if(S.page!=='player')render();
  if(manual)notify(c?.online?'Каталог обновлён · '+S.shows.length+' сериалов':'Используем сохранённый каталог. Проверь соединение.');
 }catch(err){$('#network').textContent='● Локальный каталог';if(manual)notify('Ошибка обновления: '+err.message);}
 finally{S.loading=false;}
 if(S.shows.length)loadPosters(manual);
}
async function loadPosters(force=false){
 const list=items().filter(x=>force||!S.meta[x.key]||Date.now()-(S.meta[x.key].updated||0)>1000*60*60*24*7);
 for(const x of list){
  try{
   const q=await fetch('https://api.tvmaze.com/search/shows?q='+encodeURIComponent(x.en));
   if(!q.ok)continue;
   const found=await q.json();
   const target=found.map(a=>a.show).filter(Boolean).sort((a,b)=>{
    const score=t=>(String(t.name).toLowerCase()===String(x.en).toLowerCase()?0:1)+Math.abs(Number((t.premiered||'').slice(0,4))-(x.year||2020))*.03;
    return score(a)-score(b);
   })[0];
   if(!target)continue;
   S.meta[x.key]={...(S.meta[x.key]||{}),id:target.id,imdb:target.externals?.imdb||x.imdb||null,
     image:target.image?.original||target.image?.medium||x.image||null,rating:target.rating?.average,
     summary:(target.summary||'').replace(/<[^>]*>/g,' ').slice(0,650),
     updated:Date.now()};
   save('tv-meta-cache',S.meta);
   document.querySelectorAll('[data-poster]').forEach(p=>{
    if(p.dataset.poster!==x.key||p.querySelector('img'))return;
    const img=document.createElement('img');img.alt='';img.loading='lazy';img.src=S.meta[x.key].image||'';
    p.querySelector('.no-art')?.replaceWith(img);
   });
   if(S.page==='detail'&&S.show===x.key) {
    const f=document.activeElement?.dataset.focus||null;
    render();if(f)document.querySelector('[data-focus="'+f+'"]')?.focus({preventScroll:true});
   }
   await new Promise(resolve=>setTimeout(resolve,180));
  }catch{}
 }
}
async function loadEpisodes(key){
 const x=item(key);if(!x)return;
 let m=meta(key);
 if(!m.id){
  try{
   const q=await fetch('https://api.tvmaze.com/search/shows?q='+encodeURIComponent(x.en));
   const arr=await q.json(),sh=arr[0]?.show;
   if(sh){m={...m,id:sh.id,imdb:sh.externals?.imdb||x.imdb,image:sh.image?.original||sh.image?.medium};}
  }catch{}
 }
 if(!m.id)return;
 if(m.episodes&&Date.now()-(m.episodesUpdated||0)<86400000)return;
 try{
  const res=await fetch('https://api.tvmaze.com/shows/'+m.id+'/episodes');
  if(!res.ok)return;
  const episodes=await res.json();
  m.episodes=episodes.map(e=>({season:e.season,number:e.number,name:e.name,airdate:e.airdate})).filter(e=>e.number);
  m.episodesUpdated=Date.now();S.meta[key]=m;save('tv-meta-cache',S.meta);
  if(S.show===key && (S.page==='player'||S.page==='detail')) {
   const old=document.activeElement?.dataset.focus;
   render();if(old)document.querySelector('[data-focus="'+old+'"]')?.focus({preventScroll:true});
  }
 }catch{}
}
window.UltraTVRemote={back:goBack,releaseCursor:stopCursor};
render();refresh(false);
setInterval(()=>{if(!document.hidden)refresh(false)},30*60*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(false)});
})();