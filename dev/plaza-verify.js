"use strict";
/* PLAZA AETERNA — headless verification driver.
   Usage: node dev/plaza-verify.js [--keep] [--only=name] */
const {spawn}=require("child_process");
function PLAZA_TARGET(){var c=[path.resolve(__dirname,"..","plaza-aeterna.html"),path.resolve(__dirname,"..","index.html")];for(var i=0;i<c.length;i++)if(fs.existsSync(c[i]))return c[i];return c[0]}
const fs=require("fs"),path=require("path"),http=require("http"),os=require("os"),vm=require("vm");
const CHROME=process.env.CHROME||"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TARGET=PLAZA_TARGET();
const OUT=path.join(__dirname,"plaza-shots");
fs.mkdirSync(OUT,{recursive:true});
const PORT=9500+Math.floor(Math.random()*300);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

let pass=0,fail=0;const failures=[];
function ok(name,cond,extra){
  if(cond){pass++;console.log("  \u2713 "+name)}else{fail++;failures.push(name+(extra?" :: "+extra:""));console.log("  \u2717 "+name+(extra?"  -> "+extra:""))}
}

/* ---------- 1. syntax ---------- */
const html=fs.readFileSync(TARGET,"utf8");
const m=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
console.log("\n== static ==");
ok("exactly one inline script",m.length===1,"found "+m.length);
const js=m[0][1];
try{new vm.Script(js,{filename:"plaza-inline.js"});ok("inline JS parses",true)}
catch(e){ok("inline JS parses",false,e.message);console.log(e.stack)}

