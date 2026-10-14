"use strict";
/* mechanism proof: (a) window re-clamp after a breakpoint crossing buries the icon column
                (b) decisive single-feature grid direction test                       */
const {spawn}=require("child_process");
function PLAZA_TARGET(){var c=[path.resolve(__dirname,"..","plaza-aeterna.html"),path.resolve(__dirname,"..","index.html")];for(var i=0;i<c.length;i++)if(fs.existsSync(c[i]))return c[i];return c[0]}
const fs=require("fs"),path=require("path"),http=require("http"),os=require("os");
const CHROME="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TARGET=PLAZA_TARGET();
const PORT=9950+Math.floor(Math.random()*40);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const userDir=fs.mkdtempSync(path.join(os.tmpdir(),"icoprof"));
const proc=spawn(CHROME,["--headless=new","--no-sandbox","--disable-breakpad","--disable-gpu","--no-first-run",
  "--no-default-browser-check","--autoplay-policy=no-user-gesture-required","--mute-audio",
  "--remote-debugging-port="+PORT,"--user-data-dir="+userDir,"--window-size=1440,900","--hide-scrollbars","about:blank"],{stdio:"ignore"});
function get(p){return new Promise((res,rej)=>{http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej)})}
let ws,id=0,pend=new Map();
function send(m,p){return new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p||{}}));setTimeout(()=>{if(pend.has(i)){pend.delete(i);rej(new Error("timeout "+m))}},25000)})}
async function ev(e){const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error("eval "+JSON.stringify(r.exceptionDetails.exception&&r.exceptionDetails.exception.description));return r.result.value}
const L=console.log;
async function metrics(w,h,mobile){await send("Emulation.setDeviceMetricsOverride",{width:w,height:h,deviceScaleFactor:1,mobile:!!mobile})}
async function clickAt(x,y){await send("Input.dispatchMouseEvent",{type:"mousePressed",x,y,button:"left",buttons:1,clickCount:1});
  await send("Input.dispatchMouseEvent",{type:"mouseReleased",x,y,button:"left",buttons:0,clickCount:1});await sleep(200)}
const dumpWins=`(function(){return [].slice.call(document.querySelectorAll('.win')).map(function(w){var b=w.getBoundingClientRect();
  return w.id+" inline.left="+w.style.left+" rect="+Math.round(b.left)+".."+Math.round(b.right)+" vis="+!w.classList.contains('hidden')})})()`;
const iconHit=`(function(){var out=[];document.querySelectorAll('#icons .icon').forEach(function(e){var b=e.getBoundingClientRect();
  var x=Math.round(b.left+b.width/2),y=Math.round(b.top+b.height/2);var h=(x>=0&&y>=0&&x<innerWidth&&y<innerHeight)?document.elementFromPoint(x,y):null;
  out.push(e.dataset.open+":"+(h&&h.closest&&h.closest('.icon')?"HIT":"blocked-by-"+(h?h.tagName+"."+(typeof h.className==="string"?h.className:"")+"@"+(h.closest('.win')?h.closest('.win').id:""):"null")))});
  return out})()`;
