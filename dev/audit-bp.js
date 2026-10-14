"use strict";
/* focused diagnostics: breakpoint boundary + hit-testing + grid direction, tightly constrained */
const {spawn}=require("child_process");
function PLAZA_TARGET(){var c=[path.resolve(__dirname,"..","plaza-aeterna.html"),path.resolve(__dirname,"..","index.html")];for(var i=0;i<c.length;i++)if(fs.existsSync(c[i]))return c[i];return c[0]}
const fs=require("fs"),path=require("path"),http=require("http"),os=require("os");
const CHROME="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TARGET=PLAZA_TARGET();
const PORT=9900+Math.floor(Math.random()*90);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const userDir=fs.mkdtempSync(path.join(os.tmpdir(),"bpprof"));
const proc=spawn(CHROME,["--headless=new","--no-sandbox","--disable-breakpad","--disable-gpu","--no-first-run",
  "--no-default-browser-check","--autoplay-policy=no-user-gesture-required","--mute-audio",
  "--remote-debugging-port="+PORT,"--user-data-dir="+userDir,"--window-size=1440,900","--hide-scrollbars","about:blank"],{stdio:"ignore"});
function get(p){return new Promise((res,rej)=>{http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej)})}
let ws,id=0,pend=new Map();
function send(m,p){return new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p||{}}));setTimeout(()=>{if(pend.has(i)){pend.delete(i);rej(new Error("timeout "+m))}},25000)})}
async function ev(e){const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error("eval "+JSON.stringify(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.text));return r.result.value}
const L=console.log;
async function metrics(w,h,mobile){await send("Emulation.setDeviceMetricsOverride",{width:w,height:h,deviceScaleFactor:1,mobile:!!mobile})}
async function main(){
  let list=null;for(let i=0;i<90&&!list;i++){try{const l=await get("/json/list");if(Array.isArray(l)&&l.some(t=>t.type==="page"))list=l}catch(e){}if(!list)await sleep(300)}
  const page=list.find(t=>t.type==="page");ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result)}};
  await send("Page.enable");await send("Runtime.enable");await metrics(1440,900,false);
  await send("Page.navigate",{url:"file:///"+TARGET.replace(/\\/g,"/")});await sleep(2400);

  L("== 1. breakpoint: does max-width:720 match above 720? ==");
  for(const [w,h,mob] of [[700,800,true],[720,800,true],[721,800,false],[730,800,false],[740,380,false],[760,400,false],[1440,900,false]]){
    await metrics(w,h,mob);await sleep(320);
    L("  w="+w+" h="+h+" mobile="+mob+" -> innerWidth="+await ev("innerWidth")
      +" mq720="+await ev("matchMedia('(max-width:720px)').matches")
      +" --tb-h="+await ev("getComputedStyle(document.documentElement).getPropertyValue('--tb-h').trim()")
      +" win.position="+await ev("getComputedStyle(document.querySelector('.win')).position")
      +" desktop.overflowY="+await ev("getComputedStyle(document.getElementById('desktop')).overflowY")
      +" icons.z="+await ev("getComputedStyle(document.getElementById('icons')).zIndex")
      +" docScrollW="+await ev("document.documentElement.scrollWidth"));
  }

  L("\n== 2. hit-test at 721x900 (icons reportedly un-hittable) ==");
  await metrics(721,900,false);await sleep(400);
  const ht=await ev(`(function(){var out=[];document.querySelectorAll('#icons .icon').forEach(function(e,i){var b=e.getBoundingClientRect();
    var x=Math.round(b.left+b.width/2),y=Math.round(b.top+b.height/2);var h=document.elementFromPoint(x,y);
    out.push(i+" @"+x+","+y+" -> "+(h?h.tagName+"#"+(h.id||"")+"."+(typeof h.className==="string"?h.className:"")+" closestIcon="+!!(h.closest&&h.closest('.icon')):"null"))});
    var s=document.getElementById('scene').getBoundingClientRect();
    var d=document.getElementById('desktop');
    var ds=getComputedStyle(d);
    return out.concat(["scene rect "+JSON.stringify([s.left,s.top,s.width,s.height]),
      "desktop pointerEvents="+ds.pointerEvents+" z="+ds.zIndex+" rect="+JSON.stringify(d.getBoundingClientRect().toJSON()),
      "elementFromPoint(50,80)="+String(document.elementFromPoint(50,80)&&document.elementFromPoint(50,80).tagName),
      "scene.vhs="+document.getElementById('scene').classList.contains('vhs')])})()`);
  ht.forEach(l=>L("  "+l));
  const clickTest=await ev("(function(){var b=document.querySelector('#icons .icon[data-open=sys]').getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()");
  await send("Input.dispatchMouseEvent",{type:"mousePressed",x:clickTest[0],y:clickTest[1],button:"left",buttons:1,clickCount:1});
  await send("Input.dispatchMouseEvent",{type:"mouseReleased",x:clickTest[0],y:clickTest[1],button:"left",buttons:0,clickCount:1});
  await sleep(250);
  L("  real mouse click on icon 'sys' opened window: "+await ev("!document.getElementById('win-sys').classList.contains('hidden')"));

  L("\n== 3. grid direction, tightly constrained (bottom 20% band, d in 0..30) ==");
  await metrics(1440,900,false);await sleep(300);
  const profInner=`(function(){var c=document.getElementById('grid'),g=c.getContext('2d');
    var W=c.width,H=c.height,y0=Math.round(H*0.82),out=[],y;
    for(y=y0;y<H;y++){var d=g.getImageData(0,y,W,1).data,s=0,x;for(x=0;x<W;x++)s+=(d[x*4]+d[x*4+1]+d[x*4+2])/3;out.push(s/W)}
    return out})()`;
  for(const dt of [700,1100]){
    const A=await ev(profInner);await sleep(dt);const B=await ev(profInner);
    const n=A.length,res=[];
    for(let d=0;d<=30;d++){let s=0,c=0;for(let i=0;i+d<n;i++){s+=A[i]*B[i+d];c++}res.push([d,s/c])}
    res.sort((a,b)=>b[1]-a[1]);
    const up=[];for(let d=0;d<=30;d++){let s=0,c=0;for(let i=d;i<n;i++){s+=A[i]*B[i-d];c++}up.push([d,s/c])}
    up.sort((a,b)=>b[1]-a[1]);
    // expected downward shift: dy = bot*NREF*0.42*dt/1000 / n^2 , n in [6.5, 7.93] for y in [0.82H, H]
    const bot=900*0.375,lo=6.5,hi=6.5/0.82;
    L("  dt="+dt+"ms  band="+n+"px  expected DOWN shift = "+(bot*6.5*0.42*(dt/1000)/(hi*hi)).toFixed(1)+".."+(bot*6.5*0.42*(dt/1000)/(lo*lo)).toFixed(1)+"px");
    L("      best DOWN d="+res[0][0]+" (score "+res[0][1].toFixed(0)+")   2nd d="+res[1][0]+" ("+res[1][1].toFixed(0)+")");
    L("      best UP   d="+up[0][0]+" (score "+up[0][1].toFixed(0)+")   2nd d="+up[1][0]+" ("+up[1][1].toFixed(0)+")");
  }
  L("  (drawGrid: phase=(t*0.42)%1 up; n=i-phase down; y=hy+bot*(6.5/n) up => line y increases => moves DOWN/toward viewer)");
  ws.close();proc.kill();process.exit(0);
}
main().catch(e=>{L("ERR "+e.message+"\n"+e.stack);try{proc.kill()}catch(x){};process.exit(3)});
