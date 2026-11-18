/* UВидео TV for Android TV. Distinct 10-foot client, shared catalog with web. */
(() => {
'use strict';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tags={super:'Супергерои',scifi:'Фантастика',fantasy:'Фэнтези',horror:'Мистика',thriller:'Триллеры',crime:'Криминал',action:'Боевики',drama:'Драмы',comedy:'Комедии',animation:'Анимация'};
const store=(k,def)=>{try{return JSON.parse(localStorage.getItem('tv-v17-preview-'+k))||def}catch{return def}};
const save=(k,v)=>{try{localStorage.setItem('tv-v17-preview-'+k,JSON.stringify(v))}catch{}};
const S={shows:store('tv-catalog-cache',[]),opts:store('tv-options-cache',{embeds:{},episodes:{}}),
  releases:store('tv-release-cache',[]),meta:store('tv-meta-cache',{}),
  tracked:store('tv-tracked',{}),recent:store('tv-recent',[]),
  page:'home',show:null,season:1,episode:1,source:0,search:'',loading:false,
  cursor:false,cx:.5,cy:.5,cursorFocus:null,
  added:store('tv-manual-added',[]),discover:store('tv-discover-cache',[]),
  sourceChoice:store('tv-source-choice',{}),seriesSort:store('tv-series-sort','episodes'),optionsOpen:false,directWatch:false,
  scheduleLoading:false,scheduleDone:0,scheduleMode:'mine',
  progress:store('tv-progress-v1',{}),progressDraft:{},
  ruSummaries:store('tv-summary-ru-cache',{}),initemLastWrite:0,initemAdPlaying:false};
const root=$('#content');

// A missing CDN image must never leave a black resume card.
root.addEventListener('error',event=>{
 const img=event.target;
 if(!img?.matches?.('.resume-art img[data-landscape-key]'))return;
 const key=img.dataset.landscapeKey;
 delete img.dataset.landscapeKey;
 const x=item(key);
 if(x){
   S.meta[key]={...meta(key),backdrop:null,backdropCheckedAt:Date.now()};
   save('tv-meta-cache',S.meta);
   const fallback=poster(x);
   if(fallback&&fallback!==img.src)img.src=fallback;
 }
},true);
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
// TVmaze classifies widescreen artwork as "background". Never stretch a poster
// when a genuine landscape image has already been cached.
function validLandscape(url){
 return typeof url==='string'&&/^https:\/\/static\.tvmaze\.com\/uploads\/images\/[a-z0-9_.\/-]+$/i.test(url);
}
function pickLandscape(images){
 if(!Array.isArray(images))return '';
 const valid=images.filter(p=>p?.type==='background'&&validLandscape(p?.resolutions?.original?.url));
 return (valid.find(p=>p.main===true)||valid[0])?.resolutions.original.url||'';
}
const resumeImage=x=>validLandscape(meta(x.key).backdrop)?meta(x.key).backdrop:poster(x);

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
 // Refresh only the text. Rerendering the iframe would interrupt playback.
 if(S.page==='player'&&S.show===key){
   const label=$('#player-progress');
   if(label)label.textContent=playerProgressLabel(key);
 }
}
function progressLabel(key){
 const p=getProgress(key);
 if(!p)return '';
 if(p.completed)return 'Просмотрена · '+episodeCode(p.season,p.episode);
 if(p.confirmed&&(p.kind==='direct'||p.kind==='initem')&&Number(p.seconds)>0)
   return episodeCode(p.season,p.episode)+' · '+clock(p.seconds);
 if(p.confirmed)return 'Отмечено · '+episodeCode(p.season,p.episode);
 // The default first episode was missing from the resume badge because
 // opening an iframe does not necessarily emit changeEpisode.
 if(p.openedAt)return episodeCode(p.season,p.episode);
 return 'Последний просмотр';
}
function playerProgressLabel(key){
 const p=getProgress(key);
 if(!p)return 'Время просмотра пока не получено';
 const ep=episodeCode(p.season,p.episode);
 if(p.completed)return 'Серия '+ep+' · просмотрена';
 if(Number(p.seconds)>0){
   const total=Number(p.duration)>0?' / '+clock(p.duration):'';
   return 'Серия '+ep+' · '+clock(p.seconds)+total+
      (p.kind==='initem'&&!p.confirmed?' · номер серии не подтверждён плеером':'');
 }
 return 'Серия '+ep+' · время просмотра пока не получено'+
   (p.kind==='initem'&&!p.confirmed?' (выбрана в Ultra TV)':'');
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
  if(page==='home')loadResumeBackdrops();
}
function notify(text){
  const el=$('#toast');el.textContent=text;el.classList.add('show');
  clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>el.classList.remove('show'),3800);
}
const category=x=>(x.genres||[]).map(g=>tags[g]||g).slice(0,2).join(' · ');
// TV v0.17: only genuine, recently published LostFilm entries can earn a badge.
function newEpisode(x){
 if(!x||S.tracked[x.key]===false||!Array.isArray(S.releases))return null;
 const known=norm(x.en),ru=norm(x.ru),now=Date.now();
 const matches=S.releases.filter(e=>{
   if(!e||!(known&&norm(e.seriesEn)===known||ru&&norm(e.seriesRu)===ru))return false;
   const when=Date.parse(e.published||'');
   return Number.isFinite(when)&&when<=now&&now-when<=14*86400000&&
     Number.isInteger(Number(e.season))&&Number(e.season)>0&&
     Number.isInteger(Number(e.episode))&&Number(e.episode)>0;
 }).sort((a,b)=>(Number(b.season)*1000+Number(b.episode))-(Number(a.season)*1000+Number(a.episode)));
 const latest=matches[0];
 if(!latest)return null;
 const p=getProgress(x.key);
 const seen=p&&p.openedAt?(Number(p.season)||1)*1000+(Number(p.episode)||1):0;
 const aired=Number(latest.season)*1000+Number(latest.episode);
 // Don't call an already selected/played episode a new release.
 return seen>=aired?null:latest;
}
const thumb=x=>{
 const url=poster(x),fresh=newEpisode(x);
 return '<div class="art" data-poster="'+esc(x.key)+'">'+
   (url?'<img src="'+esc(url)+'" alt="" loading="lazy" decoding="async">':'<span class="no-art">▶</span>')+
   (fresh?'<span class="new-episode-badge">Новая серия</span>':'')+
   '<span class="poster-name">'+esc(x.ru)+'</span></div>';
};
const card=x=>'<button class="card poster-card" data-act="detail" data-key="'+esc(x.key)+'" data-focus="show:'+esc(x.key)+'" aria-label="'+esc(x.ru)+'">'+
  thumb(x)+'<span class="card-title">'+esc(x.ru)+'</span><small class="card-sub">'+esc(x.year)+' · '+esc(category(x))+
  (Number(x.rating||meta(x.key).rating)?' · ★ '+esc(x.rating||meta(x.key).rating):'')+'</small></button>';
