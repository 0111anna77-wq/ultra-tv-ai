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
  cursor:false,cx:.5,cy:.5,cursorFocus:null,
  added:store('tv-manual-added',[]),discover:store('tv-discover-cache',[]),
  sourceChoice:store('tv-source-choice',{}),optionsOpen:false,directWatch:false,
  scheduleLoading:false,scheduleDone:0,scheduleMode:'mine',
  progress:store('tv-progress-v1',{}),progressDraft:{},
  ruSummaries:store('tv-summary-ru-cache',{})};
const root=$('#content');
let focusKey=null,refreshTimer=0;
let focusRows=[],focusSlots=new WeakMap(),focusMemory=new Map(),lastRepeatAt=0;
const items=()=>{
 const byKey=new Map();
 for(const x of [...S.shows,...S.added])if(x&&x.key&&x.ru)byKey.set(x.key,x);
 return [...byKey.values()];
};
const item=key=>items().find(x=>x.key===key)||S.discover.find(x=>x.key===key);
const isInCollection=key=>items().some(x=>x.key===key);
const meta=key=>S.meta[key]||{};
const poster=x=>{
 const m=meta(x.key);
 const url=m.posterMedium||m.image||x.image||'';
 return url.replace('/original_untouched/','/medium_portrait/')
           .replace('/original/','/medium_portrait/');
};
const imdb=x=>meta(x.key).imdb||x.imdb||'';
const summaryRu=x=>S.ruSummaries[x.key]||'Русское описание пока недоступно.';
const latest=()=>items().filter(x=>S.tracked[x.key]!==false);
const getProgress=key=>S.progress[key]||null;
const episodeCode=(season,episode)=>'S'+String(season||1).padStart(2,'0')+'E'+String(episode||1).padStart(2,'0');
const clock=seconds=>{
 const t=Math.max(0,Math.floor(Number(seconds)||0)),h=Math.floor(t/3600),m=Math.floor(t%3600/60),ss=t%60;
 return h?String(h)+':'+String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0'):
   String(m)+':'+String(ss).padStart(2,'0');
};
function setProgress(key,updates){
 const prev=getProgress(key)||{};
 S.progress[key]={...prev,...updates};
 save('tv-progress-v1',S.progress);
}
function progressLabel(key){
 const p=getProgress(key);
 if(!p)return '';
 if(p.completed)return 'Просмотрена · '+episodeCode(p.season,p.episode);
 if(p.kind==='direct'&&Number(p.seconds)>0)return episodeCode(p.season,p.episode)+' · '+clock(p.seconds);
 if(p.confirmed)return 'Отмечено · '+episodeCode(p.season,p.episode);
 return 'Последний просмотр';
}
function progressDraft(key){
 if(!S.progressDraft[key]){
   const p=getProgress(key);
   S.progressDraft[key]={season:Math.max(1,Number(p?.season)||1),
     episode:Math.max(1,Number(p?.episode)||1)};
 }
 return S.progressDraft[key];
}
function changeProgressDraft(key,field,direction){
 const v=progressDraft(key);
 v[field]=Math.max(1,Math.min(field==='season'?30:99,v[field]+direction));
 if(field==='season')v.episode=1;
 return v;
}
function navigate(page,key){
  if(S.cursor)stopCursor();
  S.page=page; S.show=key||null;S.optionsOpen=false;
  focusKey=null;focusMemory.clear(); render();
  window.scrollTo(0,0);
  const selector=page==='player'?'[data-act="cursor"]':page==='detail'?'[data-act="play"]':
    page==='search'?'[data-focus="search-field"]':'#nav .nav-active';
  const first=$(selector)||$('#content button');
  if(first)first.focus({preventScroll:true});
  if(page==='catalog')setTimeout(loadSchedule,80);
}
function notify(text){
  const el=$('#toast');el.textContent=text;el.classList.add('show');
  clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>el.classList.remove('show'),3800);
}
const category=x=>(x.genres||[]).map(g=>tags[g]||g).slice(0,2).join(' · ');
const thumb=x=>{
  const url=poster(x),label=progressLabel(x.key);
  return '<div class="art" data-poster="'+esc(x.key)+'">'+
    (url?'<img src="'+esc(url)+'" alt="" loading="lazy" decoding="async">':'<span class="no-art">▶</span>')+
    (label?'<span class="pill">'+esc(label)+'</span>':'')+'</div>';
};
const card=x=>'<button class="card" data-act="detail" data-key="'+esc(x.key)+'" data-focus="show:'+esc(x.key)+'">'+
  thumb(x)+'<span class="card-title">'+esc(x.ru)+'</span><small class="card-sub">'+esc(x.year)+' · '+esc(category(x))+
  (Number(x.rating||meta(x.key).rating)?' · ★ '+esc(x.rating||meta(x.key).rating):'')+'</small></button>';
