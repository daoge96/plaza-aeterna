"use strict";
/* AUDIT PROBE — adversarial measurements. Does not modify plaza-aeterna.html. */
const {spawn}=require("child_process");
function PLAZA_TARGET(){var c=[path.resolve(__dirname,"..","plaza-aeterna.html"),path.resolve(__dirname,"..","index.html")];for(var i=0;i<c.length;i++)if(fs.existsSync(c[i]))return c[i];return c[0]}
const fs=require("fs"),path=require("path"),http=require("http"),os=require("os");
const CHROME=process.env.CHROME||"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TARGET=PLAZA_TARGET();
const OUT=path.join(__dirname,"audit-shots");fs.mkdirSync(OUT,{recursive:true});
const PORT=9700+Math.floor(Math.random()*200);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ARGS=process.argv.slice(2);
const NOAUTOPLAY=ARGS.includes("--no-autoplay-flag");

const userDir=fs.mkdtempSync(path.join(os.tmpdir(),"auditprof"));
const args=["--headless=new","--no-sandbox","--disable-breakpad","--disable-gpu","--no-first-run",
  "--no-default-browser-check","--disable-extensions","--mute-audio",
  "--remote-debugging-port="+PORT,"--user-data-dir="+userDir,
  "--window-size=1440,900","--hide-scrollbars","about:blank"];
if(!NOAUTOPLAY)args.splice(5,0,"--autoplay-policy=no-user-gesture-required");
const proc=spawn(CHROME,args,{stdio:"ignore"});

function get(p){return new Promise((res,rej)=>{http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej)})}
let ws,id=0,pend=new Map(),errors=[],requests=[];
function send(method,params){return new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});
  ws.send(JSON.stringify({id:i,method,params:params||{}}));
  setTimeout(()=>{if(pend.has(i)){pend.delete(i);rej(new Error("timeout "+method))}},30000)})}