function progressPercent(key){
 const p=getProgress(key),duration=Number(p?.duration),seconds=Number(p?.seconds);
 if(!p||p.completed||!Number.isFinite(seconds)||!Number.isFinite(duration)||
      duration<=0||seconds<0||seconds>duration+5)return 0;
 return Math.max(0,Math.min(100,100*seconds/duration));
}
const resumeCard=x=>{
 const p=getProgress(x.key),pct=progressPercent(x.key),url=resumeImage(x);
 const episode=p?episodeCode(p.season,p.episode):'';
 return '<button class="card resume-card" data-act="continue" data-key="'+esc(x.key)+'" data-focus="show:'+esc(x.key)+'" aria-label="'+esc('Продолжить '+x.ru+(episode?' '+episode:''))+'">'+
  '<span class="resume-art" data-poster="'+esc(x.key)+'">'+
   (url?'<img src="'+esc(url)+'" alt="" loading="lazy" decoding="async"'+
     (validLandscape(meta(x.key).backdrop)?' data-landscape-key="'+esc(x.key)+'"':'')+'>':
     '<span class="no-art">▶</span>')+
   '<span class="resume-shade"></span>'+
   '<span class="resume-copy"><strong class="resume-title">'+esc(x.ru)+'</strong>'+
    (episode?'<small class="resume-episode">'+esc(episode)+'</small>':'')+
   '</span><span class="resume-play" aria-hidden="true">▶</span>'+
   '<span class="resume-track" aria-hidden="true"><span class="resume-fill" style="width:'+pct.toFixed(1)+'%"></span></span>'+
   '</span></button>';
};
const rail=(title,xs,action)=>xs.length?
 '<section class="rail'+(action==='continue'?' rail-resume':' rail-posters')+'"><h2>'+esc(title)+'</h2><div class="strip'+
   (action==='continue'?' resume-strip':' poster-strip')+'">'+
   xs.map(x=>action==='continue'?resumeCard(x):card(x)).join('')+
   '</div></section>':'';