const rail=(title,xs,action)=>xs.length?'<section class="rail"><h2>'+esc(title)+'</h2><div class="strip">'+
   xs.map(x=>action==='continue'?card(x).replace('data-act="detail"','data-act="continue"'):card(x)).join('')+
   '</div></section>':'';
function home(){
 const data=latest();
 const history=Object.entries(S.progress).filter(([key,p])=>p&&Number(p.openedAt)>0&&item(key))
   .sort((a,b)=>Number(b[1].openedAt)-Number(a[1].openedAt))
   .slice(0,12).map(([key])=>item(key));
 return rail('▶ Продолжить просмотр',history,'continue')+
   rail('Мои сериалы',data)+
   rail('Фантастика и фэнтези',data.filter(x=>x.genres.some(g=>['scifi','fantasy','super'].includes(g))))+
   rail('Криминал и триллеры',data.filter(x=>x.genres.some(g=>['crime','thriller'].includes(g))))+
   rail('Драмы и комедии',data.filter(x=>x.genres.some(g=>['drama','comedy'].includes(g))));
}
function dateRu(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return value||'';
 return new Date(value+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'});
}
function todayLocal(){
 const d=new Date();
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
const norm=t=>String(t||'').toLowerCase().replace(/[^a-zа-яё0-9]/g,'');
function matchRelease(entry){
 const en=norm(entry.seriesEn),ru=norm(entry.seriesRu);
 return items().find(x=>(en&&norm(x.en)===en)||(ru&&norm(x.ru)===ru));
}
function scheduleEntry(x,episode,kind){
 const key=x?.key||'';
 const code='S'+String(episode.season||0).padStart(2,'0')+'E'+String(episode.number||0).padStart(2,'0');
 return '<button class="schedule-entry" data-act="detail" data-key="'+esc(key)+'" data-focus="episode:'+esc(key)+':'+esc(code)+
  '" aria-label="'+esc(x.ru+' '+code)+'"><span class="episode-day">'+esc(dateRu(episode.airdate||episode.date))+
  '</span><span class="episode-name"><strong>'+esc(x.ru)+'</strong><small>'+esc(episode.name||episode.title||'Новая серия')+
  '</small></span><span class="episode-code">'+esc(code)+'</span><span class="episode-source">'+esc(kind)+'</span></button>';
}
function catalog(){
 const all=S.scheduleMode==='all'?items():latest();
 const today=todayLocal(),cutoff=new Date();cutoff.setDate(cutoff.getDate()+60);
 const until=[cutoff.getFullYear(),String(cutoff.getMonth()+1).padStart(2,'0'),String(cutoff.getDate()).padStart(2,'0')].join('-');
 const upcoming=[];
 for(const x of all){
   const eps=(meta(x.key).episodes||[]).filter(ep=>ep.airdate&&ep.airdate>=today&&ep.airdate<=until);
   eps.sort((a,b)=>a.airdate.localeCompare(b.airdate));
   for(const ep of eps.slice(0,5))upcoming.push({x,episode:ep});
 }
 upcoming.sort((a,b)=>a.episode.airdate.localeCompare(b.episode.airdate)||a.x.ru.localeCompare(b.x.ru,'ru'));
 const recent=[];
 for(const entry of S.releases){
  const x=matchRelease(entry);
  if(!x||!all.some(y=>y.key===x.key))continue;
  const date=String(entry.published||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
  recent.push({x,episode:{date,season:entry.season,number:entry.episode,name:entry.title}});
 }
 recent.sort((a,b)=>b.episode.date.localeCompare(a.episode.date));
 const filters='<div class="schedule-filters">'+
  '<button data-act="schedule-filter" data-mode="mine" class="'+(S.scheduleMode==='mine'?'selected':'')+'">Мои сериалы</button>'+
  '<button data-act="schedule-filter" data-mode="all" class="'+(S.scheduleMode==='all'?'selected':'')+'">Все сериалы</button></div>';
 const progress=S.scheduleLoading?'<p class="schedule-progress">Проверяем расписание TVMaze: '+S.scheduleDone+' из '+latest().length+'…</p>':'';
 return '<h1 class="section-title">Расписание выхода серий</h1>'+
  '<p class="section-note">Плановые даты премьер по TVMaze и уже опубликованные серии в озвучке LostFilm — это разные события.</p>'+
  filters+progress+
  '<h2 class="schedule-subtitle">Скоро в эфире · ближайшие 60 дней</h2>'+
  (upcoming.length?'<div class="schedule-list">'+upcoming.slice(0,70).map(row=>scheduleEntry(row.x,row.episode,'TVMaze')).join('')+'</div>':
    '<div class="empty">Подтверждённых дат пока нет. Если расписание ещё загружается, записи появятся ниже после проверки.</div>')+
  '<h2 class="schedule-subtitle">Недавно вышли с озвучкой LostFilm</h2>'+
  (recent.length?'<div class="schedule-list">'+recent.slice(0,24).map(row=>scheduleEntry(row.x,row.episode,'LostFilm')).join('')+'</div>':
   '<div class="empty">В последних сообщениях LostFilm нет совпадений с выбранными сериалами.</div>');
}
function newShows(){
 const owned=new Set(items().map(x=>x.key));
 const discovered=S.discover.filter(x=>x&&x.key&&x.image&&Number(x.rating)>=7.7&&!owned.has(x.key))
   .sort((a,b)=>Number(b.rating)-Number(a.rating)||Number(b.year)-Number(a.year));
 return '<h1 class="section-title">Сериалы с высоким рейтингом</h1>'+
 '<p class="section-note">Подборка TVMaze вне твоего каталога. Оценки указаны по TVMaze, это не IMDb. Здесь ничего не добавляется автоматически.</p>'+
 (discovered.length?'<div class="cards-grid">'+discovered.map(card).join('')+'</div>':
 '<div class="empty">Подборка пока загружается или все предложенные сериалы уже добавлены.</div>');
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
 return '<h1 class="section-title">Настройки</h1><section class="settings-box">'+
 '<div class="settings-row"><div><h2>Каталог и расписание</h2><p>Сериалы и источники проверяются при запуске и раз в 30 минут.</p></div>'+
 '<button class="action" data-act="refresh" data-focus="refresh">↻ Обновить каталог</button></div>'+
 '<div class="settings-row"><div><h2>Версия приложения</h2><p>Новые версии APK устанавливаются через системное подтверждение Android.</p></div>'+
 '<button class="action" data-act="appupdate" data-focus="appupdate">⬇ Проверить обновление</button></div>'+
 '<div class="settings-row"><div><h2>Блокировщик рекламы</h2><p>Включить или выключить фильтр, посмотреть статистику блокировок.</p></div>'+
 '<button class="action" data-act="adsettings">⚙ AdBlock</button></div>'+
 '<div class="settings-row"><div><h2>Управление</h2><p>Стрелки — выбор, OK — действие; удержание OK в видео — указатель. Назад — выйти из просмотра.</p></div></div>'+
 '<p class="settings-footer">Общий каталог синхронизируется с сайтом. Сохранённые на приставке добавления пока локальные.</p></section>';
}

function progressUI(x){
 const key=x.key,p=getProgress(key),v=progressDraft(key);
 const summary=p?.kind==='direct'&&Number(p.seconds)>0?
   'Сохранено '+episodeCode(p.season,p.episode)+' · '+clock(p.seconds):
   p?.confirmed?'Сохранено '+episodeCode(p.season,p.episode):
   p?.openedAt?'Последний просмотр':'Отметь серию';
 return '<div class="progress-panel" role="group" aria-label="Последняя просмотренная серия">'+
  '<span class="progress-summary">'+esc(summary)+'</span>'+
  '<div class="progress-picker">'+
  '<span>Сезон</span><button data-act="progress-step" data-part="season" data-step="-1" aria-label="Предыдущий сезон">−</button><b>'+v.season+
  '</b><button data-act="progress-step" data-part="season" data-step="1" aria-label="Следующий сезон">+</button>'+
  '<span>Серия</span><button data-act="progress-step" data-part="episode" data-step="-1" aria-label="Предыдущая серия">−</button><b>'+v.episode+
  '</b><button data-act="progress-step" data-part="episode" data-step="1" aria-label="Следующая серия">+</button></div>'+
  '<button class="action progress-save" data-act="progress-save" aria-label="Запомнить выбранную серию">✓ Запомнить</button>'+
  '<small class="progress-explain">Initem откроет отмеченную серию; точная минута пока не определяется.</small>'+
  '</div>';
}
function detail(){
 const x=item(S.show);if(!x)return catalog();
 const m=meta(x.key),img=poster(x),isOwned=isInCollection(x.key);
 const genres=(x.genres||[]).map(v=>'<span class="badge">'+esc(tags[v]||v)+'</span>').join('');
 const sources=availableSources(x),choice=Number(S.sourceChoice[x.key])||0;
 const panel=S.optionsOpen?
   '<div class="source-panel"><h3>Источники просмотра</h3>'+
   (sources.length?sources.map((src,i)=>'<button data-act="preselect-source" data-index="'+i+'" data-focus="source:'+i+
   '" class="'+(i===choice?'selected':'')+'">'+esc(src.name||src.platform||'Источник '+(i+1))+'</button>').join(''):
   '<p>Дополнительных источников пока нет.</p>')+
   '<p class="subtle">Озвучку можно выбрать в самом плеере.</p></div>':'';
 const favLabel=isOwned?(S.tracked[x.key]===false?'Вернуть в каталог':'В моём каталоге'):'Добавить в мой каталог';
 return '<section class="detail detail-compact">'+
 '<div class="detail-poster">'+(img?'<img class="detail-art" src="'+esc(img)+'" alt="'+esc(x.ru)+'">':'<div class="detail-art"></div>')+'</div>'+
 '<div class="detail-info"><div class="eyebrow">Ultra TV · сериал</div><h1>'+esc(x.ru)+'</h1>'+
 '<p class="detail-metadata">'+esc(x.year)+(m.rating||x.rating?' · ★ '+esc(m.rating||x.rating):'')+' · '+esc(x.en)+'</p>'+
 '<div class="detail-genres">'+genres+'</div><p class="detail-description">'+esc(summaryRu(x))+'</p>'+
 '<div class="actions detail-commands"><button class="primary" data-act="play" data-focus="detail-play">'+
 (getProgress(x.key)?'▶ Продолжить просмотр':'▶ Смотреть')+'</button>'+
 '<button class="secondary icon-button" data-act="follow" aria-label="'+esc(favLabel)+'" title="'+esc(favLabel)+'">'+
 (isOwned&&S.tracked[x.key]!==false?'✓':'＋')+'▤</button>'+
 '<button class="action icon-button" data-act="player-options" data-focus="player-options" aria-label="Настройки плеера" title="Настройки плеера" aria-expanded="'+S.optionsOpen+'">⚙</button></div>'+
 progressUI(x)+
 panel+'</div></section>';
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
 let url=src?.url;if(!url)return '<div class="empty">Плеер пока не подключён для этого сериала.</div>';
 // Tested with Initem: ?season=1&episode=2 controls playlist.current.
 // Apply only when the user manually chose an episode; otherwise preserve
 // any internal Initem resume behavior.
 if(src.platform==='initem'&&getProgress(S.show)?.confirmed){
   const u=new URL(url);
   u.searchParams.set('season',String(S.season));
   u.searchParams.set('episode',String(S.episode));
   url=u.toString();
 }
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
 '<button class="primary" data-act="cursor" data-focus="player-cursor">⛶ Полный экран</button></div>'+
 '<h1>'+esc(x.ru)+' · просмотр</h1>'+
 '<div id="tv-video-frame" class="player-frame" role="button" tabindex="0" data-act="frame" aria-label="Плеер. OK — просмотр на весь экран">'+sourceMedia(src)+'</div>'+
 '<p class="player-help" id="player-help">«Полный экран» включает просмотр с управлением указателем. Стрелки — движение, OK — выбор. Курсор сам скрывается через 3 секунды и появляется при следующем движении.</p>'+
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
 const activeBefore=document.activeElement;
 const oldSlot=focusSlots.get(activeBefore);
 const prev=focusKey;
 root.innerHTML=html;
 buildFocusRows();
 let target=null;
 if(oldSlot){
   const row=focusRows.find(r=>r.id===oldSlot.rowId);
   target=row?.items.find(e=>e.dataset.focus&&e.dataset.focus===prev)||
     row?.items[Math.min(oldSlot.index,row.items.length-1)]||null;
 }
 if(!target&&prev)target=[...document.querySelectorAll('[data-focus]')].find(x=>x.dataset.focus===prev);
 if(target)target.focus({preventScroll:true});
 if(S.page==='player')bindNativeVideoProgress();
}
function bindNativeVideoProgress(){
 const video=$('#tv-video'),key=S.show;
 if(!video||!key)return;
 const source=video.getAttribute('src')||'';
 video.addEventListener('loadedmetadata',()=>{
   const p=getProgress(key);
   const time=Number(p?.seconds)||0;
   if(p?.kind==='direct'&&!p.completed&&p.mediaUrl===source
      &&p.season===S.season&&p.episode===S.episode
      &&Number.isFinite(video.duration)&&time>5&&time<video.duration-20){
     try{video.currentTime=time;}catch{}
   }
 });
 let lastSaved=0;
 const storeTime=(force=false)=>{
   const now=Date.now();
   if(!force&&now-lastSaved<5000)return;
   if(!Number.isFinite(video.currentTime)||video.currentTime<0)return;
   // Do not erase a saved position when a new player initializes at 00:00
   // before its actual media metadata or playback has arrived.
   if(video.readyState===0&&video.currentTime===0)return;
   const duration=Number.isFinite(video.duration)?video.duration:0;
   setProgress(key,{season:S.season,episode:S.episode,
     source:S.source,openedAt:now,
     kind:'direct',mediaUrl:source,seconds:Math.floor(video.currentTime),
     duration:Math.floor(duration),completed:duration>0&&duration-video.currentTime<8});
   lastSaved=now;
 };
 video.addEventListener('timeupdate',()=>storeTime(false));
 video.addEventListener('pause',()=>storeTime(true));
 video.addEventListener('ended',()=>{storeTime(true);setProgress(key,{completed:true});});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&!video.paused)storeTime(true)},{once:true});
}
function record(key){
 S.recent=[{key,date:Date.now()},...S.recent.filter(x=>x.key!==key)].slice(0,12);
 save('tv-recent',S.recent);
}
function openShow(key){if(!item(key))return;navigate('detail',key);loadEpisodes(key);}
function watch(key){
 const x=item(key||S.show);if(!x)return;
 const previous=getProgress(x.key)||{};
 S.show=x.key;
 S.source=Number(S.sourceChoice[x.key]??previous.source??0)||0;
 S.season=Math.max(1,Number(previous.season)||1);
 S.episode=Math.max(1,Number(previous.episode)||1);
 record(x.key);
 const src=availableSources(x)[S.source]||availableSources(x)[0];
 setProgress(x.key,{season:S.season,episode:S.episode,
   source:S.source,openedAt:Date.now(),
   kind:src?.kind==='video'||/\.(mp4|webm)(?:\?|$)/i.test(src?.url||'')?'direct':'embed'});
 S.directWatch=true;
 navigate('player',x.key);loadEpisodes(x.key);
 // The click/OK user gesture goes straight to fullscreen with no extra view.
 startCursor();
}
function refreshPlayer(){
 if(S.cursor)stopCursor();
 const key='player-cursor';focusKey=key;render();
 const el=$('[data-act=cursor]');if(el)el.focus({preventScroll:true});
}
function goBack(){
 if(S.cursor){stopCursor();return true;}
 if(S.page==='player'){S.directWatch=false;navigate('detail',S.show);return true;}
 if(S.page==='detail'){navigate('catalog');return true;}
 if(S.page!=='home'){navigate('home');return true;}
 return false;
}
function signalNativePointer(enabled,x=.5,y=.5){
  const request=new Image();
  request.src='/_native/pointer?mode='+(enabled?'on':'off')+
    '&x='+x.toFixed(5)+'&y='+y.toFixed(5)+'&id='+Date.now();
}
function startCursor(){
  const frame=$('#tv-video-frame'),button=$('[data-act=cursor]');
  if(!frame||(!$('#tv-player-iframe')&&!$('#tv-video'))){notify('Видео ещё загружается');return;}
  if(S.cursor)return;
  S.cursor=true;S.cursorFocus=button;
  button.textContent='⛶ Полный экран';
  const help=$('#player-help');
  if(help)help.textContent='Стрелки двигают указатель, OK нажимает. Через 3 секунды он исчезает и снова появляется при движении.';
  // Do not trap D-pad scrolling in half of a page. Native fullscreen uses
  // the real TV player and the native cursor is visible above its video.
  const showPointer=()=>{
    if(!S.cursor)return;
    const r=frame.getBoundingClientRect();
    const x=Math.min(.96,Math.max(.04,(r.left+r.width/2)/innerWidth));
    const y=Math.min(.96,Math.max(.04,(r.top+r.height/2)/innerHeight));
    signalNativePointer(true,x,y);
  };
  const fullscreenFallback=()=>{
    if(!S.cursor)return;
    // Some KION WebViews reject requestFullscreen. Still occupy the screen,
    // rather than leaving the cursor trapped over a half-visible video.
    frame.classList.add('tv-maximized');
    showPointer();
  };
  if(document.fullscreenElement||!frame.requestFullscreen){fullscreenFallback();return;}
  try{
    const result=frame.requestFullscreen();
    if(result&&typeof result.then==='function')result.then(showPointer).catch(fullscreenFallback);
    else setTimeout(showPointer,80);
  }catch(err){fullscreenFallback();}
}
function stopCursor(fromNative=false){
  if(!S.cursor&&!fromNative)return;
  S.cursor=false;
  $('#tv-video-frame')?.classList.remove('tv-maximized');
  if(!fromNative)signalNativePointer(false);
  if(document.fullscreenElement){
    try{document.exitFullscreen().catch(()=>{});}catch(e){}
  }
  if(fromNative&&S.directWatch){
    S.directWatch=false;
    setTimeout(()=>{if(S.page==='player')navigate('detail',S.show)},90);
  }
  const help=$('#player-help');
  if(help)help.textContent='Для просмотра нажми «Полный экран» или OK на видеоплеере.';
  const button=$('[data-act=cursor]');
  if(button){
    button.textContent='⛶ Полный экран';
    if(fromNative)button.focus({preventScroll:true});
  }
}
/**
 * Remote navigation is built ONCE per layout, not on every D-pad event.
 * Home uses fixed visual rows; catalog/search grids use rendered rows.
 * Individual taps are immediate, while only extremely fast repeats are capped.
 */
