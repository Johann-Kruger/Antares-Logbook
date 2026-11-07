(function(){
  "use strict";

  // ================= Constants =================
  var STORAGE_KEY = "antares_logbook_v1";
  var SCHEMA_VERSION = 1;
  // The blank DFFE tuna pole-and-line catch statistics form (.xlsx), filled in
  // by buildDffeXlsx(). Replaced at build time; see tools/build.py.
  var DFFE_TEMPLATE_B64 = "__DFFE_TEMPLATE_B64__";

  var DIRECTIONS = ["N","NE","E","SE","S","SW","W","NW"];
  var WIND_KN = ["0-5","5-10","10-15","15-20","20-25","25+"];
  var SEA = ["Calm","Slight","Moderate","Rough"];
  var BAIT = [{code:"",label:"None"},{code:"L",label:"Live"},{code:"F",label:"Frozen"}];
  var TANKS = ["1","2","3","4","5","6"];
  // Species the DFFE form has a column for. ALB and YFT are stored as
  // stop.alb / stop.yft (the original fields); every other species goes in
  // stop.other[code]. Species the skipper adds are saved in state.customSpecies
  // and use the form's four spare columns (AE-AH).
  var BUILTIN_SPECIES = [
    { code:"ALB", name:"Longfin", short:"LF", col:"P" },
    { code:"YFT", name:"Yellowfin", short:"YFT", col:"S" },
    { code:"BET", name:"Bigeye", short:"BE", col:"V" },
    { code:"BFT", name:"Bluefin", short:"BFT", col:"Y" },
    { code:"YTL", name:"Yellowtail", short:"YT", col:"AB" },
    { code:"SNK", name:"Snoek", short:"SNK", col:"AC" },
    { code:"SKJ", name:"Skipjack", short:"SKJ", col:"AD" }
  ];
  var SPARE_COLS = ["AE","AF","AG","AH"];

  function defaultSettings(){ return {
    vessel:"ANTARES", registrationNo:"HTB278", rightsHolder:"Southwest Tuna Fishing Cc",
    rightNo:"TPL21222", permitNo:"2602382", skipper:"Johann Kruger", contact:"083 204 4880",
    email:"johannkruger1@gmail.com", port:"Hout Bay", observer:"N",
    owner:"Ntoza Fishing (Pty) Ltd", licenceNo:"HTB 278 TP", crewListPort:"Hout Bay Harbour", skipperId:"",
    fcoName:"", fcoPhone:"", fcoEmail:"", vmsProvider:"", fishingArea:"Off Cape Point",
    defaultCrew:"10", defaultHours:"13", gear:"P", liveBait:"N", baitCondition:"", polePct:"100",
    stopSpecies:"ALB,YFT,BET"
  }; }
  var SETTINGS_TEXT = Object.keys(defaultSettings());
  var TRIP_TEXT = ["tripNumber","sailDate","sailTime","dischargeDate","notes"];
  // Departure check: each tick stores the time it was ticked. No ice: the boat has RSW.
  var DEP_TEXT = ["vmsOnAt","vmsConfirmedAt","vmsHow","permitAt","rswAt","rswTemp","fuel","water","fcoAt","fcoHow","fcoRef","doneAt"];
  var LAND_TEXT = ["eta","etaTime","port","fcoAt","fcoHow","fcoRef"];
  var STOP_TEXT = ["date","time","lat","lon","gpsNote","alb","yft","tank","sst","windDir","windKn","sea","driftDir","driftKn","schoolDepth","bait","notes"];
  var DAY_TEXT = ["crew","hours","gear","liveBait","baitCondition","polePct","sst","wxTime","wxWindDir","wxWindKn","wxSea","wxSwell","wxSky","wxNote","endedAt"];
  var SKY = ["Clear","Cloudy","Rain","Fog"];
  // The vessel's HACCP books (Zip Print forms 0322 / 0323).
  var SAN_OPS = ["Ablution facilities clean","Mess area clean","Galley clean and tidy","Cabins clean and tidy","Fishing deck clean","Fishing gear clean","Knives and saws clean","Holds clean","Processing deck clean","Ice clean","Staff fit and healthy","Staff correctly attired/no jewellery present","Staff hand-washing correct"];
  var SAN_STORE = ["Fishing gear clean and stowed","Mutton cloth dry and stored","Fuel and oil separate, no spillage","Chemicals and cleaning stored","Galley food fresh and stowed","Durables in sealed containers, no rust"];
  // Fresh fish inspection columns. yn = a Yes/No question with the expected answer.
  var FISH_FIELDS = [
    { k:"catchTime", label:"Date & time of catch" }, { k:"waterTemp", label:"Water temp °C" },
    { k:"icing", label:"Icing correct?", yn:"Y" }, { k:"haulToIce", label:"Time from haul to ice" },
    { k:"tPrior", label:"Temp prior to icing °C" }, { k:"t6", label:"Temp after 6 h °C" }, { k:"t12", label:"Temp after 12 h °C" },
    { k:"t16", label:"Temp after 16 h °C" }, { k:"tOff", label:"Offloading temp °C" },
    { k:"decomposed", label:"Decomposed?", yn:"N" }, { k:"poisonous", label:"Poisonous?", yn:"N" }, { k:"tainted", label:"Tainted?", yn:"N" },
    { k:"foreign", label:"Foreign matter?", yn:"N" }, { k:"parasites", label:"Parasites?", yn:"N" },
    { k:"gutting", label:"Gutting?", yn:"N" }, { k:"washing", label:"Washing?", yn:"Y" }, { k:"offal", label:"Offal discharge hygienic?", yn:"Y" }
  ];
  var CREW_TEXT = ["name","surname","idNumber","role","nationality","contact","kinName","kinContact","albRate","yftRate"];
  // Positions on the vessel's crew list.
  var POSITIONS = ["Crew","Fisherman","Rodman","Baitmaster","Cook","Engineer","Observer"];
  var CONDITION_FIELDS = ["sst","windDir","windKn","sea","driftDir","driftKn","schoolDepth","bait"];

  // ================= Small helpers =================
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
  function pad2(n){ return String(n).padStart(2,"0"); }
  function todayISO(d){ d = d || new Date(); return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()); }
  function nowHM(){ var d = new Date(); return pad2(d.getHours())+":"+pad2(d.getMinutes()); }
  function isPlainObject(v){ return v !== null && typeof v === "object" && !Array.isArray(v); }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function num(v){ var n = parseFloat(String(v==null?"":v).replace(",", ".")); return isFinite(n) ? n : 0; }
  function int(v){ var n = parseInt(String(v==null?"":v), 10); return isFinite(n) ? n : 0; }
  function fmtDate(iso){
    if(!iso) return "";
    var p = iso.split("-"); if(p.length!==3) return iso;
    return p[2]+"/"+p[1]+"/"+p[0];
  }
  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  function fmtDay(iso){
    var d = new Date(iso+"T12:00:00");
    if(isNaN(d)) return iso;
    return DAYS[d.getDay()]+" "+d.getDate()+" "+MONTHS[d.getMonth()].slice(0,3);
  }
  function addDays(iso, n){ var d = new Date(iso+"T12:00:00"); d.setDate(d.getDate()+n); return todayISO(d); }
  function kg(v){ return (Math.round(v*10)/10).toFixed(1); }
  // Decimal degrees -> {deg, min} (minutes to one decimal, absolute value).
  function degMin(dec){
    var a = Math.abs(num(dec)); var d = Math.floor(a); var m = Math.round((a-d)*600)/10;
    if(m >= 60){ d += 1; m = 0; }
    return { deg:d, min:m };
  }
  function fmtPos(lat, lon){
    if(lat==="" || lon==="" || lat==null || lon==null) return "No position";
    var a = degMin(lat), b = degMin(lon);
    return a.deg+"°"+pad2(Math.floor(a.min))+(a.min%1 ? "."+Math.round((a.min%1)*10) : ".0")+"'"+(num(lat)<0?"S":"N")+"  "+
           b.deg+"°"+pad2(Math.floor(b.min))+(b.min%1 ? "."+Math.round((b.min%1)*10) : ".0")+"'"+(num(lon)<0?"W":"E");
  }

  // ================= Storage =================
  // Same rules as the Iingwane logbook: the saved data is the only copy, so a
  // logbook that can't be read is never written over. It is copied aside and
  // the app stays locked until the skipper chooses what to do.
  var storageLocked = false;
  var loadProblem = null;
  function emptyState(){
    return { schemaVersion:SCHEMA_VERSION, settings:defaultSettings(), trips:[], knownCrew:[], customSpecies:[], lastConditions:{}, backupAt:"" };
  }
  function textFields(obj, keys){ keys.forEach(function(k){ if(obj[k]==null) obj[k]=""; else if(typeof obj[k]!=="string") obj[k]=String(obj[k]); }); return obj; }
  function normaliseState(s){
    var out = emptyState();
    out.schemaVersion = SCHEMA_VERSION;
    out.settings = Object.assign(defaultSettings(), isPlainObject(s.settings) ? s.settings : {});
    textFields(out.settings, SETTINGS_TEXT);
    out.knownCrew = (Array.isArray(s.knownCrew) ? s.knownCrew : []).filter(isPlainObject).map(function(c){ return textFields(splitKin(Object.assign({}, c)), CREW_TEXT); });
    out.lastConditions = isPlainObject(s.lastConditions) ? s.lastConditions : {};
    out.customSpecies = (Array.isArray(s.customSpecies) ? s.customSpecies : []).filter(function(c){ return isPlainObject(c) && c.code && c.name; })
      .map(function(c){ return { code:String(c.code).toUpperCase().slice(0,6), name:String(c.name).slice(0,30) }; });
    out.backupAt = typeof s.backupAt === "string" ? s.backupAt : "";
    out.trips = (Array.isArray(s.trips) ? s.trips : []).filter(isPlainObject).map(function(t){
      var trip = textFields(Object.assign({}, t), TRIP_TEXT);
      if(!trip.id) trip.id = uid();
      trip.ended = !!trip.ended;
      trip.createdAt = typeof trip.createdAt === "number" ? trip.createdAt : Date.now();
      trip.crew = (Array.isArray(t.crew) ? t.crew : []).filter(isPlainObject).map(function(c){ var x = textFields(splitKin(Object.assign({}, c)), CREW_TEXT); if(!x.id) x.id = uid(); return x; });
      trip.stops = (Array.isArray(t.stops) ? t.stops : []).filter(isPlainObject).map(function(p){
        var x = textFields(Object.assign({}, p), STOP_TEXT); if(!x.id) x.id = uid();
        var other = {};
        if(isPlainObject(p.other)) Object.keys(p.other).forEach(function(k){ if(int(p.other[k])>0) other[k] = String(int(p.other[k])); });
        x.other = other;
        return x;
      });
      var bt = isPlainObject(t.bait) ? t.bait : {};
      trip.bait = { boxKg: String(bt.boxKg==null?"":bt.boxKg), baitType: String(bt.baitType==null?"":bt.baitType),
        entries: (Array.isArray(bt.entries) ? bt.entries : []).filter(function(e){ return isPlainObject(e) && /^(load|received|used)$/.test(e.type); })
          .map(function(e){ var x = textFields(Object.assign({}, e), ["id","type","date","boxes","note"]); if(!x.id) x.id = uid(); return x; }) };
      trip.contracts = {};
      if(isPlainObject(t.contracts)) Object.keys(t.contracts).forEach(function(k){
        var c = t.contracts[k];
        if(isPlainObject(c) && typeof c.sig==="string" && /^data:image\/(png|jpeg);base64,/.test(c.sig)) trip.contracts[k] = { sig:c.sig, signedAt:String(c.signedAt||"") };
      });
      trip.departure = textFields(Object.assign({}, isPlainObject(t.departure) ? t.departure : {}), DEP_TEXT);
      trip.landing = textFields(Object.assign({}, isPlainObject(t.landing) ? t.landing : {}), LAND_TEXT);
      trip.reportsAt = typeof t.reportsAt === "string" ? t.reportsAt : "";
      trip.crewConfirmedAt = typeof t.crewConfirmedAt === "string" ? t.crewConfirmedAt : "";
      trip.haccp = {};
      if(isPlainObject(t.haccp)) Object.keys(t.haccp).forEach(function(d){ var h = normaliseHaccp(t.haccp[d]); if(h) trip.haccp[d] = h; });
      trip.skipperSig = typeof t.skipperSig === "string" && /^data:image\/png;base64,/.test(t.skipperSig) ? t.skipperSig : "";
      trip.days = {};
      if(isPlainObject(t.days)) Object.keys(t.days).forEach(function(k){ if(isPlainObject(t.days[k])) trip.days[k] = textFields(Object.assign({}, t.days[k]), DAY_TEXT); });
      trip.weights = (Array.isArray(t.weights) ? t.weights : []).filter(isPlainObject).map(function(w){ var x = textFields(Object.assign({}, w), ["sp","kg","len"]); if(!x.id) x.id = uid(); if(!/^[A-Z]{2,6}$/.test(x.sp)) x.sp = "ALB"; return x; });
      return trip;
    });
    return out;
  }
  function normaliseHaccp(h){
    if(!isPlainObject(h)) return null;
    var out = { san:{}, dailyTemp: String(h.dailyTemp==null?"":h.dailyTemp), inspectedBy: String(h.inspectedBy==null?"":h.inspectedBy), doneAt: String(h.doneAt==null?"":h.doneAt), fish:[] };
    if(isPlainObject(h.san)) Object.keys(h.san).forEach(function(k){ if(h.san[k]==="Y" || h.san[k]==="N") out.san[k] = h.san[k]; });
    out.fish = (Array.isArray(h.fish) ? h.fish : []).filter(isPlainObject).map(function(f){ return textFields(Object.assign({}, f), FISH_FIELDS.map(function(x){ return x.k; }).concat(["sp"])); });
    return out;
  }
  // Older records kept next of kin as one text ("Sinazo 060 365 2733");
  // split it at the first digit into name and number.
  function splitKin(c){
    if(c.nextOfKin && !c.kinName && !c.kinContact){
      var m = /^(.*?)\s*(\+?\d[\d\s-]*)$/.exec(String(c.nextOfKin).trim());
      if(m){ c.kinName = m[1].trim(); c.kinContact = m[2].trim(); } else c.kinName = String(c.nextOfKin).trim();
    }
    delete c.nextOfKin;
    return c;
  }
  function keepCopyOf(raw, tag){
    var key = STORAGE_KEY + "_" + tag + "_" + Date.now();
    try{ localStorage.setItem(key, raw); return key; }catch(e){ return null; }
  }
  function loadState(){
    var raw;
    try{ raw = localStorage.getItem(STORAGE_KEY); }
    catch(e){ storageLocked = true; loadProblem = { kind:"unavailable" }; return emptyState(); }
    if(raw === null || raw.trim() === "") return emptyState();
    var parsed = null;
    try{ parsed = JSON.parse(raw); }catch(e){}
    if(!isPlainObject(parsed) || !Array.isArray(parsed.trips)){
      storageLocked = true;
      loadProblem = { kind:"corrupt", raw:raw, copyKey:keepCopyOf(raw, "corrupt") };
      return emptyState();
    }
    return normaliseState(parsed);
  }
  var state = loadState();
  function saveState(){
    if(storageLocked) return false;
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch(e){ console.error("save failed", e); document.getElementById("saveFailedBanner").classList.remove("hidden"); return false; }
    document.getElementById("saveFailedBanner").classList.add("hidden");
    return true;
  }

  // ================= Lookups and totals =================
  function getTrip(id){ return state.trips.find(function(t){ return t.id===id; }) || null; }
  function openTrip(){ return state.trips.find(function(t){ return !t.ended; }) || null; }
  function sortedStops(trip){
    return trip.stops.slice().sort(function(a,b){ return (a.date+a.time).localeCompare(b.date+b.time); });
  }
  function tripDates(trip){
    var set = {};
    trip.stops.forEach(function(s){ if(s.date) set[s.date] = 1; });
    Object.keys(trip.days).forEach(function(d){ set[d] = 1; });
    return Object.keys(set).sort();
  }
  function stopsOn(trip, date){ return sortedStops(trip).filter(function(s){ return s.date===date; }); }
  function sumOf(list, f){ return list.reduce(function(a,s){ return a + int(s[f]); }, 0); }
  function allSpecies(){ return BUILTIN_SPECIES.concat(state.customSpecies.map(function(c){ return { code:c.code, name:c.name, short:c.code, custom:true }; })); }
  function speciesOf(code){ return allSpecies().find(function(x){ return x.code===code; }) || { code:code, name:code, short:code }; }
  function countOf(stop, code){ return code==="ALB" ? int(stop.alb) : code==="YFT" ? int(stop.yft) : int(stop.other && stop.other[code]); }
  function sumSp(list, code){ return list.reduce(function(a,s){ return a + countOf(s, code); }, 0); }
  // Species with any fish or weights on this trip, in form order.
  function speciesInTrip(trip){
    return allSpecies().filter(function(sp){ return sumSp(trip.stops, sp.code)>0 || trip.weights.some(function(w){ return w.sp===sp.code; }); });
  }
  function stopSpeciesCodes(){
    var codes = String(state.settings.stopSpecies||"").split(",").map(function(x){ return x.trim(); }).filter(Boolean);
    if(codes.indexOf("ALB")<0) codes.unshift("ALB");
    return codes.filter(function(c){ return allSpecies().some(function(x){ return x.code===c; }); });
  }
  function otherTotal(list){ return list.reduce(function(a,s){ return a + Object.keys(s.other||{}).reduce(function(b,k){ return b+int(s.other[k]); },0); }, 0); }
  function tripTotals(trip){ return { alb:sumOf(trip.stops,"alb"), yft:sumOf(trip.stops,"yft"), other:otherTotal(trip.stops), stops:trip.stops.length, days:tripDates(trip).length }; }
  function extrasText(stop){
    return Object.keys(stop.other||{}).filter(function(k){ return int(stop.other[k])>0; }).map(function(k){ return "+"+int(stop.other[k])+" "+speciesOf(k).short; });
  }
  function weightStats(trip, sp){
    var list = trip.weights.filter(function(w){ return w.sp===sp && num(w.kg)>0; });
    var total = list.reduce(function(a,w){ return a+num(w.kg); }, 0);
    return { n:list.length, kg:total, avg:list.length ? total/list.length : 0 };
  }
  function crewOnly(trip){ return trip.crew.filter(function(c){ return c.role!=="Skipper"; }); }
  function personsOnBoard(trip){ return crewOnly(trip).length + 1; }
  function tripLabel(trip){ return trip.tripNumber ? "Trip "+trip.tripNumber : "Trip (no number)"; }
  function tripRange(trip){
    var d = tripDates(trip);
    if(!d.length) return trip.sailDate ? "Sailed "+fmtDay(trip.sailDate) : "No stops yet";
    return d.length===1 ? fmtDay(d[0]) : fmtDay(d[0])+" – "+fmtDay(d[d.length-1]);
  }
  function dayInfo(trip, date){
    var s = state.settings;
    var d = trip.days[date] || {};
    var stops = stopsOn(trip, date);
    var ssts = stops.map(function(x){ return num(x.sst); }).filter(function(v){ return v>0; });
    var sstAuto = "";
    if(ssts.length){
      var mn = Math.min.apply(null, ssts), mx = Math.max.apply(null, ssts);
      sstAuto = mn===mx ? mn.toFixed(1) : mn.toFixed(1)+"-"+mx.toFixed(1);
    }
    var bait = stops.map(function(x){ return x.bait; }).filter(Boolean);
    return {
      crew: d.crew || String(trip.crew.length ? personsOnBoard(trip) : (s.defaultCrew || "")),
      hours: d.hours || s.defaultHours || "",
      gear: d.gear || s.gear || "P",
      liveBait: d.liveBait || (bait.length ? "Y" : (s.liveBait || "N")),
      baitCondition: d.baitCondition || (bait.length ? bait[0] : (s.baitCondition || "")),
      polePct: d.polePct || s.polePct || "100",
      sst: d.sst || sstAuto,
      sstIsAuto: !d.sst && !!sstAuto
    };
  }

  // ================= UI basics =================
  var toastTimer = null;
  function showToast(msg, isError){
    var t = document.getElementById("toast");
    t.textContent = msg; t.classList.toggle("toast-error", !!isError); t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.classList.remove("show"); }, Math.min(8000, Math.max(3000, msg.length*60)));
  }
  var openSheets = [];
  function openSheet(html, opts){
    var backdrop = document.createElement("div");
    backdrop.className = "sheet-backdrop";
    var sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.innerHTML = html;
    backdrop.appendChild(sheet);
    document.body.appendChild(backdrop);
    var entry = { backdrop:backdrop, sheet:sheet, onClose:opts && opts.onClose, guard:opts && opts.guard };
    openSheets.push(entry);
    function close(){
      if(!backdrop.parentNode) return;
      document.body.removeChild(backdrop);
      openSheets = openSheets.filter(function(e){ return e!==entry; });
      if(entry.onClose) entry.onClose();
    }
    entry.close = close;
    // Tapping outside a sheet with unsaved input asks first (guard), so a stray tap loses nothing.
    backdrop.addEventListener("click", function(e){ if(e.target===backdrop) tryClose(entry); });
    return { sheet:sheet, close:close, entry:entry };
  }
  function tryClose(entry){
    if(entry.guard && entry.guard()){
      showConfirm("Discard what you've entered here?", "Discard", "btn-danger", function(){ entry.close(); });
    } else entry.close();
  }
  function showConfirm(message, okLabel, okClass, onOk){
    var s = openSheet('<p class="sheet-text">'+esc(message)+'</p><div class="btnrow"><button class="btn btn-outline" data-a="no">Cancel</button><button class="btn '+(okClass||"btn-accent")+'" data-a="ok">'+esc(okLabel||"OK")+'</button></div>');
    s.sheet.querySelector('[data-a="no"]').onclick = s.close;
    s.sheet.querySelector('[data-a="ok"]').onclick = function(){ s.close(); onOk(); };
  }
  function chips(name, options, value, cls){
    return '<div class="chiprow" data-chips="'+name+'">'+options.map(function(o){
      var code = typeof o==="string" ? o : o.code, label = typeof o==="string" ? o : o.label;
      return '<div class="chip '+(cls||"")+(String(value)===String(code)?" on":"")+'" data-v="'+esc(code)+'">'+esc(label)+'</div>';
    }).join("")+'</div>';
  }
  // Chip groups act like radio buttons; tapping the selected chip clears it.
  function wireChips(root, onChange){
    root.querySelectorAll("[data-chips]").forEach(function(row){
      row.addEventListener("click", function(e){
        var c = e.target.closest(".chip"); if(!c) return;
        var was = c.classList.contains("on");
        row.querySelectorAll(".chip").forEach(function(x){ x.classList.remove("on"); });
        if(!was || row.hasAttribute("data-required")) c.classList.add("on");
        if(onChange) onChange(row.getAttribute("data-chips"), chipValue(root, row.getAttribute("data-chips")));
      });
    });
  }
  function chipValue(root, name){
    var on = root.querySelector('[data-chips="'+name+'"] .chip.on');
    return on ? on.getAttribute("data-v") : "";
  }
  function field(label, id, value, type, extra){
    return '<div class="field"><label for="'+id+'">'+esc(label)+'</label><input id="'+id+'" type="'+(type||"text")+'" value="'+esc(value)+'" '+(extra||"")+'></div>';
  }
  function val(root, id){ var el = root.querySelector("#"+id); return el ? el.value.trim() : ""; }

  // ================= GPS =================
  // Same two-step approach as Iingwane: a quick high-accuracy fix first,
  // then a slower fallback. Works offline (satellites only).
  function captureGeo(onDone){
    if(!navigator.geolocation){ onDone("", "", "this phone has no location support"); return; }
    function attempt(high, ms, cb){
      var settled = false;
      var timer = setTimeout(function(){ if(!settled){ settled = true; cb("", "", "timed out waiting for a GPS fix", false); } }, ms+500);
      try{
        navigator.geolocation.getCurrentPosition(function(pos){
          if(settled) return; settled = true; clearTimeout(timer);
          cb(pos.coords.latitude.toFixed(5), pos.coords.longitude.toFixed(5), "", false);
        }, function(err){
          if(settled) return; settled = true; clearTimeout(timer);
          var denied = err && err.code===1;
          cb("", "", denied ? "location permission denied — allow location for the app in phone settings" : "no GPS fix yet", denied);
        }, { enableHighAccuracy:high, timeout:ms, maximumAge:0 });
      }catch(e){ if(!settled){ settled = true; clearTimeout(timer); cb("", "", "location request failed", false); } }
    }
    attempt(true, 10000, function(lat, lon, reason, denied){
      if(lat || denied){ onDone(lat, lon, reason); return; }
      attempt(false, 15000, onDone);
    });
  }

  // ================= Files out =================
  function isNativeApp(){ return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
  function blobToBase64(blob){
    return new Promise(function(resolve, reject){
      var r = new FileReader();
      r.onloadend = function(){ var s = r.result || ""; var i = s.indexOf(","); resolve(i>=0 ? s.slice(i+1) : s); };
      r.onerror = function(){ reject(new Error("Could not read file data")); };
      r.readAsDataURL(blob);
    });
  }
  // In the Android app a download link does nothing, so the file is written
  // to the app cache and handed to the Share sheet (save, email, WhatsApp...).
  function saveFileOut(filename, blob){
    if(isNativeApp() && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem){
      var Filesystem = window.Capacitor.Plugins.Filesystem, Share = window.Capacitor.Plugins.Share;
      return blobToBase64(blob).then(function(b64){
        return Filesystem.writeFile({ path:filename, data:b64, directory:"CACHE" });
      }).then(function(res){
        if(Share && Share.share) return Share.share({ url:res.uri, title:filename });
      }).then(function(){ showToast("Ready to save or share"); })
      .catch(function(e){
        console.error(e);
        // Closing the share sheet without choosing an app is not a failure.
        if(e && /cancel/i.test(String(e.message||e))) return;
        showToast("Saving the file failed: "+(e && e.message ? e.message : e), true);
      });
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
    showToast("Download started");
    return Promise.resolve();
  }
  function fileName(trip, subject, ext){
    var t = trip ? "_trip"+(trip.tripNumber || "X").replace(/[^0-9A-Za-z]/g,"") : "";
    return todayISO().replace(/-/g,"")+"_antares"+t+"_"+subject+"."+ext;
  }
  function csvEscape(v){ v = String(v==null?"":v); return /[",\n;]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; }
  function toCsv(rows){ return rows.map(function(r){ return r.map(csvEscape).join(","); }).join("\r\n")+"\r\n"; }

  // ================= Navigation =================
  var view = { screen:"trips", tripId:null };
  function go(screen, tripId){ view.screen = screen; if(tripId!==undefined) view.tripId = tripId; render(); window.scrollTo(0,0); }
  function render(){
    var trip = view.tripId ? getTrip(view.tripId) : null;
    if(view.screen!=="trips" && !trip){ view.screen = "trips"; }
    var fab = document.getElementById("fab");
    fab.classList.add("hidden"); fab.innerHTML = "";
    if(view.screen==="trips") renderTrips();
    else if(view.screen==="trip") renderTrip(trip);
    else if(view.screen==="weights") renderWeights(trip);
    else if(view.screen==="crew") renderCrew(trip);
    else if(view.screen==="contracts") renderContracts(trip);
    else if(view.screen==="reports") renderReports(trip);
  }
  function setTopbar(title, sub){
    document.getElementById("tbTitle").textContent = title;
    document.getElementById("tbSub").textContent = sub;
  }
  function backButton(label, fn){ return '<button class="btn btn-ghost btn-sm" id="btnBack" style="margin-bottom:12px;">‹ '+esc(label)+'</button>'; }
  function wireBack(fn){ var b = document.getElementById("btnBack"); if(b) b.onclick = fn; }

  // ================= Trips screen =================
  function renderTrips(){
    setTopbar(state.settings.vessel || "ANTARES", "Tuna pole-and-line logbook");
    var el = document.getElementById("screen");
    var trips = state.trips.slice().sort(function(a,b){ return b.createdAt-a.createdAt; });
    var html = "";
    if(storageLocked){
      html += '<div class="locked-note"><span>The saved logbook could not be read, so nothing will be saved until this is sorted out. Open the menu → Backup &amp; restore.</span></div>';
    }
    var open = openTrip();
    if(!open) html += '<button class="btn btn-accent btn-big" id="btnNewTrip" style="margin-bottom:16px;">+ New trip</button>';
    if(!trips.length){
      html += '<div class="empty"><div class="big">🐟</div>No trips yet.<br>Tap <b>New trip</b> when you sail.</div>';
    }
    trips.forEach(function(t){
      var tot = tripTotals(t);
      html += '<div class="lineitem" data-trip="'+t.id+'"><div class="num">'+esc(t.tripNumber||"–")+'</div><div class="meta">'+
        '<div class="t1">'+esc(tripLabel(t))+' '+(t.ended?'':'<span class="tag open">AT SEA</span>')+'</div>'+
        '<div class="t2">'+esc(tripRange(t))+' · '+tot.stops+' stops</div>'+
        '<div class="t2"><b style="color:var(--kelp)">'+tot.alb+' LF</b>'+(tot.yft?' · <b style="color:var(--yellow)">'+tot.yft+' YFT</b>':'')+(tot.other?' · '+tot.other+' other':'')+'</div>'+
        '</div><div class="chev">›</div></div>';
    });
    html += '<div class="card" style="margin-top:16px;"><div class="row-between"><div class="helptext" style="margin:0;">'+esc(backupStatusText())+'</div><button class="btn btn-ghost btn-sm" id="btnBackupNow">Back up</button></div></div>';
    el.innerHTML = html;
    var nb = document.getElementById("btnNewTrip"); if(nb) nb.onclick = function(){ openTripSheet(null); };
    el.querySelectorAll("[data-trip]").forEach(function(r){ r.onclick = function(){ go("trip", r.getAttribute("data-trip")); }; });
    document.getElementById("btnBackupNow").onclick = exportBackup;
  }
  function backupStatusText(){
    if(!state.trips.length) return "Back up the logbook regularly — it's stored only on this phone.";
    if(!state.backupAt) return "Not backed up yet. The logbook is stored only on this phone.";
    var d = new Date(state.backupAt);
    var days = Math.floor((Date.now()-d.getTime())/86400000);
    return "Last backup "+fmtDay(todayISO(d))+" "+pad2(d.getHours())+":"+pad2(d.getMinutes())+(days>=7 ? " — due again" : "");
  }

  // ================= Trip sheet (new / edit) =================
  function openTripSheet(trip){
    var isNew = !trip;
    var last = state.trips.slice().sort(function(a,b){ return b.createdAt-a.createdAt; })[0];
    var t = trip || { tripNumber: last && /^\d+$/.test(last.tripNumber) ? String(int(last.tripNumber)+1) : "", sailDate: todayISO(), sailTime: nowHM(), dischargeDate:"", notes:"" };
    var s = openSheet(
      '<h2>'+(isNew?"New trip":"Trip details")+'</h2>'+
      '<div class="grid2">'+field("Trip number (DFFE)", "tTripNo", t.tripNumber, "text", 'inputmode="numeric"')+field("Discharge date", "tDis", t.dischargeDate, "date")+'</div>'+
      '<div class="grid2">'+field("Sailing date", "tSail", t.sailDate, "date")+field("Sailing time", "tSailTime", t.sailTime, "time")+'</div>'+
      (isNew && last && last.crew.length ? '<p class="helptext">The crew list from '+esc(tripLabel(last))+' ('+last.crew.length+') is brought over for you to check and confirm.</p>' : '')+
      '<div class="field"><label for="tNotes">Notes</label><textarea id="tNotes">'+esc(t.notes)+'</textarea></div>'+
      '<div class="sheet-foot"><button class="btn btn-outline" data-a="cancel">Cancel</button><button class="btn btn-accent" data-a="save">'+(isNew?"Start trip":"Save")+'</button></div>'
    );
    s.sheet.querySelector('[data-a="cancel"]').onclick = s.close;
    s.sheet.querySelector('[data-a="save"]').onclick = function(){
      var no = val(s.sheet,"tTripNo");
      var clash = state.trips.find(function(x){ return x!==trip && no && x.tripNumber===no; });
      if(clash){ showToast("Trip "+no+" already exists", true); return; }
      if(isNew){
        trip = { id:uid(), createdAt:Date.now(), ended:false, crew:[], stops:[], days:{}, weights:[], haccp:{}, skipperSig:"", crewConfirmedAt:"", contracts:{}, bait:{ boxKg:"", baitType:"", entries:[] }, departure:textFields({}, DEP_TEXT), landing:textFields({}, LAND_TEXT) };
        if(last && last.crew.length) trip.crew = last.crew.map(function(c){ return Object.assign({}, c, { id:uid() }); });
        state.trips.push(trip);
      }
      trip.tripNumber = no; trip.sailDate = val(s.sheet,"tSail"); trip.sailTime = val(s.sheet,"tSailTime");
      trip.dischargeDate = val(s.sheet,"tDis"); trip.notes = val(s.sheet,"tNotes");
      saveState(); s.close();
      if(!isNew){ render(); return; }
      // Start of trip: skipper signs once, then checks the crew list.
      view.tripId = trip.id;
      captureSkipperSig(trip, function(){ go("trip", trip.id); openDepartureSheet(trip); });
    };
  }

  // ================= Trip screen =================
  function renderTrip(trip){
    var tot = tripTotals(trip);
    setTopbar(tripLabel(trip), tripRange(trip));
    var el = document.getElementById("screen");
    var today = todayISO();
    var todays = stopsOn(trip, today);
    var html = backButton("All trips");
    if(trip.ended){
      html += '<div class="locked-note"><span>This trip is ended. Reopen it to change anything.</span><button class="btn btn-sm" id="btnReopen">Reopen</button></div>';
    }
    html += '<div class="card"><div class="totals">'+
      (trip.ended ? '' : '<div><div class="n">'+sumOf(todays,"alb")+'</div><div class="l">today</div></div>')+
      '<div><div class="n">'+tot.alb+'</div><div class="l">LF trip</div></div>'+
      '<div><div class="n yf">'+tot.yft+'</div><div class="l">YFT trip</div></div>'+
      '<div><div class="n" style="color:var(--text)">'+tot.stops+'</div><div class="l">stops</div></div>'+
      '</div></div>';
    var steps = tripSteps(trip);
    if(steps.some(function(x){ return !x.done; })){
      html += '<div class="card"><h2>'+(trip.ended ? "After offload" : "Before you start fishing")+'</h2>'+steps.map(function(x){
        return '<div class="row-between" style="padding:7px 0;border-bottom:1px solid var(--line);"><div style="font-size:15px;'+(x.done?'color:var(--text-dim);':'font-weight:700;')+'">'+(x.done?'✓ ':'○ ')+esc(x.label)+(x.sub?'<div class="helptext" style="margin:2px 0 0;">'+esc(x.sub)+'</div>':'')+'</div>'+
          '<button class="btn '+(x.done?'btn-ghost':'btn-accent')+' btn-sm" data-step-go="'+x.key+'">'+(x.done?'Open':'Go')+'</button></div>';
      }).join("")+'</div>';
    }
    if(!trip.ended && !trip.skipperSig) html += '<div class="locked-note"><span>No skipper signature for this trip.</span><button class="btn btn-sm" id="btnSign">Sign</button></div>';
    if(baitLoaded(trip)){
      var bb = baitBalance(trip);
      html += '<div class="card"><div class="row-between"><div><div style="font-weight:800;font-size:17px;">🐟 Bait on board: '+bb+' boxes</div><div class="helptext" style="margin:2px 0 0;">'+
        (trip.bait.boxKg ? kg(bb*num(trip.bait.boxKg))+' kg · ' : '')+'loaded '+baitSum(trip,"load")+(baitSum(trip,"received")?' · received '+baitSum(trip,"received"):'')+' · used '+baitSum(trip,"used")+'</div></div>'+
        (trip.ended ? '' : '<button class="btn btn-ghost btn-sm" id="btnBaitRecv">+ Received</button>')+'</div></div>';
    }
    html += '<div class="actions">'+
      '<button class="btn btn-ghost" id="btnCrew">👥 Crew ('+trip.crew.length+')</button>'+
      '<button class="btn btn-ghost" id="btnWeights">⚖ Weights ('+trip.weights.length+')</button>'+
      '<button class="btn btn-ghost" id="btnTanks">🧊 Tanks</button>'+
      '<button class="btn btn-ghost" id="btnReports">📄 Reports</button>'+
      '<button class="btn btn-ghost" id="btnTripEdit">✎ Trip details</button>'+
      (trip.ended ? '<span></span>' : '<button class="btn btn-ghost" id="btnEnd">⚓ End trip</button>')+
      '</div>';
    var dates = tripDates(trip).slice().reverse();
    if(!dates.length) html += '<div class="empty"><div class="big">📍</div>No stops yet.<br>Tap <b>Log stop</b> each time you stop on fish.</div>';
    var running = {}; // trip running total after each stop
    var acc = 0;
    sortedStops(trip).forEach(function(s){ acc += int(s.alb); running[s.id] = acc; });
    dates.forEach(function(d){
      var list = stopsOn(trip, d);
      var info = dayInfo(trip, d);
      var hdone = trip.haccp[d] && trip.haccp[d].doneAt;
      html += '<div class="dayhead"><div><div class="d">'+esc(fmtDay(d))+'</div><div class="s">'+list.length+' stops · '+sumOf(list,"alb")+' LF'+(sumOf(list,"yft")?' · '+sumOf(list,"yft")+' YFT':'')+(otherTotal(list)?' · '+otherTotal(list)+' other':'')+(info.sst?' · SST '+esc(info.sst):'')+'</div>'+
        (hasWeather(trip,d)?'<div class="s">🌬 '+esc(weatherText(trip.days[d])||trip.days[d].wxNote)+'</div>':'')+'</div>'+
        '<button class="btn btn-ghost btn-sm" data-day="'+d+'">Day ▾</button></div>'+
        (list.length ? (dayEnded(trip,d)
          ? '<div class="btnrow" style="margin-bottom:8px;"><button class="btn btn-ghost btn-sm" data-dayrep="'+d+'">📄 Day report</button><button class="btn btn-ghost btn-sm" data-daytext="'+d+'">💬 Day text</button></div>'
          : '<button class="btn btn-outline btn-sm" data-endday="'+d+'" style="width:100%;margin-bottom:8px;border-color:var(--yellow);color:var(--yellow);">🌙 End of day — bait, HACCP, report</button>') : '');
      var dayAcc = 0;
      list.forEach(function(s){
        dayAcc += int(s.alb);
        var cond = [];
        if(s.sst) cond.push(s.sst+"°C");
        if(s.windDir || s.windKn) cond.push((s.windDir||"")+" "+(s.windKn||"")+"kn");
        if(s.sea) cond.push(s.sea);
        if(s.schoolDepth) cond.push(s.schoolDepth+"m");
        if(s.tank) cond.push("tank "+s.tank);
        html += '<div class="stoprow" data-stop="'+s.id+'"><div class="tm">'+esc(s.time||"--:--")+'</div><div><div class="pos">'+esc(fmtPos(s.lat,s.lon))+'</div>'+
          (cond.length?'<div class="cond">'+esc(cond.join(" · "))+'</div>':'')+(s.notes?'<div class="cond">'+esc(s.notes)+'</div>':'')+
          '</div><div class="fish"><div class="a">'+int(s.alb)+(int(s.yft)?' <span class="tag yf">+'+int(s.yft)+' YF</span>':'')+'</div>'+
          (extrasText(s).length?'<div class="r">'+esc(extrasText(s).join(" "))+'</div>':'')+'<div class="r">'+dayAcc+' / '+running[s.id]+'</div></div></div>';
      });
    });
    el.innerHTML = html;
    wireBack(function(){ go("trips", null); });
    document.getElementById("btnCrew").onclick = function(){ go("crew"); };
    document.getElementById("btnWeights").onclick = function(){ go("weights"); };
    document.getElementById("btnReports").onclick = function(){ go("reports"); };
    document.getElementById("btnTanks").onclick = function(){ openTanksSheet(trip); };
    document.getElementById("btnTripEdit").onclick = function(){ if(lockedGuard(trip)) return; openTripSheet(trip); };
    var be = document.getElementById("btnEnd"); if(be) be.onclick = function(){ openEndTripSheet(trip); };
    var br = document.getElementById("btnReopen"); if(br) br.onclick = function(){
      if(openTrip()){ showToast("End the trip that's at sea first", true); return; }
      showConfirm("Reopen "+tripLabel(trip)+" so it can be changed?", "Reopen", "btn-accent", function(){ trip.ended = false; saveState(); render(); });
    };
    el.querySelectorAll("[data-day]").forEach(function(b){ b.onclick = function(){ openDayMenu(trip, b.getAttribute("data-day")); }; });
    el.querySelectorAll("[data-endday]").forEach(function(b){ b.onclick = function(){ startEndOfDay(trip, b.getAttribute("data-endday")); }; });
    el.querySelectorAll("[data-dayrep]").forEach(function(b){ b.onclick = function(){ buildDayReportPdf(trip, b.getAttribute("data-dayrep")); }; });
    el.querySelectorAll("[data-daytext]").forEach(function(b){ b.onclick = function(){ shareDayText(trip, b.getAttribute("data-daytext")); }; });
    el.querySelectorAll("[data-step-go]").forEach(function(b){ b.onclick = function(){ runStep(trip, b.getAttribute("data-step-go")); }; });
    var brc = document.getElementById("btnBaitRecv"); if(brc) brc.onclick = function(){ openBaitReceivedSheet(trip); };
    var sg = document.getElementById("btnSign"); if(sg) sg.onclick = function(){ captureSkipperSig(trip); };
    el.querySelectorAll("[data-stop]").forEach(function(r){ r.onclick = function(){ openStopSheet(trip, trip.stops.find(function(s){ return s.id===r.getAttribute("data-stop"); })); }; });
    var fab = document.getElementById("fab");
    var next = steps.find(function(x){ return !x.done; });
    if(!trip.ended){
      var todayStops = stopsOn(trip, today).length;
      if(next){
        // Setup isn't finished: the big button is the next step; a stop can still be logged.
        fab.innerHTML = '<div class="btnrow"><button class="btn btn-ghost" id="btnLogStop" style="flex:0 0 34%;min-height:72px;">📍 Stop</button><button class="btn btn-accent btn-big" id="btnNext">NEXT: '+esc(next.short)+'</button></div>';
      } else if(todayStops && !dayEnded(trip, today)){
        fab.innerHTML = '<div class="btnrow"><button class="btn btn-accent btn-big" id="btnLogStop">📍 LOG STOP</button><button class="btn btn-ghost" id="btnEndDay" style="flex:0 0 34%;min-height:72px;">🌙 End day</button></div>';
      } else {
        fab.innerHTML = '<button class="btn btn-accent btn-big" id="btnLogStop">📍 LOG STOP</button>';
      }
    } else if(next){
      fab.innerHTML = '<button class="btn btn-accent btn-big" id="btnNext">NEXT: '+esc(next.short)+'</button>';
    }
    if(fab.innerHTML){
      fab.classList.remove("hidden");
      var ls = document.getElementById("btnLogStop"); if(ls) ls.onclick = function(){ openStopSheet(trip, null); };
      var nx = document.getElementById("btnNext"); if(nx) nx.onclick = function(){ runStep(trip, next.key); };
      var ed = document.getElementById("btnEndDay"); if(ed) ed.onclick = function(){ startEndOfDay(trip, today); };
    }
  }
  // The order a trip is worked through. Before the trip ends: crew, contracts,
  // bait. After it ends: offloading temperatures, weigh sheet, reports.
  function tripSteps(trip){
    if(!trip.ended){
      var crew = crewOnly(trip);
      var signed = crew.filter(function(c){ return trip.contracts[c.id]; }).length;
      return [
        { key:"departure", label:"Departure check (bait, VMS, permit, fuel, water, RSW, FCO)", short:"Departure check", done: !!trip.departure.doneAt, sub: trip.departure.doneAt ? "done "+fmtTime(trip.departure.doneAt) : (trip.departure.fcoAt ? "FCO notified" : "") },
        { key:"crew", label:"Crew list", short:"Crew list", done: !!(trip.crewConfirmedAt && trip.crew.length), sub: trip.crew.length ? personsOnBoard(trip)+" on board incl. skipper"+(trip.crewConfirmedAt?"":" — not confirmed") : "" },
        { key:"contracts", label:"Crew contracts signed", short:"Contracts", done: !!trip.crewConfirmedAt && signed===crew.length, sub: crew.length ? signed+" of "+crew.length+" signed" : "" }
      ];
    }
    var offDone = Object.keys(trip.haccp).length>0 && Object.keys(trip.haccp).every(function(d){ return trip.haccp[d].fish.every(function(f){ return f.tOff; }); });
    var wsDone = trip.weights.length>0;
    return [
      { key:"landing", label:"Landing notice to FCO", short:"Landing notice", done: !!trip.landing.fcoAt, sub: trip.landing.fcoAt ? "sent "+fmtTime(trip.landing.fcoAt)+" by "+trip.landing.fcoHow : "" },
      { key:"offtemps", label:"Offloading temperatures", short:"Offload temps", done: offDone },
      { key:"weights", label:"Weigh sheet", short:"Weigh sheet", done: wsDone, sub: trip.weights.length ? trip.weights.length+" fish weighed" : "" },
      { key:"reports", label:"Reports", short:"Reports", done: !!trip.reportsAt }
    ];
  }
  function runStep(trip, key){
    if(key==="crew") go("crew");
    else if(key==="contracts") go("contracts");
    else if(key==="bait") openDepartureSheet(trip);
    else if(key==="departure") openDepartureSheet(trip);
    else if(key==="landing") openLandingSheet(trip);
    else if(key==="offtemps") openOffloadTemps(trip);
    else if(key==="weights") go("weights");
    else if(key==="reports"){ trip.reportsAt = trip.reportsAt || new Date().toISOString(); saveState(); go("reports"); }
  }

  // ================= Bait =================
  function baitSum(trip, type, date){ return trip.bait.entries.filter(function(e){ return e.type===type && (!date || e.date===date); }).reduce(function(a,e){ return a+num(e.boxes); }, 0); }
  function baitLoaded(trip){ return trip.bait.entries.some(function(e){ return e.type==="load"; }); }
  function baitBalance(trip, uptoDate){
    return trip.bait.entries.filter(function(e){ return !uptoDate || e.date<=uptoDate; }).reduce(function(a,e){ return a + (e.type==="used" ? -num(e.boxes) : num(e.boxes)); }, 0);
  }
  function openBaitLoadSheet(trip){
    if(lockedGuard(trip)) return;
    var load = trip.bait.entries.find(function(e){ return e.type==="load"; });
    var sh = openSheet('<h2>Bait on board</h2><p class="helptext" style="margin:0 0 8px;">Boxes loaded before sailing.</p>'+
      '<div class="grid2">'+field("Boxes", "bLoad", load ? load.boxes : "", "text", 'inputmode="numeric"')+field("kg per box", "bKg", trip.bait.boxKg, "text", 'inputmode="decimal"')+'</div>'+
      field("Bait type (optional)", "bType", trip.bait.baitType, "text", 'placeholder="e.g. pilchard"')+
      '<div class="sheet-foot"><button class="btn btn-outline" data-a="cancel">Cancel</button><button class="btn btn-accent" data-a="save">Save</button></div>');
    sh.sheet.querySelector('[data-a="cancel"]').onclick = sh.close;
    sh.sheet.querySelector('[data-a="save"]').onclick = function(){
      var n = num(val(sh.sheet,"bLoad"));
      if(!(n>0)){ showToast("Enter the number of boxes", true); return; }
      if(load) load.boxes = String(n);
      else trip.bait.entries.push({ id:uid(), type:"load", date: trip.sailDate || todayISO(), boxes:String(n), note:"" });
      trip.bait.boxKg = val(sh.sheet,"bKg"); trip.bait.baitType = val(sh.sheet,"bType");
      saveState(); sh.close(); render(); showToast(n+" boxes of bait on board");
    };
  }
  function openBaitReceivedSheet(trip){
    if(lockedGuard(trip)) return;
    var sh = openSheet('<h2>Bait received</h2><p class="helptext" style="margin:0 0 8px;">Boxes taken on during the trip.</p>'+
      '<div class="grid2">'+field("Boxes", "bRecv", "", "text", 'inputmode="numeric"')+field("Date", "bDate", todayISO(), "date")+'</div>'+
      field("From (optional)", "bNote", "", "text", 'placeholder="e.g. another vessel"')+
      '<div class="sheet-foot"><button class="btn btn-outline" data-a="cancel">Cancel</button><button class="btn btn-accent" data-a="save">Add</button></div>');
    sh.sheet.querySelector('[data-a="cancel"]').onclick = sh.close;
    sh.sheet.querySelector('[data-a="save"]').onclick = function(){
      var n = num(val(sh.sheet,"bRecv")); if(!(n>0)){ showToast("Enter the number of boxes", true); return; }
      trip.bait.entries.push({ id:uid(), type:"received", date: val(sh.sheet,"bDate") || todayISO(), boxes:String(n), note: val(sh.sheet,"bNote") });
      saveState(); sh.close(); render(); showToast("+"+n+" boxes · "+baitBalance(trip)+" on board");
    };
  }
  function openBaitUsedSheet(trip, date, after){
    var used = trip.bait.entries.find(function(e){ return e.type==="used" && e.date===date; });
    var before = baitBalance(trip, date) + (used ? num(used.boxes) : 0);
    var sh = openSheet('<h2>Bait used — '+esc(fmtDay(date))+'</h2>'+
      '<p class="sheet-text">On board: <b>'+before+' boxes</b>'+(baitSum(trip,"received",date)?' (incl. '+baitSum(trip,"received",date)+' received today)':'')+'</p>'+
      '<div class="counter"><button data-bstep="-1">−</button><input id="bUsed" type="number" inputmode="decimal" min="0" value="'+esc(used ? used.boxes : "")+'" placeholder="0"><button data-bstep="1">+</button></div>'+
      '<p class="sheet-text" id="bLeft" style="margin-top:10px;"></p>'+
      '<div class="sheet-foot"><button class="btn btn-outline" data-a="cancel">Cancel</button><button class="btn btn-accent" data-a="save">'+(after?"Save &amp; next":"Save")+'</button></div>');
    var inp = sh.sheet.querySelector("#bUsed");
    function upd(){ var left = before - num(inp.value); sh.sheet.querySelector("#bLeft").innerHTML = "Balance after today: <b>"+left+" boxes</b>"+(trip.bait.boxKg?" ("+kg(left*num(trip.bait.boxKg))+" kg)":"")+(left<0?' <span style="color:var(--danger)">— more than on board</span>':""); }
    upd(); inp.addEventListener("input", upd);
    sh.sheet.querySelectorAll("[data-bstep]").forEach(function(b){ b.onclick = function(){ inp.value = String(Math.max(0, num(inp.value)+int(b.getAttribute("data-bstep")))); upd(); }; });
    sh.sheet.querySelector('[data-a="cancel"]').onclick = sh.close;
    sh.sheet.querySelector('[data-a="save"]').onclick = function(){
      var n = Math.max(0, num(inp.value));
      if(used) used.boxes = String(n); else trip.bait.entries.push({ id:uid(), type:"used", date:date, boxes:String(n), note:"" });
      saveState(); sh.close();
      if(after) after(); else render();
    };
  }

  // ================= Departure check and FCO notices =================
  function fmtTime(iso){ var d = new Date(iso); return isNaN(d) ? "" : fmtDay(todayISO(d))+" "+pad2(d.getHours())+":"+pad2(d.getMinutes()); }
  function intlNumber(n){ var d = String(n||"").replace(/[^\d+]/g,""); if(/^\+/.test(d)) return d.slice(1); if(/^0\d{9}$/.test(d)) return "27"+d.slice(1); return d; }
  function departureMessage(trip){
    var s = state.settings, dep = trip.departure;
    return ["DEPARTURE NOTIFICATION",
      "Vessel: FV "+String(s.vessel).toUpperCase()+" ("+s.licenceNo+")",
      "Right/permit: "+s.rightNo+" / "+s.permitNo+" — tuna pole-line",
      "Owner: "+s.owner,
      "Skipper: "+s.skipper+" "+s.contact,
      "Departing: "+(s.crewListPort||s.port)+", "+fmtDate(trip.sailDate)+(trip.sailTime?" "+trip.sailTime:""),
      "Trip no.: "+(trip.tripNumber||"—"),
      "Persons on board: "+personsOnBoard(trip)+" (incl. skipper)"+(trip.crewConfirmedAt ? "" : " — crew list not yet confirmed"),
      "Bait on board: "+(baitSum(trip,"load") ? baitSum(trip,"load")+" boxes"+(trip.bait.baitType?" "+trip.bait.baitType:"") : "—"),
      "VMS: "+(dep.vmsOnAt ? "on and transmitting"+(dep.vmsConfirmedAt?", position confirmed":"") : "—"),
      "Fishing area: "+(s.fishingArea||"—")].join("\n");
  }
  function landingMessage(trip){
    var s = state.settings, l = trip.landing;
    var catchTxt = dffeSpecies(trip).map(function(sp){ var n = sumSp(trip.stops, sp.code); return n ? n+" "+sp.name : ""; }).filter(Boolean).join(", ") || "none";
    var avg = weightStats(trip,"ALB");
    return ["LANDING NOTIFICATION",
      "Vessel: FV "+String(s.vessel).toUpperCase()+" ("+s.licenceNo+")",
      "Right/permit: "+s.rightNo+" / "+s.permitNo,
      "Skipper: "+s.skipper+" "+s.contact,
      "Trip no.: "+(trip.tripNumber||"—")+", sailed "+fmtDate(trip.sailDate),
      "ETA: "+(l.port||s.crewListPort||s.port)+", "+fmtDate(l.eta)+(l.etaTime?" "+l.etaTime:""),
      "Catch on board (count): "+catchTxt,
      "Persons on board: "+personsOnBoard(trip)].join("\n");
  }
  // Opens WhatsApp, SMS or email with the message filled in.
  function sendNotice(how, subject, text){
    var s = state.settings, url = "";
    if(how==="WhatsApp"){
      var n = intlNumber(s.fcoPhone);
      url = "https://wa.me/"+(n||"")+"?text="+encodeURIComponent(text);
    } else if(how==="SMS"){
      url = "sms:"+String(s.fcoPhone||"").replace(/\s/g,"")+"?body="+encodeURIComponent(text);
    } else {
      url = "mailto:"+encodeURIComponent(s.fcoEmail||"")+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(text);
    }
    window.__lastNoticeUrl = url; // for the browser tests
    try{ window.open(url, "_system"); }catch(e){ location.href = url; }
  }
  function noticeButtons(prefix){
    var s = state.settings;
    return '<div class="btnrow" style="flex-wrap:wrap;">'+
      '<button class="btn btn-success btn-sm" data-send="WhatsApp" style="flex:1;">WhatsApp</button>'+
      '<button class="btn btn-ghost btn-sm" data-send="SMS" style="flex:1;">SMS</button>'+
      '<button class="btn btn-ghost btn-sm" data-send="Email" style="flex:1;">Email</button></div>'+
      (!s.fcoPhone && !s.fcoEmail ? '<p class="helptext" style="color:var(--yellow);">Add the FCO\'s number and email in menu → Vessel &amp; form details.</p>' : '<p class="helptext">To: '+esc([s.fcoName, s.fcoPhone, s.fcoEmail].filter(Boolean).join(" · "))+'</p>');
  }
  function tick(name, label, at, sub){
    return '<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--line);"><div><div style="font-size:16px;font-weight:700;">'+esc(label)+'</div>'+
      (sub?'<div class="helptext" style="margin:2px 0 0;">'+esc(sub)+'</div>':'')+'</div>'+
      '<div class="chip'+(at?" on":"")+'" data-tick="'+name+'" style="min-width:96px;">'+(at?"✓ "+esc(fmtTime(at).slice(-5)):"Tick")+'</div></div>';
  }
  function openDepartureSheet(trip){
    if(lockedGuard(trip)) return;
    var d = Object.assign({}, trip.departure);
    var load0 = trip.bait.entries.find(function(e){ return e.type==="load"; });
    var bait = { boxes: load0 ? load0.boxes : "", kg: trip.bait.boxKg, type: trip.bait.baitType };
    // Bait loaded is kept as the trip's "load" entry so the balance works from it.
    function saveBait(){
      var load = trip.bait.entries.find(function(e){ return e.type==="load"; });
      var n = num(bait.boxes);
      if(n>0){ if(load) load.boxes = String(n); else trip.bait.entries.push({ id:uid(), type:"load", date: trip.sailDate || todayISO(), boxes:String(n), note:"" }); }
      else if(load && bait.boxes==="") trip.bait.entries = trip.bait.entries.filter(function(e){ return e!==load; });
      trip.bait.boxKg = bait.kg; trip.bait.baitType = bait.type;
    }
    var sh = openSheet('<h2>Departure check</h2><div id="depBody"></div>'+
      '<div class="sheet-foot"><button class="btn btn-outline" data-a="cancel">Close</button><button class="btn btn-accent" data-a="done">Ready to sail</button></div>');
    var root = sh.sheet;
    function body(){
      root.querySelector("#depBody").innerHTML =
        '<div class="sectionlabel">Bait on board</div>'+
        '<div class="grid3">'+field("Boxes", "dBaitBoxes", bait.boxes, "text", 'inputmode="numeric"')+field("kg per box", "dBaitKg", bait.kg, "text", 'inputmode="decimal"')+field("Bait type", "dBaitType", bait.type, "text", 'placeholder="pilchard"')+'</div>'+
        '<div class="sectionlabel">VMS</div>'+
        tick("vmsOnAt", "VMS on and transmitting", d.vmsOnAt)+
        tick("vmsConfirmedAt", "VMS position checked / confirmed", d.vmsConfirmedAt, state.settings.vmsProvider ? "with "+state.settings.vmsProvider : "")+
        field("How confirmed (optional)", "dVmsHow", d.vmsHow, "text", 'placeholder="e.g. phoned provider, portal"')+
        '<div class="sectionlabel">Vessel</div>'+
        tick("permitAt", "Permit / licence on board", d.permitAt)+
        tick("rswAt", "RSW system running", d.rswAt)+
        '<div class="grid3" style="margin-top:8px;">'+field("RSW temp °C", "dRsw", d.rswTemp, "text", 'inputmode="decimal"')+field("Fuel (litres)", "dFuel", d.fuel, "text", 'inputmode="numeric"')+field("Water (litres)", "dWater", d.water, "text", 'inputmode="numeric"')+'</div>'+
        '<div class="sectionlabel">Notify the Fishery Control Officer</div>'+
        (d.fcoAt ? '<div class="card" style="border-color:var(--kelp);margin-bottom:8px;"><b style="color:var(--kelp);">✓ Notified '+esc(fmtTime(d.fcoAt))+' by '+esc(d.fcoHow)+'</b></div>' : '')+
        '<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;background:var(--surface-2);border-radius:10px;padding:10px;margin:0 0 8px;">'+esc(departureMessage(Object.assign({}, trip, { departure:d })))+'</pre>'+
        noticeButtons()+
        field("Reference / who you spoke to (optional)", "dRef", d.fcoRef);
    }
    function grab(){ bait.boxes = val(root,"dBaitBoxes"); bait.kg = val(root,"dBaitKg"); bait.type = val(root,"dBaitType"); d.vmsHow = val(root,"dVmsHow"); d.rswTemp = val(root,"dRsw"); d.fuel = val(root,"dFuel"); d.water = val(root,"dWater"); d.fcoRef = val(root,"dRef"); }
    body();
    root.addEventListener("change", function(e){ if(/^dBait/.test(e.target.id)){ grab(); saveBait(); saveState(); var pre = root.querySelector("pre"); if(pre) pre.textContent = departureMessage(Object.assign({}, trip, { departure:d })); } });
    root.addEventListener("click", function(e){
      var t = e.target.closest("[data-tick]");
      if(t){ grab(); var k = t.getAttribute("data-tick"); d[k] = d[k] ? "" : new Date().toISOString(); body(); return; }
      var b = e.target.closest("[data-send]");
      if(b){
        grab(); saveBait();
        var how = b.getAttribute("data-send");
        sendNotice(how, "Departure notification – FV "+state.settings.vessel+" – "+fmtDate(trip.sailDate), departureMessage(Object.assign({}, trip, { departure:d })));
        d.fcoAt = new Date().toISOString(); d.fcoHow = how;
        saveBait(); trip.departure = textFields(Object.assign({}, d), DEP_TEXT); saveState(); body();
      }
    });
    function save(){ grab(); saveBait(); trip.departure = textFields(Object.assign({}, d), DEP_TEXT); saveState(); }
    root.querySelector('[data-a="cancel"]').onclick = function(){ save(); sh.close(); render(); };
    root.querySelector('[data-a="done"]').onclick = function(){
      grab();
      var missing = [];
      if(!(num(bait.boxes)>0)) missing.push("bait on board");
      if(!d.vmsOnAt) missing.push("VMS on"); if(!d.vmsConfirmedAt) missing.push("VMS confirmed"); if(!d.permitAt) missing.push("permit on board");
      if(!d.rswAt) missing.push("RSW running"); if(!d.fuel) missing.push("fuel"); if(!d.water) missing.push("water"); if(!d.fcoAt) missing.push("FCO notified");
      function finish(){
        d.doneAt = new Date().toISOString(); saveBait(); trip.departure = textFields(Object.assign({}, d), DEP_TEXT); saveState(); sh.close();
        if(!trip.crewConfirmedAt){ go("crew"); showToast("Departure check done — now the crew list"); }
        else { render(); showToast("Departure check done — safe trip"); }
      }
      if(missing.length) showConfirm("Not done yet: "+missing.join(", ")+".\n\nSail anyway?", "Sail anyway", "btn-danger", finish); else finish();
    };
  }
  function openLandingSheet(trip){
    var l = Object.assign({}, trip.landing);
    if(!l.eta) l.eta = todayISO();
    if(!l.port) l.port = state.settings.crewListPort || state.settings.port;
    var sh = openSheet('<h2>Landing notice</h2><div id="landBody"></div>'+
      '<div class="sheet-foot"><button class="btn btn-accent" data-a="close">Close</button></div>');
    var root = sh.sheet;
    function grab(){ l.eta = val(root,"lEta"); l.etaTime = val(root,"lTime"); l.port = val(root,"lPort"); l.fcoRef = val(root,"lRef"); }
    function body(){
      root.querySelector("#landBody").innerHTML =
        '<div class="grid2">'+field("Arrival date", "lEta", l.eta, "date")+field("Arrival time", "lTime", l.etaTime, "time")+'</div>'+
        field("Landing port", "lPort", l.port)+
        (l.fcoAt ? '<div class="card" style="border-color:var(--kelp);margin-bottom:8px;"><b style="color:var(--kelp);">✓ Sent '+esc(fmtTime(l.fcoAt))+' by '+esc(l.fcoHow)+'</b></div>' : '')+
        '<pre id="landMsg" style="white-space:pre-wrap;font-family:inherit;font-size:13px;background:var(--surface-2);border-radius:10px;padding:10px;margin:0 0 8px;">'+esc(landingMessage(Object.assign({}, trip, { landing:l })))+'</pre>'+
        noticeButtons()+field("Reference / who you spoke to (optional)", "lRef", l.fcoRef);
    }
    body();
    root.addEventListener("change", function(e){ if(/^l(Eta|Time|Port)$/.test(e.target.id)){ grab(); root.querySelector("#landMsg").textContent = landingMessage(Object.assign({}, trip, { landing:l })); } });
    root.addEventListener("click", function(e){
      var b = e.target.closest("[data-send]"); if(!b) return;
      grab();
      var how = b.getAttribute("data-send");
      sendNotice(how, "Landing notification – FV "+state.settings.vessel+" – ETA "+fmtDate(l.eta), landingMessage(Object.assign({}, trip, { landing:l })));
      l.fcoAt = new Date().toISOString(); l.fcoHow = how;
      trip.landing = textFields(Object.assign({}, l), LAND_TEXT); saveState(); body();
    });
    root.querySelector('[data-a="close"]').onclick = function(){ grab(); trip.landing = textFields(Object.assign({}, l), LAND_TEXT); saveState(); sh.close(); render(); };
  }
  function buildDepartureRecordPdf(trip){
    if(!window.jspdf){ showToast("PDF library missing", true); return; }
    var s = state.settings, d = trip.departure, l = trip.landing;
    var doc = new window.jspdf.jsPDF({ unit:"mm", format:"a4" });
    var L = 18, y = 18;
    doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.text("DEPARTURE & LANDING RECORD — FV "+String(s.vessel).toUpperCase(), 105, y, { align:"center" }); y += 7;
    doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.text(tripLabel(trip)+"  ·  "+s.licenceNo+"  ·  Skipper "+s.skipper, 105, y, { align:"center" }); y += 10;
    function row(k, v){ doc.setFont("helvetica","bold"); doc.text(k, L, y); doc.setFont("helvetica","normal"); doc.text(String(v||"—"), L+62, y); y += 6.5; }
    function hd(t){ y += 3; doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.text(t, L, y); doc.setFontSize(10); y += 7; }
    hd("Departure check");
    row("Departure", fmtDate(trip.sailDate)+(trip.sailTime?" "+trip.sailTime:"")+", "+(s.crewListPort||s.port));
    row("VMS on and transmitting", d.vmsOnAt ? "Yes — "+fmtTime(d.vmsOnAt) : "No");
    row("VMS position confirmed", d.vmsConfirmedAt ? "Yes — "+fmtTime(d.vmsConfirmedAt)+(d.vmsHow?" ("+d.vmsHow+")":"") : "No");
    row("Permit / licence on board", d.permitAt ? "Yes — "+fmtTime(d.permitAt) : "No");
    row("RSW running", d.rswAt ? "Yes — "+fmtTime(d.rswAt)+(d.rswTemp?", "+d.rswTemp+" °C":"") : "No");
    row("Fuel on board", d.fuel ? d.fuel+" L" : "");
    row("Water on board", d.water ? d.water+" L" : "");
    row("Persons on board", personsOnBoard(trip)+" incl. skipper");
    row("FCO notified", d.fcoAt ? fmtTime(d.fcoAt)+" by "+d.fcoHow+(d.fcoRef?" — "+d.fcoRef:"") : "No");
    hd("Landing notice");
    row("ETA", l.eta ? fmtDate(l.eta)+(l.etaTime?" "+l.etaTime:"")+", "+(l.port||"") : "");
    row("FCO notified", l.fcoAt ? fmtTime(l.fcoAt)+" by "+l.fcoHow+(l.fcoRef?" — "+l.fcoRef:"") : "No");
    row("Fishery Control Officer", [s.fcoName, s.fcoPhone, s.fcoEmail].filter(Boolean).join(", "));
    y += 14; doc.text("Skipper:", L, y); sigOnPdf(doc, trip, L+18, y+1, 40); doc.line(L+18, y+1, L+70, y+1);
    saveFileOut(fileName(trip, "departure_landing", "pdf"), doc.output("blob"));
  }

  // ================= End of day =================
  function dayEnded(trip, date){ return !!(trip.days[date] && trip.days[date].endedAt); }
  // Bait used -> HACCP check -> day report, one after the other.
  function startEndOfDay(trip, date){
    if(lockedGuard(trip)) return;
    function haccp(){ openHaccpSheet(trip, date, report); }
    function report(){
      var day = trip.days[date] || textFields({}, DAY_TEXT);
      day.endedAt = new Date().toISOString(); trip.days[date] = textFields(day, DAY_TEXT);
      saveState(); render(); openDayReportSheet(trip, date);
    }
    if(baitLoaded(trip)) openBaitUsedSheet(trip, date, haccp); else haccp();
  }
  function openDayReportSheet(trip, date){
    var sh = openSheet('<h2>Day report — '+esc(fmtDay(date))+'</h2><pre style="white-space:pre-wrap;font-family:inherit;font-size:15px;line-height:1.5;margin:0 0 12px;">'+esc(dayText(trip, date))+'</pre>'+
      '<div class="sheet-actions"><button class="btn btn-accent" data-a="pdf">📄 Share day report (PDF)</button><button class="btn btn-ghost" data-a="text">💬 Send as text</button><button class="btn btn-outline" data-a="done">Done</button></div>');
    sh.sheet.querySelector('[data-a="pdf"]').onclick = function(){ buildDayReportPdf(trip, date); };
    sh.sheet.querySelector('[data-a="text"]').onclick = function(){ shareDayText(trip, date); };
    sh.sheet.querySelector('[data-a="done"]').onclick = sh.close;
  }
  function daySummary(trip, date){
    var list = stopsOn(trip, date);
    var sps = allSpecies().filter(function(sp){ return sumSp(list, sp.code); });
    var best = list.slice().sort(function(a,b){ return int(b.alb)-int(a.alb); })[0];
    var h = trip.haccp[date];
    var issues = [];
    if(h){
      Object.keys(h.san).forEach(function(q){ if(h.san[q]==="N") issues.push(q+": No"); });
      h.fish.forEach(function(f){ FISH_FIELDS.forEach(function(x){ if(x.yn && f[x.k] && f[x.k]!==x.yn) issues.push(speciesOf(f.sp).short+" "+x.label.replace("?","")+": "+(f[x.k]==="Y"?"Yes":"No")); }); });
    }
    return { list:list, sps:sps, best:best, info:dayInfo(trip, date), haccp:h, issues:issues,
      used: baitSum(trip,"used",date), received: baitSum(trip,"received",date), balance: baitBalance(trip, date) };
  }
  function dayText(trip, date){
    var d = daySummary(trip, date), s = state.settings, L = [];
    L.push("FV "+String(s.vessel).toUpperCase()+" – "+tripLabel(trip)+" – "+fmtDay(date)+" "+date.slice(0,4));
    L.push("Stops: "+d.list.length+(d.list.length ? " ("+d.list[0].time+"–"+d.list[d.list.length-1].time+")" : ""));
    L.push("Catch: "+(d.sps.length ? d.sps.map(function(sp){ return sumSp(d.list, sp.code)+" "+sp.short; }).join(", ") : "none"));
    L.push("Trip total: "+dffeSpecies(trip).map(function(sp){ return sumSp(trip.stops, sp.code)+" "+sp.short; }).filter(function(x){ return !/^0 /.test(x); }).join(", "));
    if(d.best && int(d.best.alb)) L.push("Best stop: "+d.best.alb+" LF at "+d.best.time+", "+fmtPos(d.best.lat, d.best.lon));
    if(hasWeather(trip, date)) L.push("Weather: "+(weatherText(trip.days[date]) || trip.days[date].wxNote));
    if(d.info.sst) L.push("SST: "+d.info.sst+" °C");
    if(baitLoaded(trip)) L.push("Bait: used "+d.used+(d.received?", received "+d.received:"")+", on board "+d.balance+" boxes"+(trip.bait.boxKg?" ("+kg(d.balance*num(trip.bait.boxKg))+" kg)":""));
    L.push("HACCP: "+(d.haccp && d.haccp.doneAt ? (d.issues.length ? "done – "+d.issues.join("; ") : "done, all OK") : "not done"));
    return L.join("\n");
  }
  function shareDayText(trip, date){
    var text = dayText(trip, date);
    try{
      var Share = isNativeApp() && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
      if(Share && Share.share){ Share.share({ text:text, title:"Day report "+fmtDay(date) }).catch(function(){}); return; }
    }catch(e){}
    // Off the phone: show it to copy.
    var sh = openSheet('<h2>Day report text</h2><textarea id="dayTxt" style="width:100%;min-height:240px;font-size:15px;background:var(--surface-2);color:var(--text);border-radius:10px;padding:10px;border:1px solid var(--line);">'+esc(text)+'</textarea>'+
      '<div class="sheet-foot"><button class="btn btn-outline" data-a="close">Close</button><button class="btn btn-accent" data-a="copy">Copy</button></div>');
    sh.sheet.querySelector('[data-a="close"]').onclick = sh.close;
    sh.sheet.querySelector('[data-a="copy"]').onclick = function(){
      var ta = sh.sheet.querySelector("#dayTxt"); ta.select();
      try{ (navigator.clipboard && navigator.clipboard.writeText) ? navigator.clipboard.writeText(text) : document.execCommand("copy"); showToast("Copied"); }catch(e){ showToast("Select the text and copy it", true); }
    };
  }
  function buildDayReportPdf(trip, date){
    if(!window.jspdf){ showToast("PDF library missing", true); return; }
    var d = daySummary(trip, date), s = state.settings;
    var doc = new window.jspdf.jsPDF({ unit:"mm", format:"a4" });
    var W = 210, L = 14, y = 16;
    doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.text("DAILY REPORT — FV "+String(s.vessel).toUpperCase(), W/2, y, { align:"center" }); y += 7;
    doc.setFontSize(11); doc.setFont("helvetica","normal");
    doc.text(fmtDay(date)+" "+date.slice(0,4)+"   ·   "+tripLabel(trip)+"   ·   Skipper "+s.skipper, W/2, y, { align:"center" }); y += 9;
    var info = [];
    if(hasWeather(trip, date)) info.push(["Weather", (weatherText(trip.days[date]) || trip.days[date].wxNote)+(trip.days[date].wxTime?" ("+trip.days[date].wxTime+")":"")]);
    if(d.info.sst) info.push(["SST", d.info.sst+" °C"]);
    info.push(["Catch today", d.sps.length ? d.sps.map(function(sp){ return sumSp(d.list, sp.code)+" "+sp.name; }).join(", ") : "none"]);
    info.push(["Trip total", dffeSpecies(trip).map(function(sp){ return sumSp(trip.stops, sp.code)+" "+sp.name; }).join(", ")]);
    if(baitLoaded(trip)) info.push(["Bait", "used "+d.used+(d.received?", received "+d.received:"")+", on board "+d.balance+" boxes"+(trip.bait.boxKg?" ("+kg(d.balance*num(trip.bait.boxKg))+" kg)":"")]);
    info.push(["HACCP", d.haccp && d.haccp.doneAt ? (d.issues.length ? "done – needs attention: "+d.issues.join("; ") : "done, all OK") : "not done"]);
    info.forEach(function(r){
      doc.setFont("helvetica","bold"); doc.text(r[0]+":", L, y); doc.setFont("helvetica","normal");
      var l = doc.splitTextToSize(r[1], W-2*L-30); doc.text(l, L+30, y); y += l.length*5+1.5;
    });
    y += 4;
    var cols = [["Time",16],["Position",44],["Tank",13]].concat(d.sps.map(function(sp){ return [sp.short,15]; }), [["Day LF",17],["SST",14],["Wind",24],["Depth",15]]);
    var x = L;
    cols.forEach(function(c){ cellText(doc, c[0], x, y, c[1], 7, { bold:true, fill:[225,232,230], size:8.5 }); x += c[1]; });
    y += 7;
    var acc = 0;
    d.list.forEach(function(st){
      if(y > 270){ doc.addPage(); y = 16; }
      acc += int(st.alb);
      var vals = [st.time, fmtPos(st.lat, st.lon), st.tank].concat(d.sps.map(function(sp){ return countOf(st, sp.code) || ""; }), [acc, st.sst, ((st.windDir||"")+" "+(st.windKn||"")).trim(), st.schoolDepth ? st.schoolDepth+" m" : ""]);
      x = L; cols.forEach(function(c, j){ cellText(doc, vals[j], x, y, c[1], 6.5, { size:8.5 }); x += c[1]; }); y += 6.5;
    });
    x = L; cols.forEach(function(c, j){
      var v = j===0 ? "Total" : (j>=3 && j<3+d.sps.length) ? sumSp(d.list, d.sps[j-3].code) : "";
      cellText(doc, v, x, y, c[1], 7, { bold:true, size:8.5 }); x += c[1];
    });
    y += 16;
    doc.setFontSize(10); doc.text("Skipper:", L, y); sigOnPdf(doc, trip, L+18, y+1, 40); doc.line(L+18, y+1, L+70, y+1);
    saveFileOut(fileName(trip, "day_report_"+date.replace(/-/g,""), "pdf"), doc.output("blob"));
  }
  function lockedGuard(trip){
    if(trip.ended){ showToast("This trip is ended — tap Reopen to change it", true); return true; }
    if(storageLocked){ showToast("Saving is paused until the logbook problem is sorted (menu → Backup & restore)", true); return true; }
    return false;
  }

  // ================= Stop sheet =================
  function openStopSheet(trip, stop){
    if(lockedGuard(trip)) return;
    var isNew = !stop;
    // Weather is captured at the start of each day and then used for every
    // stop until it's changed, so ask for it before the day's first stop.
    if(isNew && !hasWeather(trip, todayISO())){
      openWeatherSheet(trip, todayISO(), function(){ openStopSheet(trip, null); });
      return;
    }
    var lastStop = sortedStops(trip).slice(-1)[0];
    var lc = state.lastConditions || {};
    var s0 = stop ? Object.assign({}, stop) : {
      date: todayISO(), time: nowHM(), lat:"", lon:"", gpsNote:"", alb:"", yft:"", other:{},
      tank: lastStop ? lastStop.tank : "",
      sst: lc.sst||"", windDir: lc.windDir||"", windKn: lc.windKn||"", sea: lc.sea||"", driftDir: lc.driftDir||"", driftKn: lc.driftKn||"",
      schoolDepth:"", bait: lc.bait||"", notes:""
    };
    var dirty = false;
    var shown = stopSpeciesCodes().filter(function(c){ return c!=="ALB"; });
    Object.keys(s0.other||{}).forEach(function(k){ if(shown.indexOf(k)<0) shown.push(k); });
    if(int(s0.yft) && shown.indexOf("YFT")<0) shown.unshift("YFT");
    function smallCounter(code){
      var sp = speciesOf(code);
      return '<div class="sectionlabel">'+esc(sp.name)+' ('+esc(sp.short)+')</div>'+
        '<div class="counter small"><button data-step="'+code+':-1">−</button><input data-sp="'+code+'" type="number" inputmode="numeric" min="0" value="'+esc(countOf(s0, code)||"")+'" placeholder="0"><button data-step="'+code+':1">+</button></div>';
    }
    var html =
      '<h2>'+(isNew?"New stop":"Stop "+esc(s0.time))+'</h2>'+
      '<div class="gpsbox" id="gpsBox"><div class="p" id="gpsText"></div><button class="btn btn-ghost btn-sm" id="btnGps">GPS</button></div>'+
      '<div class="sectionlabel">Longfin (LF)</div>'+
      '<div class="counter"><button data-step="ALB:-1">−</button><input id="sAlb" data-sp="ALB" type="number" inputmode="numeric" min="0" value="'+esc(s0.alb)+'" placeholder="0"><button data-step="ALB:1">+</button></div>'+
      '<div class="quick"><button data-step="ALB:5">+5</button><button data-step="ALB:10">+10</button><button data-step="ALB:20">+20</button><button data-step="ALB:50">+50</button></div>'+
      '<div id="spCounters">'+shown.map(smallCounter).join("")+'</div>'+
      '<button class="btn btn-ghost" id="btnOtherSp" style="margin-top:10px;">+ Other species</button>'+
      '<div class="sectionlabel">Tank</div>'+chips("tank", TANKS, s0.tank, "sq")+
      '<details class="more"'+(isNew?'':' open')+'><summary>Conditions (kept until you change them)</summary>'+
        '<div class="grid2">'+field("SST °C", "sSst", s0.sst, "text", 'inputmode="decimal"')+field("School depth (m)", "sDepth", s0.schoolDepth, "text", 'inputmode="numeric"')+'</div>'+
        '<div class="sectionlabel">Wind direction</div>'+chips("windDir", DIRECTIONS, s0.windDir, "sq")+
        '<div class="sectionlabel">Wind (knots)</div>'+chips("windKn", WIND_KN, s0.windKn)+
        '<div class="sectionlabel">Sea</div>'+chips("sea", SEA, s0.sea)+
        '<div class="sectionlabel">Drift / current setting to</div>'+chips("driftDir", DIRECTIONS, s0.driftDir, "sq")+
        '<div class="grid2" style="margin-top:8px;">'+field("Drift (knots)", "sDriftKn", s0.driftKn, "text", 'inputmode="decimal"')+'<div></div></div>'+
        '<div class="sectionlabel">Bait</div>'+chips("bait", BAIT, s0.bait)+
      '</details>'+
      '<details class="more"'+(isNew?'':' open')+'><summary>Time, date and notes</summary>'+
        '<div class="grid2">'+field("Time", "sTime", s0.time, "time")+field("Date", "sDate", s0.date, "date")+'</div>'+
        '<div class="sectionlabel">Position (if GPS failed)</div>'+
        '<div class="grid2">'+field("Lat ° S", "sLatD", s0.lat!==""?degMin(s0.lat).deg:"", "text", 'inputmode="numeric"')+field("Lat min", "sLatM", s0.lat!==""?degMin(s0.lat).min:"", "text", 'inputmode="decimal"')+'</div>'+
        '<div class="grid2">'+field("Lon ° E", "sLonD", s0.lon!==""?degMin(s0.lon).deg:"", "text", 'inputmode="numeric"')+field("Lon min", "sLonM", s0.lon!==""?degMin(s0.lon).min:"", "text", 'inputmode="decimal"')+'</div>'+
        '<div class="field"><label for="sNotes">Notes</label><textarea id="sNotes">'+esc(s0.notes)+'</textarea></div>'+
        (isNew?'':'<button class="btn btn-danger" id="btnDelStop" style="margin-top:6px;">Delete this stop</button>')+
      '</details>'+
      '<div class="sheet-foot"><button class="btn btn-outline" data-a="cancel">Cancel</button><button class="btn btn-accent" data-a="save">Save stop</button></div>';
    var sh = openSheet(html, { guard:function(){ return dirty; } });
    var root = sh.sheet;
    var lat = s0.lat, lon = s0.lon, gpsNote = s0.gpsNote;
    function showGps(st){
      var box = root.querySelector("#gpsBox"), t = root.querySelector("#gpsText");
      box.classList.remove("wait","bad");
      if(st==="wait"){ box.classList.add("wait"); t.innerHTML = "Getting GPS fix…<small>you can carry on entering fish</small>"; return; }
      if(lat!=="" && lon!==""){ t.innerHTML = esc(fmtPos(lat,lon))+"<small>"+(gpsNote?esc(gpsNote):"GPS position")+"</small>"; return; }
      box.classList.add("bad"); t.innerHTML = "No position<small>"+esc(gpsNote||"tap GPS to try again, or type it under Time, date and notes")+"</small>";
    }
    function getFix(){
      showGps("wait");
      captureGeo(function(la, lo, reason){
        if(!root.isConnected) return;
        if(la){ lat = la; lon = lo; gpsNote = ""; fillManual(); }
        else gpsNote = reason;
        showGps();
      });
    }
    function fillManual(){
      var a = degMin(lat), b = degMin(lon);
      root.querySelector("#sLatD").value = a.deg; root.querySelector("#sLatM").value = a.min;
      root.querySelector("#sLonD").value = b.deg; root.querySelector("#sLonM").value = b.min;
    }
    if(isNew) getFix(); else showGps();
    root.querySelector("#btnGps").onclick = getFix;
    root.addEventListener("click", function(e){
      var b = e.target.closest("[data-step]"); if(!b) return;
      var p = b.getAttribute("data-step").split(":");
      var input = root.querySelector('input[data-sp="'+p[0]+'"]');
      input.value = String(Math.max(0, int(input.value) + int(p[1])));
      dirty = true;
    });
    root.querySelector("#btnOtherSp").onclick = function(){
      pickSpecies(shown.concat(["ALB"]), function(code){
        shown.push(code);
        var wrap = document.createElement("div"); wrap.innerHTML = smallCounter(code);
        while(wrap.firstChild) root.querySelector("#spCounters").appendChild(wrap.firstChild);
        var inp = root.querySelector('input[data-sp="'+code+'"]'); inp.value = "1"; dirty = true;
      });
    };
    root.addEventListener("input", function(){ dirty = true; });
    wireChips(root, function(){ dirty = true; });
    root.querySelector('[data-a="cancel"]').onclick = function(){ tryClose(sh.entry); };
    var del = root.querySelector("#btnDelStop");
    if(del) del.onclick = function(){
      showConfirm("Delete the "+s0.time+" stop ("+int(s0.alb)+" LF)?", "Delete", "btn-danger", function(){
        trip.stops = trip.stops.filter(function(x){ return x.id!==stop.id; });
        saveState(); sh.close(); render(); showToast("Stop deleted");
      });
    };
    root.querySelector('[data-a="save"]').onclick = function(){
      // A position typed by hand replaces the GPS one only when it was changed.
      var la = val(root,"sLatD"), lm = val(root,"sLatM"), lo = val(root,"sLonD"), lom = val(root,"sLonM");
      if(la!=="" && lo!==""){
        var mLat = -(num(la) + num(lm)/60), mLon = num(lo) + num(lom)/60;
        if(lat==="" || Math.abs(mLat-num(lat))>0.002 || Math.abs(mLon-num(lon))>0.002){ lat = mLat.toFixed(5); lon = mLon.toFixed(5); gpsNote = "typed in"; }
      }
      var rec = stop || { id:uid() };
      rec.date = val(root,"sDate") || todayISO(); rec.time = val(root,"sTime") || nowHM();
      rec.lat = lat; rec.lon = lon; rec.gpsNote = gpsNote;
      rec.alb = "0"; rec.yft = "0"; rec.other = {};
      root.querySelectorAll("input[data-sp]").forEach(function(inp){
        var code = inp.getAttribute("data-sp"), n = Math.max(0, int(inp.value));
        if(code==="ALB") rec.alb = String(n); else if(code==="YFT") rec.yft = String(n); else if(n) rec.other[code] = String(n);
      });
      rec.tank = chipValue(root,"tank");
      rec.sst = val(root,"sSst"); rec.schoolDepth = val(root,"sDepth"); rec.driftKn = val(root,"sDriftKn");
      rec.windDir = chipValue(root,"windDir"); rec.windKn = chipValue(root,"windKn"); rec.sea = chipValue(root,"sea");
      rec.driftDir = chipValue(root,"driftDir"); rec.bait = chipValue(root,"bait"); rec.notes = val(root,"sNotes");
      textFields(rec, STOP_TEXT);
      if(!stop) trip.stops.push(rec);
      state.lastConditions = {}; CONDITION_FIELDS.forEach(function(k){ if(k!=="schoolDepth") state.lastConditions[k] = rec[k]; });
      state.lastConditions.date = rec.date;
      saveState(); sh.close(); render();
      var tot = tripTotals(trip);
      showToast("Saved · "+rec.alb+" LF · day "+sumOf(stopsOn(trip, rec.date),"alb")+" · trip "+tot.alb);
    };
  }

  // ================= Species picker =================
  // Lists every species not already on the stop, and lets the skipper add a
  // new one, which is saved for every trip after this.
  function pickSpecies(exclude, onPick){
    var list = allSpecies().filter(function(sp){ return exclude.indexOf(sp.code)<0; });
    var sh = openSheet('<h2>Other species</h2><div class="chiprow" id="spList">'+
      list.map(function(sp){ return '<div class="chip" data-code="'+esc(sp.code)+'">'+esc(sp.name)+'</div>'; }).join("")+'</div>'+
      '<div class="sectionlabel">New species</div><div class="grid2">'+field("Name", "nsName", "")+field("Code (2-6 letters)", "nsCode", "", "text", 'autocapitalize="characters" maxlength="6"')+'</div>'+
      '<p class="helptext">New species are saved for later trips. The DFFE form has four spare columns for them.</p>'+
      '<div class="sheet-foot"><button class="btn btn-outline" data-a="cancel">Cancel</button><button class="btn btn-accent" data-a="add">Add new species</button></div>');
    sh.sheet.querySelector('[data-a="cancel"]').onclick = sh.close;
    sh.sheet.querySelector("#spList").addEventListener("click", function(e){
      var c = e.target.closest("[data-code]"); if(!c) return;
      sh.close(); onPick(c.getAttribute("data-code"));
    });
    sh.sheet.querySelector('[data-a="add"]').onclick = function(){
      var name = val(sh.sheet,"nsName"), code = val(sh.sheet,"nsCode").toUpperCase().replace(/[^A-Z]/g,"");
      if(!name){ showToast("Type the species name", true); return; }
      if(!code) code = name.toUpperCase().replace(/[^A-Z]/g,"").slice(0,3);
      if(code.length<2){ showToast("Give it a code of 2-6 letters", true); return; }
      if(allSpecies().some(function(x){ return x.code===code; })){ showToast(code+" is already used", true); return; }
      state.customSpecies.push({ code:code, name:name });
      saveState(); sh.close(); onPick(code);
      showToast(name+" saved as a species");
    };
  }

  // ================= Daily weather =================
  function hasWeather(trip, date){ var d = trip.days[date]; return !!(d && (d.wxWindDir || d.wxWindKn || d.wxSea || d.wxSky || d.wxSwell || d.wxNote)); }
  function lastWeather(trip, before){
    var dates = Object.keys(trip.days).filter(function(d){ return d<before && hasWeather(trip, d); }).sort();
    if(dates.length) return trip.days[dates[dates.length-1]];
    var prev = state.trips.filter(function(t){ return t!==trip; }).sort(function(a,b){ return b.createdAt-a.createdAt; });
    for(var i=0;i<prev.length;i++){ var ds = Object.keys(prev[i].days).filter(function(d){ return hasWeather(prev[i], d); }).sort(); if(ds.length) return prev[i].days[ds[ds.length-1]]; }
    return {};
  }
  function weatherText(d){
    if(!d) return "";
    var bits = [];
    if(d.wxWindDir || d.wxWindKn) bits.push(((d.wxWindDir||"")+" "+(d.wxWindKn?d.wxWindKn+" kn":"")).trim());
    if(d.wxSea) bits.push(d.wxSea);
    if(d.wxSwell) bits.push(d.wxSwell+" m swell");
    if(d.wxSky) bits.push(d.wxSky);
    return bits.join(" · ");
  }
  function openWeatherSheet(trip, date, after){
    var d = hasWeather(trip, date) ? trip.days[date] : lastWeather(trip, date);
    var first = !hasWeather(trip, date);
    var sh = openSheet('<h2>Weather — '+esc(fmtDay(date))+'</h2>'+
      (first ? '<p class="helptext" style="margin:0 0 8px;">Start of the day. Stops use this weather until you change it.</p>' : '')+
      '<div class="sectionlabel">Wind direction</div>'+chips("wxWindDir", DIRECTIONS, d.wxWindDir||"", "sq")+
      '<div class="sectionlabel">Wind (knots)</div>'+chips("wxWindKn", WIND_KN, d.wxWindKn||"")+
      '<div class="sectionlabel">Sea</div>'+chips("wxSea", SEA, d.wxSea||"")+
      '<div class="sectionlabel">Sky</div>'+chips("wxSky", SKY, d.wxSky||"")+
      '<div class="grid2" style="margin-top:10px;">'+field("Swell (m)", "wxSwell", d.wxSwell||"", "text", 'inputmode="decimal"')+field("Time", "wxTime", first ? nowHM() : (d.wxTime||""), "time")+'</div>'+
      field("Weather notes", "wxNote", first ? "" : (d.wxNote||""))+
      '<div class="sheet-foot">'+(after?'<button class="btn btn-outline" data-a="skip">Skip</button>':'<button class="btn btn-outline" data-a="cancel">Cancel</button>')+'<button class="btn btn-accent" data-a="save">'+(after?"Save &amp; log stop":"Save")+'</button></div>');
    var root = sh.sheet;
    wireChips(root);
    var c = root.querySelector('[data-a="cancel"]'); if(c) c.onclick = sh.close;
    var sk = root.querySelector('[data-a="skip"]');
    if(sk) sk.onclick = function(){
      // Skipping still marks the day so the question isn't asked at every stop.
      var day = trip.days[date] || textFields({}, DAY_TEXT); day.wxNote = day.wxNote || "not recorded"; trip.days[date] = textFields(day, DAY_TEXT);
      saveState(); sh.close(); after();
    };
    root.querySelector('[data-a="save"]').onclick = function(){
      var day = trip.days[date] || textFields({}, DAY_TEXT);
      day.wxWindDir = chipValue(root,"wxWindDir"); day.wxWindKn = chipValue(root,"wxWindKn"); day.wxSea = chipValue(root,"wxSea");
      day.wxSky = chipValue(root,"wxSky"); day.wxSwell = val(root,"wxSwell"); day.wxTime = val(root,"wxTime"); day.wxNote = val(root,"wxNote");
      trip.days[date] = textFields(day, DAY_TEXT);
      // The day's weather becomes the default for the stops that follow.
      state.lastConditions = Object.assign({}, state.lastConditions, { windDir:day.wxWindDir, windKn:day.wxWindKn, sea:day.wxSea });
      saveState(); sh.close();
      if(after) after(); else render();
    };
  }

  // ================= Signature pad =================
  // Draw with a finger; saved as a small PNG so it can go on the PDFs.
  function openSignatureSheet(title, note, onSave, outWidth){
    var sh = openSheet('<h2>'+esc(title)+'</h2>'+(note?'<p class="helptext" style="margin:0 0 8px;">'+esc(note)+'</p>':'')+
      '<canvas id="sigPad" style="width:100%;height:200px;background:#fff;border-radius:12px;touch-action:none;display:block;"></canvas>'+
      '<div class="sheet-foot"><button class="btn btn-outline" data-a="clear">Clear</button><button class="btn btn-outline" data-a="cancel">Cancel</button><button class="btn btn-accent" data-a="save">Save</button></div>');
    var cv = sh.sheet.querySelector("#sigPad");
    var ratio = 2, w = cv.clientWidth || 360, h = 200;
    cv.width = w*ratio; cv.height = h*ratio;
    var ctx = cv.getContext("2d");
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0A2530";
    var drawing = false, inked = false, last = null;
    function pt(e){ var r = cv.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top }; }
    cv.addEventListener("pointerdown", function(e){ drawing = true; last = pt(e); cv.setPointerCapture(e.pointerId); e.preventDefault(); });
    cv.addEventListener("pointermove", function(e){
      if(!drawing) return; var p = pt(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; inked = true; e.preventDefault();
    });
    ["pointerup","pointercancel","pointerleave"].forEach(function(ev){ cv.addEventListener(ev, function(){ drawing = false; }); });
    sh.sheet.querySelector('[data-a="clear"]').onclick = function(){ ctx.clearRect(0,0,w,h); inked = false; };
    sh.sheet.querySelector('[data-a="cancel"]').onclick = sh.close;
    sh.sheet.querySelector('[data-a="save"]').onclick = function(){
      if(!inked){ showToast("Sign in the white box first", true); return; }
      // Downscale to keep the stored image small.
      var ow = outWidth || 600;
      var out = document.createElement("canvas"); out.width = ow; out.height = Math.round(ow*h/w);
      out.getContext("2d").drawImage(cv, 0, 0, out.width, out.height);
      var data = out.toDataURL("image/png");
      sh.close(); onSave(data);
    };
  }
  function captureSkipperSig(trip, after){
    openSignatureSheet("Skipper signature", state.settings.skipper+" — signs the documents for "+tripLabel(trip)+".", function(data){
      trip.skipperSig = data; saveState(); showToast("Signature saved"); if(after) after(); else render();
    });
  }

  // ================= Day details (DFFE per-day fields) =================
  function openDaySheet(trip, date){
    if(lockedGuard(trip)) return;
    var info = dayInfo(trip, date);
    var html = '<h2>'+esc(fmtDay(date))+' — DFFE details</h2>'+
      '<div class="grid2">'+field("No. crew", "dCrew", info.crew, "text", 'inputmode="numeric"')+field("Hours fishing", "dHours", info.hours, "text", 'inputmode="decimal"')+'</div>'+
      '<div class="sectionlabel">Fishing gear</div>'+chips("gear", ["P","L","P/L"], info.gear)+
      '<div class="sectionlabel">Live bait used</div>'+chips("liveBait", [{code:"Y",label:"Yes"},{code:"N",label:"No"}], info.liveBait)+
      '<div class="sectionlabel">Live bait live or frozen</div>'+chips("baitCondition", [{code:"L",label:"Live"},{code:"F",label:"Frozen"}], info.baitCondition)+
      '<div class="grid2" style="margin-top:10px;">'+field("% pole (rest line)", "dPole", info.polePct, "text", 'inputmode="numeric"')+field("SST °C", "dSst", trip.days[date] && trip.days[date].sst || "", "text", 'placeholder="'+esc(info.sstIsAuto?info.sst:"e.g. 16.1-17.2")+'"')+'</div>'+
      '<p class="helptext">'+(info.sstIsAuto ? "SST is taken from the stops ("+esc(info.sst)+") unless you type one here." : "Enter SST at each stop and it fills in here by itself.")+'</p>'+
      '<div class="sheet-foot"><button class="btn btn-outline" data-a="cancel">Cancel</button><button class="btn btn-accent" data-a="save">Save</button></div>';
    var sh = openSheet(html);
    wireChips(sh.sheet);
    sh.sheet.querySelector('[data-a="cancel"]').onclick = sh.close;
    sh.sheet.querySelector('[data-a="save"]').onclick = function(){
      trip.days[date] = textFields({
        crew: val(sh.sheet,"dCrew"), hours: val(sh.sheet,"dHours"), gear: chipValue(sh.sheet,"gear"),
        liveBait: chipValue(sh.sheet,"liveBait"), baitCondition: chipValue(sh.sheet,"baitCondition"),
        polePct: val(sh.sheet,"dPole"), sst: val(sh.sheet,"dSst")
      }, DAY_TEXT);
      saveState(); sh.close(); render();
    };
  }

  // ================= Tanks =================
  function openTanksSheet(trip){
    var by = {};
    var sps = speciesInTrip(trip).filter(function(sp){ return sumSp(trip.stops, sp.code)>0; });
    trip.stops.forEach(function(st){
      var k = st.tank || "—"; by[k] = by[k] || { stops:0 };
      by[k].stops++;
      sps.forEach(function(sp){ by[k][sp.code] = (by[k][sp.code]||0) + countOf(st, sp.code); });
    });
    var keys = Object.keys(by).sort();
    var html = '<h2>Fish by tank</h2>';
    if(!keys.length) html += '<p class="sheet-text">No stops yet.</p>';
    else html += '<table class="tbl"><tr><th>Tank</th><th class="r">Stops</th>'+sps.map(function(sp){ return '<th class="r">'+esc(sp.short)+'</th>'; }).join("")+'</tr>'+
      keys.map(function(k){ return '<tr><td><b>'+esc(k==="—"?"Not set":"Tank "+k)+'</b></td><td class="r">'+by[k].stops+'</td>'+sps.map(function(sp){ return '<td class="r"><b>'+(by[k][sp.code]||0)+'</b></td>'; }).join("")+'</tr>'; }).join("")+'</table>'+
      '<p class="helptext">Each stop goes in the tank chosen on the last stop until you pick another. A stop split over two tanks: put it on the tank that took most, and note the split.</p>';
    html += '<div class="sheet-foot"><button class="btn btn-accent" data-a="ok">Close</button></div>';
    var sh = openSheet(html);
    sh.sheet.querySelector('[data-a="ok"]').onclick = sh.close;
  }

  // ================= End trip =================
  function openEndTripSheet(trip){
    if(lockedGuard(trip)) return;
    var tot = tripTotals(trip);
    var warn = [];
    if(!trip.tripNumber) warn.push("No trip number yet");
    if(!trip.crew.length) warn.push("No crew list");
    else if(!trip.crewConfirmedAt) warn.push("Crew list not confirmed");
    if(!trip.skipperSig) warn.push("No skipper signature");
    var openDays = tripDates(trip).filter(function(d){ return stopsOn(trip,d).length && !dayEnded(trip,d); });
    if(openDays.length) warn.push("End of day not done for "+openDays.map(fmtDay).join(", "));
    var noH = tripDates(trip).filter(function(d){ return stopsOn(trip,d).length && !(trip.haccp[d] && trip.haccp[d].doneAt); });
    if(noH.length && !openDays.length) warn.push("End-of-day HACCP not done for "+noH.map(fmtDay).join(", "));
    if(!trip.departure.doneAt) warn.push("Departure check not done");
    var unsigned = crewOnly(trip).filter(function(c){ return !trip.contracts[c.id]; }).length;
    if(unsigned) warn.push(unsigned+" crew contract(s) not signed");
    if(!trip.weights.length) warn.push("No offload weights yet (you can add them after ending)");
    var noPos = trip.stops.filter(function(st){ return st.lat===""; }).length;
    if(noPos) warn.push(noPos+" stop(s) without a position");
    var html = '<h2>End '+esc(tripLabel(trip))+'</h2>'+
      '<p class="sheet-text">'+tot.stops+' stops · '+tot.alb+' LF · '+tot.yft+' YFT'+(tot.other?' · '+tot.other+' other':'')+' over '+tot.days+' days.</p>'+
      (warn.length ? '<div class="locked-note" style="display:block;">'+warn.map(esc).join("<br>")+'</div>' : '')+
      field("Discharge date", "eDis", trip.dischargeDate || todayISO(), "date")+
      '<div class="sheet-foot"><button class="btn btn-outline" data-a="cancel">Cancel</button><button class="btn btn-accent" data-a="ok">End trip</button></div>';
    var sh = openSheet(html);
    sh.sheet.querySelector('[data-a="cancel"]').onclick = sh.close;
    sh.sheet.querySelector('[data-a="ok"]').onclick = function(){
      trip.dischargeDate = val(sh.sheet,"eDis"); trip.ended = true;
      saveState(); sh.close(); render();
      showToast("Trip ended. Next: landing notice, offloading temperatures, then the weigh sheet.");
      if(!trip.landing.fcoAt) openLandingSheet(trip);
    };
  }

  // ================= Day menu and end-of-day HACCP =================
  function openDayMenu(trip, date){
    var sh = openSheet('<h2>'+esc(fmtDay(date))+'</h2><div class="sheet-actions">'+
      '<button class="btn btn-ghost" data-a="wx">🌬 Weather'+(hasWeather(trip,date)?' — '+esc(weatherText(trip.days[date])||"set"):'')+'</button>'+
      '<button class="btn btn-ghost" data-a="eod">🌙 End of day (bait, HACCP, report)</button>'+
      '<button class="btn btn-ghost" data-a="haccp">🧊 HACCP check only</button>'+
      '<button class="btn btn-ghost" data-a="dffe">📋 DFFE day details (crew, hours, bait, SST)</button>'+
      '<button class="btn btn-outline" data-a="close">Close</button></div>');
    sh.sheet.querySelector('[data-a="close"]').onclick = sh.close;
    sh.sheet.querySelector('[data-a="wx"]').onclick = function(){ sh.close(); if(lockedGuard(trip)) return; openWeatherSheet(trip, date); };
    sh.sheet.querySelector('[data-a="haccp"]').onclick = function(){ sh.close(); openHaccpSheet(trip, date); };
    sh.sheet.querySelector('[data-a="eod"]').onclick = function(){ sh.close(); startEndOfDay(trip, date); };
    sh.sheet.querySelector('[data-a="dffe"]').onclick = function(){ sh.close(); openDaySheet(trip, date); };
  }
  // Previous day's answers on any trip, so each day starts from the last one.
  function lastHaccp(trip, date){
    var all = [];
    state.trips.forEach(function(t){ Object.keys(t.haccp||{}).forEach(function(d){ if(t.haccp[d].doneAt && !(t===trip && d===date)) all.push({ d:d, h:t.haccp[d] }); }); });
    all.sort(function(a,b){ return a.d.localeCompare(b.d); });
    var before = all.filter(function(x){ return x.d<date; });
    return (before.length ? before[before.length-1] : all[all.length-1] || {}).h || null;
  }
  function haccpDefaults(trip, date){
    var prev = lastHaccp(trip, date);
    var h = { san:{}, dailyTemp:"", inspectedBy:state.settings.skipper, doneAt:"", fish:[] };
    SAN_OPS.concat(SAN_STORE).forEach(function(q){ h.san[q] = (prev && prev.san[q]) || "Y"; });
    if(prev && prev.inspectedBy) h.inspectedBy = prev.inspectedBy;
    var list = stopsOn(trip, date);
    var info = dayInfo(trip, date);
    var times = list.map(function(x){ return x.time; }).filter(Boolean);
    allSpecies().forEach(function(sp){
      if(!sumSp(list, sp.code)) return;
      var pf = prev && prev.fish.find(function(f){ return f.sp===sp.code; }) || (prev && prev.fish[0]) || {};
      var row = { sp:sp.code, catchTime: fmtDate(date)+" "+(times.length ? times[0]+(times.length>1?"-"+times[times.length-1]:"") : ""), waterTemp: info.sst || "" };
      FISH_FIELDS.forEach(function(f){
        if(row[f.k]!==undefined) return;
        if(f.yn) row[f.k] = pf[f.k] || f.yn;
        else if(f.k==="haulToIce") row[f.k] = pf.haulToIce || "";
        else row[f.k] = "";
      });
      h.fish.push(row);
    });
    return h;
  }
  function openHaccpSheet(trip, date, after){
    var saved = trip.haccp[date];
    var h = saved ? JSON.parse(JSON.stringify(saved)) : haccpDefaults(trip, date);
    // Species caught since the check was saved get a row too.
    var fresh = haccpDefaults(trip, date);
    fresh.fish.forEach(function(r){ if(!h.fish.some(function(f){ return f.sp===r.sp; })) h.fish.push(r); });
    var dirty = !saved;
    function yn(name, v, expect){
      return '<div class="chiprow" data-chips="'+esc(name)+'" data-required>'+["Y","N"].map(function(c){
        return '<div class="chip sq'+(v===c?" on":"")+'" data-v="'+c+'"'+(v===c && c!==expect ? ' style="background:var(--danger);border-color:var(--danger);color:#fff;"' : '')+'>'+(c==="Y"?"Yes":"No")+'</div>';
      }).join("")+'</div>';
    }
    function sanRows(list){ return list.map(function(q){ return '<div class="row-between" style="padding:6px 0;border-bottom:1px solid var(--line);"><div style="font-size:15px;">'+esc(q)+'</div>'+yn("san:"+q, h.san[q], "Y")+'</div>'; }).join(""); }
    var html = '<h2>End of day — '+esc(fmtDay(date))+'</h2>'+
      '<p class="helptext" style="margin:0 0 6px;">Filled in from the stops and your answers last time. Change only what\'s different, then save. Answers that need attention show red.</p>'+
      '<div class="sectionlabel" style="font-size:15px;color:var(--text);">Fresh fish inspection</div>';
    h.fish.forEach(function(f, i){
      var sp = speciesOf(f.sp);
      html += '<div class="card" style="padding:10px;"><b>'+esc(sp.name)+' — '+sumSp(stopsOn(trip,date), f.sp)+' fish</b>'+
        '<div class="grid2" style="margin-top:8px;">'+
          field("Date & time of catch", "f"+i+"_catchTime", f.catchTime)+field("Water temp °C", "f"+i+"_waterTemp", f.waterTemp, "text", 'inputmode="decimal"')+
          field("Time from haul to ice", "f"+i+"_haulToIce", f.haulToIce, "text", 'placeholder="e.g. 15 min"')+field("Temp prior to icing °C", "f"+i+"_tPrior", f.tPrior, "text", 'inputmode="decimal"')+
        '</div><div class="grid3">'+field("After 6 h", "f"+i+"_t6", f.t6, "text", 'inputmode="decimal"')+field("After 12 h", "f"+i+"_t12", f.t12, "text", 'inputmode="decimal"')+field("After 16 h", "f"+i+"_t16", f.t16, "text", 'inputmode="decimal"')+'</div>'+
        FISH_FIELDS.filter(function(x){ return x.yn; }).map(function(x){ return '<div class="row-between" style="padding:4px 0;"><div style="font-size:15px;">'+esc(x.label)+'</div>'+yn("f"+i+":"+x.k, f[x.k], x.yn)+'</div>'; }).join("")+
        '</div>';
    });
    if(!h.fish.length) html += '<p class="helptext">No fish logged on this day.</p>';
    html += '<div class="sectionlabel" style="font-size:15px;color:var(--text);">Operation and sanitation</div>'+sanRows(SAN_OPS)+
      '<div class="sectionlabel" style="font-size:15px;color:var(--text);">Storage</div>'+sanRows(SAN_STORE)+
      '<div class="grid2" style="margin-top:10px;">'+field("Daily temp °C", "hDailyTemp", h.dailyTemp, "text", 'inputmode="decimal"')+field("Inspected by", "hBy", h.inspectedBy)+'</div>'+
      '<p class="helptext">Offloading temperatures are added on discharge day (Reports → HACCP).</p>'+
      '<div class="sheet-foot"><button class="btn btn-outline" data-a="cancel">Cancel</button><button class="btn btn-accent" data-a="save">Save check</button></div>';
    var sh = openSheet(html, { guard:function(){ return dirty; } });
    var root = sh.sheet;
    wireChips(root, function(name, v){
      dirty = true;
      // Re-colour: red when the answer isn't the expected one.
      var row = root.querySelector('[data-chips="'+(window.CSS && CSS.escape ? CSS.escape(name) : name)+'"]');
      var expect = name.indexOf("san:")===0 ? "Y" : (FISH_FIELDS.find(function(x){ return x.k===name.split(":")[1]; })||{}).yn;
      row.querySelectorAll(".chip").forEach(function(c){ c.removeAttribute("style"); if(c.classList.contains("on") && c.getAttribute("data-v")!==expect) c.setAttribute("style","background:var(--danger);border-color:var(--danger);color:#fff;"); });
    });
    root.addEventListener("input", function(){ dirty = true; });
    root.querySelector('[data-a="cancel"]').onclick = function(){ tryClose(sh.entry); };
    root.querySelector('[data-a="save"]').onclick = function(){
      if(storageLocked){ lockedGuard(trip); return; }
      SAN_OPS.concat(SAN_STORE).forEach(function(q){ h.san[q] = chipValue(root, "san:"+q) || h.san[q]; });
      h.fish.forEach(function(f, i){
        FISH_FIELDS.forEach(function(x){
          if(x.yn) f[x.k] = chipValue(root, "f"+i+":"+x.k) || f[x.k];
          else { var el = root.querySelector("#f"+i+"_"+x.k); if(el) f[x.k] = el.value.trim(); }
        });
      });
      h.dailyTemp = val(root,"hDailyTemp"); h.inspectedBy = val(root,"hBy"); h.doneAt = new Date().toISOString();
      trip.haccp[date] = normaliseHaccp(h);
      saveState(); sh.close(); showToast("End-of-day check saved");
      if(after) after(); else render();
    };
  }
  function openOffloadTemps(trip){
    var dates = Object.keys(trip.haccp).filter(function(d){ return trip.haccp[d].fish.length; }).sort();
    if(!dates.length){ showToast("Do the end-of-day HACCP checks first", true); return; }
    var html = '<h2>Offloading temperatures</h2><p class="helptext" style="margin:0 0 8px;">Core temperature at discharge, per day\'s catch.</p>';
    dates.forEach(function(d){ trip.haccp[d].fish.forEach(function(f, i){ html += field(fmtDay(d)+" — "+speciesOf(f.sp).name+" °C", "off_"+d+"_"+i, f.tOff, "text", 'inputmode="decimal"'); }); });
    html += '<div class="sheet-foot"><button class="btn btn-outline" data-a="cancel">Cancel</button><button class="btn btn-accent" data-a="save">Save</button></div>';
    var sh = openSheet(html);
    sh.sheet.querySelector('[data-a="cancel"]').onclick = sh.close;
    sh.sheet.querySelector('[data-a="save"]').onclick = function(){
      dates.forEach(function(d){ trip.haccp[d].fish.forEach(function(f, i){ f.tOff = val(sh.sheet, "off_"+d+"_"+i); }); });
      saveState(); sh.close(); showToast("Offloading temperatures saved");
      if(trip.ended && !trip.weights.length) go("weights"); else render();
    };
  }

  // ---------- HACCP PDFs, laid out like the paper books ----------
  function sigOnPdf(doc, trip, x, y, w){
    if(trip.skipperSig){ try{ doc.addImage(trip.skipperSig, "PNG", x, y-w*0.33, w, w*0.33); }catch(e){} }
  }
  function pdfHeader(doc, title, trip, pageW){
    doc.setFont("helvetica","bold"); doc.setFontSize(14);
    var tl = title.indexOf("\n")>=0 ? title.split("\n") : doc.splitTextToSize(title, pageW-30);
    if(tl.length>1){ doc.setFontSize(13); doc.text(tl, pageW/2, 9, { align:"center", lineHeightFactor:1.1 }); }
    else doc.text(title, pageW/2, 14, { align:"center" });
    doc.setFontSize(10);
    var dates = tripDates(trip);
    doc.text("VESSEL: ", 12, 23); doc.setFont("helvetica","normal"); doc.text(state.settings.vessel+"  ("+state.settings.registrationNo+")", 30, 23);
    doc.setFont("helvetica","bold"); doc.text("TRIP DATES: ", pageW/2, 23); doc.setFont("helvetica","normal");
    doc.text((dates.length ? fmtDate(dates[0])+" - "+fmtDate(dates[dates.length-1]) : fmtDate(trip.sailDate))+(trip.tripNumber?"   (Trip "+trip.tripNumber+")":""), pageW/2+24, 23);
  }
  function cellText(doc, txt, x, y, w, h, opts){
    opts = opts || {};
    if(opts.fill){ doc.setFillColor(opts.fill[0],opts.fill[1],opts.fill[2]); doc.rect(x,y,w,h,"F"); }
    doc.setDrawColor(120); doc.rect(x, y, w, h);
    if(txt===undefined || txt===null || txt==="") return;
    doc.setFont("helvetica", opts.bold ? "bold" : "normal"); doc.setFontSize(opts.size || 8);
    var lines = doc.splitTextToSize(String(txt), w-2);
    var lh = (opts.size||8)*0.42;
    var ty = y + h/2 - (lines.length-1)*lh/2 + lh*0.35;
    lines.forEach(function(l, i){ doc.text(l, opts.left ? x+1.5 : x+w/2, ty+i*lh, opts.left ? {} : { align:"center" }); });
  }
  function buildSanitationPdf(trip){
    var doc = new window.jspdf.jsPDF({ unit:"mm", format:"a4", orientation:"portrait" });
    var W = 210;
    var dates = Object.keys(trip.haccp).filter(function(d){ return trip.haccp[d].doneAt; }).sort();
    if(!dates.length){ showToast("No end-of-day checks saved on this trip", true); return; }
    for(var page=0; page*7<dates.length; page++){
      if(page) doc.addPage();
      var ds = dates.slice(page*7, page*7+7);
      pdfHeader(doc, "DAILY OPERATIONS\nSANITATION AND STORAGE PROCESS CONTROL REPORT", trip, W);
      var x0 = 12, qW = 72, cW = (W-24-qW)/14, y = 30, rh = 7;
      cellText(doc, "OPERATION AND SANITATION", x0, y, qW, rh, { bold:true, left:true, size:9 });
      for(var i=0;i<7;i++) cellText(doc, ds[i] ? "Date: "+fmtDate(ds[i]).slice(0,5) : "Date:", x0+qW+i*2*cW, y, 2*cW, rh, { size:7, bold:true });
      y += rh;
      cellText(doc, "Area", x0, y, qW, rh, { left:true });
      for(i=0;i<14;i++) cellText(doc, i%2 ? "No" : "Yes", x0+qW+i*cW, y, cW, rh, { size:7 });
      y += rh;
      function block(list){
        list.forEach(function(q){
          cellText(doc, q+" ?", x0, y, qW, rh, { left:true, size:7.5 });
          for(var k=0;k<7;k++){
            var a = ds[k] ? trip.haccp[ds[k]].san[q] : "";
            cellText(doc, a==="Y" ? "X" : "", x0+qW+k*2*cW, y, cW, rh, { bold:true, size:9 });
            cellText(doc, a==="N" ? "X" : "", x0+qW+k*2*cW+cW, y, cW, rh, { bold:true, size:9, fill: a==="N" ? [255,215,205] : null });
          }
          y += rh;
        });
      }
      block(SAN_OPS);
      cellText(doc, "STORAGE", x0, y, qW, rh, { bold:true, left:true, size:9 }); for(i=0;i<14;i++) cellText(doc, "", x0+qW+i*cW, y, cW, rh); y += rh;
      block(SAN_STORE);
      cellText(doc, "DAILY TEMP.", x0, y, qW, rh, { bold:true, left:true, size:9 });
      for(i=0;i<7;i++) cellText(doc, ds[i] ? trip.haccp[ds[i]].dailyTemp : "", x0+qW+i*2*cW, y, 2*cW, rh);
      y += rh;
      cellText(doc, "Inspected by:", x0, y, qW, rh+4, { left:true, bold:true });
      for(i=0;i<7;i++) cellText(doc, ds[i] ? trip.haccp[ds[i]].inspectedBy : "", x0+qW+i*2*cW, y, 2*cW, rh+4, { size:6.5 });
      y += rh+14;
      doc.setFont("helvetica","normal"); doc.setFontSize(10);
      doc.text("Skipper: "+state.settings.skipper, x0, y); sigOnPdf(doc, trip, 90, y+2, 45); doc.line(90, y+2, 140, y+2);
    }
    saveFileOut(fileName(trip, "haccp_sanitation", "pdf"), doc.output("blob"));
  }
  function buildFishInspectionPdf(trip){
    var doc = new window.jspdf.jsPDF({ unit:"mm", format:"a4", orientation:"landscape" });
    var W = 297;
    var rows = [];
    Object.keys(trip.haccp).sort().forEach(function(d){ trip.haccp[d].fish.forEach(function(f){ rows.push(f); }); });
    if(!rows.length){ showToast("No end-of-day checks with fish on this trip", true); return; }
    var per = 10;
    for(var page=0; page*per<rows.length; page++){
      if(page) doc.addPage();
      var rs = rows.slice(page*per, page*per+per);
      pdfHeader(doc, "FRESH FISH INSPECTION AND PROCESSING CONTROL REPORT", trip, W);
      var x0 = 10, y = 30, hh = 11, rh = 7.5;
      var top = [["Specie ?","sp",24],["Date & time of catch ?","catchTime",34],["Water temp ?","waterTemp",20],["Icing Correct ?","icing",22],["Time from haul to ice ?","haulToIce",26],["Temp prior to icing ?","tPrior",26],["Temp after 6 hours ?","t6",26],["Temp after 12 hours ?","t12",26],["Temp after 16 hours ?","t16",26],["Off Loading Temperatures","tOff",27]];
      var x = x0;
      top.forEach(function(c){ cellText(doc, c[0], x, y, c[2], hh, { bold:true, size:7.5 }); x += c[2]; });
      y += hh;
      rs.forEach(function(f){
        x = x0;
        top.forEach(function(c){
          var v = c[1]==="sp" ? speciesOf(f.sp).name : (f[c[1]]==="Y" ? "Yes" : f[c[1]]==="N" ? "No" : f[c[1]]);
          cellText(doc, v, x, y, c[2], rh, { size:7.5, fill: (c[1]==="icing" && f.icing==="N") ? [255,215,205] : null }); x += c[2];
        });
        y += rh;
      });
      y += 8;
      var q = [["decomposed","Decomposed ?"],["poisonous","Poisonous ?"],["tainted","Tainted ?"],["foreign","Foreign Matter ?"],["parasites","Parasites ?"]];
      var tail = [["gutting","Gutting ?"],["washing","Washing ?"],["offal","Offal discharge Hygienic ?"]];
      var spW = 24, dW = 34, ynW = 15, tW = (W-2*x0-spW-dW-q.length*2*ynW)/tail.length;
      x = x0;
      cellText(doc, "Specie ?", x, y, spW, hh+5, { bold:true, size:7.5 }); x += spW;
      cellText(doc, "Date & time of catch ?", x, y, dW, hh+5, { bold:true, size:7.5 }); x += dW;
      q.forEach(function(c){ cellText(doc, c[1], x, y, 2*ynW, hh, { bold:true, size:7.5 }); cellText(doc, "YES", x, y+hh, ynW, 5, { size:6.5, fill:[225,225,225] }); cellText(doc, "NO", x+ynW, y+hh, ynW, 5, { size:6.5, fill:[225,225,225] }); x += 2*ynW; });
      tail.forEach(function(c){ cellText(doc, c[1], x, y, tW, hh+5, { bold:true, size:7.5 }); x += tW; });
      y += hh+5;
      rs.forEach(function(f){
        x = x0;
        cellText(doc, speciesOf(f.sp).name, x, y, spW, rh, { size:7.5 }); x += spW;
        cellText(doc, f.catchTime, x, y, dW, rh, { size:7 }); x += dW;
        q.forEach(function(c){
          cellText(doc, f[c[0]]==="Y" ? "X" : "", x, y, ynW, rh, { bold:true, fill: f[c[0]]==="Y" ? [255,215,205] : null });
          cellText(doc, f[c[0]]==="N" ? "X" : "", x+ynW, y, ynW, rh, { bold:true }); x += 2*ynW;
        });
        tail.forEach(function(c){ cellText(doc, f[c[0]]==="Y" ? "Yes" : f[c[0]]==="N" ? "No" : "", x, y, tW, rh, { size:7.5 }); x += tW; });
        y += rh;
      });
      y += 12;
      doc.setFont("helvetica","normal"); doc.setFontSize(10);
      doc.text("Skipper: "+state.settings.skipper, x0, y); sigOnPdf(doc, trip, 70, y+2, 45); doc.line(70, y+2, 120, y+2);
    }
    saveFileOut(fileName(trip, "haccp_fresh_fish", "pdf"), doc.output("blob"));
  }

  // ================= Weight sheet =================
  var wsSpecies = "ALB";
  function renderWeights(trip){
    setTopbar(tripLabel(trip)+" · Weights", "Offload weigh sheet");
    var el = document.getElementById("screen");
    var sps = speciesInTrip(trip);
    if(!sps.some(function(x){ return x.code==="ALB"; })) sps.unshift(speciesOf("ALB"));
    if(!sps.some(function(x){ return x.code===wsSpecies; })) sps.push(speciesOf(wsSpecies));
    var html = backButton(tripLabel(trip))+
      '<div class="card"><div class="totals">'+sps.map(function(sp){
        var st = weightStats(trip, sp.code), counted = sumSp(trip.stops, sp.code);
        return '<div><div class="n'+(sp.code==="ALB"?"":" yf")+'">'+st.n+'</div><div class="l">'+esc(sp.short)+' · '+kg(st.kg)+' kg<br>avg '+kg(st.avg)+(counted!==st.n?'<br>stops: '+counted:'')+'</div></div>';
      }).join("")+'</div></div>'+
      '<div class="card">'+chips("sp", sps.map(function(sp){ return { code:sp.code, label:sp.name }; }).concat([{ code:"__more", label:"+ Other" }]), wsSpecies)+
      '<div class="wsentry" style="margin-top:10px;"><input id="wKg" type="number" inputmode="decimal" step="0.1" placeholder="kg"><button class="btn btn-accent" id="btnAddW">Add</button></div>'+
      (wsSpecies!=="ALB" ? '<div style="margin-top:8px;">'+field("Fork length cm (optional)", "wLen", "", "text", 'inputmode="numeric"')+'</div>' : '')+
      '<p class="helptext">Type a weight and press Add (or Enter on the keyboard). Tap a weight to change or delete it.</p></div>';
    allSpecies().forEach(function(spx){
      var sp = spx.code;
      var list = trip.weights.filter(function(w){ return w.sp===sp; });
      if(!list.length) return;
      html += '<div class="sectionlabel">'+esc(spx.name)+' ('+list.length+' · '+kg(weightStats(trip, sp).kg)+' kg)</div>';
      for(var r=0; r<list.length; r+=10){
        var row = list.slice(r, r+10), rowKg = row.reduce(function(a,w){ return a+num(w.kg); }, 0);
        html += '<div class="wsrow"><div class="rn">'+(r+1)+'–<br>'+(r+10)+'</div>'+
          row.map(function(w){ return '<div class="wscell'+(sp!=="ALB"?" yf":"")+'" data-w="'+w.id+'"><div class="v">'+esc(w.kg)+'</div>'+(w.len?'<div class="i">'+esc(w.len)+'cm</div>':'')+'</div>'; }).join("")+
          new Array(10-row.length+1).join('<div class="wscell empty"></div>')+
          '<div class="rsum">'+kg(rowKg)+' kg</div></div>';
      }
    });
    el.innerHTML = html;
    wireBack(function(){ go("trip"); });
    wireChips(el, function(name, v){
      if(v==="__more"){ pickSpecies(sps.map(function(x){ return x.code; }), function(code){ wsSpecies = code; render(); }); render(); return; }
      wsSpecies = v || "ALB"; render(); setTimeout(function(){ var k = document.getElementById("wKg"); if(k) k.focus(); }, 50);
    });
    var input = document.getElementById("wKg");
    function add(){
      if(storageLocked){ lockedGuard(trip); return; }
      var v = num(input.value);
      if(!(v>0)){ input.focus(); return; }
      if(v>400){ showToast("That looks too heavy — check the weight", true); return; }
      var lenEl = document.getElementById("wLen");
      trip.weights.push({ id:uid(), sp:wsSpecies, kg:String(Math.round(v*10)/10), len: lenEl ? lenEl.value.trim() : "" });
      saveState(); render();
      var k = document.getElementById("wKg"); if(k) k.focus();
    }
    document.getElementById("btnAddW").onclick = add;
    input.addEventListener("keydown", function(e){ if(e.key==="Enter"){ e.preventDefault(); add(); } });
    el.querySelectorAll("[data-w]").forEach(function(c){ c.onclick = function(){ openWeightEdit(trip, c.getAttribute("data-w")); }; });
  }
  function openWeightEdit(trip, id){
    var w = trip.weights.find(function(x){ return x.id===id; }); if(!w) return;
    var sh = openSheet('<h2>Edit weight</h2>'+chips("sp", allSpecies().map(function(sp){ return { code:sp.code, label:sp.name }; }), w.sp)+
      '<div class="grid2" style="margin-top:10px;">'+field("Weight kg", "eKg", w.kg, "number", 'inputmode="decimal" step="0.1"')+field("Fork length cm", "eLen", w.len, "text", 'inputmode="numeric"')+'</div>'+
      '<div class="sheet-foot"><button class="btn btn-danger" data-a="del">Delete</button><button class="btn btn-accent" data-a="save">Save</button></div>');
    wireChips(sh.sheet);
    sh.sheet.querySelector('[data-a="del"]').onclick = function(){
      showConfirm("Delete this "+w.kg+" kg weight?", "Delete", "btn-danger", function(){ trip.weights = trip.weights.filter(function(x){ return x!==w; }); saveState(); sh.close(); render(); });
    };
    sh.sheet.querySelector('[data-a="save"]').onclick = function(){
      var v = num(val(sh.sheet,"eKg")); if(!(v>0)){ showToast("Enter a weight", true); return; }
      w.kg = String(Math.round(v*10)/10); w.len = val(sh.sheet,"eLen"); w.sp = chipValue(sh.sheet,"sp") || w.sp;
      saveState(); sh.close(); render();
    };
  }

  // ================= Crew =================
  function renderCrew(trip){
    setTopbar(tripLabel(trip)+" · Crew", personsOnBoard(trip)+" on board incl. skipper");
    var el = document.getElementById("screen");
    var html = backButton(tripLabel(trip));
    if(trip.crewConfirmedAt) html += '<div class="card" style="border-color:var(--kelp);"><b style="color:var(--kelp);">✓ Crew list confirmed</b><div class="helptext" style="margin:2px 0 0;">'+esc(fmtDay(todayISO(new Date(trip.crewConfirmedAt))))+' — any change needs confirming again.</div></div>';
    else if(trip.crew.length) html += '<div class="locked-note"><span>Check the names, add or remove anyone, then confirm.</span></div>';
    html += '<div class="actions"><button class="btn btn-ghost" id="btnAddCrew">+ Add crew</button><button class="btn btn-ghost" id="btnCrewPdf">📄 Crew list PDF</button></div>';
    var prevTrip = state.trips.filter(function(t){ return t!==trip && t.crew.length; }).sort(function(a,b){ return b.createdAt-a.createdAt; })[0];
    if(!trip.crew.length && prevTrip && !trip.ended) html += '<button class="btn btn-ghost" id="btnImportCrew" style="margin-bottom:12px;">⤓ Import crew from '+esc(tripLabel(prevTrip))+' ('+prevTrip.crew.length+')</button>';
    if(!trip.crew.length) html += '<div class="empty"><div class="big">👥</div>No crew on this trip yet.</div>';
    trip.crew.forEach(function(c, i){
      html += '<div class="lineitem" data-crew="'+c.id+'"><div class="num">'+(i+1)+'</div><div class="meta"><div class="t1">'+esc(c.name+" "+c.surname)+'</div><div class="t2">'+esc(c.role||"Crew")+(c.nationality?' · '+esc(c.nationality):'')+(c.idNumber?' · '+esc(c.idNumber):' · <b style="color:var(--yellow)">no ID</b>')+'</div></div><div class="chev">›</div></div>';
    });
    if(trip.crewConfirmedAt && crewOnly(trip).length){
      var signed = crewOnly(trip).filter(function(c){ return trip.contracts[c.id]; }).length;
      html += '<button class="btn '+(signed===crewOnly(trip).length?'btn-ghost':'btn-accent')+' btn-big" id="btnContracts" style="margin-top:8px;">✍ Contracts ('+signed+' of '+crewOnly(trip).length+' signed)</button>';
    }
    if(trip.crew.length && !trip.crewConfirmedAt && !trip.ended) html += '<button class="btn btn-accent btn-big" id="btnConfirmCrew" style="margin-top:8px;">✓ Confirm crew list ('+trip.crew.length+')</button>';
    el.innerHTML = html;
    wireBack(function(){ go("trip"); });
    var ic = document.getElementById("btnImportCrew");
    if(ic) ic.onclick = function(){ trip.crew = prevTrip.crew.map(function(c){ return Object.assign({}, c, { id:uid() }); }); trip.crewConfirmedAt = ""; saveState(); render(); };
    var cc = document.getElementById("btnConfirmCrew");
    if(cc) cc.onclick = function(){
      if(lockedGuard(trip)) return;
      var noId = trip.crew.filter(function(c){ return !c.idNumber; }).length;
      showConfirm("Confirm these "+crewOnly(trip).length+" crew (+ skipper = "+personsOnBoard(trip)+" on board) for "+tripLabel(trip)+"?"+(noId?"\n\n"+noId+" without an ID number.":""), "Confirm", "btn-accent", function(){
        trip.crewConfirmedAt = new Date().toISOString(); saveState(); go("contracts"); showToast("Crew list confirmed — now the contracts");
      });
    };
    document.getElementById("btnAddCrew").onclick = function(){ if(lockedGuard(trip)) return; openCrewSheet(trip, null); };
    document.getElementById("btnCrewPdf").onclick = function(){ buildCrewPdf(trip); };
    var bc = document.getElementById("btnContracts"); if(bc) bc.onclick = function(){ go("contracts"); };
    el.querySelectorAll("[data-crew]").forEach(function(r){ r.onclick = function(){ if(lockedGuard(trip)) return; openCrewSheet(trip, trip.crew.find(function(c){ return c.id===r.getAttribute("data-crew"); })); }; });
  }
  function openCrewSheet(trip, person){
    var isNew = !person;
    var p = person || { name:"", surname:"", idNumber:"", role:"Crew", nationality:"RSA", contact:"", kinName:"", kinContact:"" };
    var known = state.knownCrew.filter(function(k){ return !trip.crew.some(function(c){ return c.name.toLowerCase()===k.name.toLowerCase() && c.surname.toLowerCase()===k.surname.toLowerCase(); }); });
    var html = '<h2>'+(isNew?"Add crew member":"Crew member")+'</h2>'+
      (isNew && known.length ? '<div class="sectionlabel">From earlier trips</div><div class="chiprow" id="knownList">'+known.map(function(k,i){ return '<div class="chip" data-k="'+i+'">'+esc(k.name+" "+k.surname)+'</div>'; }).join("")+'</div><div class="sectionlabel">Or type a new one</div>' : '')+
      '<div class="grid2">'+field("Name", "cName", p.name)+field("Surname", "cSurname", p.surname)+'</div>'+
      '<div class="grid2">'+field("ID / passport number", "cId", p.idNumber)+field("Nationality", "cNat", p.nationality, "text", 'autocapitalize="characters"')+'</div>'+
      field("Contact number", "cTel", p.contact, "tel")+
      '<div class="grid2">'+field("Next of kin name", "cKinName", p.kinName)+field("Next of kin number", "cKinTel", p.kinContact, "tel")+'</div>'+
      '<div class="sectionlabel">Commission for the contract (not on the crew list)</div>'+
      '<div class="grid2">'+field("Longfin R / ton", "cAlbRate", p.albRate, "text", 'inputmode="decimal"')+field("Yellowfin R / ton", "cYftRate", p.yftRate, "text", 'inputmode="decimal"')+'</div>'+
      '<div class="sectionlabel">Position</div>'+chips("role", POSITIONS.concat(p.role && POSITIONS.indexOf(p.role)<0 ? [p.role] : []), p.role||"Crew")+
      '<div class="sheet-foot">'+(isNew?'<button class="btn btn-outline" data-a="cancel">Cancel</button>':'<button class="btn btn-danger" data-a="del">Remove</button>')+'<button class="btn btn-accent" data-a="save">Save</button></div>';
    var sh = openSheet(html);
    wireChips(sh.sheet);
    var kl = sh.sheet.querySelector("#knownList");
    if(kl) kl.addEventListener("click", function(e){
      var c = e.target.closest("[data-k]"); if(!c) return;
      var k = known[int(c.getAttribute("data-k"))];
      trip.crew.push(Object.assign({}, k, { id:uid(), role:k.role||"Crew" })); trip.crewConfirmedAt = "";
      saveState(); sh.close(); render(); showToast(k.name+" added");
    });
    var cancel = sh.sheet.querySelector('[data-a="cancel"]'); if(cancel) cancel.onclick = sh.close;
    var del = sh.sheet.querySelector('[data-a="del"]');
    if(del) del.onclick = function(){ showConfirm("Remove "+p.name+" "+p.surname+" from this trip?", "Remove", "btn-danger", function(){ trip.crew = trip.crew.filter(function(c){ return c!==person; }); trip.crewConfirmedAt = ""; saveState(); sh.close(); render(); }); };
    sh.sheet.querySelector('[data-a="save"]').onclick = function(){
      var rec = person || { id:uid() };
      rec.name = val(sh.sheet,"cName"); rec.surname = val(sh.sheet,"cSurname"); rec.idNumber = val(sh.sheet,"cId"); rec.role = chipValue(sh.sheet,"role") || "Crew";
      rec.nationality = val(sh.sheet,"cNat").toUpperCase(); rec.contact = val(sh.sheet,"cTel"); rec.kinName = val(sh.sheet,"cKinName"); rec.kinContact = val(sh.sheet,"cKinTel");
      rec.albRate = val(sh.sheet,"cAlbRate"); rec.yftRate = val(sh.sheet,"cYftRate");
      if(!rec.name){ showToast("Enter a name", true); return; }
      if(!person) trip.crew.push(rec);
      trip.crewConfirmedAt = "";
      rememberCrew(rec);
      saveState(); sh.close(); render();
    };
  }
  function rememberCrew(c){
    var k = state.knownCrew.find(function(x){ return x.name.toLowerCase()===c.name.toLowerCase() && x.surname.toLowerCase()===c.surname.toLowerCase(); });
    var copy = {}; CREW_TEXT.forEach(function(f){ copy[f] = c[f] || ""; });
    if(k) CREW_TEXT.forEach(function(f){ if(copy[f]) k[f] = copy[f]; });
    else state.knownCrew.push(copy);
  }
  function buildCrewPdf(trip){
    if(!window.jspdf){ showToast("PDF library missing", true); return; }
    var s = state.settings;
    var doc = new window.jspdf.jsPDF({ unit:"mm", format:"a4", orientation:"landscape" });
    var W = 297;
    doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.text("CREW LIST — FV "+String(s.vessel).toUpperCase(), W/2, 15, { align:"center" });
    doc.setFontSize(10);
    function kv(x, y, k, v){ doc.setFont("helvetica","bold"); doc.text(k, x, y); var w = doc.getTextWidth(k+" "); doc.setFont("helvetica","normal"); doc.text(String(v||""), x+w, y); return x + w + doc.getTextWidth(String(v||"")) + 8; }
    var x = kv(14, 25, "Owner/Operator:", s.owner); x = kv(x, 25, "Official/Licence No.:", s.licenceNo); kv(x, 25, "Port:", s.crewListPort || s.port);
    x = kv(14, 32, "Trip No.:", trip.tripNumber); x = kv(x, 32, "Departure:", fmtDate(trip.sailDate)+(trip.sailTime?", "+trip.sailTime:"")+", "+(s.crewListPort||s.port)); kv(x, 32, "Persons on board (incl. skipper):", String(personsOnBoard(trip)));
    x = kv(14, 41, "Skipper:", s.skipper); x = kv(x, 41, "ID No.:", s.skipperId); kv(x, 41, "Contact:", s.contact);
    var cols = [["#",10],["Name",32],["Surname",32],["Nat.",16],["ID / Passport No.",44],["Position",28],["Contact",30],["Next of kin",42],["Next of kin no.",35]];
    var y = 48, rh = 9, x0 = 14;
    x = x0;
    cols.forEach(function(c){ doc.setFillColor(225,232,230); doc.rect(x, y, c[1], rh, "F"); doc.setDrawColor(150); doc.rect(x, y, c[1], rh); doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.text(c[0], x+2, y+6); x += c[1]; });
    y += rh;
    var crew = crewOnly(trip);
    var n = Math.max(12, crew.length);
    for(var i=0;i<n;i++){
      if(y > 185){ doc.addPage(); y = 20; }
      var c = crew[i];
      var idText = c ? (c.idNumber || "— (no ID)") : "";
      var vals = c ? [String(i+1), c.name, c.surname, c.nationality, idText, c.role||"Crew", c.contact, c.kinName, c.kinContact] : [String(i+1),"","","","","","","",""];
      x = x0;
      cols.forEach(function(col, j){ doc.setDrawColor(150); doc.rect(x, y, col[1], rh); doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.text(doc.splitTextToSize(String(vals[j]||""), col[1]-3)[0] || "", x+2, y+6); x += col[1]; });
      y += rh;
    }
    y = Math.min(y + 16, 200);
    doc.setFontSize(10); doc.setFont("helvetica","normal");
    doc.text("Skipper signature:", x0, y); sigOnPdf(doc, trip, x0+34, y+1, 45); doc.line(x0+34, y+1, x0+100, y+1);
    doc.text("Date: "+(trip.crewConfirmedAt ? fmtDate(todayISO(new Date(trip.crewConfirmedAt))) : "______________"), x0+115, y);
    saveFileOut(fileName(trip, "crew_list", "pdf"), doc.output("blob"));
  }

  // ================= Crew contracts =================
  // Ntoza Fishing's voyage contract, word for word from the company's form.
  var CONTRACT_FINISH = "On completion of offload";
  function contractSections(c){
    var rate = function(v){ return v ? String(v) : "_____"; };
    return [
      ["Contract Duration", "The contract starts on the date the vessel departs Hout Bay Harbour for the specified trip and ends when the vessel returns, the catch is offloaded, and the vessel is back in sailing condition."],
      ["Wages and Commission", "Crew are paid per trip as agreed. Commission: R "+rate(c.albRate)+" / ton Longfin, R "+rate(c.yftRate)+" / ton Yellowfin. Cook – R150 per day. Bait master – R150 per day. Payment is made 7 working days after offload."],
      ["Notice", "Crew are engaged per trip. The contract ends automatically at the end of the trip."],
      ["Repatriation", "If the trip ends early, or if a crew member is injured, ill, or otherwise unable to continue, Ntoza Fishing will ensure the crew member is safely returned to Hout Bay Harbour or their place of engagement at no cost to the crew."],
      ["Injury, Illness, or Death", "If a crew member is injured, falls ill, or dies as a direct result of work on board, Ntoza Fishing will cover reasonable medical care while on duty, necessary treatment ashore, and in case of death, transport of remains and reasonable support to the next of kin."],
      ["Obligations", "Crew agree to follow all lawful instructions given by the skipper or mate for the duration of the voyage."]
    ];
  }
  var CONTRACT_INTRO = "This is a contract of employment for crew working on the licensed commercial vessel Antares, operated by Ntoza Fishing (Pty) Ltd. The contract applies to each voyage as defined below.";
  function renderContracts(trip){
    var crew = crewOnly(trip);
    var signed = crew.filter(function(c){ return trip.contracts[c.id]; }).length;
    setTopbar(tripLabel(trip)+" · Contracts", signed+" of "+crew.length+" signed");
    var el = document.getElementById("screen");
    var html = backButton("Crew");
    if(!trip.skipperSig) html += '<div class="locked-note"><span>Skipper hasn\'t signed for this trip yet.</span><button class="btn btn-sm" id="btnSignSk">Sign</button></div>';
    html += '<p class="helptext" style="margin:0 0 10px;">Tap a name, let them read the contract, then hand them the phone to sign.</p>';
    crew.forEach(function(c, i){
      var k = trip.contracts[c.id];
      html += '<div class="lineitem" data-con="'+c.id+'"><div class="num">'+(i+1)+'</div><div class="meta"><div class="t1">'+esc(c.name+" "+c.surname)+'</div>'+
        '<div class="t2">'+(k ? '<span class="tag open">SIGNED</span> '+esc(fmtDay(todayISO(new Date(k.signedAt)))) : '<b style="color:var(--yellow)">Not signed</b>')+'</div></div><div class="chev">›</div></div>';
    });
    html += '<button class="btn btn-ghost" id="btnAllContracts" style="margin-top:6px;">📄 All contracts (PDF)</button>';
    el.innerHTML = html;
    wireBack(function(){ go("crew"); });
    var ss = document.getElementById("btnSignSk"); if(ss) ss.onclick = function(){ captureSkipperSig(trip); };
    document.getElementById("btnAllContracts").onclick = function(){ buildContractsPdf(trip, null); };
    el.querySelectorAll("[data-con]").forEach(function(r){ r.onclick = function(){ openContractSheet(trip, trip.crew.find(function(c){ return c.id===r.getAttribute("data-con"); })); }; });
  }
  function openContractSheet(trip, c){
    var k = trip.contracts[c.id];
    var html = '<h2>Voyage contract — '+esc(c.name+" "+c.surname)+'</h2>'+
      '<table class="tbl">'+
        [["Name", c.name],["Surname", c.surname],["ID / Passport", c.idNumber||"—"],["Contact", c.contact||"—"],["Next of kin", ((c.kinName||"")+" "+(c.kinContact||"")).trim()||"—"],
         ["Trip no.", trip.tripNumber||"—"],["Commences", fmtDate(trip.sailDate)],["Finishes", CONTRACT_FINISH],["Commission", "R "+(c.albRate||"—")+"/ton longfin · R "+(c.yftRate||"—")+"/ton yellowfin"]]
        .map(function(r){ return '<tr><th>'+esc(r[0])+'</th><td>'+esc(r[1])+'</td></tr>'; }).join("")+'</table>'+
      '<p class="sheet-text" style="margin-top:12px;font-size:15px;">'+esc(CONTRACT_INTRO)+'</p>'+
      ((!c.albRate || !c.yftRate) ? '<div class="locked-note">Commission rate missing — set it in this crew member\'s details first.</div>' : '')+
      contractSections(c).map(function(x){ return '<p class="sheet-text" style="font-size:15px;"><b>'+esc(x[0])+'</b>\n'+esc(x[1])+'</p>'; }).join("")+
      (k ? '<div class="card" style="background:#fff;"><img src="'+k.sig+'" style="width:100%;max-width:320px;display:block;"></div><p class="helptext">Signed '+esc(fmtDay(todayISO(new Date(k.signedAt))))+'</p>' : '')+
      '<div class="sheet-foot"><button class="btn btn-outline" data-a="pdf">PDF</button>'+
      (trip.ended ? '' : '<button class="btn btn-accent" data-a="sign">'+(k?"Sign again":"Crew signs")+'</button>')+'</div>';
    var sh = openSheet(html);
    sh.sheet.querySelector('[data-a="pdf"]').onclick = function(){ buildContractsPdf(trip, [c]); };
    var sg = sh.sheet.querySelector('[data-a="sign"]');
    if(sg) sg.onclick = function(){
      if(lockedGuard(trip)) return;
      sh.close();
      openSignatureSheet(c.name+" "+c.surname+" — sign here", "I have read and agree to the voyage contract for "+tripLabel(trip)+".", function(data){
        trip.contracts[c.id] = { sig:data, signedAt:new Date().toISOString() };
        if(saveState()) showToast(c.name+" signed");
        var crew = crewOnly(trip);
        if(crew.every(function(x){ return trip.contracts[x.id]; })){
          // Everyone has signed: back to the trip, ready to fish.
          go("trip"); showToast("All contracts signed — ready to fish");
        } else render();
      }, 360);
    };
  }
  function buildContractsPdf(trip, only){
    if(!window.jspdf){ showToast("PDF library missing", true); return; }
    var crew = only || crewOnly(trip);
    if(!crew.length){ showToast("No crew on this trip", true); return; }
    var doc = new window.jspdf.jsPDF({ unit:"mm", format:"a4" });
    var L = 20, W = 170;
    crew.forEach(function(c, idx){
      if(idx) doc.addPage();
      var y = 22;
      doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.text(String(state.settings.owner||"NTOZA FISHING (Pty) Ltd").toUpperCase(), 105, y, { align:"center" }); y += 8;
      doc.setFontSize(12); doc.text("VOYAGE CONTRACT OF EMPLOYMENT – Vessel Antares", 105, y, { align:"center" }); y += 10;
      doc.setFont("helvetica","normal"); doc.setFontSize(10);
      function para(t){ var l = doc.splitTextToSize(t, W); doc.text(l, L, y); y += l.length*4.6 + 3; }
      function heading(t){ doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.text(t, L, y); y += 5.5; doc.setFont("helvetica","normal"); doc.setFontSize(10); }
      function fieldLine(pairs){
        var x = L;
        pairs.forEach(function(pr){
          doc.setFont("helvetica","normal"); doc.text(pr[0]+":", x, y); x += doc.getTextWidth(pr[0]+": ");
          doc.setFont("helvetica","bold"); doc.text(String(pr[1]||""), x+1, y-0.6);
          doc.setDrawColor(90); doc.line(x, y+1, x+pr[2], y+1); x += pr[2]+6;
        });
        doc.setFont("helvetica","normal"); y += 9;
      }
      para(CONTRACT_INTRO);
      var secs = contractSections(c);
      heading(secs[0][0]); para(secs[0][1]);
      y += 2;
      fieldLine([["Name", c.name, 52],["Surname", c.surname, 60]]);
      fieldLine([["I.D./Passport No", c.idNumber, 45],["Contact No", c.contact, 45]]);
      fieldLine([["Next of Kin & Contact", ((c.kinName||"")+"  "+(c.kinContact||"")).trim(), 120]]);
      fieldLine([["Trip No", trip.tripNumber, 18],["Date Commence", fmtDate(trip.sailDate), 24],["Date Finish", CONTRACT_FINISH, 44]]);
      y += 2;
      secs.slice(1).forEach(function(x){ heading(x[0]); para(x[1]); });
      y += 10;
      var k = trip.contracts[c.id];
      doc.text("Signed by Crew:", L, y);
      if(k){ try{ doc.addImage(k.sig, "PNG", L+30, y-13, 45, 15); }catch(e){} }
      doc.line(L+30, y+1, L+95, y+1);
      doc.text("Date: "+(k ? fmtDate(todayISO(new Date(k.signedAt))) : ""), L+105, y); doc.line(L+115, y+1, L+150, y+1);
      y += 18;
      doc.text("Signed by Skipper/Ntoza Fishing Rep:", L, y);
      sigOnPdf(doc, trip, L+64, y+1, 40); doc.line(L+64, y+1, L+110, y+1);
      doc.text("Date: "+(k ? fmtDate(todayISO(new Date(k.signedAt))) : ""), L+115, y); doc.line(L+125, y+1, L+160, y+1);
      doc.setFontSize(9); doc.text(state.settings.skipper, L+64, y+5);
    });
    var who = crew.length===1 ? "_"+(crew[0].surname||crew[0].name).replace(/[^A-Za-z0-9]/g,"") : "";
    saveFileOut(fileName(trip, "crew_contract"+(crew.length===1?"":"s")+who, "pdf"), doc.output("blob"));
  }

  // ================= Reports =================
  function renderReports(trip){
    setTopbar(tripLabel(trip)+" · Reports", tripRange(trip));
    var el = document.getElementById("screen");
    var rows = dffeRows(trip);
    var sps = dffeSpecies(trip);
    var html = backButton(tripLabel(trip));
    html += '<div class="card"><h2>DFFE catch statistics</h2><div style="overflow-x:auto;">'+
      '<table class="tbl"><tr><th>Date</th><th>Start pos.</th>'+sps.map(function(sp){ return '<th class="r">'+esc(sp.short)+'</th><th class="r">kg</th>'; }).join("")+'</tr>'+
      rows.map(function(r){ return '<tr><td>'+esc(r.dateShort)+'</td><td>'+esc(r.posText)+'</td>'+sps.map(function(sp){ var c = r.sp[sp.code]; return '<td class="r"><b>'+c.n+'</b></td><td class="r">'+(c.kg===""?"–":c.kg)+'</td>'; }).join("")+'</tr>'; }).join("")+
      '<tr><td><b>Offload</b></td><td></td>'+sps.map(function(sp){ var st = weightStats(trip, sp.code); return '<td class="r">'+(st.n||"")+'</td><td class="r"><b>'+(st.n?kg(st.kg):"–")+'</b></td>'; }).join("")+'</tr></table></div>'+
      '<p class="helptext">Daily kg = daily count × the offload average for that species.'+(rows.length>16 ? " <b>More than 16 days — only the first 16 fit on one form.</b>" : "")+'</p>'+
      dffeChecks(trip).map(function(w){ return '<div class="locked-note">'+esc(w)+'</div>'; }).join("")+
      '<button class="btn btn-accent" id="btnDffe">DFFE form (Excel)</button></div>';
    var hd = Object.keys(trip.haccp).filter(function(d){ return trip.haccp[d].doneAt; }).length;
    html += '<div class="card"><h2>HACCP</h2><p class="helptext" style="margin:0 0 10px;">End-of-day checks saved for '+hd+' of '+tripDates(trip).length+' days.</p><div class="sheet-actions">'+
      '<button class="btn btn-ghost" id="btnOffTemps">🌡 Offloading temperatures</button>'+
      '<button class="btn btn-ghost" id="btnFishPdf">Fresh fish inspection (PDF)</button>'+
      '<button class="btn btn-ghost" id="btnSanPdf">Sanitation &amp; storage (PDF)</button>'+
      '</div></div>';
    var ended = tripDates(trip).filter(function(d){ return stopsOn(trip,d).length; });
    if(ended.length) html += '<div class="card"><h2>Daily reports</h2>'+ended.map(function(d){
      return '<div class="row-between" style="padding:6px 0;border-bottom:1px solid var(--line);"><b>'+esc(fmtDay(d))+'</b><div class="btnrow" style="flex:0 0 auto;"><button class="btn btn-ghost btn-sm" data-dayrep="'+d+'">PDF</button><button class="btn btn-ghost btn-sm" data-daytext="'+d+'">Text</button></div></div>';
    }).join("")+'</div>';
    if(baitLoaded(trip)) html += '<div class="card"><h2>Bait</h2><p class="sheet-text" style="margin:0;">Loaded '+baitSum(trip,"load")+' · received '+baitSum(trip,"received")+' · used '+baitSum(trip,"used")+' · <b>left '+baitBalance(trip)+' boxes</b>'+(trip.bait.boxKg?' ('+kg(baitBalance(trip)*num(trip.bait.boxKg))+' kg)':'')+'</p></div>';
    if(!trip.weights.length) html += '<div class="locked-note">The weigh sheet isn\'t done yet — the DFFE form needs the offload weights.</div>';
    html += '<div class="card"><h2>Other files</h2><div class="sheet-actions">'+
      '<button class="btn btn-ghost" id="btnCrewPdf2">Crew list (PDF)</button>'+
      '<button class="btn btn-ghost" id="btnContractsPdf">Crew contracts (PDF)</button>'+
      '<button class="btn btn-ghost" id="btnDepPdf">Departure &amp; landing record (PDF)</button>'+
      '<button class="btn btn-ghost" id="btnStopsCsv">Stop log (CSV)</button>'+
      '<button class="btn btn-ghost" id="btnWeightsCsv">Weight sheet (CSV)</button>'+
      (trip.skipperSig ? '' : '<button class="btn btn-outline" id="btnSignR">✍ Add skipper signature</button>')+
      '</div></div>';
    el.innerHTML = html;
    wireBack(function(){ go("trip"); });
    document.getElementById("btnDffe").onclick = function(){ buildDffeXlsx(trip).then(function(blob){ return saveFileOut(fileName(trip,"dffe_catch_stats","xlsx"), blob); }).catch(function(e){ console.error(e); showToast("Could not make the DFFE form: "+e.message, true); }); };
    document.getElementById("btnStopsCsv").onclick = function(){ saveFileOut(fileName(trip,"stop_log","csv"), new Blob([stopsCsv(trip)], { type:"text/csv" })); };
    document.getElementById("btnWeightsCsv").onclick = function(){ saveFileOut(fileName(trip,"weights","csv"), new Blob([weightsCsv(trip)], { type:"text/csv" })); };
    document.getElementById("btnCrewPdf2").onclick = function(){ buildCrewPdf(trip); };
    document.getElementById("btnContractsPdf").onclick = function(){ buildContractsPdf(trip, null); };
    document.getElementById("btnDepPdf").onclick = function(){ buildDepartureRecordPdf(trip); };
    document.getElementById("btnOffTemps").onclick = function(){ if(storageLocked){ lockedGuard(trip); return; } openOffloadTemps(trip); };
    document.getElementById("btnFishPdf").onclick = function(){ buildFishInspectionPdf(trip); };
    document.getElementById("btnSanPdf").onclick = function(){ buildSanitationPdf(trip); };
    var sr = document.getElementById("btnSignR"); if(sr) sr.onclick = function(){ captureSkipperSig(trip); };
    el.querySelectorAll("[data-dayrep]").forEach(function(b){ b.onclick = function(){ buildDayReportPdf(trip, b.getAttribute("data-dayrep")); }; });
    el.querySelectorAll("[data-daytext]").forEach(function(b){ b.onclick = function(){ shareDayText(trip, b.getAttribute("data-daytext")); }; });
  }
  // Species for the form: always longfin, plus anything caught or weighed.
  function dffeSpecies(trip){
    var list = speciesInTrip(trip);
    if(!list.some(function(x){ return x.code==="ALB"; })) list.unshift(speciesOf("ALB"));
    return list;
  }
  function dffeChecks(trip){
    var w = [];
    if(!trip.tripNumber) w.push("Trip number is missing (Trip details).");
    if(!trip.dischargeDate) w.push("Discharge date is missing (End trip / Trip details).");
    dffeSpecies(trip).forEach(function(sp){
      var st = weightStats(trip, sp.code), n = sumSp(trip.stops, sp.code);
      if(st.n!==n && (st.n || n)) w.push("Weigh sheet has "+st.n+" "+sp.short+" but the stops add up to "+n+".");
    });
    var custom = dffeSpecies(trip).filter(function(x){ return x.custom; });
    if(custom.length>SPARE_COLS.length) w.push("The form has only "+SPARE_COLS.length+" spare species columns; "+custom.slice(SPARE_COLS.length).map(function(x){ return x.name; }).join(", ")+" won't fit.");
    tripDates(trip).forEach(function(d){ if(!dayInfo(trip,d).sst) w.push("No SST for "+fmtDay(d)+" (Day ▾ → DFFE day details)."); });
    return w;
  }
  // One row per fishing day, in the shape the DFFE form wants.
  function dffeRows(trip){
    var sps = dffeSpecies(trip);
    var avg = {}; sps.forEach(function(sp){ var st = weightStats(trip, sp.code); avg[sp.code] = st.n ? st.avg : null; });
    return tripDates(trip).map(function(d){
      var list = stopsOn(trip, d);
      var first = list.find(function(x){ return x.lat!=="" && x.lon!==""; });
      var info = dayInfo(trip, d);
      var lat = first ? degMin(first.lat) : null, lon = first ? degMin(first.lon) : null;
      var pole = Math.max(0, Math.min(100, int(info.polePct||"100")));
      var sp = {}, caught = [];
      sps.forEach(function(x){ var n = sumSp(list, x.code); sp[x.code] = { n:n, kg: avg[x.code]!==null ? Math.round(n*avg[x.code]) : "" }; if(n) caught.push(x.code); });
      return {
        date:d, dateText:fmtDate(d), dateShort:fmtDay(d), crew:info.crew, gear:info.gear,
        latDeg: lat ? lat.deg : "", latMin: lat ? Math.round(lat.min) : "", lonDeg: lon ? lon.deg : "", lonMin: lon ? Math.round(lon.min) : "",
        posText: first ? fmtPos(first.lat, first.lon) : "–",
        sst: info.sst, target: caught.length ? caught.join(" ") : "ALB", hours: info.hours, liveBait: info.liveBait,
        baitCondition: info.liveBait==="Y" ? (info.baitCondition||"") : "--",
        sp: sp, alb: sp.ALB.n, albKg: sp.ALB.kg, yft: sp.YFT ? sp.YFT.n : 0, yftKg: sp.YFT ? sp.YFT.kg : "",
        pole: pole, line: 100-pole
      };
    });
  }
  function stopsCsv(trip){
    var sps = speciesInTrip(trip); if(!sps.some(function(x){ return x.code==="ALB"; })) sps.unshift(speciesOf("ALB"));
    var rows = [["Trip","Date","Time","Lat (dec)","Lon (dec)","Position"].concat(sps.map(function(x){ return x.code; }),["Day ALB","Trip ALB","Tank","SST C","Wind dir","Wind kn","Sea","Drift to","Drift kn","School depth m","Bait","Day weather","Notes"])];
    var acc = 0, dayAcc = {};
    sortedStops(trip).forEach(function(st){
      acc += int(st.alb); dayAcc[st.date] = (dayAcc[st.date]||0) + int(st.alb);
      rows.push([trip.tripNumber, st.date, st.time, st.lat, st.lon, fmtPos(st.lat,st.lon)].concat(sps.map(function(x){ return countOf(st, x.code); }),
        [dayAcc[st.date], acc, st.tank, st.sst, st.windDir, st.windKn, st.sea, st.driftDir, st.driftKn, st.schoolDepth, st.bait, weatherText(trip.days[st.date]), st.notes]));
    });
    return toCsv(rows);
  }
  function weightsCsv(trip){
    var rows = [["Trip","No.","Species","Weight kg","Fork length cm"]];
    var n = {};
    trip.weights.forEach(function(w){ n[w.sp] = (n[w.sp]||0)+1; rows.push([trip.tripNumber, n[w.sp], w.sp, w.kg, w.len]); });
    allSpecies().forEach(function(sp){ var st = weightStats(trip, sp.code); if(st.n) rows.push(["","Total",sp.code,kg(st.kg),"avg "+kg(st.avg)]); });
    return toCsv(rows);
  }

  // ---------- DFFE Excel form ----------
  // Fills the official form (kept inside the app, logo and all) by editing
  // its sheet XML directly, so the layout is exactly DFFE's own.
  var NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  function colIndex(ref){ var m = /^([A-Z]+)/.exec(ref)[1], n = 0; for(var i=0;i<m.length;i++) n = n*26 + (m.charCodeAt(i)-64); return n; }
  function setCell(doc, ref, value){
    var rowNo = int(/\d+$/.exec(ref)[0]);
    var sheetData = doc.getElementsByTagNameNS(NS, "sheetData")[0];
    var row = null, rows = sheetData.getElementsByTagNameNS(NS, "row");
    for(var i=0;i<rows.length;i++){ if(int(rows[i].getAttribute("r"))===rowNo){ row = rows[i]; break; } if(int(rows[i].getAttribute("r"))>rowNo){ break; } }
    if(!row){
      row = doc.createElementNS(NS, "row"); row.setAttribute("r", String(rowNo));
      var before = null; for(var j=0;j<rows.length;j++){ if(int(rows[j].getAttribute("r"))>rowNo){ before = rows[j]; break; } }
      sheetData.insertBefore(row, before);
    }
    var cell = null, cells = row.getElementsByTagNameNS(NS, "c");
    for(var k=0;k<cells.length;k++){ if(cells[k].getAttribute("r")===ref){ cell = cells[k]; break; } }
    if(!cell){
      cell = doc.createElementNS(NS, "c"); cell.setAttribute("r", ref);
      var nextCell = null; for(var q=0;q<cells.length;q++){ if(colIndex(cells[q].getAttribute("r"))>colIndex(ref)){ nextCell = cells[q]; break; } }
      row.insertBefore(cell, nextCell);
    }
    while(cell.firstChild) cell.removeChild(cell.firstChild);
    if(value===null || value===undefined || value===""){ cell.removeAttribute("t"); return; }
    if(typeof value==="number"){
      cell.setAttribute("t","n");
      var v = doc.createElementNS(NS, "v"); v.textContent = String(value); cell.appendChild(v);
    } else {
      cell.setAttribute("t","inlineStr");
      var is = doc.createElementNS(NS, "is"), t = doc.createElementNS(NS, "t");
      t.setAttribute("xml:space","preserve"); t.textContent = String(value);
      is.appendChild(t); cell.appendChild(is);
    }
  }
  function b64ToBytes(b64){ var bin = atob(b64), out = new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i); return out; }
  function buildDffeXlsx(trip){
    return new Promise(function(resolve){
      var F = window.fflate;
      var files = F.unzipSync(b64ToBytes(DFFE_TEMPLATE_B64));
      var path = "xl/worksheets/sheet1.xml";
      var doc = new DOMParser().parseFromString(F.strFromU8(files[path]), "application/xml");
      var s = state.settings;
      var rows = dffeRows(trip);
      var first = rows[0] ? rows[0].date : (trip.sailDate || todayISO());
      var put = function(ref, v){ setCell(doc, ref, v); };
      put("M3", s.observer||"N"); put("S3", s.vessel); put("Z3", MONTHS[int(first.slice(5,7))-1] || "");
      put("L4", s.rightsHolder); put("S4", s.registrationNo); put("Z4", int(first.slice(0,4)));
      put("M5", s.rightNo); put("S5", s.skipper); put("Z5", fmtDate(trip.sailDate));
      put("M6", s.permitNo); put("S6", s.contact); put("Z6", fmtDate(trip.dischargeDate));
      put("S7", s.email); put("Z7", s.port);
      var tripNo = trip.tripNumber ? (/^\d+$/.test(trip.tripNumber) ? int(trip.tripNumber) : trip.tripNumber) : "";
      var sps = dffeSpecies(trip);
      // Fixed form columns; species the skipper added take the spare columns.
      var colOf = {}, poleCols = { P:["Q","R"], S:["T","U"], V:["W","X"], Y:["Z","AA"] };
      var spare = 0;
      sps.forEach(function(sp){
        var b = BUILTIN_SPECIES.find(function(x){ return x.code===sp.code; });
        if(b) colOf[sp.code] = b.col;
        else if(spare < SPARE_COLS.length){ colOf[sp.code] = SPARE_COLS[spare]; put(SPARE_COLS[spare]+"10", sp.name); spare++; }
      });
      var fixedCols = ["P","S","V","Y","AB","AC","AD"];
      var a = weightStats(trip,"ALB");
      // Block 1 holds days 1-8 (rows 12-27), block 2 days 9-16 (rows 29-44).
      [[12,28],[29,45]].forEach(function(block, bi){
        var dayRows = rows.slice(bi*8, bi*8+8);
        if(bi===1 && !dayRows.length) return;
        put("A"+block[0], tripNo);
        dayRows.forEach(function(r, i){
          var R = block[0] + i*2;
          put("B"+R, r.dateText); put("C"+R, r.crew!=="" ? int(r.crew) : ""); put("D"+R, r.gear);
          put("E"+R, r.latDeg); put("G"+R, r.latMin); put("H"+R, r.lonDeg); put("I"+R, r.lonMin);
          put("J"+R, r.sst ? (/^-?\d+(\.\d+)?$/.test(r.sst) ? num(r.sst) : r.sst) : "");
          put("K"+R, r.target); put("L"+R, r.hours!=="" ? num(r.hours) : ""); put("M"+R, r.liveBait); put("N"+R, r.baitCondition);
          fixedCols.forEach(function(c){ put(c+R, 0); if(poleCols[c]){ put(poleCols[c][0]+R, 0); put(poleCols[c][1]+R, 0); put(c+(R+1), 0); } });
          sps.forEach(function(sp){
            var c = colOf[sp.code]; if(!c) return;
            var v = r.sp[sp.code];
            put(c+R, v.n);
            if(poleCols[c]){ put(poleCols[c][0]+R, v.n || c==="P" ? r.pole : 0); put(poleCols[c][1]+R, v.n || c==="P" ? r.line : 0); }
            put(c+(R+1), v.kg);
          });
        });
        if(bi===0 || rows.length>8){
          sps.forEach(function(sp){ var c = colOf[sp.code]; if(!c) return; var st = weightStats(trip, sp.code); put(c+block[1], st.n ? Math.round(st.kg*10)/10 : ""); });
        }
      });
      var t = tripTotals(trip);
      var comment = "Comments: Trip "+(trip.tripNumber||"")+" sailed "+s.port+" "+fmtDate(trip.sailDate)+(trip.sailTime?" "+trip.sailTime:"")+
        (rows.length ? ", fished "+rows[0].dateText+(rows.length>1?" - "+rows[rows.length-1].dateText:"") : "")+
        (trip.dischargeDate ? ", discharged "+fmtDate(trip.dischargeDate) : "")+". Stop log: "+sps.map(function(sp){ return sumSp(trip.stops, sp.code)+" "+sp.code; }).join(", ")+"."+
        (a.n ? " Offload: "+sps.filter(function(sp){ return weightStats(trip, sp.code).n; }).map(function(sp){ var st = weightStats(trip, sp.code); return st.n+" "+sp.code+" "+kg(st.kg)+" kg"; }).join(", ")+". Daily kg = daily count x offload average." : "")+
        " Position = first stop of each day.";
      put("A46", comment);
      put("S56", s.skipper); put("AA56", fmtDate(trip.dischargeDate || todayISO()));
      var xml = new XMLSerializer().serializeToString(doc);
      if(!/^<\?xml/.test(xml)) xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xml;
      files[path] = F.strToU8(xml);
      var out = {};
      Object.keys(files).forEach(function(k){ if(!/\/$/.test(k)) out[k] = files[k]; });
      var zipped = F.zipSync(out, { level:6 });
      resolve(new Blob([zipped], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    });
  }

  // ================= Menu, settings, backup =================
  function openMenu(){
    var sh = openSheet('<h2>Menu</h2><div class="menu-list">'+
      '<button class="btn btn-ghost" data-a="settings">⚙ Vessel &amp; form details</button>'+
      '<button class="btn btn-ghost" data-a="backup">💾 Backup &amp; restore</button>'+
      '<button class="btn btn-ghost" data-a="crew">👥 Known crew ('+state.knownCrew.length+')</button>'+
      '</div><div class="sheet-foot"><button class="btn btn-outline" data-a="close">Close</button></div>');
    sh.sheet.querySelector('[data-a="close"]').onclick = sh.close;
    sh.sheet.querySelector('[data-a="settings"]').onclick = function(){ sh.close(); openSettings(); };
    sh.sheet.querySelector('[data-a="backup"]').onclick = function(){ sh.close(); openBackupSheet(); };
    sh.sheet.querySelector('[data-a="crew"]').onclick = function(){ sh.close(); openKnownCrew(); };
  }
  function openSettings(){
    var s = state.settings;
    var f = [["Vessel name","vessel"],["Vessel reg no. (DFFE form)","registrationNo"],["Rights holder","rightsHolder"],["Right application no.","rightNo"],["Permit no.","permitNo"],["Skipper","skipper"],["Skipper ID no.","skipperId"],["Skipper contact no.","contact"],["Email","email"],["Discharge port","port"],
      ["Owner/operator (crew list)","owner"],["Official/licence no. (crew list)","licenceNo"],["Port (crew list)","crewListPort"],
      ["Fishery Control Officer name","fcoName"],["FCO cell number (WhatsApp/SMS)","fcoPhone"],["FCO email","fcoEmail"],["VMS provider / contact","vmsProvider"],["Fishing area (FCO notice)","fishingArea"]];
    var sh = openSheet('<h2>Vessel &amp; form details</h2>'+f.map(function(x){ return field(x[0], "set_"+x[1], s[x[1]]); }).join("")+
      '<div class="sectionlabel">Observer on board (default)</div>'+chips("observer", [{code:"N",label:"No"},{code:"Y",label:"Yes"}], s.observer)+
      '<div class="sectionlabel">Defaults for each fishing day</div>'+
      '<div class="grid2">'+field("Crew", "set_defaultCrew", s.defaultCrew, "text", 'inputmode="numeric"')+field("Hours fishing", "set_defaultHours", s.defaultHours, "text", 'inputmode="decimal"')+'</div>'+
      '<div class="sectionlabel">Gear</div>'+chips("gear", ["P","L","P/L"], s.gear)+
      '<div class="sectionlabel">Live bait</div>'+chips("liveBait", [{code:"Y",label:"Yes"},{code:"N",label:"No"}], s.liveBait)+
      field("% pole", "set_polePct", s.polePct, "text", 'inputmode="numeric"')+
      '<div class="sheet-foot"><button class="btn btn-outline" data-a="cancel">Cancel</button><button class="btn btn-accent" data-a="save">Save</button></div>');
    wireChips(sh.sheet);
    sh.sheet.querySelector('[data-a="cancel"]').onclick = sh.close;
    sh.sheet.querySelector('[data-a="save"]').onclick = function(){
      f.concat([["","defaultCrew"],["","defaultHours"],["","polePct"]]).forEach(function(x){ s[x[1]] = val(sh.sheet, "set_"+x[1]); });
      s.observer = chipValue(sh.sheet,"observer") || "N"; s.gear = chipValue(sh.sheet,"gear") || "P"; s.liveBait = chipValue(sh.sheet,"liveBait") || "N";
      saveState(); sh.close(); render(); showToast("Saved");
    };
  }
  function openKnownCrew(){
    var html = '<h2>Known crew</h2><p class="helptext">People added to a trip are remembered here so they can be picked next time.</p>'+
      (state.knownCrew.length ? state.knownCrew.map(function(k,i){ return '<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--line);"><div><b>'+esc(k.name+" "+k.surname)+'</b><div class="helptext" style="margin:0;">'+esc(k.idNumber||"")+'</div></div><button class="btn btn-danger btn-sm" data-k="'+i+'">Forget</button></div>'; }).join("") : '<p class="sheet-text">Nobody yet.</p>')+
      '<div class="sheet-foot"><button class="btn btn-accent" data-a="ok">Close</button></div>';
    var sh = openSheet(html);
    sh.sheet.querySelector('[data-a="ok"]').onclick = sh.close;
    sh.sheet.querySelectorAll("[data-k]").forEach(function(b){ b.onclick = function(){ state.knownCrew.splice(int(b.getAttribute("data-k")),1); saveState(); sh.close(); openKnownCrew(); }; });
  }
  function exportBackup(){
    var json = JSON.stringify({ app:"antares-logbook", savedAt:new Date().toISOString(), data:state }, null, 1);
    saveFileOut(fileName(null, "backup", "json"), new Blob([json], { type:"application/json" })).then(function(){
      if(storageLocked) return;
      state.backupAt = new Date().toISOString(); saveState(); render();
    });
  }
  function openBackupSheet(){
    var html = '<h2>Backup &amp; restore</h2>'+
      (loadProblem ? '<div class="locked-note" style="display:block;">The saved logbook could not be read'+(loadProblem.copyKey?" (a copy was kept on the phone)":"")+'. Restore your last backup file, or start empty.</div>' : '')+
      '<p class="sheet-text">'+esc(backupStatusText())+'\nThe backup file has crew ID numbers in it, so keep it out of group chats.</p>'+
      '<div class="sheet-actions"><button class="btn btn-accent" data-a="backup">Back up all data now</button>'+
      '<button class="btn btn-ghost" data-a="restore">Restore from a backup file</button>'+
      (loadProblem ? '<button class="btn btn-danger" data-a="fresh">Start with an empty logbook</button>' : '')+
      '<button class="btn btn-outline" data-a="close">Close</button></div><input type="file" id="restoreFile" accept=".json,application/json" class="hidden">';
    var sh = openSheet(html);
    sh.sheet.querySelector('[data-a="close"]').onclick = sh.close;
    sh.sheet.querySelector('[data-a="backup"]').onclick = function(){ sh.close(); exportBackup(); };
    var file = sh.sheet.querySelector("#restoreFile");
    sh.sheet.querySelector('[data-a="restore"]').onclick = function(){ file.click(); };
    var fresh = sh.sheet.querySelector('[data-a="fresh"]');
    if(fresh) fresh.onclick = function(){ showConfirm("Start an empty logbook? The unreadable data stays copied on the phone.", "Start empty", "btn-danger", function(){ storageLocked = false; loadProblem = null; state = emptyState(); saveState(); sh.close(); go("trips", null); }); };
    file.onchange = function(){
      var f = file.files && file.files[0]; if(!f) return;
      var r = new FileReader();
      r.onload = function(){
        var parsed = null;
        try{ parsed = JSON.parse(r.result); }catch(e){}
        var data = parsed && isPlainObject(parsed.data) ? parsed.data : parsed;
        if(!isPlainObject(data) || !Array.isArray(data.trips)){ showToast("That file isn't an Antares logbook backup", true); return; }
        var incoming = normaliseState(data);
        var stops = incoming.trips.reduce(function(a,t){ return a+t.stops.length; }, 0);
        showConfirm("Replace everything on this phone with the backup?\n\n"+incoming.trips.length+" trips, "+stops+" stops.\nWhat's on the phone now is kept as a copy first.", "Restore", "btn-danger", function(){
          try{ var now = localStorage.getItem(STORAGE_KEY); if(now) keepCopyOf(now, "before_restore"); }catch(e){}
          state = incoming; storageLocked = false; loadProblem = null;
          if(saveState()){ sh.close(); go("trips", null); showToast("Restored "+incoming.trips.length+" trips"); }
        });
      };
      r.readAsText(f);
    };
  }

  // ================= Back button, theme, start =================
  function handleBack(){
    if(openSheets.length){ tryClose(openSheets[openSheets.length-1]); return; }
    if(view.screen==="contracts"){ go("crew"); return; }
    if(view.screen==="weights" || view.screen==="crew" || view.screen==="reports"){ go("trip"); return; }
    if(view.screen==="trip"){ go("trips", null); return; }
    showConfirm("Close the logbook?", "Close", "btn-accent", function(){
      try{ window.Capacitor.Plugins.App.exitApp(); }catch(e){}
    });
  }
  function registerBack(){
    try{
      var App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if(App && App.addListener) App.addListener("backButton", handleBack);
    }catch(e){}
  }
  function applyTheme(t){
    document.documentElement.setAttribute("data-theme", t);
    try{ localStorage.setItem(STORAGE_KEY+"_theme", t); }catch(e){}
  }
  document.getElementById("btnTheme").onclick = function(){ applyTheme(document.documentElement.getAttribute("data-theme")==="sun" ? "dark" : "sun"); };
  document.getElementById("btnMenu").onclick = openMenu;
  document.getElementById("btnHome").onclick = function(){ go("trips", null); };
  try{ applyTheme(localStorage.getItem(STORAGE_KEY+"_theme") || "dark"); }catch(e){}
  registerBack();
  // Open straight into the trip that's at sea.
  var atSea = openTrip();
  if(atSea){ view.screen = "trip"; view.tripId = atSea.id; }
  render();
  if(loadProblem) openBackupSheet();
  // For the browser tests only.
  window.__antares = { state:function(){ return state; }, dffeRows:dffeRows, buildDffeXlsx:buildDffeXlsx, stopsCsv:stopsCsv };
})();