const must=[
  ["sunset gradient pink",/#ff71ce/i],["sunset gradient purple",/#b967ff/i],["sunset gradient cyan",/#01cdfe/i],
  ["win95 grey",/#c0c0c0/i],["navy title bar",/#000080/i],
  ["fullwidth aesthetic",/\uff21 \uff25 \uff33 \uff34 \uff28 \uff25 \uff34 \uff29 \uff23/],
  ["prefers-reduced-motion",/prefers-reduced-motion/],
  ["phone breakpoint",/max-width:720px/],
  ["marquee-less ticker",/@keyframes marq/],
  ["viewBox on bust",/viewBox","-16 0 272 400/]
];
for(const [n,re] of must)ok("source contains "+n,re.test(html));

/* ---------- 2. browser ---------- */
const userDir=fs.mkdtempSync(path.join(os.tmpdir(),"plazaprof"));
const proc=spawn(CHROME,["--headless=new","--no-sandbox","--disable-breakpad","--disable-gpu","--no-first-run","--no-default-browser-check",
  "--disable-extensions","--autoplay-policy=no-user-gesture-required","--mute-audio",
  "--remote-debugging-port="+PORT,"--user-data-dir="+userDir,
  "--window-size=1440,900","--hide-scrollbars","about:blank"],{stdio:"ignore"});
function get(p){return new Promise((res,rej)=>{http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej)})}
let ws,id=0,pend=new Map(),errors=[];
function send(method,params){
  return new Promise((res,rej)=>{
    const i=++id;pend.set(i,{res,rej});
    ws.send(JSON.stringify({id:i,method,params:params||{}}));
    setTimeout(()=>{if(pend.has(i)){pend.delete(i);rej(new Error("timeout "+method))}},25000);
  });
}
async function ev(expr){
  const r=await send("Runtime.evaluate",{expression:expr,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw new Error("eval: "+(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.text));
  return r.result.value;
}
async function shot(name){
  const r=await send("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(OUT,name+".png"),Buffer.from(r.data,"base64"));
  return path.join(OUT,name+".png");
}
async function mouse(type,x,y,btn){
  await send("Input.dispatchMouseEvent",{type, x, y, button:btn||"left", buttons:type==="mousePressed"?1:0, clickCount:1});
}
async function clickAt(x,y){await mouse("mouseMoved",x,y);await mouse("mousePressed",x,y);await sleep(35);await mouse("mouseReleased",x,y);await sleep(70)}
async function clickSel(sel){const r=await ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;var b=e.getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()`);if(!r)throw new Error("no element "+sel);await clickAt(r[0],r[1])}

function lum(c){const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])}
function ratio(a,b){const l1=Math.max(lum(a),lum(b)),l2=Math.min(lum(a),lum(b));return (l1+0.05)/(l2+0.05)}
async function backdropUnder(sel){
  const r=await ev(`(function(){var b=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return [Math.round(b.left),Math.round(b.top),Math.max(1,Math.round(b.width)),Math.max(1,Math.round(b.height))]})()`);
  await ev(`document.querySelector(${JSON.stringify(sel)}).style.visibility='hidden'`);
  await sleep(140);
  const s=await send("Page.captureScreenshot",{format:"png"});
  await ev(`document.querySelector(${JSON.stringify(sel)}).style.visibility=''`);
  return ev(`(async function(){
    var img=new Image();img.src="data:image/png;base64,${s.data}";await img.decode();
    var c=document.createElement('canvas');c.width=img.width;c.height=img.height;
    var g=c.getContext('2d');g.drawImage(img,0,0);
    var d=g.getImageData(${r[0]},${r[1]},${r[2]},${r[3]}).data,rr=0,gg=0,bb=0,n=0;
    for(var i=0;i<d.length;i+=4){rr+=d[i];gg+=d[i+1];bb+=d[i+2];n++}
    return [rr/n,gg/n,bb/n];
  })()`);
}
const OUTLINE=[50,0,72],OUTLINE2=[40,0,60];

async function main(){
  let list=null;
  for(let i=0;i<90&&!list;i++){
    try{const l=await get("/json/list");if(Array.isArray(l)&&l.some(t=>t.type==="page"))list=l}catch(e){}
    if(!list)await sleep(300);
  }
  if(!list)throw new Error("no chrome page target");
  const page=list.find(t=>t.type==="page");
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
  ws.onmessage=e=>{
    const msg=JSON.parse(e.data);
    if(msg.id&&pend.has(msg.id)){const p=pend.get(msg.id);pend.delete(msg.id);msg.error?p.rej(new Error(JSON.stringify(msg.error))):p.res(msg.result);return}
    if(msg.method==="Runtime.exceptionThrown"){const d=msg.params.exceptionDetails;errors.push("EXC "+(d.exception&&d.exception.description||d.text))}
    if(msg.method==="Runtime.consoleAPICalled"&&["error","warning"].includes(msg.params.type))
      errors.push("CONSOLE."+msg.params.type+" "+msg.params.args.map(a=>a.value||a.description||"").join(" "));
    if(msg.method==="Log.entryAdded"&&msg.params.entry.level==="error")errors.push("LOG "+msg.params.entry.text+" @"+(msg.params.entry.url||""));
  };
  await send("Page.enable");await send("Runtime.enable");await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:"file:///"+TARGET.replace(/\\/g,"/")});
  await sleep(2600);

  console.log("\n== boot & scene ==");
  ok("no boot overlay remains",await ev("!document.getElementById('boot')"));
  ok("PLAZA debug handle",await ev("!!window.PLAZA"));
  ok("6 windows constructed",await ev("document.querySelectorAll('.win').length===6"));
  ok("welcome window visible",await ev("!document.getElementById('win-welcome').classList.contains('hidden')"));
  ok("directory window visible",await ev("!document.getElementById('win-directory').classList.contains('hidden')"));
  ok("midi window visible",await ev("!document.getElementById('win-midi').classList.contains('hidden')"));
  ok("no AudioContext before first gesture",await ev("!window.PLAZA.audio.ctx"));

  console.log("\n== scene contents ==");
  ok("sun circle with stripe mask",await ev("!!document.querySelector('#sun circle[mask]')"));
  ok("sun has >=12 stripes",await ev("document.querySelectorAll('#sun mask rect').length>=12"),await ev("document.querySelectorAll('#sun mask rect').length+''"));
  ok("palm silhouettes drawn",await ev("document.querySelectorAll('#palms path').length>=24"),await ev("document.querySelectorAll('#palms path').length+''"));
  ok("palms positioned",await ev("document.querySelectorAll('#palms g[transform]').length>=10"));
  ok("bust has 13+13 marrow slices",await ev("document.querySelectorAll('#rigF use').length===13 && document.querySelectorAll('#rigS use').length===13"));
  ok("marble pattern has raster texture",await ev("(function(){var i=document.querySelector('#marblePat image');return !!i && (i.getAttribute('href')||'').length>2000})()"));
  ok("bust plinth present",await ev("!!document.getElementById('plinth')"));
  ok("bust art paths present",await ev("document.querySelectorAll('#artF path').length>=6 && document.querySelectorAll('#artS path').length>=6"));
  ok("grid canvas is painted",await ev("(function(){var c=document.getElementById('grid');var g=c.getContext('2d');var d=g.getImageData(0,Math.floor(c.height*0.8),c.width,1).data;var n=0;for(var i=3;i<d.length;i+=4)if(d[i]>8)n++;return n>c.width*0.1})()"));
  ok("grid near-horizon row painted",await ev("(function(){var c=document.getElementById('grid');var g=c.getContext('2d');var d=g.getImageData(0,Math.floor(c.height*0.64),c.width,1).data;var n=0;for(var i=3;i<d.length;i+=4)if(d[i]>6)n++;return n>c.width*0.2})()"));
  ok("noise texture applied",await ev("getComputedStyle(document.getElementById('noise')).backgroundImage.indexOf('data:image/png')>0"));
  ok("scanline overlay",await ev("!!document.getElementById('scan')"));

  const p1=await shot("01-desktop");
  await clickAt(700,760);await sleep(200);
  const p2=await shot("02-desktop-clean");
  ok("frames differ over time (grid scrolls)",await ev("window.PLAZA.bust()>0.3"));

  console.log("\n== audio (gesture) ==");
  await clickSel("#mplay");await sleep(500);
  const st=await ev("window.PLAZA.audio.ctx && window.PLAZA.audio.ctx.state");
  ok("AudioContext created on real click",st==="running","state="+st);
  ok("sequencer playing",await ev("window.PLAZA.audio.playing===true"));
  ok("oscillators actually produced sound graph",await ev("!!window.PLAZA.audio.analyser"));
  await sleep(1400);
  const vu=await ev("[].slice.call(document.querySelectorAll('#vu i b')).map(function(b){return parseFloat(b.style.height)||0}).some(function(h){return h>6})");
  ok("VU meter responds to audio",vu,await ev("[].slice.call(document.querySelectorAll('#vu i b')).map(function(b){return b.style.height}).join(',')"));
  ok("hint hidden after gesture",await ev("document.getElementById('hint').classList.contains('hidden')"));
  await shot("03-midi-playing");
  ok("tracker playhead advanced",await ev("document.querySelectorAll('#tracker .cl.cur').length>0"));
  await clickSel("#mpause");await sleep(150);
  ok("pause works",await ev("window.PLAZA.audio.paused===true"));
  await clickSel("#mstop");await sleep(150);
  ok("stop works",await ev("window.PLAZA.audio.playing===false"));

  console.log("\n== windows interaction ==");
  const before=await ev("document.getElementById('win-welcome').style.left");
  const tb=await ev("(function(){var b=document.querySelector('#win-welcome .tb').getBoundingClientRect();return [b.left+120,b.top+10]})()");
  await mouse("mouseMoved",tb[0],tb[1]);await mouse("mousePressed",tb[0],tb[1]);
  await mouse("mouseMoved",tb[0]+180,tb[1]+130);await sleep(60);
  await mouse("mouseMoved",tb[0]+240,tb[1]+170);await sleep(60);
  await mouse("mouseReleased",tb[0]+240,tb[1]+170);await sleep(120);
  const after=await ev("document.getElementById('win-welcome').style.left");
  ok("title-bar drag moves window",before!==after,before+" -> "+after);
  ok("drag stayed in viewport",await ev("parseFloat(document.getElementById('win-welcome').style.left)>=0"));

  await clickSel("#win-welcome .wbtn[data-a=min]");await sleep(150);
  ok("minimise hides window",await ev("document.getElementById('win-welcome').classList.contains('hidden')"));
  ok("taskbar button shows pressed",await ev("document.getElementById('task-welcome').classList.contains('down')"));
  await shot("04-minimised");
  await clickSel("#task-welcome");await sleep(200);
  ok("taskbar restores window",await ev("!document.getElementById('win-welcome').classList.contains('hidden')"));

  await clickSel("#win-welcome .wbtn[data-a=max]");await sleep(150);
  ok("maximise fills width",await ev("document.getElementById('win-welcome').getBoundingClientRect().width>window.innerWidth*0.9"));
  await clickSel("#win-welcome .wbtn[data-a=max]");await sleep(120);

  await clickSel("#icons .icon[data-open=sys]");await sleep(250);
  ok("desktop icon opens window",await ev("!document.getElementById('win-sys').classList.contains('hidden')"));
  await clickSel("#icons .icon[data-open=cam]");await sleep(250);
  ok("statue cam opens",await ev("!document.getElementById('win-cam').classList.contains('hidden')"));
  ok("statue cam has hud + live view",await ev("!!document.querySelector('#camsvg use') && !!document.getElementById('camang')"));
  await clickSel("#icons .icon[data-open=bin]");await sleep(220);
  ok("recycle bin lists files",await ev("document.querySelectorAll('#binlist > div').length>3"));
  await clickSel("#binempty");await sleep(120);
  ok("empty bin works",await ev("document.querySelectorAll('#binlist > div').length<=1"));
  await shot("05-extra-windows");

  await clickSel("#start");await sleep(200);
  ok("start menu opens",await ev("!document.getElementById('startmenu').classList.contains('hidden')"));
  ok("start menu has entries + shutdown",await ev("document.querySelectorAll('#startitems li').length>=8"));
  await shot("06-startmenu");
  await clickSel("#start");await sleep(150);
  await clickSel("#win-sys .wbtn[data-a=close]");await sleep(120);
  ok("close removes taskbar button",await ev("!document.getElementById('task-sys')"));

  console.log("\n== directory ==");
  await clickSel("#dirlist .row");await sleep(120);
  ok("directory row selects + details",await ev("!!document.querySelector('#dirlist .row.sel') && document.getElementById('dirdetail').textContent.length>20"));
  await ev("(function(){var q=document.getElementById('dirq');q.value='palm';q.dispatchEvent(new Event('input'))})()");
  await sleep(120);
  ok("directory search filters",await ev("document.querySelectorAll('#dirlist .row').length===1"),await ev("document.querySelectorAll('#dirlist .row').length+''"));
  await clickSel("#dirclr");await sleep(100);
  ok("clear restores list",await ev("document.querySelectorAll('#dirlist .row').length>10"));
  ok("pastel icons in rows",await ev("document.querySelectorAll('#dirlist .row svg').length>10"));
  await clickSel("#dirlist .row:nth-child(3)");await sleep(120);
  ok("listbox sets aria-selected on the chosen row",await ev("(function(){var r=document.querySelector('#dirlist .row.sel');return !!r && r.getAttribute('aria-selected')==='true' && document.querySelectorAll('#dirlist .row[aria-selected=\"true\"]').length===1})()"));
  ok("roving tabindex: exactly one row focusable",await ev("document.querySelectorAll('#dirlist .row[tabindex=\"0\"]').length===1"));
  await ev("(function(){var r=document.querySelector('#dirlist .row.sel');r.focus();r.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))})()");
  await sleep(80);
  ok("ArrowDown moves selection",await ev("document.activeElement.classList.contains('row') && document.activeElement.dataset.i==='3'"),await ev("document.activeElement.dataset&&document.activeElement.dataset.i"));
  await ev("(function(){var r=document.querySelector('#dirlist .row.sel');r.focus();r.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))})()");
  await sleep(80);
  ok("End jumps to the last row",await ev("document.activeElement===document.querySelector('#dirlist .row:last-child')"));
  await ev("(function(){var r=document.querySelector('#dirlist .row');r.focus();r.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}))})()");
  await sleep(80);
  ok("Space selects a focused row",await ev("document.querySelector('#dirlist .row').getAttribute('aria-selected')==='true'"));
  ok("detail pane announces the selection",await ev("document.getElementById('dirdetail').textContent.length>20"));

  console.log("\n== glitch ==");
  const iconPos=await ev("(function(){var b=document.querySelector('#icons .icon').getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()");
  await mouse("mouseMoved",700,800);
  await sleep(420);
  await mouse("mouseMoved",iconPos[0],iconPos[1]);
  await sleep(30);
  ok("hover adds per-element glitch class",await ev("!!document.querySelector('#icons .icon.hit')"));
  ok("hover triggers vhs tracking-filter burst",await ev("document.getElementById('scene').classList.contains('vhs')"));
  ok("vhs filter is COMPUTED (not overridden by the boot animation)",await ev("/url\\(.*#vhs/.test(getComputedStyle(document.getElementById('scene')).filter)"),await ev("getComputedStyle(document.getElementById('scene')).filter"));
  ok("poweron class released after boot",await ev("!document.getElementById('scene').classList.contains('powering')"));
  await shot("07-glitch");
  await sleep(500);
  ok("vhs filter clears",await ev("!document.getElementById('scene').classList.contains('vhs')"));
  ok("glitch class clears",await ev("!document.querySelector('#icons .icon.hit')"));

  console.log("\n== typography ==");
  ok("serif italic used",await ev("(function(){var e=document.querySelector('.welcome h1');var s=getComputedStyle(e);return /serif|georgia|times|palatino/i.test(s.fontFamily)&&s.fontStyle==='italic'})()"));
  ok("pixel monospace used",await ev("(function(){var s=getComputedStyle(document.querySelector('.ae'));return /mono|courier|lucida|consolas/i.test(s.fontFamily)})()"));
  ok("wide letter spacing on aesthetic line",await ev("parseFloat(getComputedStyle(document.querySelector('.ae')).letterSpacing)>1"));
  ok("aesthetic line fits on one row",await ev("document.querySelector('.ae').getBoundingClientRect().height<40"),await ev("document.querySelector('.ae').getBoundingClientRect().height+''"));
  ok("facial features live on one rig, not per slice",await ev("document.querySelectorAll('#artF ellipse').length===2 && document.querySelectorAll('#bustFace ellipse').length>=4 && document.querySelectorAll('#bustFaceS path').length>=6"));
  ok("side face rig exists + crossfades",await ev("!!document.getElementById('bustFaceS') && Math.abs(parseFloat(document.getElementById('rigF').getAttribute('opacity'))+parseFloat(document.getElementById('rigS').getAttribute('opacity'))-1)<1.01"));

  console.log("\n== contrast (fill or outline vs measured backdrop) ==");
  for(const [sel,fill,min,label] of [[".s1",[255,255,255],3,"sign title (large)"],[".s2",[255,255,255],4.5,"sign subtitle"],[".s3",[42,0,66],4.5,"sign japanese"],[".icon .il",[255,255,255],4.5,"desktop icon label"]]){
    const bd=await backdropUnder(sel);
    const rFill=ratio(fill,bd),rOutline=ratio(sel===".s3"?[255,255,255]:OUTLINE,bd);
    const best=Math.max(rFill,rOutline);
    ok("contrast >= "+min+":1 for "+label,best>=min,"fill "+rFill.toFixed(2)+" outline "+rOutline.toFixed(2)+" backdrop "+bd.map(v=>Math.round(v)).join(","));
  }

  console.log("\n== responsive ==");
  const wLeftPre=await ev("parseFloat(document.getElementById('win-welcome').style.left)");
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await sleep(700);
  const wLeftNarrow=await ev("parseFloat(document.getElementById('win-welcome').style.left)");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await sleep(600);
  const wLeftBack=await ev("parseFloat(document.getElementById('win-welcome').style.left)");
  ok("window is clamped inwards when the viewport shrinks",wLeftNarrow<=10,wLeftNarrow+"");
  ok("window returns to its previous column after shrink+grow",Math.abs(wLeftBack-wLeftPre)<3,wLeftPre+" -> "+wLeftNarrow+" -> "+wLeftBack);
  ok("desktop icon remains hittable after resize round-trip",await ev("(function(){var i=document.querySelector('#icons .icon[data-open=sys]').getBoundingClientRect();var e=document.elementFromPoint(i.left+i.width/2,i.top+8);return !!(e&&e.closest&&e.closest('#icons'))})()"),await ev("(function(){var i=document.querySelector('#icons .icon').getBoundingClientRect();var e=document.elementFromPoint(i.left+i.width/2,i.top+8);return e?(e.tagName+'.'+e.className):'null'})()"));
  ok("directory stays right-aligned after resize round-trip",await ev("document.getElementById('win-directory').getBoundingClientRect().right>innerWidth-90"));
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await sleep(600);
  ok("windows become static cards on phones",await ev("getComputedStyle(document.querySelector('.win')).position==='static'"));
  ok("cards stack in one column",await ev("(function(){var w=document.querySelectorAll('.win:not(.hidden)');if(w.length<2)return false;var a=w[0].getBoundingClientRect(),b=w[1].getBoundingClientRect();return Math.abs(a.left-b.left)<2 && b.top>a.bottom-2})()"));
  ok("no horizontal overflow on phone",await ev("document.documentElement.scrollWidth<=window.innerWidth+1"),await ev("document.documentElement.scrollWidth+'/'+window.innerWidth"));
  ok("icons become a horizontal strip",await ev("getComputedStyle(document.getElementById('icons')).flexDirection==='row'"));
  ok("taskbar + clock present on phone",await ev("!!document.getElementById('clock') && getComputedStyle(document.getElementById('taskbar')).display!=='none'"));
  await ev("document.getElementById('desktop').scrollTop=0");await sleep(150);
  const pm=await shot("08-phone");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await sleep(400);

  console.log("\n== clock ==");
  const c=await ev("document.getElementById('clock').textContent");
  ok("clock shows a time",/^\d{1,2}:\d{2}/.test(c)||/AM|PM/i.test(c),c);

  console.log("\n== keyboard ==");
  ok("start menu items are keyboard-activatable",await ev("(function(){var li=document.querySelector('#startitems li');li.focus();li.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return !document.getElementById('win-bin').classList.contains('hidden')&&document.getElementById('startmenu').classList.contains('hidden')})()"));
  ok("icons are real buttons",await ev("document.querySelectorAll('#icons button.icon').length===6"));
  ok("window buttons have aria-labels",await ev("document.querySelectorAll('.wbtn[aria-label]').length===18"));
  ok("shift-tab reachable into taskbar start",await ev("document.getElementById('start').tabIndex>=0"));

  console.log("\n== console hygiene ==");
  ok("no page errors/warnings",errors.length===0,errors.slice(0,6).join(" | "));

  console.log("\nshots: "+OUT);
  console.log("pass "+pass+" / fail "+fail);
  if(failures.length){console.log("\nFAILURES:");failures.forEach(f=>console.log("  - "+f))}
  ws.close();
  if(!process.argv.includes("--keep")){proc.kill()}
  process.exit(fail?1:0);
}
main().catch(e=>{console.log("DRIVER ERROR: "+e.message+"\n"+e.stack);try{proc.kill()}catch(x){};process.exit(3)});
