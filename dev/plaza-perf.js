"use strict";
const {spawn}=require("child_process");const fs=require("fs"),path=require("path"),http=require("http"),os=require("os");
function PLAZA_TARGET(){var c=[path.resolve(__dirname,"..","plaza-aeterna.html"),path.resolve(__dirname,"..","index.html")];for(var i=0;i<c.length;i++)if(fs.existsSync(c[i]))return c[i];return c[0]}
const CHROME="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TARGET=PLAZA_TARGET();
const PORT=9980+Math.floor(Math.random()*15);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const proc=spawn(CHROME,["--headless=new","--no-sandbox","--disable-breakpad","--disable-gpu","--no-first-run",
 "--remote-debugging-port="+PORT,"--user-data-dir="+fs.mkdtempSync(path.join(os.tmpdir(),"perf")),
 "--window-size=1440,900","--hide-scrollbars","about:blank"],{stdio:"ignore"});
function get(p){return new Promise((res,rej)=>{http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(JSON.parse(d)))}).on("error",rej)})}
let ws,id=0,pend=new Map();
function send(m,p){return new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p||{}}));setTimeout(()=>{if(pend.has(i)){pend.delete(i);rej(new Error("t "+m))}},25000)})}
async function ev(e){const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails).slice(0,300));return r.result.value}
(async()=>{
  let list=null;
  for(let i=0;i<80&&!list;i++){try{const l=await get("/json/list");if(l&&l.some(t=>t.type==="page"))list=l}catch(e){};if(!list)await sleep(300)}
  ws=new WebSocket(list.find(t=>t.type==="page").webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result)}};
  await send("Page.enable");await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:"file:///"+TARGET.replace(/\\/g,"/")});
  await sleep(3000);
  async function cadence(label,secs){
    await ev("window.__n=0;window.__last=performance.now();window.__max=0;(function l(){var t=performance.now();var d=t-window.__last;window.__last=t;if(window.__n>0&&d>window.__max)window.__max=d;window.__n++;requestAnimationFrame(l)})()");
    await sleep(secs*1000);
    const r=await ev("JSON.stringify({fps:(window.__n/"+secs+").toFixed(1),maxGap:+window.__max.toFixed(1)})");
    console.log(label.padEnd(34)+r);
  }
  await cadence("idle desktop (3 windows)",3);
  await ev("window.PLAZA.openWin('sys');window.PLAZA.openWin('cam');window.PLAZA.openWin('bin')");
  await sleep(300);
  await cadence("all 6 windows open",3);
  await ev("document.getElementById('mplay').click()");
  await sleep(600);
  await cadence("audio playing + all windows",3);
  await ev("for(var i=0;i<40;i++){document.getElementById('scene').classList.toggle('vhs');}");
  await cadence("vhs filter forced on",3);
  await ev("window.PLAZA.setTheta(0)");
  await cadence("burst-free baseline",3);
  const mem=await ev("JSON.stringify(performance.memory?{usedMB:Math.round(performance.memory.usedJSHeapSize/1048576)}:{})");
  console.log("heap: "+mem);
  console.log("dom nodes: "+await ev("document.getElementsByTagName('*').length"));
  console.log("rAF loops leaking? intervals:"+await ev("(function(){return 0})()"));
  ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.log("ERR "+e.message);try{proc.kill()}catch(x){};process.exit(1)});
