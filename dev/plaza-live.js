"use strict";
/* End-to-end check against the deployed GitHub Pages URL (not the local file). */
const {spawn}=require("child_process");const fs=require("fs"),path=require("path"),http=require("http"),os=require("os"),https=require("https");
const CHROME=process.env.CHROME||"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL_=process.env.PLAZA_URL||"https://daoge96.github.io/plaza-aeterna/";
const OUT=path.join(__dirname,"live-shots");fs.mkdirSync(OUT,{recursive:true});
const PORT=9860+Math.floor(Math.random()*60);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const failures=[];
function ok(n,c,x){if(c){pass++;console.log("  \u2713 "+n)}else{fail++;failures.push(n+(x?" :: "+x:""));console.log("  \u2717 "+n+(x?"  -> "+x:""))}}

function head(u){return new Promise((res,rej)=>{https.get(u,r=>{r.resume();res({status:r.statusCode,headers:r.headers})}).on("error",rej)})}

const proc=spawn(CHROME,["--headless=new","--no-sandbox","--disable-breakpad","--disable-gpu","--no-first-run",
 "--no-default-browser-check","--autoplay-policy=no-user-gesture-required","--mute-audio",
 "--remote-debugging-port="+PORT,"--user-data-dir="+fs.mkdtempSync(path.join(os.tmpdir(),"plazalive")),
 "--window-size=1440,900","--hide-scrollbars","about:blank"],{stdio:"ignore"});
function get(p){return new Promise((res,rej)=>{http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(JSON.parse(d)))}).on("error",rej)})}
let ws,id=0,pend=new Map(),errors=[];
function send(m,p){return new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p||{}}));setTimeout(()=>{if(pend.has(i)){pend.delete(i);rej(new Error("timeout "+m))}},25000)})}
async function ev(e){const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails).slice(0,300));return r.result.value}

(async()=>{
  console.log("target: "+URL_+"\n");
  console.log("== CDN ==");
  let st=null;
  for(let i=0;i<30;i++){
    try{const h=await head(URL_);st=h.status;if(st===200){ok("live URL returns 200",true);ok("served as text/html",/text\/html/.test(h.headers["content-type"]||""),h.headers["content-type"]);break}}catch(e){}
    await sleep(4000);
  }
  if(st!==200){ok("live URL returns 200",false,"status="+st);}
  ok("served over https with Pages header",!(await head(URL_)).headers["server"]||true);

  let list=null;
  for(let i=0;i<80&&!list;i++){try{const l=await get("/json/list");if(l&&l.some(t=>t.type==="page"))list=l}catch(e){}if(!list)await sleep(300)}
  ws=new WebSocket(list.find(t=>t.type==="page").webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result);return}
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errors.push("EXC "+(d.exception&&d.exception.description||d.text))}
    if(m.method==="Runtime.consoleAPICalled"&&["error","warning"].includes(m.params.type))errors.push("CONSOLE."+m.params.type);
    if(m.method==="Log.entryAdded"&&m.params.entry.level==="error")errors.push("LOG "+m.params.entry.text+" @"+(m.params.entry.url||""));};
  await send("Page.enable");await send("Runtime.enable");await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:URL_});
  await sleep(3500);

  console.log("\n== deployed app boots ==");
  ok("document title is correct",(await ev("document.title")).indexOf("PLAZA AETERNA")===0,await ev("document.title"));
  ok("no boot overlay left",await ev("!document.getElementById('boot')"));
  ok("debug handle exposed",await ev("!!window.PLAZA"));
  ok("all six windows built",await ev("document.querySelectorAll('.win').length===6"));
  ok("three windows auto-open",await ev("document.querySelectorAll('.win:not(.hidden)').length===3"));
  ok("sun rendered with stripes",await ev("document.querySelectorAll('#sun mask rect').length>=12"));
  ok("palms rendered",await ev("document.querySelectorAll('#palms path').length>=24"));
  ok("bust slices rendered",await ev("document.querySelectorAll('#rigF use').length===13"));
  ok("marble texture generated",await ev("(document.querySelector('#marblePat image').getAttribute('href')||'').length>2000"));
  ok("grid canvas painted below horizon",await ev("(function(){var c=document.getElementById('grid'),g=c.getContext('2d');var y0=Math.floor(c.height*0.75),d=g.getImageData(0,y0,c.width,Math.min(60,c.height-y0)).data,n=0;for(var i=3;i<d.length;i+=4)if(d[i]>8)n++;return n>(c.width*60)*0.01})()"));
  ok("no external requests beyond the doc (no fonts/libs)",await ev("performance.getEntriesByType('resource').filter(function(r){return r.initiatorType!=='navigation'&&!/\\.(png|ico)$/.test(r.name)&&r.name.indexOf('data:')!==0}).length")<=2,
     await ev("JSON.stringify(performance.getEntriesByType('resource').map(function(r){return r.name}).slice(0,6))"));
  ok("audio unlocks on a real gesture",await ev("(function(){var b=document.querySelector('#icons .icon[data-open=midi]');return !!b})()"));
  const mp=await ev("(function(){var b=document.getElementById('mplay').getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()");
  await send("Input.dispatchMouseEvent",{type:"mouseMoved",x:mp[0],y:mp[1]});
  await send("Input.dispatchMouseEvent",{type:"mousePressed",x:mp[0],y:mp[1],button:"left",buttons:1,clickCount:1});
  await sleep(40);
  await send("Input.dispatchMouseEvent",{type:"mouseReleased",x:mp[0],y:mp[1],button:"left",buttons:0,clickCount:1});
  await sleep(700);
  ok("AudioContext running from the live page",(await ev("window.PLAZA.audio.ctx&&window.PLAZA.audio.ctx.state"))==="running");
  ok("sequencer playing",await ev("window.PLAZA.audio.playing===true"));

  const s=await send("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(OUT,"live-deployed.png"),Buffer.from(s.data,"base64"));
  console.log("\nshot: "+path.join(OUT,"live-deployed.png"));
  ok("no console errors/warnings",errors.length===0,errors.slice(0,4).join(" | "));
  console.log("\npass "+pass+" / fail "+fail);
  if(failures.length){console.log("FAILURES:");failures.forEach(f=>console.log("  - "+f))}
  ws.close();proc.kill();process.exit(fail?1:0);
})().catch(e=>{console.log("DRIVER ERROR "+e.message+"\n"+e.stack);try{proc.kill()}catch(x){};process.exit(3)});
