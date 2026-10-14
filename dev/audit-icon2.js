"use strict";
const {spawn}=require("child_process");
function PLAZA_TARGET(){var c=[path.resolve(__dirname,"..","plaza-aeterna.html"),path.resolve(__dirname,"..","index.html")];for(var i=0;i<c.length;i++)if(fs.existsSync(c[i]))return c[i];return c[0]}
const fs=require("fs"),path=require("path"),http=require("http"),os=require("os");
const CHROME="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TARGET=PLAZA_TARGET();
const PORT=9970+Math.floor(Math.random()*20);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const userDir=fs.mkdtempSync(path.join(os.tmpdir(),"ico2"));
const proc=spawn(CHROME,["--headless=new","--no-sandbox","--disable-breakpad","--disable-gpu","--no-first-run",
  "--no-default-browser-check","--mute-audio","--remote-debugging-port="+PORT,"--user-data-dir="+userDir,
  "--window-size=1440,900","--hide-scrollbars","about:blank"],{stdio:"ignore"});
function get(p){return new Promise((res,rej)=>{http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej)})}
let ws,id=0,pend=new Map();
function send(m,p){return new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p||{}}));setTimeout(()=>{if(pend.has(i)){pend.delete(i);rej(new Error("timeout "+m))}},20000)})}
async function ev(e){const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails.exception&&r.exceptionDetails.exception.description));return r.result.value}
const L=console.log;
async function metrics(w,h,mobile){await send("Emulation.setDeviceMetricsOverride",{width:w,height:h,deviceScaleFactor:1,mobile:!!mobile})}
const lefts=`JSON.stringify([].slice.call(document.querySelectorAll('.win')).map(function(w){return w.id+'='+w.style.left}))`;
const hitmap=`JSON.stringify([].slice.call(document.querySelectorAll('#icons .icon')).map(function(e){var b=e.getBoundingClientRect();
  var x=Math.round(b.left+b.width/2),y=Math.round(b.top+b.height/2);var h=(x<innerWidth&&y<innerHeight)?document.elementFromPoint(x,y):null;
  return e.dataset.open+':'+(h&&h.closest&&h.closest('.icon')?'HIT':'BLOCKED')}))`;
async function main(){
  let list=null;for(let i=0;i<90&&!list;i++){try{const l=await get("/json/list");if(Array.isArray(l)&&l.some(t=>t.type==="page"))list=l}catch(e){}if(!list)await sleep(300)}
  const page=list.find(t=>t.type==="page");ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result)}};
  await send("Page.enable");await send("Runtime.enable");
  await metrics(1000,800,false);
  await send("Page.navigate",{url:"file:///"+TARGET.replace(/\\/g,"/")});await sleep(2300);
  await ev("window.__rs=0;addEventListener('resize',function(){window.__rs++});window.__mq=0;matchMedia('(max-width:720px),(max-height:540px)').addEventListener('change',function(){window.__mq++})");
  L("fresh 1000x800 lefts: "+await ev(lefts));
  L("fresh 1000x800 hitmap: "+await ev(hitmap));
  L("  resize events so far: "+await ev("window.__rs")+"  mq change events: "+await ev("window.__mq"));
  await metrics(390,844,true);await sleep(600);
  L("after 390x844: lefts "+await ev(lefts)+"  mq="+await ev("matchMedia('(max-width:720px),(max-height:540px)').matches")+"  win.position="+await ev("getComputedStyle(document.querySelector('.win')).position"));
  L("  resize events: "+await ev("window.__rs")+"  mq change events: "+await ev("window.__mq"));
  await metrics(1000,800,false);await sleep(700);
  L("back at 1000x800: lefts "+await ev(lefts)+"  mq="+await ev("matchMedia('(max-width:720px),(max-height:540px)').matches"));
  L("  hitmap: "+await ev(hitmap));
  L("  covering element at icon(0) centre: "+await ev("(function(){var b=document.querySelector('#icons .icon').getBoundingClientRect();var h=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return h.tagName+'.'+(typeof h.className==='string'?h.className:'')+' win='+(h.closest('.win')?h.closest('.win').id:'-')})()"));
  const c=await ev("(function(){var b=document.querySelector('#icons .icon[data-open=bin]').getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()");
  await send("Input.dispatchMouseEvent",{type:"mousePressed",x:c[0],y:c[1],button:"left",buttons:1,clickCount:1});
  await send("Input.dispatchMouseEvent",{type:"mouseReleased",x:c[0],y:c[1],button:"left",buttons:0,clickCount:1});
  await sleep(250);
  L("  real click on Recycle Bin icon opened it: "+await ev("!document.getElementById('win-bin').classList.contains('hidden')"));
  ws.close();proc.kill();process.exit(0);
}
main().catch(e=>{L("ERR "+e.message);try{proc.kill()}catch(x){};process.exit(3)});
