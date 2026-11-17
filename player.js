(()=>{
function playerModule(){
  'use strict';
  const app = window.UltraTV;
  if (!app) return;
  const $ = (s, root=document) => root.querySelector(s);
  const qsa = (selector, root=document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {LostFilm:'LostFilm',Dub:'Полноценный дубляж',DubReported:'Дубляж (заявлен)',RuReported:'Русская озвучка (заявлена)',Other:'Другая озвучка',Unknown:'Не указана'};
  let current = null, hls = null, lastProgress = 0, hlsPromise = null;
  let initemSession = null;
  const INITEM_ORIGIN = 'https://api.initem.ws';
  const initemEvents = new Set(['changeEpisode','viewProgress','startWatching','ended','playerReady','adStart','adStop']);
  let remoteOptions={shows:{},embeds:{},episodes:{}};
  function state(){ const s=app.state; if(!s.sources || typeof s.sources!=='object')s.sources={};if(!s.progress || typeof s.progress!=='object')s.progress={};if(!s.initemProgress || Array.isArray(s.initemProgress) || typeof s.initemProgress!=='object')s.initemProgress={};if(!s.initemDiag||Array.isArray(s.initemDiag)||typeof s.initemDiag!=='object')s.initemDiag={};return s;}
  function validUrl(raw){try{const u=new URL(String(raw).trim());if(u.protocol!=='https:'||u.username||u.password)throw Error();return u.href;}catch{throw Error('Нужна прямая HTTPS-ссылка на видео или страницу.');}}
  function parseSource(raw){
  let src=String(raw||'').trim(),embedded=false;
  if(/<iframe\b/i.test(src)){
    const html=new DOMParser().parseFromString(src,'text/html');
    const iframe=html.querySelector('iframe[src]');
    if(!iframe)throw Error('Не удалось найти адрес iframe.');
    src=iframe.getAttribute('src')||'';
    embedded=true;
  }
  let url=validUrl(src),u=new URL(url);
  if(/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(u.hostname)){
    const id=u.hostname.includes('youtu.be')?u.pathname.slice(1).split('/')[0]:(u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/)?.[1]);
    if(id && /^[A-Za-z0-9_-]{11}$/.test(id)){url='https://www.youtube-nocookie.com/embed/'+id;embedded=true;}
  }
  if(u.hostname==='rutube.ru' && /^\/video\/[\da-f-]{32,36}\/?$/i.test(u.pathname)){
    url='https://rutube.ru/play/embed/'+u.pathname.split('/')[2];embedded=true;
  }
  if(u.hostname==='vk.com' && /^\/video-?\d+_\d+/.test(u.pathname)){
    const match=u.pathname.match(/\/video(-?\d+)_(\d+)/);
    if(match){url='https://vk.com/video_ext.php?oid='+match[1]+'&id='+match[2];embedded=true;}
  }
  return {url,embedded};
}
  function kindOf(src){
    if(src.kind && src.kind!=='auto')return src.kind;
    const path=new URL(src.url).pathname.toLowerCase();
    if(path.endsWith('.m3u8'))return 'hls';
    if(src.embedded || /(^|\/)(embed|video_ext\.php)(\/|$)/i.test(path) || /youtube-nocookie\.com/.test(new URL(src.url).hostname))return 'embed';
    if(/\.(mp4|webm|ogv|ogg|m4v)$/.test(path))return 'video';
    return 'page';
  }
  // Explicitly verified LostFilm links outrank anything else. For ordinary entries,
  // default to the multi-voice browser; keep episode-specific RUTUBE as a fallback.
  const preference = src => src.dub==='LostFilm'?0:src.platform==='initem'?1:src.dub==='Dub'?2:src.dub==='Other'?3:4;
  const episode = (key,id) => app.showInfo(key)?.episodes?.find(e=>String(e.id)===String(id));
  const keyOf = () => current && (current.key+':'+current.episodeId);

  function bookmarkKey(){
    if(!current)return null;
    const ep=episodesFor(current.key).find(e=>String(e.id)===String(current.episodeId));
    return ep?current.key+':'+app.epCode(ep):null;
  }
  function prettyTime(seconds){
    const n=Math.max(0,Math.floor(Number(seconds)||0));
    const p=v=>String(v).padStart(2,'0');
    return n>=3600?Math.floor(n/3600)+':'+p(Math.floor(n%3600/60))+':'+p(n%60):Math.floor(n/60)+':'+p(n%60);
  }
  function progressStatus(key){
    const old=key&&state().bookmarks?.[key];
    const auto=key&&state().initemProgress?.[key];
    const validAuto=auto?.provider==='initem'&&
      (auto.confirmed===true||auto.selection==='site')&&
      Number.isFinite(auto.seconds)&&auto.seconds>0&&
      Number.isFinite(auto.duration)&&auto.duration>0;
    const validManual=Number.isFinite(old?.seconds)&&old.seconds>0;
    // Preserve legacy manual bookmarks, but let a newer automatic sample win.
    if(validAuto&&(!validManual||Number(auto.sampledAt||auto.at||0)>=Number(old.at||0)))
      return 'Последний сигнал Initem: ≈'+prettyTime(auto.seconds)+
        (auto.confirmed===true?' · серия подтверждена':' · серия выбрана в Ultra TV, не подтверждена плеером');
    if(validManual)return 'Ранее сохранено вручную: '+prettyTime(old.seconds);
    return 'Время ещё не получено';
  }
  function bookmarkBlock(){
    const key=bookmarkKey();
    return '<div class="ut-bookmark"><div class="ut-bookmark-heading">⏱ Прогресс просмотра</div>'+
      '<small id="ut-bookmark-status">'+esc(progressStatus(key))+'</small>'+
      '<p id="ut-initem-live" class="ut-initem-live" hidden></p>'+
      '<details id="ut-initem-diagnostics" class="ut-initem-diagnostics" hidden><summary>Диагностика времени Initem</summary>'+
      '<p id="ut-initem-counters">Пока нет данных.</p>'+
      '<button type="button" class="ut-probe-time" data-ut-probe-time>Проверить запрос времени</button>'+
      '<p id="ut-initem-probe-status">Запрос пока не отправлялся.</p>'+
      '<p>Это проверка совместимости с API PlayerJS. Initem может её не поддерживать. Периодический таймкод появляется примерно раз в минуту реального просмотра.</p></details>'+
      '<p>Прогресс сохраняется автоматически после получения сигнала Initem. Позиция приблизительная; номер серии без события от плеера считается выбранным в Ultra TV, а не подтверждённым Initem. Сам Initem может отдельно продолжать просмотр с последнего места.</p></div>';
  }
  function message(msg){const el=$('#ut-player-message');if(el)el.textContent=msg;}
  // External player messages are advisory. Only the active trusted iframe may
  // modify watch history; no cross-origin DOM access or player injections.
  function activeInitemFrame(){
    if(!current||current.activeSource?.platform!=='initem')return null;
    const frame=$('#ut-media iframe');
    if(!frame)return null;
    try{if(new URL(frame.getAttribute('src')||'').origin!==INITEM_ORIGIN)return null;}catch{return null;}
    return frame;
  }
  function persistInitemDiag(){
    if(!initemSession||!current?.key)return;
    const d=initemSession, records=state().initemDiag;
    // Diagnostic metadata only. No media URLs, raw events or user content.
    records[current.key]={at:Date.now(),received:d.received,episodes:d.episodes,
      times:d.times,wrongFrame:d.wrongFrame,otherOrigin:d.otherOrigin,invalid:d.invalid,ads:d.ads,
      probeSent:d.probeSent,probeReplies:d.probeReplies,probeStatus:d.probeStatus,
      last:d.last,confirmed:Boolean(d.confirmedKey)};
    const keys=Object.keys(records).sort((a,b)=>Number(records[b]?.at||0)-Number(records[a]?.at||0));
    for(const key of keys.slice(20))delete records[key];
    app.persist();
  }
  function initemSessionStart(){
    initemSession={received:0,episodes:0,times:0,wrongFrame:0,otherOrigin:0,invalid:0,ads:0,
      last:'Ожидание сообщений',confirmedKey:null,selectedKey:bookmarkKey(),seconds:null,duration:null,sampledAt:0,
      adPlaying:false,lastStoredAt:0,probeSent:0,probeReplies:0,probeUntil:0,
      probeTime:null,probeDuration:null,probeStatus:'Запрос пока не отправлялся.'};
    updateInitemUI();
  }
  function updateInitemUI(){
    const live=$('#ut-initem-live'),details=$('#ut-initem-diagnostics'),counters=$('#ut-initem-counters');
    const active=Boolean(activeInitemFrame()),s=initemSession;
    if(live)live.hidden=!active;
    if(details)details.hidden=!active;
    if(!active||!s)return;
    const key=s.confirmedKey||s.selectedKey;
    const saved=key&&state().initemProgress?.[key];
    const previous=key&&state().initemProgress?.[key];
    const code=key?key.split(':').pop():'';
    if(live){
      if(s.times>0&&s.seconds!==null){
        live.textContent='⏱ '+(code?'Серия '+code:'Серия не подтверждена')+
          ' · ≈'+prettyTime(s.seconds)+(s.duration?' / '+prettyTime(s.duration):'')+
          (s.confirmedKey?' · серия подтверждена':' · серия выбрана в Ultra TV, не подтверждена плеером');
      }else live.textContent=(previous?.confirmed&&Number.isFinite(previous.seconds)&&previous.seconds>0?
        'В этом сеансе время ещё не получено · раньше: ≈'+prettyTime(previous.seconds):
        s.episodes>0?'Серия подтверждена, ожидаем время от Initem':
        'Ожидаем время и номер серии от Initem');
    }
    const status=$('#ut-bookmark-status');
    if(status)status.textContent=progressStatus(key);
    const probe=$('#ut-initem-probe-status');
    if(probe)probe.textContent=s.probeStatus;
    if(counters)counters.textContent='Сообщений: '+s.received+' · эпизодов: '+s.episodes+
      ' · таймкодов: '+s.times+' · реклама: '+s.ads+' · другой кадр: '+s.wrongFrame+' · другой домен: '+s.otherOrigin+
      ' · отклонено: '+s.invalid+'. Последнее: '+s.last+
      (saved?' · сохранено: '+prettyTime(saved.seconds):'');
  }
  function flushInitemTime(force=false){
    const s=initemSession;
    if(!s||!(s.confirmedKey||s.selectedKey)||s.seconds===null||!Number.isFinite(s.seconds)||
       !Number.isFinite(s.duration)||s.duration<=0)return;
    const now=Date.now();
    if(!s.sampledAt)return;
    if(!force&&now-s.lastStoredAt<3000)return;
    const key=s.confirmedKey||s.selectedKey;
    const previous=state().initemProgress[key];
    if(previous&&Number(previous.sampledAt||previous.at||0)>s.sampledAt)return;
    const next={seconds:Math.floor(Math.min(s.seconds,s.duration)),duration:Math.floor(s.duration),
      at:s.sampledAt,sampledAt:s.sampledAt,confirmed:Boolean(s.confirmedKey),
      selection:s.confirmedKey?'player':'site',provider:'initem'};
    if(!previous||previous.seconds!==next.seconds||previous.duration!==next.duration||
        previous.confirmed!==next.confirmed){
      state().initemProgress[key]=next;
      // Bound personal localStorage growth without touching manually saved marks.
      const records=Object.entries(state().initemProgress);
      if(records.length>200){
        records.sort((a,b)=>Number(b[1]?.at||0)-Number(a[1]?.at||0));
        state().initemProgress=Object.fromEntries(records.slice(0,200));
      }
      app.persist();
    }
    s.lastStoredAt=now;
  }
  function probeInitemTime(){
    const s=initemSession,frame=activeInitemFrame();
    if(!s||!frame)return false;
    // Read-only PlayerJS request. This does NOT control, seek, or modify video.
    s.probeSent++;s.probeReplies=0;s.probeTime=null;s.probeDuration=null;
    s.probeUntil=Date.now()+7000;
    s.probeStatus='Отправлены запросы времени и длительности. Ждём ответ до 7 секунд…';
    try{
      frame.contentWindow.postMessage({api:'time'},INITEM_ORIGIN);
      frame.contentWindow.postMessage({api:'duration'},INITEM_ORIGIN);
    }catch{
      s.probeStatus='Не удалось отправить запрос';s.probeUntil=0;
      updateInitemUI();return false;
    }
    updateInitemUI();
    setTimeout(()=>{
      if(s!==initemSession||!s.probeUntil||Date.now()<s.probeUntil)return;
      s.probeUntil=0;
      if(s.probeReplies===0)s.probeStatus='Ответа нет. Вероятно, Initem не поддерживает API PlayerJS.';
      else if(s.probeTime===null)s.probeStatus='Ответ пришёл, но время не получено.';
      else if(s.probeDuration===null)s.probeStatus='Получено время '+prettyTime(s.probeTime)+', длительность не передана.';
      updateInitemUI();
    },7200);
    return true;
  }
  function handleInitemMessage(event){
    if(!current||!event||!event.data)return false;
    const frame=activeInitemFrame();
    if(!frame)return false;
    const data=event.data;
    if(!data||typeof data!=='object'||Array.isArray(data)||
       (!initemEvents.has(data.event)&&!['time','duration'].includes(data.event)))return false;
    const s=initemSession;
    if(!s)return false;
    if(event.origin!==INITEM_ORIGIN){
      // Diagnose mismatched embedded-frame origin, but never accept its commands.
      if(event.source===frame.contentWindow){
        s.otherOrigin++;s.last='Сообщение от другого домена плеера';updateInitemUI();
      }
      return false;
    }
    s.received++;
    if(event.source!==frame.contentWindow){
      s.wrongFrame++;s.last='Сообщение от другого кадра';updateInitemUI();return false;
    }
    if(data.event==='time'||data.event==='duration'){
      // PlayerJS sends {event:'time'|'duration', answer:number} if enabled.
      // Only accept responses after an explicit request from the user.
      if(!s.probeUntil||Date.now()>s.probeUntil)return false;
      const n=Number(data.answer);
      if(data.answer===null||data.answer===undefined||!Number.isFinite(n)||
         n<0||n>86400||(data.event==='duration'&&n<=0)){
        s.invalid++;s.probeStatus='Ответ получен, но значение времени некорректно';
        updateInitemUI();return false;
      }
      s.probeReplies++;
      if(data.event==='time')s.probeTime=Math.floor(n);
      else s.probeDuration=Math.floor(n);
      s.probeStatus=s.probeTime!==null?
        'PlayerJS ответил: '+prettyTime(s.probeTime)+
           (s.probeDuration!==null?' / '+prettyTime(s.probeDuration):' (ожидаем длительность)'):
        'PlayerJS ответил длительностью '+prettyTime(s.probeDuration)+'; ожидаем время.';
      if(s.probeTime!==null&&s.probeDuration!==null&&s.probeTime<=s.probeDuration+5){
        s.probeStatus+=' · протокол работает'+(s.confirmedKey?' · серия подтверждена':' · серия пока не подтверждена');
        // Do not misattribute a time to a guessed episode.
        if(s.confirmedKey&&!s.adPlaying){
          s.seconds=Math.min(s.probeTime,s.probeDuration);s.duration=s.probeDuration;
          s.sampledAt=Date.now();
          flushInitemTime(true);
        }
        s.probeUntil=0;
      }
      updateInitemUI();return true;
    }
    if(data.event==='adStart'){s.adPlaying=true;s.ads++;s.last='Реклама';updateInitemUI();return true;}
    if(data.event==='adStop'){s.adPlaying=false;s.last='Реклама завершена';updateInitemUI();return true;}
    if(data.event==='changeEpisode'){
      const season=Number(data.season),number=Number(data.episode);
      if(!Number.isInteger(season)||!Number.isInteger(number)||season<1||season>30||number<1||number>200){
        s.invalid++;s.last='Неверный номер серии';updateInitemUI();return false;
      }
      const selected=episodesFor(current.key).find(ep=>Number(ep.season)===season&&Number(ep.number)===number);
      flushInitemTime(true);
      s.confirmedKey=null;s.selectedKey=null;s.seconds=null;s.duration=null;s.sampledAt=0;s.lastStoredAt=0;
      s.episodes++;
      if(!selected){s.last='Серия '+season+'/'+number+' не найдена в каталоге';updateInitemUI();return true;}
      current.episodeId=String(selected.id);
      current.autoChoose=false;
      s.confirmedKey=bookmarkKey();s.selectedKey=s.confirmedKey;
      s.last='Подтверждена серия '+app.epCode(selected);
      app.recordOpen(current.key,selected);
      const heading=$('.ut-heading h2');
      if(heading)heading.textContent=(app.getEntry(current.key)?.ru||'Сериал')+' · '+app.epCode(selected);
      const title=$('.ut-heading p');
      if(title)title.textContent=selected.name||'Серия';
      qsa('[data-ut-episode]').forEach(button=>button.classList.toggle('ut-episode-active',button.dataset.utEpisode===String(selected.id)));
      const seasonPicker=$('#ut-season');
      if(seasonPicker&&[...seasonPicker.options].some(opt=>Number(opt.value)===season))seasonPicker.value=String(season);
      const status=$('#ut-bookmark-status');
      if(status)status.textContent=progressStatus(s.confirmedKey);
      updateInitemUI();return true;
    }
    if(data.event==='viewProgress'){
      if(s.adPlaying){s.ads++;s.last='Время рекламы пропущено';updateInitemUI();return true;}
      const seconds=Number(data.time),duration=Number(data.duration);
      if(!Number.isFinite(seconds)||seconds<0||seconds>86400||!Number.isFinite(duration)||
         duration<=0||duration>86400||seconds>duration+5){
        s.invalid++;s.last='Некорректный таймкод';updateInitemUI();return false;
      }
      s.seconds=Math.floor(Math.min(seconds,duration));s.duration=Math.floor(duration);
      s.sampledAt=Date.now();
      s.times++;s.last='Получено время '+prettyTime(s.seconds);
      flushInitemTime();
      updateInitemUI();return true;
    }
    s.last='Событие '+data.event;updateInitemUI();return true;
  }
  window.addEventListener('message',handleInitemMessage,false);
  window.addEventListener('pagehide',()=>{flushInitemTime(true);persistInitemDiag();});
  function stopMedia(){
    const v=$('#ut-video');
    if(v){try{v.pause();v.removeAttribute('src');v.load();}catch{}}
    if(hls){try{hls.destroy();}catch{}hls=null;}
  }
  function close(){
    if(!current)return;
    flushInitemTime(true);
    persistInitemDiag();
    stopMedia();current=null;initemSession=null;
    const root=$('#player-root');if(root)root.innerHTML='';
    app.draw();
  }
  function episodesFor(key){
    const known=(app.showInfo(key)?.episodes||[]).filter(e=>e.number!=null&&(!e.airdate||app.released(e)));
    if(known.length)return known;
    return Object.keys(remoteOptions.episodes||{}).filter(k=>k.startsWith(key+':S')).map(k=>{
      const m=k.match(/:S(\d+)E(\d+)$/);if(!m)return null;
      return {id:'registry-'+m[1]+'-'+m[2],season:Number(m[1]),number:Number(m[2]),name:'Серия '+Number(m[2]),airdate:null};
    }).filter(Boolean);
  }
  function list(){
    const s=state(),episodeKey=keyOf(),showKey='show:'+current.key;
    const ep=Array.isArray(s.sources[episodeKey])?s.sources[episodeKey]:[];
    const show=Array.isArray(s.sources[showKey])?s.sources[showKey]:[];
    const selected=episodesFor(current.key).find(e=>String(e.id)===String(current.episodeId));
    const publicKey=selected?current.key+':'+app.epCode(selected):'';
    const sharedEpisode=[...(Array.isArray(remoteOptions.episodes?.[episodeKey])?remoteOptions.episodes[episodeKey]:[]),
      ...(Array.isArray(remoteOptions.episodes?.[publicKey])?remoteOptions.episodes[publicKey]:[])];
    const sharedConfigured=Array.isArray(remoteOptions.embeds?.[current.key])?remoteOptions.embeds[current.key]:[];
    // Search dynamically by the IMDb ID TVmaze supplies. This is a discovery
    // route, not evidence that a translation or specific episode is playable.
    const imdb=String(app.showInfo(current.key)?.imdb||'');
    const automatic= /^tt\d{5,12}$/.test(imdb)&&!sharedConfigured.some(src=>src.platform==='initem')?
      [{name:'Initem β · поиск озвучек по IMDb (не проверено)',url:'https://api.initem.ws/embed/imdb/'+imdb,
        kind:'embed',embedded:true,dub:'Unknown',platform:'initem',mode:'browse',autoDiscovered:true}]:[];
    const sharedShow=[...sharedConfigured,...automatic];
    return [...ep.map((src,i)=>({...src,__key:episodeKey,__index:i})),
      ...sharedEpisode.map(src=>({...src,__remote:true,__key:'public:episode'})),
      ...show.map((src,i)=>({...src,__key:showKey,__index:i})),
      ...sharedShow.map(src=>({...src,__remote:true,__key:'public:show'}))].filter(src=>{try{validUrl(src.url);return true}catch{return false}});
  }

  function officialLinks(){
    if(!current)return '';
    const offers=Array.isArray(remoteOptions.shows?.[current.key])?remoteOptions.shows[current.key]:[];
    if(!offers.length)return '';
    return '<div class="ut-offers-title">Официальные страницы просмотра (откроются отдельно; доступность зависит от страны и подписки)</div><div class="ut-offers-links">'+
      offers.filter(a=>{try{validUrl(a.url);return true}catch{return false}})
      .map(a=>'<a href="'+esc(a.url)+'" target="_blank" rel="noopener noreferrer">'+esc(a.name||'Площадка')+' ↗</a>').join('')+'</div>';
  }
  async function loadOptions(){
    try{
      const response=await fetch('./watch-options.json',{cache:'no-cache'});
      if(!response.ok)throw Error('HTTP '+response.status);
      const data=await response.json();
      if(!data||typeof data!=='object')return;
      remoteOptions={shows:data.shows||{},embeds:data.embeds||{},episodes:data.episodes||{}};
      app.draw();
      const box=$('#ut-offers');if(box)box.innerHTML=officialLinks();
      if(current&&!$('#ut-video')&&!$('#ut-media iframe')){
        if(current.autoChoose){
          const available=episodesFor(current.key).filter(e=>playableFor(current.key,e));
          const candidate=newest(available);
          if(candidate)current.episodeId=String(candidate.id);
        }
        if(list().length||episodesFor(current.key).length)render(true);
      }
    }catch(e){console.warn('Каталог официальных вариантов просмотра недоступен',e);}
  }
  function render(autoPick){
      if(!current)return;
      flushInitemTime(true);
      persistInitemDiag();
      initemSession=null;current.activeSource=null;
      stopMedia();
      const x=app.getEntry(current.key);
      if(!x){close();return;}
      const allEpisodes=episodesFor(current.key).sort((a,b)=>a.season-b.season||a.number-b.number);
      let ep=allEpisodes.find(e=>String(e.id)===String(current.episodeId));
      if(!ep){
        ep=allEpisodes[allEpisodes.length-1]||null;
        if(ep)current.episodeId=String(ep.id);
      }
      if(ep)app.recordOpen(current.key,ep);
      // Keep indices stable while Initem switches episodes internally.
      current.sourceSnapshot=list();
      const rows=current.sourceSnapshot.map((src,i)=>({...src,index:i})).sort((a,b)=>preference(a)-preference(b));
      const last=state().lastSource?.[keyOf()];
      const preferred=rows.find(r=>r.url===last)||rows[0];
      const hasOwnSeriesPicker=!!preferred&&preferred.__key==='show:'+current.key&&kindOf(preferred)==='embed'||
        !!preferred&&preferred.__key==='public:show'&&kindOf(preferred)==='embed';
      const seasons=[...new Set(allEpisodes.map(e=>e.season))].sort((a,b)=>b-a);
      const selectedSeason=ep?.season||seasons[0];
      const seasonEpisodes=allEpisodes.filter(e=>e.season===selectedSeason);
      const root=$('#player-root');
      root.innerHTML=`<div class="ut-overlay"><section class="ut-dialog" role="dialog" aria-modal="true" aria-label="Просмотр сериала">
        <div class="ut-heading"><div><div class="ut-kicker">ULTRA TV · ПРОСМОТР</div><h2>${esc(x.ru)}${ep?' · '+esc(app.epCode(ep)):''}</h2><p>${ep?esc(ep.name||'Серия'): 'Выберите сериал или дождитесь загрузки расписания'}</p></div>
        <button type="button" class="ut-close" data-ut-close aria-label="Закрыть просмотр">✕</button></div>
        <div class="ut-layout"><div class="ut-view">
          <div id="ut-media" class="ut-media"><div class="ut-placeholder">▶<small>${rows.length?'Открываем плеер…':'Для этого сериала пока не найден встроенный плеер. Проверенные ссылки на просмотр появятся здесь, когда будут доступны.'}</small>${rows.length?'':'<button type="button" class="ut-save" data-ut-config>Добавить плеер</button>'}</div></div>
          <div class="ut-toolbar">
            ${rows.length>1?`<label for="ut-select-source">Источник <select id="ut-select-source">${rows.map(src=>`<option value="${src.index}" ${preferred?.index===src.index?'selected':''}>${esc(src.name||'Плеер')} · ${esc(labels[src.dub]||labels.Unknown)}</option>`).join('')}</select></label>`:rows.length===1?`<span class="ut-source-name">Источник: ${esc(preferred.name||'Плеер')} · ${esc(labels[preferred.dub]||labels.Unknown)}</span>`:'<span class="ut-source-name">Плеер пока не подключён</span>'}
            <button type="button" class="ut-tool" data-ut-config>⚙ Источники</button>
          </div>
          ${allEpisodes.length?`<details class="ut-episode-picker" ${hasOwnSeriesPicker?'':'open'}><summary>Сезоны и серии${hasOwnSeriesPicker?' (если нет выбора в плеере)':''}</summary><div class="ut-episode-inner">
            <label>Сезон <select id="ut-season">${seasons.map(n=>`<option value="${n}" ${selectedSeason===n?'selected':''}>${n}</option>`).join('')}</select></label>
            <div class="ut-episode-pills">${seasonEpisodes.map(item=>`<button type="button" class="${ep&&String(ep.id)===String(item.id)?'ut-episode-active':''}" data-ut-episode="${esc(item.id)}" title="${esc(item.name||'')}" aria-label="Серия ${item.number}">Серия ${item.number}</button>`).join('')}</div>
          </div></details>`:'<p class="ut-muted">Сведения об эпизодах ещё загружаются. Плеер всего сериала можно подключить уже сейчас.</p>'}
          ${bookmarkBlock()}
          <div id="ut-offers" class="ut-offers">${officialLinks()}</div>
          <div id="ut-player-message" class="ut-message" aria-live="polite">${rows.length?'Источник загружается.':'Ни одной подтверждённой ссылки на встроенный плеер пока нет.'}</div>
        </div>
        <details class="ut-manage" id="ut-manage"><summary>Источники и параметры воспроизведения</summary>
          <div class="ut-manage-inside">
            <h3>Подключённые плееры</h3>
            <div class="ut-sources">${rows.length?rows.map(src=>`<div class="ut-source"><button type="button" data-ut-source="${src.index}"><b>▶ ${esc(src.name||'Плеер')}</b><small>${esc(labels[src.dub]||labels.Unknown)} · ${src.__key.startsWith('show:')||src.__key==='public:show'?'Для всего сериала':'Для серии'} · ${kindOf(src)==='embed'?'Встроенный':kindOf(src)==='page'?'Сайт':kindOf(src)==='hls'?'HLS':'Видео'}</small></button>${src.__remote?'':`<button type="button" data-ut-delete="${src.index}" class="ut-delete" aria-label="Удалить источник">✕</button>`}</div>`).join(''):'<p class="ut-muted">Плееры пока не найдены.</p>'}</div>
            <details class="ut-add" ${rows.length?'':'open'}><summary>＋ Добавить плеер</summary>
              <form id="ut-form">
                <label>Ссылка на встроенный плеер или код iframe<input id="ut-url" type="text" placeholder="https://.../embed/... или &lt;iframe src=...&gt;" required></label>
                <label>Название<input id="ut-name" maxlength="60" placeholder="Плеер 1"></label>
                <div class="ut-fields"><label>Озвучка<select id="ut-dub"><option value="Unknown">Не указана</option><option value="LostFilm">LostFilm</option><option value="Dub">Полноценный дубляж</option><option value="Other">Другая</option></select></label>
                <label>Тип<select id="ut-kind"><option value="auto">Автоматически</option><option value="embed">Встроенный iframe</option><option value="video">MP4 / WebM</option><option value="hls">HLS (.m3u8)</option><option value="page">Внешняя страница</option></select></label></div>
                <label class="ut-check"><input type="checkbox" id="ut-whole-show"> Один плеер на весь сериал (если он сам переключает серии)</label>
                <button class="ut-save" type="submit">Сохранить плеер</button>
                <p class="ut-muted">Если разрешено встраивание, можно вставить готовый код iframe. Плееры, добавленные вручную, сохраняются в этом браузере.</p>
              </form></details>
            <p class="ut-footnote">Не все сайты разрешают iframe-встраивание. Мы не обходим DRM или ограничения доступа.</p>
          </div>
        </details></div></section></div>`;
      root.querySelector('.ut-overlay').addEventListener('click',e=>{if(e.target.classList.contains('ut-overlay'))close();});
      root.querySelector('.ut-close')?.focus({preventScroll:true});
      if(autoPick&&preferred)selectSource(preferred.index);
  }
  function playableFor(key,ep){
    const s=state(),episodeKey=key+':'+ep.id,publicKey=key+':'+app.epCode(ep);
    return !!((remoteOptions.episodes?.[publicKey]||[]).length ||
      (remoteOptions.episodes?.[episodeKey]||[]).length ||
      (remoteOptions.embeds?.[key]||[]).some(src=>src.mode!=='browse') ||
      (s.sources[episodeKey]||[]).length ||
      (s.sources['show:'+key]||[]).length);
  }
  function newest(eps){
    return [...eps].sort((a,b)=>(b.airdate||'').localeCompare(a.airdate||'')||
      b.season-a.season||b.number-a.number)[0]||null;
  }
  function open(key,epId){
    const x=app.getEntry(key);if(!x)return;
    const eps=episodesFor(key);
    const requested=eps.find(e=>String(e.id)===String(epId));
    const selected=requested||newest(eps.filter(e=>playableFor(key,e)))||newest(eps);
    close();
    current={key,episodeId:selected?String(selected.id):null,autoChoose:!requested};
    render(true);
  }
  async function getHls(){
    if(window.Hls)return window.Hls;
    if(hlsPromise)return hlsPromise;
    hlsPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
      script.async=true;
      script.onload=()=>window.Hls?resolve(window.Hls):reject(Error('Не удалось загрузить HLS'));
      script.onerror=()=>reject(Error('Скрипт HLS недоступен'));
      document.head.appendChild(script);
    }).catch(err=>{hlsPromise=null;throw err;});
    return hlsPromise;
  }
  async function selectSource(index){
    if(!current)return;
    const src=(current.sourceSnapshot||list())[index];if(!src)return;
    flushInitemTime(true);
    persistInitemDiag();
    const previous=state();previous.lastSource ||= {};previous.lastSource[keyOf()]=src.url;app.persist();
    const chooser=$('#ut-select-source');if(chooser)chooser.value=String(index);
    stopMedia();
    current.selected=index;current.activeSource=src;initemSession=null;
    const token=current, type=kindOf(src), media=$('#ut-media');
    qsa('.ut-source button[data-ut-source]').forEach(el=>el.classList.toggle('ut-active',Number(el.dataset.utSource)===index));
    if(type==='embed'){
      let url=src.url;
      // These provider parameters select an episode, NOT a playback timestamp.
      if(src.platform==='initem'){
        const ep=episodesFor(current.key).find(e=>String(e.id)===String(current.episodeId));
        if(ep){
          const parsed=new URL(url);
          parsed.searchParams.set('season',String(ep.season));
          parsed.searchParams.set('episode',String(ep.number));
          url=parsed.href;
        }
      }
      media.innerHTML=`<iframe class="ut-iframe" title="Плеер ${esc(src.name||'Видео')}" src="${esc(url)}" loading="eager" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-forms allow-scripts allow-same-origin allow-presentation"></iframe>`;
      if(src.platform==='initem')initemSessionStart();
      else updateInitemUI();
      message(src.mode==='browse'?'Экспериментальный плеер. Выбери нужный сезон, серию и озвучку внутри него: текущая серия и LostFilm не гарантированы. При региональной блокировке используй другие источники.':'Встроенный плеер: '+(src.name||'Источник')+' · '+(labels[src.dub]||labels.Unknown)+'. Если изображение не появляется, сервис может запрещать встраивание.');
      const link=document.createElement('a');link.href=src.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Открыть плеер отдельно ↗';$('#ut-player-message')?.append(' ',link);
      return;
    }
    if(type==='page'){
      updateInitemUI();
      media.innerHTML=`<div class="ut-placeholder">↗<small>Это веб-страница. Она откроется в отдельной вкладке, поскольку сторонние плееры не всегда разрешают встраивание.</small><a class="ut-link" target="_blank" rel="noopener noreferrer" href="${esc(src.url)}">Открыть сайт с видео ↗</a></div>`;
      message('Выбран источник: '+src.name+'. Озвучка: '+(labels[src.dub]||labels.Unknown));
      return;
    }
    media.innerHTML='<video id="ut-video" tabindex="0" controls playsinline preload="metadata" aria-label="Видеоплеер Ultra TV"></video>';
    updateInitemUI();
    const video=$('#ut-video');
    video.addEventListener('loadedmetadata',()=>{
      const p=Number(state().progress[keyOf()]||0);
      if(Number.isFinite(video.duration)&&p>5&&p<video.duration-8){try{video.currentTime=p;}catch{}}
    });
    video.addEventListener('timeupdate',()=>{
      if(!current||!Number.isFinite(video.currentTime)||video.currentTime<0||Date.now()-lastProgress<3000)return;
      lastProgress=Date.now();state().progress[keyOf()]=Math.round(video.currentTime);app.persist();
    });
    video.addEventListener('pause',()=>{
      if(!current||!Number.isFinite(video.currentTime))return;
      state().progress[keyOf()]=Math.round(video.currentTime);app.persist();
    });
    video.addEventListener('ended',()=>{
      if(!current)return;
      state().watched[keyOf()]=true;state().progress[keyOf()]=0;app.persist();app.draw();
      message('Серия отмечена как просмотренная.');
    });
    video.addEventListener('error',()=>{
      message('Не удалось воспроизвести поток. Проверь ссылку, формат и разрешения сервера (CORS), либо открой его во внешнем приложении.');
    });
    try{
      if(type==='hls'){
        const Hls=await getHls();
        if(!current||current!==token||current.selected!==index||!$('#ut-video'))return;
        if(Hls.isSupported()){
          hls=new Hls({enableWorker:true});
          hls.on(Hls.Events.ERROR,(_evt,data)=>{if(data.fatal)message('Ошибка HLS-потока: '+(data.details||'источник недоступен'));});
          hls.loadSource(src.url);hls.attachMedia(video);hls.on(Hls.Events.MANIFEST_PARSED,()=>video.play().catch(()=>{}));
        }else if(video.canPlayType('application/vnd.apple.mpegurl'))video.src=src.url;
        else message('Этот браузер не поддерживает HLS. Открой поток во внешнем плеере.');
      }else {video.src=src.url;video.play().catch(()=>{});}
      if(!current||current!==token)return;
      message('Источник: '+(src.name||'Основной')+' · '+(labels[src.dub]||labels.Unknown));
      const status=$('#ut-player-message');
      const a=document.createElement('a');a.href=src.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Открыть поток ↗';a.style.marginLeft='12px';status?.appendChild(a);
    }catch(err){if(!current||current!==token)return;message(err.message+'. Можно попробовать другой источник или открыть видео напрямую.');}
  }
  function add(){
    if(!current)return;
    let parsed;
    try{parsed=parseSource($('#ut-url').value);}catch(err){window.alert(err.message);return;}
    const s=state(),key=keyOf(),sources=list();
    if(sources.length>=15){window.alert('Для одной серии можно сохранить до 15 источников.');return;}
    const scope=$('#ut-whole-show')?.checked||!current.episodeId?'show:'+current.key:key;
    const dub=$('#ut-dub').value,kind=$('#ut-kind').value;
    const name=$('#ut-name').value.trim().slice(0,60)||'Плеер '+(sources.length+1);
    s.sources[scope]=[...(Array.isArray(s.sources[scope])?s.sources[scope]:[]),{url:parsed.url,name,dub,kind:kind==='auto'&&parsed.embedded?'embed':kind,embedded:parsed.embedded}];
    if(dub==='LostFilm')s.dubs[key]='LostFilm';
    if(dub==='Dub')s.dubs[key]='Дубляж';
    app.persist();render(true);
  }
  document.addEventListener('click',e=>{
    const play=e.target.closest('[data-player-key]');
    if(play){e.preventDefault();open(play.dataset.playerKey,play.dataset.playerEpisode);return;}
    if(!current)return;
    const closer=e.target.closest('[data-ut-close]');if(closer){close();return;}
    if(e.target.closest('[data-ut-probe-time]')){probeInitemTime();return;}
    const conf=e.target.closest('[data-ut-config]');if(conf){const el=$('#ut-manage');if(el){el.open=true;el.scrollIntoView({block:'nearest'});}return;}
    const source=e.target.closest('[data-ut-source]');if(source){selectSource(Number(source.dataset.utSource));return;}
    const epButton=e.target.closest('[data-ut-episode]');if(epButton){current.autoChoose=false;current.episodeId=epButton.dataset.utEpisode;render(true);return;}
    const del=e.target.closest('[data-ut-delete]');
    if(del && window.confirm('Удалить сохранённую ссылку на эту серию?')){
      const s=state(),i=Number(del.dataset.utDelete),src=list()[i];
      if(src) s.sources[src.__key]=(s.sources[src.__key]||[]).filter((_,j)=>j!==src.__index);
      app.persist();render(false);
    }
  });
  document.addEventListener('change',e=>{
    if(!current)return;
    if(e.target?.id==='ut-select-source'){selectSource(Number(e.target.value));return;}
    if(e.target?.id==='ut-season'){
      const eps=episodesFor(current.key).filter(ep=>ep.season===Number(e.target.value));
      const first=eps.sort((a,b)=>a.number-b.number)[0];
      if(first){current.autoChoose=false;current.episodeId=String(first.id);render(true);}
    }
  });
  document.addEventListener('submit',e=>{if(e.target?.id==='ut-form'){e.preventDefault();add();}});
  document.addEventListener('keydown',e=>{
    if(!current)return;
    if(e.key==='Escape'){e.preventDefault();close();return;}
    const target=document.activeElement;
    if(['INPUT','SELECT','TEXTAREA'].includes(target?.tagName))return;
    const video=$('#ut-video');
    if(target===video){
      if(e.key==='ArrowRight' || e.key==='ArrowLeft'){e.preventDefault();video.currentTime=Math.max(0,video.currentTime+(e.key==='ArrowRight'?10:-10));return;}
      if(e.key===' '){e.preventDefault();video.paused?video.play().catch(()=>{}):video.pause();return;}
      if(e.key.toLowerCase()==='f'){e.preventDefault();video.requestFullscreen?.().catch(()=>{});return;}
    }
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key) || !target)return;
    const focusable=[...$('#player-root').querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),summary,video')].filter(el=>el.getClientRects().length);
    const from=target.getBoundingClientRect();let best=null,score=Infinity;
    for(const el of focusable){
      if(el===target)continue;
      const r=el.getBoundingClientRect(),dx=(r.left+r.width/2)-(from.left+from.width/2),dy=(r.top+r.height/2)-(from.top+from.height/2);
      if(e.key==='ArrowRight'&&dx<=6 || e.key==='ArrowLeft'&&dx>=-6 || e.key==='ArrowDown'&&dy<=6 || e.key==='ArrowUp'&&dy>=-6)continue;
      const horiz=e.key==='ArrowLeft'||e.key==='ArrowRight',val=(horiz?Math.abs(dx):Math.abs(dy))+(horiz?Math.abs(dy):Math.abs(dx))*2;
      if(val<score){score=val;best=el;}
    }
    if(best){e.preventDefault();best.focus({preventScroll:true});best.scrollIntoView({block:'nearest'});}
  });
  window.UltraTVPlayer={
    open,close,
    hasEpisode:(key,episode)=>!!episode&&playableFor(key,episode),
    hasSeriesBrowser:key=>(remoteOptions.embeds?.[key]||[]).some(src=>src.mode==='browse')||/^tt\d{5,12}$/.test(String(app.showInfo(key)?.imdb||''))
  };
  loadOptions();
}
playerModule();
})();