const seriesSortModes=[
 {id:'episodes',text:'Новые серии'},
 {id:'recent',text:'Смотрел недавно'},
 {id:'newest',text:'Новые сериалы'}
];
function sortMySeries(data,mode=S.seriesSort){
 const releaseDate=new Map();
 if(mode==='episodes'){
  const names=new Map();
  for(const x of data){
   if(x.en)names.set(norm(x.en),x.key);
   if(x.ru)names.set(norm(x.ru),x.key);
  }
  for(const e of S.releases||[]){
   const key=names.get(norm(e.seriesEn))||names.get(norm(e.seriesRu));
   if(!key)continue;
   const t=Date.parse(e.published||'');
   if(Number.isFinite(t)&&t>Date.now()-365*86400000&&t<=Date.now()){
    releaseDate.set(key,Math.max(releaseDate.get(key)||0,t));
   }
  }
 }
 const ranked=data.map((x,i)=>{
   const rank=mode==='recent'?Number(getProgress(x.key)?.openedAt)||0:
     mode==='newest'?Number(x.year)||0:releaseDate.get(x.key)||0;
   return {x,i,rank};
 });
 return ranked.sort((a,b)=>b.rank-a.rank||a.i-b.i).map(v=>v.x);
}
function mySeriesRail(data){
 const active=seriesSortModes.find(x=>x.id===S.seriesSort)||seriesSortModes[0];
 const header='<div class="my-series-heading"><h2>Мои сериалы</h2>'+
  '<button class="sort-cycle" data-act="sort-cycle" data-focus="my-series-sort"'+
  ' title="Порядок: '+esc(active.text)+'. Нажмите для переключения"'+
  ' aria-label="Сортировать мои сериалы: '+esc(active.text)+'. Нажмите для переключения">'+
  '<span aria-hidden="true">⇅</span><span>'+esc(active.text)+'</span></button></div>';
 return '<section class="rail rail-posters rail-my-series">'+header+
  (data.length?'<div class="strip poster-strip poster-grid">'+sortMySeries(data).map(card).join('')+'</div>':
   '<p class="empty">Здесь появятся сериалы, которые ты добавишь из раздела «Новинки» или поиска.</p>')+
  '</section>';
}
function home(){
 // Keep the TV home personal: only playback progress and one chosen-series rail.
 const data=latest();
 const selected=new Set(data.map(x=>x.key));
 const history=Object.entries(S.progress).filter(([key,p])=>p&&Number(p.openedAt)>0&&selected.has(key))
   .sort((a,b)=>Number(b[1].openedAt)-Number(a[1].openedAt))
   .slice(0,12).map(([key])=>item(key));
 return '<div class="tv-home">'+rail('▶ Продолжить просмотр',history,'continue')+
   mySeriesRail(data)+'</div>';
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
 const ep=episodeCode(p?.season,p?.episode);
 const summary=p?.kind==='initem'&&!p.confirmed&&Number(p.seconds)>0?
   'Выбрано '+ep+' · время '+clock(p.seconds)+' (серия не подтверждена плеером)':
   (p?.kind==='direct'||p?.kind==='initem')&&Number(p.seconds)>0?
   'Сохранено '+ep+' · '+clock(p.seconds):
   p?.confirmed?'Сохранено '+ep:
   p?.openedAt?'Выбрано '+ep+' · время пока не получено':'Отметь серию';
 return '<div class="progress-panel" role="group" aria-label="Последняя просмотренная серия">'+
  '<span class="progress-summary">'+esc(summary)+'</span>'+
  '<div class="progress-picker">'+
  '<span>Сезон</span><button data-act="progress-step" data-part="season" data-step="-1" aria-label="Предыдущий сезон">−</button><b>'+v.season+
  '</b><button data-act="progress-step" data-part="season" data-step="1" aria-label="Следующий сезон">+</button>'+
  '<span>Серия</span><button data-act="progress-step" data-part="episode" data-step="-1" aria-label="Предыдущая серия">−</button><b>'+v.episode+
  '</b><button data-act="progress-step" data-part="episode" data-step="1" aria-label="Следующая серия">+</button></div>'+
  '<button class="action progress-save" data-act="progress-save" aria-label="Запомнить выбранную серию">✓ Запомнить</button>'+
  '<small class="progress-explain">'+
   (p?.auto&&p?.kind==='initem'?'Серия и минута определены плеером автоматически. Перемотка на сохранённую минуту пока не подтверждена.':
    'Initem сообщает выбранный эпизод и минуту, когда воспроизведение запущено.')+
   '</small>'+
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
 '<div class="player-heading"><h1>'+esc(x.ru)+' · просмотр</h1>'+
 '<button class="player-fullscreen" data-act="cursor" data-focus="player-cursor" title="На весь экран">⛶ Полный экран</button></div>'+
 '<div id="tv-video-frame" class="player-frame" role="button" tabindex="0" data-act="frame" aria-label="Плеер. OK — просмотр на весь экран">'+sourceMedia(src)+'</div>'+
 '<p id="player-progress" class="player-progress" aria-live="off">'+esc(playerProgressLabel(S.show))+'</p>'+
 '<p class="player-help" id="player-help">«Полный экран» включает просмотр с управлением указателем. Стрелки — движение, OK — выбор. Курсор сам скрывается через 3 секунды и появляется при следующем движении.</p>'+
 '<div class="player-tools player-secondary-tools"><button class="action" data-act="reload">↻ Перезагрузить плеер</button></div>'+
 (src?'<p class="subtle">Источник: '+esc(src.name||'Видео')+'</p>':'<p class="banner">Для этого сериала пока нет источника. Данные обновляются через общий каталог.</p>')+
 '</section><aside class="player-side">'+
 '<div class="player-side-section player-source-section"><h2>Источники</h2><div class="player-source-list">'+
 (sources.length?sources.map((s,i)=>'<button data-act="source" data-index="'+i+'" data-focus="player-source:'+i+'" aria-pressed="'+(i===S.source)+'"'+
  (i===S.source?' class="active"':'')+'>'+esc(s.name||s.platform||'Видео')+'</button>').join(''):
  '<p class="subtle">Плееров пока нет</p>')+'</div></div>'+
 '<div class="player-side-section player-season-section"><h2>Сезоны</h2><div class="player-season-list">'+
 [...seasons].sort((a,b)=>a-b).map(n=>'<button data-act="season" data-season="'+n+'" data-focus="player-season:'+n+'" aria-label="Сезон '+n+'" aria-pressed="'+(n===S.season)+'" class="'+(n===S.season?'selected':'')+'">'+n+'</button>').join('')+'</div></div>'+
 (epNums.length?'<div class="player-side-section player-episode-section"><h2>Серии</h2><div class="player-episode-grid">'+
  epNums.map(n=>'<button data-act="episode" data-episode="'+n+'" data-focus="player-episode:'+n+'" aria-label="Серия '+n+'" aria-pressed="'+(n===S.episode)+'" class="'+(n===S.episode?'selected':'')+'">'+n+'</button>').join('')+
  '</div></div>':'<p class="player-side-hint">Серии и озвучку также можно выбрать внутри плеера.</p>')+
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
// Initem's /js/listen-player.js posts changeEpisode and viewProgress to the
// parent iframe. Read only messages from the active trusted video frame; no
// cross-origin DOM access, interception or invasive code injection is needed.
function handleInitemMessage(event){
 if(S.page!=='player'||!S.show||!event||!event.data)return false;
 const frame=$('#tv-player-iframe');
 if(!frame||event.source!==frame.contentWindow)return false;
 let origin;
 try{origin=new URL(frame.getAttribute('src')).origin;}catch{return false;}
 if(event.origin!==origin||origin!=='https://api.initem.ws')return false;
 const data=event.data;
 if(!data||typeof data!=='object'||Array.isArray(data))return false;
 const type=data.event;
 if(!['changeEpisode','viewProgress','startWatching','ended','playerReady','adStart','adStop'].includes(type))return false;
 const x=item(S.show),sources=x?availableSources(x):[];
 const src=sources[S.source]||sources[0];
 if(!src||src.platform!=='initem')return false;
 const prev=getProgress(S.show)||{};
 if(type==='adStart'){S.initemAdPlaying=true;return true;}
 if(type==='adStop'){S.initemAdPlaying=false;return true;}
 if(type==='changeEpisode'){
   const season=Number(data.season),episode=Number(data.episode);
   if(!Number.isInteger(season)||!Number.isInteger(episode)||
      season<1||season>30||episode<1||episode>200)return false;
   const changed=Number(prev.season)!==season||Number(prev.episode)!==episode;
   S.season=season;S.episode=episode;S.initemLastWrite=0;
   S.progressDraft[S.show]={season,episode};
   setProgress(S.show,{kind:'initem',season,episode,source:S.source,
     confirmed:true,auto:true,completed:false,
     seconds:changed?0:Number(prev.seconds)||0,
     duration:changed?0:Number(prev.duration)||0,openedAt:Date.now()});
   return true;
 }
 if(type==='viewProgress'){
   if(S.initemAdPlaying)return true;
   const seconds=Number(data.time),duration=Number(data.duration);
   if(!Number.isFinite(seconds)||seconds<0||seconds>86400 ||
      !Number.isFinite(duration)||duration<=0||duration>86400||
      seconds>duration+5)return false;
   const now=Date.now();
   if(now-S.initemLastWrite<2500&&seconds<duration-5)return true;
   S.initemLastWrite=now;
   setProgress(S.show,{kind:'initem',source:S.source,
     confirmed:Boolean(prev.confirmed),auto:Boolean(prev.auto),
     season:S.season,episode:S.episode,seconds:Math.floor(Math.min(seconds,duration)),
     duration:Math.floor(duration),openedAt:now,completed:duration-seconds<5});
   return true;
 }
 if(type==='ended'){
   setProgress(S.show,{completed:true,openedAt:Date.now()});
   return true;
 }
 if(type==='startWatching'){
   setProgress(S.show,{kind:'initem',openedAt:Date.now()});
   return true;
 }
 return true;
}
window.addEventListener('message',handleInitemMessage,false);

function record(key){
 S.recent=[{key,date:Date.now()},...S.recent.filter(x=>x.key!==key)].slice(0,12);
 save('tv-recent',S.recent);
}
function openShow(key){if(!item(key))return;navigate('detail',key);loadEpisodes(key);}
function watch(key){
 const x=item(key||S.show);if(!x)return;
 const previous=getProgress(x.key)||{};
 S.show=x.key;S.initemAdPlaying=false;S.initemLastWrite=0;
 S.source=Number(S.sourceChoice[x.key]??previous.source??0)||0;
 S.season=Math.max(1,Number(previous.season)||1);
 S.episode=Math.max(1,Number(previous.episode)||1);
 record(x.key);
 const src=availableSources(x)[S.source]||availableSources(x)[0];
 setProgress(x.key,{season:S.season,episode:S.episode,
   source:S.source,openedAt:Date.now(),
   kind:src?.kind==='video'||/\.(mp4|webm)(?:\?|$)/i.test(src?.url||'')?
     'direct':src?.platform==='initem'?'initem':'embed'});
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
      if(rail.classList.contains('rail-my-series')){
        add('home:sort',rail.querySelectorAll('.sort-cycle'));
        // Grid rows are independent D-pad rows: Up/Down retain the column.
        const cards=[...rail.querySelectorAll('.poster-grid .card')];
        const rows=[];
        for(const card of cards){
          const top=card.getBoundingClientRect().top;
          const last=rows[rows.length-1];
          if(last&&Math.abs(last.top-top)<5)last.cards.push(card);
          else rows.push({top,cards:[card]});
        }
        rows.forEach((row,n)=>add('home:grid:'+n,row.cards));
      }else{
        // Continue Watching deliberately retains horizontal scrolling.
        add('home:rail:'+i,rail.querySelectorAll('.strip .card'));
      }
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
    add('player:toolbar',root.querySelectorAll('.player-main .player-heading [data-act="cursor"]'));
    add('player:video',root.querySelectorAll('.player-main [data-act="frame"]'));
    add('player:reload',root.querySelectorAll('.player-main [data-act="reload"]'));
    [...root.querySelectorAll('.player-source-list button')].forEach((el,i)=>add('player:source:'+i,[el]));
    add('player:seasons',root.querySelectorAll('.player-season-list button'));
    const episodes=[...root.querySelectorAll('.player-episode-grid button')];
    const episodeRows=[];
    for(const el of episodes){
      const top=el.getBoundingClientRect().top;
      const last=episodeRows[episodeRows.length-1];
      if(last&&Math.abs(last.top-top)<5)last.buttons.push(el);
      else episodeRows.push({top,buttons:[el]});
    }
    episodeRows.forEach((row,i)=>add('player:episode:'+i,row.buttons));
  }
}
function nearestHorizontalFocus(from,items){
  if(!items?.length)return null;
  const origin=from.getBoundingClientRect();
  const centerX=(origin.left+origin.right)/2;
  let choice=null,smallest=Infinity;
  for(const candidate of items){
    const bounds=candidate.getBoundingClientRect();
    const distance=Math.abs((bounds.left+bounds.right)/2-centerX);
    if(distance<smallest){choice=candidate;smallest=distance;}
  }
  return choice;
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
    // Do not jump to another rail when reaching the end of a horizontal row.
    if(idx>=0&&idx<row.items.length)target=row.items[idx];
  }else{
    const up=key==='ArrowUp';
    let destination=focusRows[rowIndex+(up?-1:1)];
    const findRow=id=>focusRows.find(r=>r.id===id);
    if(S.page==='home'&&slot.rowId.startsWith('home:')){
      // The sort button is visually above the poster grid, not an
      // intermediate stop between Continue Watching and My Series.
      if(!up&&destination?.id==='home:sort'){
        destination=findRow('home:grid:0')||destination;
      }else if(up&&slot.rowId==='home:grid:0'&&destination?.id==='home:sort'){
        const sort=destination.items[0];
        const a=from.getBoundingClientRect();
        const b=sort?.getBoundingClientRect();
        // Deliberate access: Up from a poster directly below the button.
        // Other columns go back to Continue Watching instead of
        // making a full-screen diagonal jump to the sort control.
        if(b&&Math.min(a.right,b.right)>Math.max(a.left,b.left)){
          target=sort;
        }else{
          destination=findRow('home:rail:0');
        }
      }else if(slot.rowId==='home:sort'){
        destination=findRow(up?'home:rail:0':'home:grid:0')||destination;
      }
      if(!target&&destination)target=nearestHorizontalFocus(from,destination.items);
    }else if(destination){
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
  if(strip&&!strip.classList.contains('poster-grid')){
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
 if(act==='sort-cycle'){
   const index=seriesSortModes.findIndex(x=>x.id===S.seriesSort);
   S.seriesSort=seriesSortModes[(index+1)%seriesSortModes.length].id;
   save('tv-series-sort',S.seriesSort);
   focusKey='my-series-sort';render();
   document.querySelector('[data-focus="my-series-sort"]')?.focus({preventScroll:true});
   return;
 }
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
      confirmed:true,auto:false,completed:false,seconds:0,duration:0,mediaUrl:null,
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
 if(act==='season'||act==='episode'){
   if(act==='season'){S.season=Number(b.dataset.season)||1;S.episode=1;}
   else S.episode=Number(b.dataset.episode)||1;
   const prev=getProgress(S.show)||{};
   const changed=Number(prev.season)!==S.season||Number(prev.episode)!==S.episode;
   setProgress(S.show,{season:S.season,episode:S.episode,confirmed:true,auto:false,
     completed:false,seconds:changed?0:Number(prev.seconds)||0,
     duration:changed?0:Number(prev.duration)||0,openedAt:Date.now()});
   S.progressDraft[S.show]={season:S.season,episode:S.episode};
   refreshPlayer();
 }
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
  // Visual-only demo history: real show titles/posters, illustrative bars, no writes.
  // Preview uses its own localStorage namespace, so installed TV and site histories stay untouched.
  if(!S.previewSeeded && !Object.values(S.progress).some(p=>p&&p.openedAt) && S.shows.length>=3){
    const now=Date.now();
    S.shows.slice(0,3).forEach((x,i)=>{
      S.progress[x.key]={season:1,episode:1,seconds:[840,1260,560][i],
        duration:2520,openedAt:now-i*1000,kind:'preview',confirmed:false};
    });
    S.previewSeeded=true;
    const notice=document.getElementById('preview-hint');
    if(notice)notice.hidden=false;
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
 // Reuse the normal TVmaze show search first; artwork discovery is
 // sequenced afterwards, avoiding competing API bursts on low-power boxes.
 if(S.shows.length)loadPosters(manual).then(loadResumeBackdrops).catch(()=>{});
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
// Only watched, selected shows need landscape artwork. Results (including
// "no background") are cached to avoid a network call per screen visit.
const landscapeRequests=new Set();
async function loadResumeBackdrops(){
 const selected=new Set(latest().map(x=>x.key));
 const history=Object.entries(S.progress)
   .filter(([key,p])=>p&&Number(p.openedAt)>0&&selected.has(key))
   .sort((a,b)=>Number(b[1].openedAt)-Number(a[1].openedAt))
   .slice(0,12);
 for(const [key] of history){
  if(landscapeRequests.has(key))continue;
  const m=meta(key);
  const freshness=validLandscape(m.backdrop)?30:7; // days
  if(Number(m.backdropCheckedAt)>0&&Date.now()-Number(m.backdropCheckedAt)<freshness*86400000)continue;
  landscapeRequests.add(key);
  try{
   let id=Number(meta(key).id)||0;
   if(!id){
     // Newly added shows may not have passed the regular poster lookup yet.
     const x=item(key);
     if(!x?.en)continue;
     const found=await fetch('https://api.tvmaze.com/search/shows?q='+encodeURIComponent(x.en));
     if(!found.ok)continue; // Retry later on offline/HTTP 429.
     const candidates=await found.json();
     if(!Array.isArray(candidates))continue;
     const target=candidates.map(r=>r.show).filter(Boolean)
       .sort((a,b)=>{
         const score=t=>(String(t.name).toLowerCase()===String(x.en).toLowerCase()?0:1)+
           Math.abs(Number((t.premiered||'').slice(0,4))-(x.year||2020))*.03;
         return score(a)-score(b);
       })[0];
     id=Number(target?.id)||0;
     if(!id)continue;
     S.meta[key]={...meta(key),id};save('tv-meta-cache',S.meta);
   }
   const result=await fetch('https://api.tvmaze.com/shows/'+id+'/images');
   if(!result.ok)continue; // Failed requests are not cached as "missing".
   const images=await result.json();
   if(!Array.isArray(images))continue;
   const url=pickLandscape(images);
   S.meta[key]={...meta(key),backdrop:url||null,backdropCheckedAt:Date.now()};
   save('tv-meta-cache',S.meta);
   if(url&&S.page==='home'){
     // Update only the image, never re-render or interrupt active playback.
     document.querySelectorAll('.resume-art[data-poster]').forEach(art=>{
       if(art.dataset.poster!==key)return;
       const img=art.querySelector('img');
       if(img){
         if(img.getAttribute('src')!==url){img.dataset.landscapeKey=key;img.src=url;}
       }else{
         const created=document.createElement('img');
         created.alt='';created.loading='lazy';created.decoding='async';
         created.dataset.landscapeKey=key;created.src=url;
         art.querySelector('.no-art')?.replaceWith(created);
       }
     });
   }
  }catch{} // Stay with the existing poster when disconnected.
  finally{landscapeRequests.delete(key);}
  // TVmaze public API is rate-limited; stagger requests by design.
  await new Promise(resolve=>setTimeout(resolve,850));
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