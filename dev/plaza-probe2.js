"use strict";
const {spawn}=require("child_process");const fs=require("fs"),path=require("path"),http=require("http"),os=require("os");
function PLAZA_TARGET(){var c=[path.resolve(__dirname,"..","plaza-aeterna.html"),path.resolve(__dirname,"..","index.html")];for(var i=0;i<c.length;i++)if(fs.existsSync(c[i]))return c[i];return c[0]}
const CHROME="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TARGET=PLAZA_TARGET();
const PORT=9900+Math.floor(Math.random()*90);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const proc=spawn(CHROME,["--headless=new","--no-sandbox","--disable-breakpad","--disable-gpu","--no-first-run",
 "--remote-debugging-port="+PORT,"--user-data-dir="+fs.mkdtempSync(path.join(os.tmpdir(),"probe2")),
 "--window-size=1440,900","--hide-scrollbars","about:blank"],{stdio:"ignore"});
function get(p){return new Promise((res,rej)=>{http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(JSON.parse(d)))}).on("error",rej)})}
let ws,id=0,pend=new Map();
function send(m,p){return new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p||{}}));setTimeout(()=>{if(pend.has(i)){pend.delete(i);rej(new Error("t "+m))}},20000)})}
async function ev(e){const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails).slice(0,400));return r.result.value}
(async()=>{
  let list=null;
  for(let i=0;i<80&&!list;i++){try{const l=await get("/json/list");if(l&&l.some(t=>t.type==="page"))list=l}catch(e){};if(!list)await sleep(300)}
  ws=new WebSocket(list.find(t=>t.type==="page").webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result)}};
  await send("Page.enable");await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:"file:///"+TARGET.replace(/\\/g,"/")});
  await sleep(2600);
  await ev("window.PLAZA.rot(0)");   // freeze rotation for a deterministic read
  await ev("document.querySelectorAll('.win').forEach(function(w){w.classList.add('hidden')})");
  await sleep(300);
  async function sample(label){
    const s=await send("Page.captureScreenshot",{format:"png"});
    const px=await ev(`(async function(){
      var img=new Image();img.src="data:image/png;base64,${s.data}";await img.decode();
      var c=document.createElement('canvas');c.width=img.width;c.height=img.height;
      var g=c.getContext('2d');g.drawImage(img,0,0);
      var pts=[[650,440],[700,300],[720,220],[600,520],[1430,880],[100,300]];
      return pts.map(function(p){var d=g.getImageData(p[0],p[1],1,1).data;return p[0]+','+p[1]+'='+d[0]+','+d[1]+','+d[2]});
    })()`);
    console.log(label+"  "+px.join("  "));
    return px;
  }
  await sample("sun ON :");
  await ev("document.getElementById('sunwrap').style.display='none';document.getElementById('sunrefl').style.display='none'");
  await sleep(250);
  await sample("sun OFF:");
  await ev("document.getElementById('sky').style.background='#101010';document.getElementById('skymask').style.display='none'");
  await sleep(200);
  await sample("flat bg:");
  // how opaque is the bust really? measure over a known dark bg
  console.log("\nbust bbox:", await ev("JSON.stringify(document.getElementById('bustsvg').getBoundingClientRect())"));
  console.log("rigF opacity:", await ev("document.getElementById('rigF').getAttribute('opacity')"));
  console.log("slice opacities:", await ev("[].map.call(document.querySelectorAll('#rigF use'),function(u){return u.getAttribute('opacity')}).join(',')"));
  console.log("pattern href len:", await ev("(document.querySelector('#marblePat image').getAttribute('href')||'').length"));
  console.log("computed fill of bust path:", await ev("getComputedStyle(document.querySelector('#artF path:nth-child(2)')).fill"));
  ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.log("ERR "+e.message);try{proc.kill()}catch(x){};process.exit(1)});