async function iconClickWorks(id2){
  const r=await ev("(function(){var b=document.querySelector('#icons .icon[data-open="+JSON.stringify(id2)+"]').getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()");
  const wasHidden=await ev("document.getElementById('win-"+id2+"').classList.contains('hidden')");
  await clickAt(r[0],r[1]);
  const nowHidden=await ev("document.getElementById('win-"+id2+"').classList.contains('hidden')");
  return wasHidden&&!nowHidden;
}
async function main(){
  let list=null;for(let i=0;i<90&&!list;i++){try{const l=await get("/json/list");if(Array.isArray(l)&&l.some(t=>t.type==="page"))list=l}catch(e){}if(!list)await sleep(300)}
  const page=list.find(t=>t.type==="page");ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result)}};
  await send("Page.enable");await send("Runtime.enable");await metrics(1440,900,false);
  await send("Page.navigate",{url:"file:///"+TARGET.replace(/\\/g,"/")});await sleep(2400);

  L("== A. fresh load 1440x900: are icons mouse-clickable? ==");
  L("  icon hit map: "+JSON.stringify(await ev(iconHit)));
  L("  click icon 'sys' opened window: "+await iconClickWorks("sys"));
  L("  window inline lefts: "+JSON.stringify(await ev("[].slice.call(document.querySelectorAll('.win')).map(function(w){return w.id+'='+w.style.left})")));

  L("\n== B. same page, viewport 390x844 (card layout) then back to 1000x800 ==");
  await metrics(390,844,true);await sleep(500);
  await metrics(1000,800,false);await sleep(600);
  L("  window inline lefts now: "+JSON.stringify(await ev("[].slice.call(document.querySelectorAll('.win')).map(function(w){return w.id+'='+w.style.left+'/'+w.style.top})")));
  L("  window rects: "+JSON.stringify(await ev(dumpWins)));
  L("  icon hit map: "+JSON.stringify(await ev(iconHit)));
  L("  click icon 'sys' opened window: "+await iconClickWorks("sys"));
  L("  icons still reachable from Start menu (workaround): "+await ev("!!document.querySelector('#startitems li')"));

  L("\n== C. fresh load directly at 1000x800 (no crossing) ==");
  await metrics(1000,800,false);
  await send("Page.navigate",{url:"file:///"+TARGET.replace(/\\/g,"/")});await sleep(2300);
  L("  window inline lefts: "+JSON.stringify(await ev("[].slice.call(document.querySelectorAll('.win')).map(function(w){return w.id+'='+w.style.left})")));
  L("  icon hit map: "+JSON.stringify(await ev(iconHit)));
  L("  click icon 'sys' opened window: "+await iconClickWorks("sys"));

  L("\n== D. fresh load directly at 721x900 then 740x380->900x700 ==");
  await metrics(721,900,false);await send("Page.navigate",{url:"file:///"+TARGET.replace(/\\/g,"/")});await sleep(2300);
  L("  721x900 fresh: icon hit map "+JSON.stringify(await ev(iconHit)));
  await metrics(740,380,false);await sleep(500);await metrics(900,700,false);await sleep(600);
  L("  after 740x380 -> 900x700: lefts "+JSON.stringify(await ev("[].slice.call(document.querySelectorAll('.win')).map(function(w){return w.id+'='+w.style.left})")));
  L("  icon hit map: "+JSON.stringify(await ev(iconHit)));

  L("\n== E. decisive grid direction: track the single brightest horizontal line ==");
  await metrics(1440,900,false);await send("Page.navigate",{url:"file:///"+TARGET.replace(/\\/g,"/")});await sleep(2300);
  await sleep(1500);
  const peak=`(function(){var c=document.getElementById('grid'),g=c.getContext('2d');
    var W=c.width,H=c.height,y0=Math.round(H*0.70),best=-1,by=-1,y,x;
    var s=[];
    for(y=y0;y<H-2;y++){var d=g.getImageData(0,y,W,1).data,t=0;for(x=0;x<W;x+=4)t+=d[x*4]+d[x*4+1]+d[x*4+2];
      t/= (W/4); s.push(t)}
    /* 5-tap smooth then argmax = brightest ridge */
    for(var i=2;i<s.length-2;i++){var v=(s[i-2]+2*s[i-1]+3*s[i]+2*s[i+1]+s[i+2])/9; if(v>best){best=v;by=y0+i}}
    return {y:by,v:Math.round(best)}})()`;
  for(let k=0;k<4;k++){
    const a=await ev(peak);await sleep(700);const b=await ev(peak);
    const expLow=(337*6.5*0.42*0.7/Math.pow(6.5/((b.y-562.5)/337.5),2));
    L("  brightest line y="+a.y+" -> y="+b.y+"  delta="+(b.y-a.y)+"px over 700ms  (predicted +"+(a.y>562? (337*6.5*0.42*0.7/Math.pow(6.5/((a.y-562.5)/337.5),2)).toFixed(1):"n/a")+"px)  "+(b.y>a.y?"DOWN/toward viewer":"UP"));
  }
  ws.close();proc.kill();process.exit(0);
}
main().catch(e=>{L("ERR "+e.message+"\n"+e.stack);try{proc.kill()}catch(x){};process.exit(3)});