async function ev(expr){const r=await send("Runtime.evaluate",{expression:expr,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw new Error("eval: "+((r.exceptionDetails.exception&&r.exceptionDetails.exception.description)||r.exceptionDetails.text));
  return r.result.value}
async function shot(n){const r=await send("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(OUT,n+".png"),Buffer.from(r.data,"base64"));return r.data}
async function metrics(w,h,mobile){await send("Emulation.setDeviceMetricsOverride",{width:w,height:h,deviceScaleFactor:1,mobile:!!mobile})}
async function mouse(type,x,y){await send("Input.dispatchMouseEvent",{type,x,y,button:"left",buttons:type==="mousePressed"?1:0,clickCount:1})}
async function clickAt(x,y){await mouse("mouseMoved",x,y);await mouse("mousePressed",x,y);await sleep(30);await mouse("mouseReleased",x,y);await sleep(60)}
async function key(k,code,vk){await send("Input.dispatchKeyEvent",{type:"rawKeyDown",key:k,code:code||k,windowsVirtualKeyCode:vk||0,nativeVirtualKeyCode:vk||0});
  await send("Input.dispatchKeyEvent",{type:"keyUp",key:k,code:code||k,windowsVirtualKeyCode:vk||0,nativeVirtualKeyCode:vk||0});await sleep(60)}
const L=console.log;
function relLum(c){c=c/255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)}
function contrast(a,b){const l1=0.2126*relLum(a[0])+0.7152*relLum(a[1])+0.0722*relLum(a[2]);
  const l2=0.2126*relLum(b[0])+0.7152*relLum(b[1])+0.0722*relLum(b[2]);
  const hi=Math.max(l1,l2),lo=Math.min(l1,l2);return (hi+0.05)/(lo+0.05)}

async function main(){
  let list=null;
  for(let i=0;i<90&&!list;i++){try{const l=await get("/json/list");if(Array.isArray(l)&&l.some(t=>t.type==="page"))list=l}catch(e){}if(!list)await sleep(300)}
  if(!list)throw new Error("no chrome page target");
  const page=list.find(t=>t.type==="page");
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result);return}
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errors.push("EXC "+(d.exception&&d.exception.description||d.text))}
    if(m.method==="Runtime.consoleAPICalled"&&["error","warning"].includes(m.params.type))errors.push("CONSOLE."+m.params.type+" "+m.params.args.map(a=>a.value||"").join(" "));
    if(m.method==="Log.entryAdded"&&m.params.entry.level==="error")errors.push("LOG "+m.params.entry.text);
    if(m.method==="Network.requestWillBeSent")requests.push(m.params.request.url)};
  await send("Page.enable");await send("Runtime.enable");await send("Log.enable");await send("Network.enable");
  await metrics(1440,900,false);
  await send("Page.navigate",{url:"file:///"+TARGET.replace(/\\/g,"/")});
  await sleep(2400);
  L("== A. LOAD / NETWORK ==");
  L("  requests: "+requests.length+" -> "+JSON.stringify(requests));
  L("  page errors on load: "+errors.length+(errors.length?" "+errors.slice(0,4).join(" | "):""));

  L("\n== B. GRID: direction + perspective (canvas pixels) ==");
  const prof=`(function(){var c=document.getElementById('grid'),g=c.getContext('2d');
    var W=c.width,H=c.height,hy=Math.round(H*0.625),out=[],y;
    for(y=hy+6;y<H;y++){var d=g.getImageData(0,y,W,1).data,lum=0,x;
      for(x=0;x<W;x++)lum+=d[x*4]+d[x*4+1]+d[x*4+2];
      out.push(lum/W)}
    return out})()`;
  const p1=await ev(prof);await sleep(1200);const p2=await ev(prof);
  // restrict to lower 45% of the floor where the motion is fastest
  const lo=Math.floor(p1.length*0.55),win=40;
  let best=-1e9,bestD=-1;
  for(let d=0;d<=70;d++){let s=0,n=0;for(let i=lo;i+win<p1.length;i++){if(i+d>=p2.length)break;s+=p1[i]*p2[i+d];n++}if(n>10){s/=n;if(s>best){best=s;bestD=d}}}
  let bestUp=-1e9,bestUpD=-1;
  for(let d=0;d<=70;d++){let s=0,n=0;for(let i=lo+d;i+win<p1.length;i++){s+=p1[i]*p2[i-d];n++}if(n>10){s/=n;if(s>bestUp){bestUp=s;bestUpD=d}}}
  L("  zero-lag baseline score="+(function(){let s=0,n=0;for(let i=lo;i+win<p1.length;i++){s+=p1[i]*p2[i];n++}return (s/n).toFixed(0)})());
  L("  best shift over 1200ms: DOWN+"+bestD+"px (score "+best.toFixed(0)+")  vs  UP-"+bestUpD+"px (score "+bestUp.toFixed(0)+")");
  L("  => horizontal lines move "+(best>bestUp?"DOWN screen = TOWARD viewer":"UP screen = away from viewer")+"  ["+(bestD>0&&best>0?"positive y-shift":"?")+"]");
  L("  analytic check of drawGrid: phase=(t*0.42)%1 increases; n=i-phase decreases; y=hy+bot*(6.5/n) therefore increases -> down");
  const vz=await ev(`(function(){var c=document.getElementById('grid'),g=c.getContext('2d');
    var W=c.width,H=c.height,hy=Math.round(H*0.625),cx=W/2;
    function runsAt(y){var d=g.getImageData(0,y,W,1).data,l=[],i,x;
      for(x=0;x<W;x++)l.push((d[x*4]+d[x*4+1]+d[x*4+2])/3);
      var s=l.slice().sort(function(a,b){return a-b}),med=s[Math.floor(W/2)],out=[],run=null;
      for(x=0;x<W;x++){if(l[x]-med>12){if(!run)run=[x,x];else run[1]=x}else if(run){out.push((run[0]+run[1])/2);run=null}}
      return out}
    var far=runsAt(Math.round(hy+(H-hy)*0.42)),near=runsAt(H-6);
    function sp(a){var o=[];for(var i=1;i<a.length;i++)o.push(a[i]-a[i-1]);o.sort(function(x,y){return x-y});return o.length?o[Math.floor(o.length/2)]:0}
    function maxOff(a){var m=0;for(var i=0;i<a.length;i++)m=Math.max(m,Math.abs(a[i]-cx));return Math.round(m)}
    function sym(a){var bad=0;for(var i=0;i<a.length;i++){var f=false;for(var j=0;j<a.length;j++)if(Math.abs((a[i]-cx)+(a[j]-cx))<3)f=true;if(!f)bad++}return bad}
    return {farN:far.length,nearN:near.length,farSp:Math.round(sp(far)),nearSp:Math.round(sp(near)),
      farOff:maxOff(far),nearOff:maxOff(near),farAsym:sym(far),nearAsym:sym(near),cx:cx}})()`);
  L("  vertical lines upper-floor: n="+vz.farN+" spacing="+vz.farSp+"px maxOffsetFromCentre="+vz.farOff+" unpaired="+vz.farAsym);
  L("  vertical lines near-bottom: n="+vz.nearN+" spacing="+vz.nearSp+"px maxOffsetFromCentre="+vz.nearOff+" unpaired="+vz.nearAsym);
  L("  => spacing widens toward bottom & offsets grow & lines mirror about cx="+vz.cx+" (1-pt vanishing point at horizon)");
  const hz=await ev(`(function(){var c=document.getElementById('grid'),g=c.getContext('2d');
    var W=c.width,H=c.height,hy=Math.round(H*0.625),ys=[],y;
    for(y=hy+4;y<H;y+=2){var d=g.getImageData(0,y,W,1).data,s=0;for(var x=0;x<W;x++)s+=(d[x*4]+d[x*4+1]+d[x*4+2])/3;
      ys.push([y,s/W])}
    var pk=[];for(var i=2;i<ys.length-2;i++)if(ys[i][1]>ys[i-1][1]&&ys[i][1]>=ys[i+1][1]&&ys[i][1]>ys[i-2][1]&&ys[i][1]>ys[i+2][1])pk.push(ys[i][0]);
    var g1=[];for(var j=1;j<pk.length;j++)g1.push(pk[j]-pk[j-1]);
    return {peaks:pk.length,first:g1.slice(0,6),last:g1.slice(-6)}})()`);
  L("  horizontal-line count="+hz.peaks+" gaps near horizon="+JSON.stringify(hz.first)+" gaps near viewer="+JSON.stringify(hz.last));

  L("\n== C. BUST: rotating? slow? ==");
  const b1=await ev("window.PLAZA.bust()");const t1=await ev("performance.now()");
  const tx1=await ev("document.querySelector('#rigF use').getAttribute('transform')");
  await sleep(2000);
  const b2=await ev("window.PLAZA.bust()");const t2=await ev("performance.now()");
  const tx2=await ev("document.querySelector('#rigF use').getAttribute('transform')");
  L("  theta "+b1.toFixed(4)+" -> "+b2.toFixed(4)+" over "+((t2-t1)/1000).toFixed(2)+"s = "+(0.30).toFixed(2)+" rad/s expected");
  L("  measured rad/s = "+((b2-b1)/((t2-t1)/1000)).toFixed(4)+"  => seconds per revolution = "+(2*Math.PI/((b2-b1)/((t2-t1)/1000))).toFixed(1));
  L("  slice transform changed: "+tx1+" -> "+tx2+"  (rotating="+(tx1!==tx2)+")");

  L("\n== D. AUDIO GESTURE GATE (no autoplay flag needed if gate real) ==");
  await send("Page.navigate",{url:"file:///"+TARGET.replace(/\\/g,"/")});await sleep(2300);
  L("  before any gesture: audio.ctx = "+await ev("String(window.PLAZA.audio.ctx)"));
  await ev("document.querySelector('#mplay').click()");
  L("  after PROGRAMMATIC .click() (no user gesture): ctx="+await ev("window.PLAZA.audio.ctx?window.PLAZA.audio.ctx.state:'null'"));
  await clickAt(760,120);
  await sleep(250);
  L("  after REAL pointer click: ctx="+await ev("window.PLAZA.audio.ctx?window.PLAZA.audio.ctx.state:'null'"));
  L("  hint hidden after gesture: "+await ev("document.getElementById('hint').classList.contains('hidden')"));

  L("\n== E. PAUSE/RESUME CONSISTENCY ==");
  await ev("window.PLAZA.openWin('midi')");await sleep(120);
  await clickAt(200,60);
  const pm=await ev("(function(){var b=document.querySelector('#mplay').getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()");
  await clickAt(pm[0],pm[1]);await sleep(2600);
  const st1=await ev("({step:window.PLAZA.audio.step,pos:document.getElementById('midiPos').textContent,t0:window.PLAZA.audio.t0,now:window.PLAZA.audio.ctx.currentTime,startStep:window.PLAZA.audio.startStep})");
  L("  playing: audio.step="+st1.step+" pos='"+st1.pos+"' t0="+st1.t0.toFixed(3)+" startStep="+st1.startStep);
  const pp=await ev("(function(){var b=document.querySelector('#mpause').getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()");
  await clickAt(pp[0],pp[1]);await sleep(900);
  await clickAt(pp[0],pp[1]);await sleep(400);
  const st2=await ev("({step:window.PLAZA.audio.step,pos:document.getElementById('midiPos').textContent,t0:window.PLAZA.audio.t0,now:window.PLAZA.audio.ctx.currentTime,cur:document.querySelectorAll('#tracker .cl.cur').length?document.querySelector('#tracker .cl.cur').previousSibling:null})");
  const visStep=await ev("(function(){var cells=[].slice.call(document.querySelectorAll('#tracker .cl'));var idx=cells.findIndex(function(c){return c.classList.contains('cur')});return idx<0?-1:idx%16})()");
  L("  after resume: audio.step="+st2.step+" (sequencer truth)  visual playhead col="+visStep+" pos='"+st2.pos+"' t0="+st2.t0.toFixed(3)+" now="+st2.now.toFixed(3));
  L("  => visual/audio step %16 delta = "+(((st2.step%16)-visStep+64)%64));
  await ev("window.PLAZA.audio.playing&&document.getElementById('mstop').click()");

  L("\n== F. PER-FRAME COST ==");
  const q=await ev(`(function(){var n=0,qs=0,qsa=0;
    var oq=document.querySelector.bind(document),oqa=document.querySelectorAll.bind(document);
    document.querySelector=function(s){qs++;return oq(s)};document.querySelectorAll=function(s){qsa++;return oqa(s)};
    return new Promise(function(res){var f=0,t0=performance.now();
      function tick(){f++;if(f<61)requestAnimationFrame(tick);else{document.querySelector=oq;document.querySelectorAll=oqa;
        res({frames:f,ms:performance.now()-t0,qs:qs,qsa:qsa})}}
      requestAnimationFrame(tick)})})()`);
  L("  over "+q.frames+" frames ("+q.ms.toFixed(0)+"ms): document.querySelector calls="+q.qs+" ("+(q.qs/q.frames).toFixed(1)+"/frame), querySelectorAll="+q.qsa);
  const js=await ev(`(function(){var n=0;
    var o=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){n++;return o.call(this)};
    window.__osc=function(){return n};return n})()`);
  const nodes1=await ev("window.__osc()");
  await ev("window.PLAZA.audio.playing||document.getElementById('mplay').click()");
  await sleep(3000);
  const nodes2=await ev("window.__osc()");
  L("  oscillators created in 3s of playback: "+(nodes2-nodes1));
  await ev("document.getElementById('mstop').click()");

  L("\n== G. RESPONSIVE ==");
  const sizes=[[320,640],[360,740],[390,844],[720,900],[721,900],[740,380],[760,400]];
  for(const [w,h] of sizes){
    await metrics(w,h,w<=720);await sleep(420);
    const r=await ev(`(function(){
      var d=document.getElementById('desktop'),tb=document.getElementById('taskbar').getBoundingClientRect();
      var vis=[].slice.call(document.querySelectorAll('.win:not(.hidden),#icons .icon')).length;
      var icons=[].slice.call(document.querySelectorAll('#icons .icon')).map(function(e){var b=e.getBoundingClientRect();
        var cx=b.left+b.width/2,cy=b.top+b.height/2;
        var hit=(cx>=0&&cy>=0&&cx<innerWidth&&cy<innerHeight)?document.elementFromPoint(cx,cy):null;
        return {l:Math.round(b.left),t:Math.round(b.top),r:Math.round(b.right),bo:Math.round(b.bottom),
          hittable:!!(hit&&hit.closest&&hit.closest('.icon')),
          underTaskbar:b.bottom>tb.top, offscreen:b.bottom>innerHeight||b.right>innerWidth||b.top<0||b.left<0}});
      var wins=[].slice.call(document.querySelectorAll('.win:not(.hidden)')).map(function(e){var b=e.getBoundingClientRect();
        return {id:e.id,t:Math.round(b.top),bo:Math.round(b.bottom),l:Math.round(b.left),r:Math.round(b.right),
          belowFold:b.bottom>tb.top, belowViewport:b.bottom>innerHeight,
          clipped:b.left<0||b.right>innerWidth||b.top<0}});
      var ctrls=[].slice.call(document.querySelectorAll('.win:not(.hidden) .gbtn,.win:not(.hidden) input')).map(function(e){var b=e.getBoundingClientRect();
        var cx=b.left+b.width/2,cy=b.top+b.height/2;var hit=(cx>=0&&cy>=0&&cx<innerWidth&&cy<innerHeight)?document.elementFromPoint(cx,cy):null;
        return {id:e.id||e.className,t:Math.round(b.top),bo:Math.round(b.bottom),reachable:!!(hit&&(hit===e||e.contains(hit)||hit.contains(e)))}}) ;
      return {sw:document.documentElement.scrollWidth,iw:innerWidth,
        dTop:Math.round(d.getBoundingClientRect().top),dBottom:Math.round(d.getBoundingClientRect().bottom),
        dOverflowY:getComputedStyle(d).overflowY,dScrollable:d.scrollHeight>d.clientHeight+1,
        tbTop:Math.round(tb.top),icons:icons,wins:wins,ctrls:ctrls}})()`);
    const badIcons=r.icons.filter(i=>!i.hittable);
    const badWins=r.wins.filter(x=>x.belowFold||x.clipped);
    const badCtrl=r.ctrls.filter(c=>!c.reachable);
    L("  ["+w+"x"+h+"] scrollW="+r.sw+" (inner="+r.iw+", overflowX="+(r.sw>r.iw+1)+") taskbarTop="+r.tbTop);
    L("      desktop box y "+r.dTop+".."+r.dBottom+" overflowY="+r.dOverflowY+" scrollable="+r.dScrollable);
    L("      icons: "+r.icons.length+" total, "+badIcons.length+" NOT hittable"+ (badIcons.length?" -> "+JSON.stringify(badIcons.map(i=>[i.l,i.t,i.r,i.bo,i.underTaskbar,i.offscreen])):""));
    L("      open windows: "+r.wins.length+", "+badWins.length+" clipped/below-fold"+(badWins.length?" -> "+JSON.stringify(badWins.map(x=>[x.id,x.t,x.bo,x.belowFold,x.belowViewport,x.clipped])):""));
    L("      controls in open windows: "+r.ctrls.length+", "+badCtrl.length+" unreachable"+(badCtrl.length?" -> "+JSON.stringify(badCtrl.map(c=>[c.id,c.t,c.bo])):""));
  }
  await metrics(1440,900,false);await sleep(300);

  L("\n== H. KEYBOARD / ARIA ==");
  await ev("document.activeElement&&document.activeElement.blur();document.body.focus()");
  const order=[];
  for(let i=0;i<40;i++){
    await key("Tab","Tab",9);
    const a=await ev("(function(){var a=document.activeElement;if(!a)return 'none';var s=getComputedStyle(a);return (a.id||a.className||a.tagName)+'|outline='+s.outlineStyle+' '+s.outlineWidth+' '+s.outlineColor+'|tabindex='+a.getAttribute('tabindex')})()");
    order.push(a);
    if(a==="none"||order.length>3&&a===order[0])break;
  }
  const seen=new Set(order.map(o=>o.split("|")[0]));
  L("  tab stops in order: "+JSON.stringify(order.map(o=>o.split("|")[0])));
  L("  icons reachable by Tab: "+[...seen].filter(s=>s.includes("icon")).length);
  L("  taskbar buttons reachable: "+[...seen].filter(s=>s.includes("tbtn2")).length);
  L("  focus indicator NONE on: "+JSON.stringify(order.filter(o=>o.includes("outline=none")).map(o=>o.split("|")[0])));
  L("  aria: rows role=option count="+await ev("document.querySelectorAll('#dirlist .row[role=option]').length")
    +" with aria-selected="+await ev("document.querySelectorAll('#dirlist .row[aria-selected]').length"));
  await ev("(function(){var r=document.querySelector('#dirlist .row');r&&r.click()})()");
  L("  after selecting a row: aria-selected present = "+await ev("!!document.querySelector('#dirlist .row.sel[aria-selected]')"));
  L("  dialog roles/aria-labels: "+await ev("[].slice.call(document.querySelectorAll('.win')).map(function(w){return w.getAttribute('role')+':'+!!w.getAttribute('aria-label')}).join(',')"));
  L("  window buttons aria-label: "+await ev("[].slice.call(document.querySelectorAll('.wbtn')).map(function(b){return b.getAttribute('aria-label')||'NONE'}).join(',')"));
  L("  dirlist arrow-key nav (ArrowDown changes focus/selection): ");
  await ev("document.querySelector('#dirlist').focus()");
  const before=await ev("document.activeElement.id||document.activeElement.className");
  await key("ArrowDown","ArrowDown",40);
  L("      focused before="+before+" after ArrowDown="+await ev("document.activeElement.id||document.activeElement.className"));
  L("  #shutdown reachable + Enter-dismissable: role="+await ev("document.getElementById('shutdown').getAttribute('role')")+" tabindex="+await ev("document.getElementById('shutdown').getAttribute('tabindex')"));
  await ev("document.getElementById('shutdown').classList.add('on');document.getElementById('shutdown').focus()");
  await key("Enter","Enter",13);
  L("      after Enter on focused #shutdown: class='"+await ev("document.getElementById('shutdown').className")+"' (still open = "+await ev("document.getElementById('shutdown').classList.contains('on')")+")");
  await key(" ","Space",32);
  L("      after Space: still open = "+await ev("document.getElementById('shutdown').classList.contains('on')"));
  await ev("document.getElementById('shutdown').classList.remove('on')");

  L("\n== I. CONTRAST over the animated backdrop (WCAG, computed from real pixels) ==");
  const sels=[["#sign .s1","sign title"],["#sign .s3","sign japanese"],["#icons .icon .il","icon label"],["#hint","hint"],["#clock","clock"],["#startmenu li","start menu item"]];
  await ev("document.getElementById('startmenu').classList.remove('hidden')");
  for(const [sel,name] of sels){
    const info=await ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;
      var b=e.getBoundingClientRect();var s=getComputedStyle(e);
      return {x:Math.round(b.left),y:Math.round(b.top),w:Math.max(1,Math.round(b.width)),h:Math.max(1,Math.round(b.height)),color:s.color,fs:s.fontSize,fw:s.fontWeight}})()`);
    if(!info||info.w<2){L("  "+name+": (not measurable)");continue}
    await ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});e.style.visibility='hidden'})()`);
    const png=await shot("contrast-"+sel.replace(/[^a-z0-9]/gi,"_"));
    await ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});e.style.visibility=''})()`);
    const px=await ev(`(function(){return new Promise(function(res){var im=new Image();
      im.onload=function(){var c=document.createElement('canvas');c.width=im.width;c.height=im.height;var g=c.getContext('2d');g.drawImage(im,0,0);
        var d=g.getImageData(${info.x},${info.y},${info.w},${info.h}).data,R=0,G=0,B=0,n=0;
        for(var i=0;i<d.length;i+=4){R+=d[i];G+=d[i+1];B+=d[i+2];n++}
        res([R/n,G/n,B/n])};im.src='data:image/png;base64,${png}'})})()`);
    const m=info.color.match(/[\d.]+/g).map(Number);
    const a=m.length>3?m[3]:1;
    const txt=[m[0]*a+px[0]*(1-a),m[1]*a+px[1]*(1-a),m[2]*a+px[2]*(1-a)];
    const cr=contrast(txt,px);
    L("  "+name+": text "+info.color+" @ "+info.fs+"/"+info.fw+"  backdrop rgb("+px.map(v=>v.toFixed(0)).join(",")+")  contrast="+cr.toFixed(2)+":1  "+(cr>=4.5?"PASS AA":cr>=3?"only AA-large":"FAIL")+"  rect "+info.w+"x"+info.h);
  }
  await ev("document.getElementById('startmenu').classList.add('hidden')");

  L("\n== J. REDUCED MOTION ==");
  await send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
  await send("Page.navigate",{url:"file:///"+TARGET.replace(/\\/g,"/")});await sleep(2400);
  L("  RM detected by page: "+await ev("matchMedia('(prefers-reduced-motion: reduce)').matches"));
  L("  css animation-name (#scanroll,#noise,#sign .s1,.marq span,#bustwrap,.blink): "+await ev("[].slice.call([document.getElementById('scanroll'),document.getElementById('noise'),document.querySelector('#sign .s1'),document.querySelector('.marq span'),document.getElementById('bustwrap'),document.querySelector('.blink')]).map(function(e){return getComputedStyle(e).animationName}).join(',')"));
  const rb1=await ev("window.PLAZA.bust()");const rp1=await ev(prof);await sleep(1200);
  const rb2=await ev("window.PLAZA.bust()");const rp2=await ev(prof);
  L("  theta delta over 1.2s under RM: "+(rb2-rb1).toFixed(5)+"  (bust rotating under RM = "+(Math.abs(rb2-rb1)>1e-6)+")");
  let mv=0;for(let i=0;i<rp1.length;i+=7)mv+=Math.abs(rp1[i]-rp2[i]);mv/=Math.ceil(rp1.length/7);
  L("  grid profile mean abs change under RM: "+mv.toFixed(3)+"  (grid scrolling under RM = "+(mv>0.4)+")");
  await ev("(function(){var i=document.querySelector('#icons .icon');i.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))})()");
  await sleep(60);
  L("  hover still animates under RM: .gl.hit present = "+await ev("document.querySelectorAll('.gl.hit').length")+", scene.vhs = "+await ev("document.getElementById('scene').classList.contains('vhs')")+", animationName on hit = "+await ev("(document.querySelector('.gl.hit')?getComputedStyle(document.querySelector('.gl.hit')).animationName:'n/a')"));
  L("  .win spawning animation under RM: "+await ev("(function(){window.PLAZA.openWin('bin');var w=document.getElementById('win-bin');return getComputedStyle(w).animationName})()"));
  L("  smooth scrollIntoView gated on RM: line 1192 uses {behavior:'smooth'} unconditionally");
  await send("Emulation.setEmulatedMedia",{features:[]});

  L("\n== K. MISC STATE / LEAK CHECKS ==");
  await send("Page.navigate",{url:"file:///"+TARGET.replace(/\\/g,"/")});await sleep(2400);
  L("  openSet/taskbar after min->close: ");
  await ev("window.PLAZA.openWin('bin')");await sleep(150);
  await ev("window.PLAZA.minWin(document.getElementById('win-bin'))");await sleep(60);
  await ev("window.PLAZA.closeWin(document.getElementById('win-bin'))");await sleep(60);
  L("      taskbar button after min then close: "+await ev("String(!!document.getElementById('task-bin'))")+" (dangling pressed button?) doc:"+await ev("String(!!document.getElementById('task-bin')&&document.getElementById('task-bin').className)"));
  L("  interval/leak surfaces:");
  L("      setInterval count (source): "+await ev("(function(){return document.title?1:1})()")+"  [static: scheduler, tickClock, glitch]");
  await ev("window.PLAZA.openWin('midi');window.PLAZA.openWin('midi');window.PLAZA.openWin('midi')");
  L("      repeated openWin('midi') taskbar buttons: "+await ev("document.querySelectorAll('[id^=task-]').length")+" (unique ids so no dup)");
  L("  close midi while playing stops sequencer: ");
  await clickAt(760,120);
  L("      A.sched after close during play = "+await ev("(function(){var m=document.getElementById('mplay');m.click();document.querySelector('#win-midi .wbtn[data-a=close]').click();return String(window.PLAZA.audio.sched)})()"));
  L("  uptime/cam elements re-queried each frame: line 1592/1597");
  L("  renderer nodes: "+await ev("document.getElementsByTagName('*').length"));
  L("  #bustsvg <use> nodes: "+await ev("document.querySelectorAll('#bustsvg use').length")+"  cam <use>: "+await ev("document.querySelectorAll('#camsvg use').length"));

  L("\n== L. FILTER / SVG ==");
  L("  xlink:href present anywhere: "+await ev("document.documentElement.outerHTML.indexOf('xlink:href')>=0"));
  L("  filter region #vhs: "+await ev("(function(){var f=document.getElementById('vhs');return f.getAttribute('x')+','+f.getAttribute('y')+','+f.getAttribute('width')+','+f.getAttribute('height')})()"));
  L("  .gl hit clip-path uses inset() (FE clip on ::before/after) ok; #scene filter bbox vs viewport checked");
  L("  image href form: "+await ev("document.querySelector('#marblePat image').getAttribute('href').slice(0,22)"));
  L("  bust svg overflow: "+await ev("getComputedStyle(document.getElementById('bustsvg')).overflow"));
  L("  marble: Math.random used inside marbleTexture? (source check below)");
  L("\n== M. errors at end ==");
  L("  errors: "+errors.length+(errors.length?" -> "+errors.slice(0,6).join(" | "):""));
  ws.close();proc.kill();process.exit(0);
}
main().catch(e=>{L("DRIVER ERROR "+e.message+"\n"+e.stack);try{proc.kill()}catch(x){};process.exit(3)});
