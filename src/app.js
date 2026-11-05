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
  var SPECIES = { ALB:"Albacore", YFT:"Yellowfin" };

  function defaultSettings(){ return {
    vessel:"ANTARES", registrationNo:"HTB278", rightsHolder:"Southwest Tuna Fishing Cc",
    rightNo:"TPL21222", permitNo:"2602382", skipper:"Johann Kruger", contact:"083 204 4880",
    email:"johannkruger1@gmail.com", port:"Hout Bay", observer:"N",
    defaultCrew:"10", defaultHours:"13", gear:"P", liveBait:"N", baitCondition:"", polePct:"100"
  }; }
  var SETTINGS_TEXT = Object.keys(defaultSettings());
  var TRIP_TEXT = ["tripNumber","sailDate","sailTime","dischargeDate","notes"];
  var STOP_TEXT = ["date","time","lat","lon","gpsNote","alb","yft","tank","sst","windDir","windKn","sea","driftDir","driftKn","schoolDepth","bait","notes"];
  var DAY_TEXT = ["crew","hours","gear","liveBait","baitCondition","polePct","sst"];
  var CREW_TEXT = ["name","surname","idNumber","role"];
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
    return { schemaVersion:SCHEMA_VERSION, settings:defaultSettings(), trips:[], knownCrew:[], lastConditions:{}, backupAt:"" };
  }
  function textFields(obj, keys){ keys.forEach(function(k){ if(obj[k]==null) obj[k]=""; else if(typeof obj[k]!=="string") obj[k]=String(obj[k]); }); return obj; }
  function normaliseState(s){
    var out = emptyState();
    out.schemaVersion = SCHEMA_VERSION;
    out.settings = Object.assign(defaultSettings(), isPlainObject(s.settings) ? s.settings : {});
    textFields(out.settings, SETTINGS_TEXT);
    out.knownCrew = (Array.isArray(s.knownCrew) ? s.knownCrew : []).filter(isPlainObject).map(function(c){ return textFields(Object.assign({}, c), CREW_TEXT); });
    out.lastConditions = isPlainObject(s.lastConditions) ? s.lastConditions : {};
    out.backupAt = typeof s.backupAt === "string" ? s.backupAt : "";
    out.trips = (Array.isArray(s.trips) ? s.trips : []).filter(isPlainObject).map(function(t){
      var trip = textFields(Object.assign({}, t), TRIP_TEXT);
      if(!trip.id) trip.id = uid();
      trip.ended = !!trip.ended;
      trip.createdAt = typeof trip.createdAt === "number" ? trip.createdAt : Date.now();
      trip.crew = (Array.isArray(t.crew) ? t.crew : []).filter(isPlainObject).map(function(c){ var x = textFields(Object.assign({}, c), CREW_TEXT); if(!x.id) x.id = uid(); return x; });
      trip.stops = (Array.isArray(t.stops) ? t.stops : []).filter(isPlainObject).map(function(p){ var x = textFields(Object.assign({}, p), STOP_TEXT); if(!x.id) x.id = uid(); return x; });
      trip.days = {};
      if(isPlainObject(t.days)) Object.keys(t.days).forEach(function(k){ if(isPlainObject(t.days[k])) trip.days[k] = textFields(Object.assign({}, t.days[k]), DAY_TEXT); });
      trip.weights = (Array.isArray(t.weights) ? t.weights : []).filter(isPlainObject).map(function(w){ var x = textFields(Object.assign({}, w), ["sp","kg","len"]); if(!x.id) x.id = uid(); if(x.sp!=="YFT") x.sp = "ALB"; return x; });
      return trip;
    });
    return out;
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
  function tripTotals(trip){ return { alb:sumOf(trip.stops,"alb"), yft:sumOf(trip.stops,"yft"), stops:trip.stops.length, days:tripDates(trip).length }; }
  function weightStats(trip, sp){
    var list = trip.weights.filter(function(w){ return w.sp===sp && num(w.kg)>0; });
    var total = list.reduce(function(a,w){ return a+num(w.kg); }, 0);
    return { n:list.length, kg:total, avg:list.length ? total/list.length : 0 };
  }
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
      crew: d.crew || String(trip.crew.length || s.defaultCrew || ""),
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
        '<div class="t2"><b style="color:var(--kelp)">'+tot.alb+' ALB</b>'+(tot.yft?' · <b style="color:var(--yellow)">'+tot.yft+' YFT</b>':'')+'</div>'+
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
      (isNew && last && last.crew.length ? '<label class="chip on" id="copyCrew" style="margin:6px 0 4px;">✓ Same crew as '+esc(tripLabel(last))+' ('+last.crew.length+')</label>' : '')+
      '<div class="field"><label for="tNotes">Notes</label><textarea id="tNotes">'+esc(t.notes)+'</textarea></div>'+
      '<div class="sheet-foot"><button class="btn btn-outline" data-a="cancel">Cancel</button><button class="btn btn-accent" data-a="save">'+(isNew?"Start trip":"Save")+'</button></div>'
    );
    var copy = s.sheet.querySelector("#copyCrew");
    if(copy) copy.onclick = function(){ copy.classList.toggle("on"); copy.textContent = (copy.classList.contains("on")?"✓ ":"")+"Same crew as "+tripLabel(last)+" ("+last.crew.length+")"; };
    s.sheet.querySelector('[data-a="cancel"]').onclick = s.close;
    s.sheet.querySelector('[data-a="save"]').onclick = function(){
      var no = val(s.sheet,"tTripNo");
      var clash = state.trips.find(function(x){ return x!==trip && no && x.tripNumber===no; });
      if(clash){ showToast("Trip "+no+" already exists", true); return; }
      if(isNew){
        trip = { id:uid(), createdAt:Date.now(), ended:false, crew:[], stops:[], days:{}, weights:[] };
        if(copy && copy.classList.contains("on")) trip.crew = last.crew.map(function(c){ return Object.assign({}, c, { id:uid() }); });
        state.trips.push(trip);
      }
      trip.tripNumber = no; trip.sailDate = val(s.sheet,"tSail"); trip.sailTime = val(s.sheet,"tSailTime");
      trip.dischargeDate = val(s.sheet,"tDis"); trip.notes = val(s.sheet,"tNotes");
      saveState(); s.close();
      if(isNew) go("trip", trip.id); else render();
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
      '<div><div class="n">'+tot.alb+'</div><div class="l">ALB trip</div></div>'+
      '<div><div class="n yf">'+tot.yft+'</div><div class="l">YFT trip</div></div>'+
      '<div><div class="n" style="color:var(--text)">'+tot.stops+'</div><div class="l">stops</div></div>'+
      '</div></div>';
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
      html += '<div class="dayhead"><div><div class="d">'+esc(fmtDay(d))+'</div><div class="s">'+list.length+' stops · '+sumOf(list,"alb")+' ALB'+(sumOf(list,"yft")?' · '+sumOf(list,"yft")+' YFT':'')+(info.sst?' · SST '+esc(info.sst):'')+'</div></div>'+
        '<button class="btn btn-ghost btn-sm" data-day="'+d+'">Day details</button></div>';
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
          '</div><div class="fish"><div class="a">'+int(s.alb)+(int(s.yft)?' <span class="tag yf">+'+int(s.yft)+' YF</span>':'')+'</div><div class="r">'+dayAcc+' / '+running[s.id]+'</div></div></div>';
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
    el.querySelectorAll("[data-day]").forEach(function(b){ b.onclick = function(){ openDaySheet(trip, b.getAttribute("data-day")); }; });
    el.querySelectorAll("[data-stop]").forEach(function(r){ r.onclick = function(){ openStopSheet(trip, trip.stops.find(function(s){ return s.id===r.getAttribute("data-stop"); })); }; });
    if(!trip.ended){
      var fab = document.getElementById("fab");
      fab.innerHTML = '<button class="btn btn-accent btn-big" id="btnLogStop">📍 LOG STOP</button>';
      fab.classList.remove("hidden");
      document.getElementById("btnLogStop").onclick = function(){ openStopSheet(trip, null); };
    }
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
    var lastStop = sortedStops(trip).slice(-1)[0];
    var lc = state.lastConditions || {};
    var s0 = stop ? Object.assign({}, stop) : {
      date: todayISO(), time: nowHM(), lat:"", lon:"", gpsNote:"", alb:"", yft:"",
      tank: lastStop ? lastStop.tank : "",
      sst: lc.sst||"", windDir: lc.windDir||"", windKn: lc.windKn||"", sea: lc.sea||"", driftDir: lc.driftDir||"", driftKn: lc.driftKn||"",
      schoolDepth:"", bait: lc.bait||"", notes:""
    };
    var dirty = false;
    var html =
      '<h2>'+(isNew?"New stop":"Stop "+esc(s0.time))+'</h2>'+
      '<div class="gpsbox" id="gpsBox"><div class="p" id="gpsText"></div><button class="btn btn-ghost btn-sm" id="btnGps">GPS</button></div>'+
      '<div class="sectionlabel">Albacore (longfin)</div>'+
      '<div class="counter"><button data-step="alb:-1">−</button><input id="sAlb" type="number" inputmode="numeric" min="0" value="'+esc(s0.alb)+'" placeholder="0"><button data-step="alb:1">+</button></div>'+
      '<div class="quick"><button data-step="alb:5">+5</button><button data-step="alb:10">+10</button><button data-step="alb:20">+20</button><button data-step="alb:50">+50</button></div>'+
      '<div class="sectionlabel">Yellowfin</div>'+
      '<div class="counter small"><button data-step="yft:-1">−</button><input id="sYft" type="number" inputmode="numeric" min="0" value="'+esc(s0.yft)+'" placeholder="0"><button data-step="yft:1">+</button></div>'+
      '<div class="sectionlabel">Tank</div>'+chips("tank", TANKS, s0.tank, "sq")+
      '<details class="more"'+(isNew?'':' open')+'><summary>Conditions (kept from the last stop)</summary>'+
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
    root.querySelectorAll("[data-step]").forEach(function(b){
      b.onclick = function(){
        var p = b.getAttribute("data-step").split(":");
        var input = root.querySelector(p[0]==="alb" ? "#sAlb" : "#sYft");
        input.value = String(Math.max(0, int(input.value) + int(p[1])));
        dirty = true;
      };
    });
    root.addEventListener("input", function(){ dirty = true; });
    wireChips(root, function(){ dirty = true; });
    root.querySelector('[data-a="cancel"]').onclick = function(){ tryClose(sh.entry); };
    var del = root.querySelector("#btnDelStop");
    if(del) del.onclick = function(){
      showConfirm("Delete the "+s0.time+" stop ("+int(s0.alb)+" ALB)?", "Delete", "btn-danger", function(){
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
      rec.alb = String(int(val(root,"sAlb"))); rec.yft = String(int(val(root,"sYft")));
      rec.tank = chipValue(root,"tank");
      rec.sst = val(root,"sSst"); rec.schoolDepth = val(root,"sDepth"); rec.driftKn = val(root,"sDriftKn");
      rec.windDir = chipValue(root,"windDir"); rec.windKn = chipValue(root,"windKn"); rec.sea = chipValue(root,"sea");
      rec.driftDir = chipValue(root,"driftDir"); rec.bait = chipValue(root,"bait"); rec.notes = val(root,"sNotes");
      textFields(rec, STOP_TEXT);
      if(!stop) trip.stops.push(rec);
      state.lastConditions = {}; CONDITION_FIELDS.forEach(function(k){ if(k!=="schoolDepth") state.lastConditions[k] = rec[k]; });
      saveState(); sh.close(); render();
      var tot = tripTotals(trip);
      showToast("Saved · "+rec.alb+" ALB · day "+sumOf(stopsOn(trip, rec.date),"alb")+" · trip "+tot.alb);
    };
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
    trip.stops.forEach(function(s){ var k = s.tank || "—"; by[k] = by[k] || { alb:0, yft:0, stops:0 }; by[k].alb += int(s.alb); by[k].yft += int(s.yft); by[k].stops++; });
    var keys = Object.keys(by).sort();
    var html = '<h2>Fish by tank</h2>';
    if(!keys.length) html += '<p class="sheet-text">No stops yet.</p>';
    else html += '<table class="tbl"><tr><th>Tank</th><th class="r">Stops</th><th class="r">ALB</th><th class="r">YFT</th></tr>'+
      keys.map(function(k){ return '<tr><td><b>'+esc(k==="—"?"Not set":"Tank "+k)+'</b></td><td class="r">'+by[k].stops+'</td><td class="r"><b>'+by[k].alb+'</b></td><td class="r">'+by[k].yft+'</td></tr>'; }).join("")+'</table>'+
      '<p class="helptext">Set the tank on each stop. A stop split over two tanks: put it on the tank that took most, and note the split.</p>';
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
    if(!trip.weights.length) warn.push("No offload weights yet (you can add them after ending)");
    var noPos = trip.stops.filter(function(s){ return s.lat===""; }).length;
    if(noPos) warn.push(noPos+" stop(s) without a position");
    var html = '<h2>End '+esc(tripLabel(trip))+'</h2>'+
      '<p class="sheet-text">'+tot.stops+' stops · '+tot.alb+' ALB · '+tot.yft+' YFT over '+tot.days+' days.</p>'+
      (warn.length ? '<div class="locked-note" style="display:block;">'+warn.map(esc).join("<br>")+'</div>' : '')+
      field("Discharge date", "eDis", trip.dischargeDate || todayISO(), "date")+
      '<div class="sheet-foot"><button class="btn btn-outline" data-a="cancel">Cancel</button><button class="btn btn-accent" data-a="ok">End trip</button></div>';
    var sh = openSheet(html);
    sh.sheet.querySelector('[data-a="cancel"]').onclick = sh.close;
    sh.sheet.querySelector('[data-a="ok"]').onclick = function(){
      trip.dischargeDate = val(sh.sheet,"eDis"); trip.ended = true;
      saveState(); sh.close(); render();
      showToast("Trip ended. Add the offload weights, then make the DFFE report.");
    };
  }

  // ================= Weight sheet =================
  var wsSpecies = "ALB";
  function renderWeights(trip){
    setTopbar(tripLabel(trip)+" · Weights", "Offload weigh sheet");
    var el = document.getElementById("screen");
    var a = weightStats(trip,"ALB"), y = weightStats(trip,"YFT");
    var tot = tripTotals(trip);
    var html = backButton(tripLabel(trip))+
      '<div class="card"><div class="totals">'+
        '<div><div class="n">'+a.n+'</div><div class="l">ALB · '+kg(a.kg)+' kg<br>avg '+kg(a.avg)+'</div></div>'+
        '<div><div class="n yf">'+y.n+'</div><div class="l">YFT · '+kg(y.kg)+' kg<br>avg '+kg(y.avg)+'</div></div>'+
      '</div>'+
      ((a.n && a.n!==tot.alb) || (y.n && y.n!==tot.yft) ? '<p class="helptext" style="text-align:center;">Stop log counted '+tot.alb+' ALB and '+tot.yft+' YFT.</p>' : '')+
      '</div>'+
      '<div class="card">'+chips("sp", [{code:"ALB",label:"Albacore"},{code:"YFT",label:"Yellowfin"}], wsSpecies)+
      '<div class="wsentry" style="margin-top:10px;"><input id="wKg" type="number" inputmode="decimal" step="0.1" placeholder="kg"><button class="btn btn-accent" id="btnAddW">Add</button></div>'+
      (wsSpecies==="YFT" ? '<div style="margin-top:8px;">'+field("Fork length cm (optional)", "wLen", "", "text", 'inputmode="numeric"')+'</div>' : '')+
      '<p class="helptext">Type a weight and press Add (or Enter on the keyboard). Tap a weight to change or delete it.</p></div>';
    ["ALB","YFT"].forEach(function(sp){
      var list = trip.weights.filter(function(w){ return w.sp===sp; });
      if(!list.length) return;
      html += '<div class="sectionlabel">'+SPECIES[sp]+' ('+list.length+')</div><div class="wsgrid">'+
        list.map(function(w, i){ return '<div class="wscell'+(sp==="YFT"?" yf":"")+'" data-w="'+w.id+'"><div class="i">'+(i+1)+'</div><div class="v">'+esc(w.kg)+'</div>'+(w.len?'<div class="i">'+esc(w.len)+' cm</div>':'')+'</div>'; }).join("")+'</div>';
    });
    el.innerHTML = html;
    wireBack(function(){ go("trip"); });
    wireChips(el, function(name, v){ wsSpecies = v || "ALB"; render(); setTimeout(function(){ var k = document.getElementById("wKg"); if(k) k.focus(); }, 50); });
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
    var sh = openSheet('<h2>Edit weight</h2>'+chips("sp", [{code:"ALB",label:"Albacore"},{code:"YFT",label:"Yellowfin"}], w.sp)+
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
    setTopbar(tripLabel(trip)+" · Crew", trip.crew.length+" on board");
    var el = document.getElementById("screen");
    var html = backButton(tripLabel(trip))+
      '<div class="actions"><button class="btn btn-accent" id="btnAddCrew">+ Add crew</button><button class="btn btn-ghost" id="btnCrewPdf">📄 Crew list PDF</button></div>';
    if(!trip.crew.length) html += '<div class="empty"><div class="big">👥</div>No crew on this trip yet.</div>';
    trip.crew.forEach(function(c, i){
      html += '<div class="lineitem" data-crew="'+c.id+'"><div class="num">'+(i+1)+'</div><div class="meta"><div class="t1">'+esc(c.name+" "+c.surname)+'</div><div class="t2">'+esc(c.role||"Crew")+(c.idNumber?' · '+esc(c.idNumber):'')+'</div></div><div class="chev">›</div></div>';
    });
    el.innerHTML = html;
    wireBack(function(){ go("trip"); });
    document.getElementById("btnAddCrew").onclick = function(){ if(lockedGuard(trip)) return; openCrewSheet(trip, null); };
    document.getElementById("btnCrewPdf").onclick = function(){ buildCrewPdf(trip); };
    el.querySelectorAll("[data-crew]").forEach(function(r){ r.onclick = function(){ if(lockedGuard(trip)) return; openCrewSheet(trip, trip.crew.find(function(c){ return c.id===r.getAttribute("data-crew"); })); }; });
  }
  function openCrewSheet(trip, person){
    var isNew = !person;
    var p = person || { name:"", surname:"", idNumber:"", role:"Crew" };
    var known = state.knownCrew.filter(function(k){ return !trip.crew.some(function(c){ return c.name.toLowerCase()===k.name.toLowerCase() && c.surname.toLowerCase()===k.surname.toLowerCase(); }); });
    var html = '<h2>'+(isNew?"Add crew member":"Crew member")+'</h2>'+
      (isNew && known.length ? '<div class="sectionlabel">From earlier trips</div><div class="chiprow" id="knownList">'+known.map(function(k,i){ return '<div class="chip" data-k="'+i+'">'+esc(k.name+" "+k.surname)+'</div>'; }).join("")+'</div><div class="sectionlabel">Or type a new one</div>' : '')+
      '<div class="grid2">'+field("Name", "cName", p.name)+field("Surname", "cSurname", p.surname)+'</div>'+
      field("ID / passport number", "cId", p.idNumber)+
      '<div class="sectionlabel">Role</div>'+chips("role", ["Skipper","Crew","Observer"], p.role||"Crew")+
      '<div class="sheet-foot">'+(isNew?'<button class="btn btn-outline" data-a="cancel">Cancel</button>':'<button class="btn btn-danger" data-a="del">Remove</button>')+'<button class="btn btn-accent" data-a="save">Save</button></div>';
    var sh = openSheet(html);
    wireChips(sh.sheet);
    var kl = sh.sheet.querySelector("#knownList");
    if(kl) kl.addEventListener("click", function(e){
      var c = e.target.closest("[data-k]"); if(!c) return;
      var k = known[int(c.getAttribute("data-k"))];
      trip.crew.push({ id:uid(), name:k.name, surname:k.surname, idNumber:k.idNumber, role:k.role||"Crew" });
      saveState(); sh.close(); render(); showToast(k.name+" added");
    });
    var cancel = sh.sheet.querySelector('[data-a="cancel"]'); if(cancel) cancel.onclick = sh.close;
    var del = sh.sheet.querySelector('[data-a="del"]');
    if(del) del.onclick = function(){ showConfirm("Remove "+p.name+" "+p.surname+" from this trip?", "Remove", "btn-danger", function(){ trip.crew = trip.crew.filter(function(c){ return c!==person; }); saveState(); sh.close(); render(); }); };
    sh.sheet.querySelector('[data-a="save"]').onclick = function(){
      var rec = person || { id:uid() };
      rec.name = val(sh.sheet,"cName"); rec.surname = val(sh.sheet,"cSurname"); rec.idNumber = val(sh.sheet,"cId"); rec.role = chipValue(sh.sheet,"role") || "Crew";
      if(!rec.name){ showToast("Enter a name", true); return; }
      if(!person) trip.crew.push(rec);
      rememberCrew(rec);
      saveState(); sh.close(); render();
    };
  }
  function rememberCrew(c){
    var k = state.knownCrew.find(function(x){ return x.name.toLowerCase()===c.name.toLowerCase() && x.surname.toLowerCase()===c.surname.toLowerCase(); });
    if(k){ if(c.idNumber) k.idNumber = c.idNumber; k.role = c.role; }
    else state.knownCrew.push({ name:c.name, surname:c.surname, idNumber:c.idNumber, role:c.role });
  }
  function buildCrewPdf(trip){
    if(!window.jspdf){ showToast("PDF library missing", true); return; }
    var s = state.settings;
    var doc = new window.jspdf.jsPDF({ unit:"mm", format:"a4" });
    doc.setFont("helvetica","bold"); doc.setFontSize(16); doc.text("CREW LIST", 105, 18, { align:"center" });
    doc.setFontSize(10); doc.setFont("helvetica","normal");
    var info = [
      ["Vessel", s.vessel], ["Registration", s.registrationNo], ["Rights holder", s.rightsHolder], ["Permit no.", s.permitNo],
      ["Skipper", s.skipper+(s.contact?"  ("+s.contact+")":"")], ["Departure port", s.port],
      ["Departure", fmtDate(trip.sailDate)+(trip.sailTime?"  "+trip.sailTime:"")], ["Trip no.", trip.tripNumber||""], ["Persons on board", String(trip.crew.length)]
    ];
    var y = 30;
    info.forEach(function(r){ doc.setFont("helvetica","bold"); doc.text(r[0]+":", 15, y); doc.setFont("helvetica","normal"); doc.text(String(r[1]||""), 55, y); y += 6; });
    y += 4;
    var cols = [15, 25, 75, 125, 175];
    doc.setFillColor(220,228,226); doc.rect(13, y-5, 184, 8, "F");
    doc.setFont("helvetica","bold"); ["#","Name","Surname","ID / passport no.","Role"].forEach(function(h,i){ doc.text(h, cols[i], y); });
    doc.setFont("helvetica","normal"); y += 8;
    trip.crew.forEach(function(c, i){
      if(y > 270){ doc.addPage(); y = 20; }
      [String(i+1), c.name, c.surname, c.idNumber, c.role||"Crew"].forEach(function(v,j){ doc.text(String(v||""), cols[j], y); });
      doc.setDrawColor(200); doc.line(13, y+2, 197, y+2); y += 8;
    });
    y += 14;
    doc.text("Skipper signature: ______________________________        Date: ______________", 15, Math.min(y, 285));
    saveFileOut(fileName(trip, "crew_list", "pdf"), doc.output("blob"));
  }

  // ================= Reports =================
  function renderReports(trip){
    setTopbar(tripLabel(trip)+" · Reports", tripRange(trip));
    var el = document.getElementById("screen");
    var rows = dffeRows(trip);
    var a = weightStats(trip,"ALB"), y = weightStats(trip,"YFT");
    var html = backButton(tripLabel(trip));
    html += '<div class="card"><h2>DFFE catch statistics</h2>'+
      '<table class="tbl"><tr><th>Date</th><th>Start pos.</th><th class="r">ALB</th><th class="r">kg</th><th class="r">YFT</th><th class="r">kg</th></tr>'+
      rows.map(function(r){ return '<tr><td>'+esc(r.dateShort)+'</td><td>'+esc(r.posText)+'</td><td class="r"><b>'+r.alb+'</b></td><td class="r">'+(r.albKg===""?"–":r.albKg)+'</td><td class="r">'+r.yft+'</td><td class="r">'+(r.yftKg===""?"–":r.yftKg)+'</td></tr>'; }).join("")+
      '<tr><td><b>Offload</b></td><td></td><td class="r">'+(a.n||"")+'</td><td class="r"><b>'+(a.n?kg(a.kg):"–")+'</b></td><td class="r">'+(y.n||"")+'</td><td class="r"><b>'+(y.n?kg(y.kg):"–")+'</b></td></tr></table>'+
      '<p class="helptext">'+(a.n ? "Daily kg = daily count × offload average ("+kg(a.avg)+" kg ALB"+(y.n?", "+kg(y.avg)+" kg YFT":"")+")." : "Daily kg fill in once the offload weights are entered.")+
      (rows.length>16 ? " <b>More than 16 days — only the first 16 fit on one form.</b>" : "")+'</p>'+
      dffeChecks(trip).map(function(w){ return '<div class="locked-note">'+esc(w)+'</div>'; }).join("")+
      '<button class="btn btn-accent" id="btnDffe">DFFE form (Excel)</button></div>';
    html += '<div class="card"><h2>Other files</h2><div class="sheet-actions">'+
      '<button class="btn btn-ghost" id="btnStopsCsv">Stop log (CSV)</button>'+
      '<button class="btn btn-ghost" id="btnWeightsCsv">Weight sheet (CSV)</button>'+
      '<button class="btn btn-ghost" id="btnCrewPdf2">Crew list (PDF)</button>'+
      '</div></div>';
    el.innerHTML = html;
    wireBack(function(){ go("trip"); });
    document.getElementById("btnDffe").onclick = function(){ buildDffeXlsx(trip).then(function(blob){ return saveFileOut(fileName(trip,"dffe_catch_stats","xlsx"), blob); }).catch(function(e){ console.error(e); showToast("Could not make the DFFE form: "+e.message, true); }); };
    document.getElementById("btnStopsCsv").onclick = function(){ saveFileOut(fileName(trip,"stop_log","csv"), new Blob([stopsCsv(trip)], { type:"text/csv" })); };
    document.getElementById("btnWeightsCsv").onclick = function(){ saveFileOut(fileName(trip,"weights","csv"), new Blob([weightsCsv(trip)], { type:"text/csv" })); };
    document.getElementById("btnCrewPdf2").onclick = function(){ buildCrewPdf(trip); };
  }
  function dffeChecks(trip){
    var w = [];
    if(!trip.tripNumber) w.push("Trip number is missing (Trip details).");
    if(!trip.dischargeDate) w.push("Discharge date is missing (End trip / Trip details).");
    var a = weightStats(trip,"ALB"), t = tripTotals(trip);
    if(a.n && a.n!==t.alb) w.push("Weigh sheet has "+a.n+" ALB but the stops add up to "+t.alb+". Check before sending.");
    var y = weightStats(trip,"YFT");
    if(y.n!==t.yft && (y.n || t.yft)) w.push("Weigh sheet has "+y.n+" YFT but the stops add up to "+t.yft+".");
    tripDates(trip).forEach(function(d){ if(!dayInfo(trip,d).sst) w.push("No SST for "+fmtDay(d)+" (Day details)."); });
    return w;
  }
  // One row per fishing day, in the shape the DFFE form wants.
  function dffeRows(trip){
    var a = weightStats(trip,"ALB"), y = weightStats(trip,"YFT");
    return tripDates(trip).map(function(d){
      var list = stopsOn(trip, d);
      var first = list.find(function(s){ return s.lat!=="" && s.lon!==""; });
      var info = dayInfo(trip, d);
      var alb = sumOf(list,"alb"), yft = sumOf(list,"yft");
      var lat = first ? degMin(first.lat) : null, lon = first ? degMin(first.lon) : null;
      var pole = Math.max(0, Math.min(100, int(info.polePct||"100")));
      return {
        date:d, dateText:fmtDate(d), dateShort:fmtDay(d), crew:info.crew, gear:info.gear,
        latDeg: lat ? lat.deg : "", latMin: lat ? Math.round(lat.min) : "", lonDeg: lon ? lon.deg : "", lonMin: lon ? Math.round(lon.min) : "",
        posText: first ? fmtPos(first.lat, first.lon) : "–",
        sst: info.sst, target: yft ? "ALB YFT" : "ALB", hours: info.hours, liveBait: info.liveBait,
        baitCondition: info.liveBait==="Y" ? (info.baitCondition||"") : "--",
        alb: alb, albKg: a.n ? Math.round(alb*a.avg) : "", yft: yft, yftKg: y.n ? Math.round(yft*y.avg) : "",
        pole: pole, line: 100-pole
      };
    });
  }
  function stopsCsv(trip){
    var rows = [["Trip","Date","Time","Lat (dec)","Lon (dec)","Position","ALB","YFT","Day ALB","Trip ALB","Tank","SST C","Wind dir","Wind kn","Sea","Drift to","Drift kn","School depth m","Bait","Notes"]];
    var acc = 0, dayAcc = {};
    sortedStops(trip).forEach(function(s){
      acc += int(s.alb); dayAcc[s.date] = (dayAcc[s.date]||0) + int(s.alb);
      rows.push([trip.tripNumber, s.date, s.time, s.lat, s.lon, fmtPos(s.lat,s.lon), s.alb, s.yft, dayAcc[s.date], acc, s.tank, s.sst, s.windDir, s.windKn, s.sea, s.driftDir, s.driftKn, s.schoolDepth, s.bait, s.notes]);
    });
    return toCsv(rows);
  }
  function weightsCsv(trip){
    var rows = [["Trip","No.","Species","Weight kg","Fork length cm"]];
    var n = { ALB:0, YFT:0 };
    trip.weights.forEach(function(w){ n[w.sp]++; rows.push([trip.tripNumber, n[w.sp], w.sp, w.kg, w.len]); });
    ["ALB","YFT"].forEach(function(sp){ var st = weightStats(trip, sp); if(st.n) rows.push(["","Total",sp,kg(st.kg),"avg "+kg(st.avg)]); });
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
      var a = weightStats(trip,"ALB"), y = weightStats(trip,"YFT");
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
          put("P"+R, r.alb); put("Q"+R, r.pole); put("R"+R, r.line);
          put("S"+R, r.yft); put("T"+R, r.yft ? r.pole : 0); put("U"+R, r.yft ? r.line : 0);
          ["V","W","X","Y","Z","AA","AB","AC","AD"].forEach(function(c){ put(c+R, 0); });
          put("P"+(R+1), r.albKg); put("S"+(R+1), r.yftKg); put("V"+(R+1), 0); put("Y"+(R+1), 0);
        });
        if(bi===0 || rows.length>8){ put("P"+block[1], a.n ? Math.round(a.kg*10)/10 : ""); put("S"+block[1], y.n ? Math.round(y.kg*10)/10 : ""); }
      });
      var t = tripTotals(trip);
      var comment = "Comments: Trip "+(trip.tripNumber||"")+" sailed "+s.port+" "+fmtDate(trip.sailDate)+(trip.sailTime?" "+trip.sailTime:"")+
        (rows.length ? ", fished "+rows[0].dateText+(rows.length>1?" - "+rows[rows.length-1].dateText:"") : "")+
        (trip.dischargeDate ? ", discharged "+fmtDate(trip.dischargeDate) : "")+". Stop log: "+t.alb+" ALB, "+t.yft+" YFT."+
        (a.n ? " Offload: "+a.n+" ALB "+kg(a.kg)+" kg (avg "+kg(a.avg)+" kg)"+(y.n?", "+y.n+" YFT "+kg(y.kg)+" kg":"")+". Daily kg = daily count x offload average." : "")+
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
    var f = [["Vessel name","vessel"],["Vessel reg no.","registrationNo"],["Rights holder","rightsHolder"],["Right application no.","rightNo"],["Permit no.","permitNo"],["Skipper","skipper"],["Skipper contact no.","contact"],["Email","email"],["Discharge port","port"]];
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