function buildFocusRows(){
  focusRows=[];
  focusSlots=new WeakMap();
  const add=(id,nodes)=>{
    const items=[...nodes].filter(x=>!x.disabled&&x.offsetWidth>0&&x.offsetHeight>0);
    if(!items.length)return;
    const row={id,items};
    focusRows.push(row);
    items.forEach((node,index)=>focusSlots.set(node,{rowId:id,index}));
  };
  add('nav',[...document.querySelectorAll('#nav button')]);
  if(S.page==='home'){
    [...root.querySelectorAll('.rail')].forEach((rail,i)=>{
      add('home:rail:'+i,rail.querySelectorAll('.strip .card'));
    });
  }else if(S.page==='catalog'){
    add('schedule:filters',root.querySelectorAll('.schedule-filters button'));
    [...root.querySelectorAll('.schedule-entry')].forEach((entry,i)=>add('schedule:episode:'+i,[entry]));
  }else if(S.page==='new'||S.page==='search'){
    if(S.page==='search')add('search:input',root.querySelectorAll('#tv-search'));
    const all=[...root.querySelectorAll('.cards-grid .card')];
    const rows=new Map();
    for(const el of all){
      const y=el.offsetTop;
      if(!rows.has(y))rows.set(y,[]);
      rows.get(y).push(el);
    }
    [...rows.values()].forEach((items,i)=>add(S.page+':grid:'+i,items));
  }else if(S.page==='detail'){
    add('detail:actions',root.querySelectorAll('.detail .detail-commands button'));
    add('detail:progress',root.querySelectorAll('.detail .progress-picker button, .detail [data-act="progress-save"]'));
    [...root.querySelectorAll('.detail [data-act="preselect-source"]')].forEach((b,i)=>add('detail:source:'+i,[b]));
  }else if(S.page==='settings'){
    [...root.querySelectorAll('.settings-box button')].forEach((el,i)=>add('settings:'+i,[el]));
  }else if(S.page==='player'){
    add('player:toolbar',root.querySelectorAll('.player-main .player-tools:first-child button'));
    add('player:video',root.querySelectorAll('.player-main [data-act="frame"]'));
    add('player:reload',root.querySelectorAll('.player-main [data-act="reload"]'));
    [...root.querySelectorAll('.player-side button')].forEach((el,i)=>add('player:side:'+i,[el]));
  }
}
function moveFocus(from,key){
  const slot=focusSlots.get(from);
  if(!slot)return false;
  const rowIndex=focusRows.findIndex(r=>r.id===slot.rowId);
  if(rowIndex<0)return false;
  const horizontal=key==='ArrowLeft'||key==='ArrowRight';
  let target=null;
  if(horizontal){
    const idx=slot.index+(key==='ArrowRight'?1:-1);
    const row=focusRows[rowIndex];
    // End-of-rail means stop, not an unexpected jump to topbar/menu.
    if(idx>=0&&idx<row.items.length)target=row.items[idx];
  }else{
    const nextRow=rowIndex+(key==='ArrowDown'?1:-1);
    const destination=focusRows[nextRow];
    if(destination){
      if(destination.id==='nav'){
        target=document.querySelector('#nav .nav-active')||destination.items[0];
      }else{
        const remembered=focusMemory.get(destination.id);
        let desired=remembered==null?slot.index:remembered;
        if(slot.rowId==='nav'&&remembered==null)desired=0;
        target=destination.items[Math.min(desired,destination.items.length-1)];
      }
    }
  }
  if(!target)return false;
  focusMemory.set(slot.rowId,slot.index);
  const nextSlot=focusSlots.get(target);
  if(nextSlot)focusMemory.set(nextSlot.rowId,nextSlot.index);
  target.focus({preventScroll:true});
  bringFocusedIntoView(target);
  return true;
}
function bringFocusedIntoView(el){
  if(el.closest('#nav')){
    if(window.scrollY>0)window.scrollTo(0,0);
    return;
  }
  const strip=el.closest('.strip');
  if(strip){
    const a=el.getBoundingClientRect(),b=strip.getBoundingClientRect();
    if(a.left<b.left+10)strip.scrollLeft+=a.left-b.left-18;
    else if(a.right>b.right-10)strip.scrollLeft+=a.right-b.right+18;
  }
  const r=el.getBoundingClientRect();
  const nav=document.querySelector('.topbar');
  const safeTop=Math.max(16,nav?.getBoundingClientRect().bottom||0)+20;
  const safeBottom=window.innerHeight-38;
  if(r.top<safeTop)window.scrollBy(0,r.top-safeTop);
  else if(r.bottom>safeBottom)window.scrollBy(0,r.bottom-safeBottom);
}
document.addEventListener('focusin',e=>{
  const el=e.target;
  if(el?.dataset?.focus)focusKey=el.dataset.focus;
  const slot=focusSlots.get(el);
  if(slot)focusMemory.set(slot.rowId,slot.index);
},true);
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-nav],[data-act]');if(!b)return;
 if(b.dataset.nav){navigate(b.dataset.nav);return;}
 const act=b.dataset.act,key=b.dataset.key||S.show;
 if(act==='detail')openShow(key);
 if(act==='continue')watch(key);
 if(act==='play')watch(key);
 if(act==='progress-step'&&item(S.show)){
   const part=b.dataset.part==='season'?'season':'episode';
   const step=Number(b.dataset.step)===-1?-1:1;
   changeProgressDraft(S.show,part,step);
   focusKey=null;render();
   document.querySelector('[data-act="progress-step"][data-part="'+part+'"][data-step="'+step+'"]')
     ?.focus({preventScroll:true});
 }
 if(act==='progress-save'&&item(S.show)){
   const draft=progressDraft(S.show),existing=getProgress(S.show)||{};
   setProgress(S.show,{season:draft.season,episode:draft.episode,
      confirmed:true,completed:false,seconds:0,duration:0,mediaUrl:null,
      openedAt:Number(existing.openedAt)||Date.now()});
   focusKey=null;render();
   document.querySelector('[data-act="progress-save"]')?.focus({preventScroll:true});
   notify('Сохранено: '+episodeCode(draft.season,draft.episode));
 }
 if(act==='back')goBack();
 if(act==='follow'&&item(S.show)){
   const x=item(S.show);
   if(!isInCollection(x.key)){
     S.added.push(x);save('tv-manual-added',S.added);
     S.tracked[x.key]=true;notify('Добавлено в коллекцию на приставке');
   }else S.tracked[x.key]=S.tracked[x.key]===false?true:false;
   save('tv-tracked',S.tracked);render();
 }
 if(act==='source'){S.source=Number(b.dataset.index)||0;S.sourceChoice[S.show]=S.source;save('tv-source-choice',S.sourceChoice);refreshPlayer();}
 if(act==='player-options'){
   S.optionsOpen=!S.optionsOpen;focusKey='player-options';render();
   document.querySelector('[data-focus="player-options"]')?.focus({preventScroll:true});
 }
 if(act==='preselect-source'){
   S.source=Number(b.dataset.index)||0;S.sourceChoice[S.show]=S.source;
   save('tv-source-choice',S.sourceChoice);focusKey='source:'+S.source;render();
   notify('Источник выбран — нажми «Смотреть»');
 }
 if(act==='schedule-filter'){
   S.scheduleMode=b.dataset.mode==='all'?'all':'mine';
   focusKey=null;render();
   document.querySelector('[data-mode="'+S.scheduleMode+'"]')?.focus({preventScroll:true});
 }
 if(act==='season'){S.season=Number(b.dataset.season)||1;S.episode=1;S.source=0;refreshPlayer();}
 if(act==='episode'){S.episode=Number(b.dataset.episode)||1;S.source=0;refreshPlayer();}
 if(act==='cursor'||act==='frame'){S.cursor?stopCursor():startCursor();}
 if(act==='reload')refreshPlayer();
 if(act==='refresh')refresh(true);
 if(act==='appupdate')window.location.href='ultratv://app-update';
 if(act==='adsettings')window.location.href='ultratv://settings';
});
document.addEventListener('input',e=>{
 if(e.target?.id==='tv-search'){
  S.search=e.target.value;
  const result=$('#search-results');
  if(result){result.innerHTML=searchMatches();buildFocusRows();}
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
 if(isOk&&document.activeElement?.dataset?.act==='frame'){
   e.preventDefault();e.stopImmediatePropagation();startCursor();return;
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
 const from=document.activeElement;
 // Consecutive distinct key taps must not be delayed by the former 110 ms gate.
 if(e.repeat){
   const now=performance.now();
   if(now-lastRepeatAt<50){e.preventDefault();e.stopImmediatePropagation();return;}
   lastRepeatAt=now;
 }
 if(!from||!focusSlots.has(from))return;
 e.preventDefault();e.stopImmediatePropagation();
 moveFocus(from,e.key);
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
  const responses=await Promise.all([readShared('tv-catalog.json'),readShared('watch-options.json'),readShared('releases.json'),readShared('tv-discover.json'),readShared('tv-summaries-ru.json')]);
  const [c,o,r,d,ru]=responses;
  if(c?.data?.shows?.length){
   S.shows=c.data.shows.filter(x=>x&&x.key&&x.ru).slice(0,500);
   save('tv-catalog-cache',S.shows);
  }
  if(o?.data?.embeds){S.opts=o.data;save('tv-options-cache',S.opts);}
  if(r?.data){
   const data=r.data;S.releases=Array.isArray(data)?data:(data.entries||data.releases||data.items||[]);
   save('tv-release-cache',S.releases);
  }
  if(d?.data?.shows?.length){
   S.discover=d.data.shows.filter(x=>x&&x.key&&x.ru&&Number(x.rating)>0).slice(0,100);
   save('tv-discover-cache',S.discover);
  }
  if(ru?.data?.shows){
   S.ruSummaries={...S.ruSummaries,...ru.data.shows};
   save('tv-summary-ru-cache',S.ruSummaries);
  }
  $('#network').textContent=c?.online?'● Каталог обновлён':'● Каталог сохранён';
  // Replacing an iframe while the user watches would restart video playback.
  // Changes stay in state and take effect when the user leaves the player.
  if(S.page!=='player')render();
  if(manual)notify(c?.online?'Каталог обновлён · '+S.shows.length+' сериалов':'Используем сохранённый каталог. Проверь соединение.');
 }catch(err){$('#network').textContent='● Локальный каталог';if(manual)notify('Ошибка обновления: '+err.message);}
 finally{S.loading=false;}
 if(S.shows.length)loadPosters(manual);
 if(S.page==='catalog'&&!S.scheduleLoading)loadSchedule();
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
     image:target.image?.medium||target.image?.original||x.image||null,
     posterMedium:target.image?.medium||null,rating:target.rating?.average,
     summary:(target.summary||'').replace(/<[^>]*>/g,' ').slice(0,650),
     updated:Date.now()};
   save('tv-meta-cache',S.meta);
   document.querySelectorAll('[data-poster="'+x.key+'"]').forEach(p=>{
    if(p.querySelector('img'))return;
    const img=document.createElement('img');img.alt='';img.loading='lazy';img.decoding='async';img.src=poster(x);
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
   if(sh){m={...m,id:sh.id,imdb:sh.externals?.imdb||x.imdb,image:sh.image?.medium||sh.image?.original};}
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
  if(S.show===key && S.page==='detail') {
   const old=document.activeElement?.dataset.focus;
   render();if(old)document.querySelector('[data-focus="'+old+'"]')?.focus({preventScroll:true});
  }
 }catch{}
}
async function loadSchedule(){
 if(S.scheduleLoading)return;
 S.scheduleLoading=true;S.scheduleDone=0;
 const shows=latest().slice(0,70);
 for(let i=0;i<shows.length;i++){
  if(S.page!=='catalog')break;
  const x=shows[i],m=meta(x.key);
  if(!m.episodes||Date.now()-(m.episodesUpdated||0)>24*3600*1000){
    try{await loadEpisodes(x.key);}catch(e){console.warn('TVMaze calendar',x.key,e);}
    await new Promise(resolve=>setTimeout(resolve,1250));
  }
  S.scheduleDone++;
  if(S.page==='catalog'&&(i%4===3||i===shows.length-1))render();
 }
 S.scheduleLoading=false;
 if(S.page==='catalog')render();
}
window.UltraTVRemote={back:goBack,releaseCursor:stopCursor};
render();refresh(false);
setInterval(()=>{if(!document.hidden)refresh(false)},30*60*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(false)});
})();