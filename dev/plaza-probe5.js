"use strict";
const {spawn}=require("child_process");const fs=require("fs"),path=require("path"),http=require("http"),os=require("os");
function PLAZA_TARGET(){var c=[path.resolve(__dirname,"..","plaza-aeterna.html"),path.resolve(__dirname,"..","index.html")];for(var i=0;i<c.length;i++)if(fs.existsSync(c[i]))return c[i];return c[0]}
const CHROME="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TARGET=PLAZA_TARGET();
const PORT=9950+Math.floor(Math.random()*40);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const proc=spawn(CHROME,["--headless=new","--no-sandbox","--disable-breakpad","--disable-gpu","--no-first-run",
 "--remote-debugging-port="+PORT,"--user-data-dir="+fs.mkdtempSync(path.join(os.tmpdir(),"probe5")),
 "--hide-scrollbars","about:blank"],{stdio:"ignore"});
function get(p){return new Promise((res,rej)=>{http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(JSON.parse(d)))}).on("error",rej)})}
let ws,id=0,pend=new Map();
function send(m,p){return new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p||{}}));setTimeout(()=>{if(pend.has(i)){pend.delete(i);rej(new Error("t "+m))}},20000)})}
async function ev(e){const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails).slice(0,300));return r.result.value}
(async()=>{
  let list=null;
  for(let i=0;i<80&&!list;i++){try{const l=await get("/json/list");if(l&&l.some(t=>t.type==="page"))list=l}catch(e){};if(!list)await sleep(300)}
  ws=new WebSocket(list.find(t=>t.type==="page").webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result)}};
  await send("Page.enable");await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1024,height:768,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:"file:///"+TARGET.replace(/\\/g,"/")});
  await sleep(2800);
  for(const [w,h] of [[1024,768],[721,900],[900,700],[1440,900]]){
    await send("Emulation.setDeviceMetricsOverride",{width:w,height:h,deviceScaleFactor:1,mobile:false});
    await sleep(600);
    console.log("=== "+w+"x"+h+" ===");
    console.log(await ev(`(function(){
      var s=document.getElementById('scene'),cs=getComputedStyle(s);
      return JSON.stringify({
        iw:innerWidth, ih:innerHeight,
        scrollW:document.documentElement.scrollWidth,
        bodyW:document.body.getBoundingClientRect().width,
        sceneRect:[Math.round(s.getBoundingClientRect().left),Math.round(s.getBoundingClientRect().width)],
        transform:cs.transform, filter:cs.filter, animation:cs.animationName,
        cls:s.className, offsetW:s.offsetWidth
      });
    })()`));
  }
  console.log("\n--- vhs override test ---");
  console.log(await ev(`(function(){var s=document.getElementById('scene');s.classList.add('vhs');var f=getComputedStyle(s).filter;s.classList.remove('vhs');return 'filter with .vhs = '+f})()`));
  console.log(await ev(`(function(){var s=document.getElementById('scene');s.style.animation='none';s.classList.add('vhs');var f=getComputedStyle(s).filter;s.classList.remove('vhs');s.style.animation='';return 'filter with .vhs + animation:none = '+f})()`));
  ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.log("ERR "+e.message);try{proc.kill()}catch(x){};process.exit(1)});
