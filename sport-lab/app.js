/* Ultra TV Sports Lab. Standalone and never loaded by the production home page. */
(function () {
  "use strict";
  var state = { tab: "matches", query: "", channels: [], fixtures: [], broadcasts: [], generated: null, saved: [] };
  var root = document.getElementById("results");
  var status = document.getElementById("status");
  var search = document.getElementById("search");
  var dataReady = false;
  try { state.saved = JSON.parse(localStorage.getItem("ultra-sport-favs") || "[]"); } catch (_) {}
  if (!Array.isArray(state.saved)) state.saved = [];
  function el(tag, className, value) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (value !== undefined) n.textContent = String(value);
    return n;
  }
  function norm(value) { return String(value || "").toLocaleLowerCase("ru").replace(/ё/g,"е").trim(); }
  function dateLabel(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "Дата не уточнена";
    var parts = iso.split("-");
    var d = new Date(Date.UTC(+parts[0],+parts[1]-1,+parts[2]));
    return new Intl.DateTimeFormat("ru-RU",{timeZone:"UTC",day:"numeric",month:"long",weekday:"short"}).format(d);
  }
  function isSaved(key){return state.saved.indexOf(key) >= 0;}
  function toggleSaved(key) {
    state.saved = isSaved(key) ? state.saved.filter(function(x){return x!==key;}) : state.saved.concat([key]);
    try { localStorage.setItem("ultra-sport-favs",JSON.stringify(state.saved)); } catch (_) {}
    render();
  }
  function badge(parent, label, kind) {
    var n=el("span","badge"+(kind?" "+kind:""),label);parent.appendChild(n);
  }
  function button(parent,label,handler) {
    var n=el("button","",label);n.type="button";n.addEventListener("click",handler);parent.appendChild(n);return n;
  }
  function safeUrl(url) {
    try {
      var u = new URL(url);
      var allowed = ["matchtv.ru","www.matchtv.ru","tvstart.ru","ru.tvstart.ru","www.tvstart.ru"];
      return u.protocol==="https:" && allowed.indexOf(u.hostname)>=0 ? u.href : "";
    } catch (_) { return ""; }
  }
  function officialLink(parent,label,url) {
    var safe=safeUrl(url); if(!safe)return;
    var a=el("a","",label+" ↗");a.href=safe;a.target="_blank";a.rel="noopener noreferrer";parent.appendChild(a);
  }
  function channelCard(c) {
    var box=el("article","card"), line=el("div","row"), head=el("div"), badges=el("div","badges");
    var title=el("h2","",c.name);head.appendChild(title);
    badge(badges, "По подписке", "warn");badge(badges,c.focus==="football"?"Футбол":"Другие виды спорта");
    head.appendChild(badges);line.appendChild(head);
    button(line,isSaved("c:"+c.id)?"★":"☆",function(){toggleSaved("c:"+c.id);}).setAttribute("aria-label","Добавить или убрать из избранного: "+c.name);
    box.appendChild(line);
    box.appendChild(el("p","sub","Русская дорожка: вероятна, не проверена. В стандартных Иви / Okko / KION: требуется сверка тарифов."));
    var actions=el("div","actions");officialLink(actions,"Программа / официальный сайт",c.guideUrl);
    box.appendChild(actions);return box;
  }
  function matchBroadcasts(f) {
    return state.broadcasts.filter(function(b){return b.fixtureId === f.id;});
  }
  function matchCard(f) {
    var box=el("article","card"),row=el("div","row"),head=el("div"),badges=el("div","badges");
    badge(badges,f.competition || "Футбол");
    badge(badges,dateLabel(f.date));
    head.appendChild(badges);
    head.appendChild(el("h2","",f.home+" — "+f.away));
    head.appendChild(el("p","sub","Время начала: не подтверждено · Данные расписания, не трансляция"));
    row.appendChild(head);
    button(row,isSaved("m:"+f.id)?"★":"☆",function(){toggleSaved("m:"+f.id);}).setAttribute("aria-label","Добавить или убрать матч из избранного");
    box.appendChild(row);
    var broadcasts=matchBroadcasts(f);
    if (!broadcasts.length) {
      box.appendChild(el("p","muted","Российский вещатель не установлен. Доступный эфир с русским комментарием не подтверждён."));
    } else {
      broadcasts.forEach(function(b){
        var c=state.channels.find(function(x){return x.id===b.channelId;});
        var p=el("p","sub",(c?c.name:"Неизвестный вещатель")+" · "+(b.commentary==="ru"?"Русский комментарий подтверждён":"Язык комментария неизвестен"));
        box.appendChild(p);
        var bar=el("div","badges");
        badge(bar,b.access==="free" && b.verifiedAt?"Бесплатный эфир проверен":"Доступ зависит от подписки",b.access==="free" && b.verifiedAt?"good":"warn");
        box.appendChild(bar);
        var actions=el("div","actions");
        if(c)officialLink(actions,"Официальная программа",c.guideUrl);
        if(b.access==="free" && b.verifiedAt)officialLink(actions,"Смотреть официальный эфир",b.watchUrl);
        box.appendChild(actions);
      });
    }
    return box;
  }
  function render() {
    root.replaceChildren();
    if(!dataReady)return;
    var q=norm(state.query),show=el("div","list");
    if(state.tab==="channels"||state.tab==="favs") {
      state.channels.filter(function(c){
        return (!q||norm(c.name).indexOf(q)>=0)
          && (state.tab!=="favs"||isSaved("c:"+c.id));
      }).forEach(function(c){show.appendChild(channelCard(c));});
    }
    if(state.tab==="matches"||state.tab==="favs") {
      state.fixtures.filter(function(f){
        return (!q||norm(f.home+" "+f.away+" "+f.competition).indexOf(q)>=0)
          && (state.tab!=="favs"||isSaved("m:"+f.id));
      }).slice(0,80).forEach(function(f){show.appendChild(matchCard(f));});
    }
    if(!show.children.length)root.appendChild(el("div","empty",q?"Совпадений нет. Измени запрос.":"Пока данных нет. Для избранного нажми ☆ у канала или матча."));
    else root.appendChild(show);
  }
  document.querySelectorAll("[data-tab]").forEach(function(b){
    b.addEventListener("click",function(){
      state.tab=b.getAttribute("data-tab");
      document.querySelectorAll("[data-tab]").forEach(function(x){x.setAttribute("aria-pressed",String(x===b));});
      render();
    });
  });
  search.addEventListener("input",function(){state.query=search.value;render();});
  Promise.all(["./channels.json","./data.json","./broadcasts.json"].map(function(path){
    return fetch(path,{cache:"no-store"}).then(function(r){if(!r.ok)throw Error(path+": HTTP "+r.status);return r.json();});
  })).then(function(items){
    state.channels=Array.isArray(items[0].channels)?items[0].channels:[];
    state.fixtures=Array.isArray(items[1].fixtures)?items[1].fixtures:[];
    state.broadcasts=Array.isArray(items[2].broadcasts)?items[2].broadcasts:[];
    state.generated=items[1].generatedAt;
    dataReady=true;
    status.textContent="Найдено матчей: "+state.fixtures.length+" · Платных каналов: "+state.channels.length+
      " · Сопоставлений с вещателями: "+state.broadcasts.length+
      (state.generated?" · Данные от "+state.generated.slice(0,10):"")+".";
    render();
  }).catch(function(err){
    dataReady=true;
    status.textContent="Ошибка загрузки данных: "+err.message+"; основное Ultra TV не затронуто.";
    root.appendChild(el("div","empty","Обнови страницу позже. Прототип не влияет на остальные разделы."));
  });
}());