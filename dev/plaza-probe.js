"use strict";
const {spawn}=require("child_process");const fs=require("fs"),path=require("path"),http=require("http"),os=require("os");
function PLAZA_TARGET(){var c=[path.resolve(__dirname,"..","plaza-aeterna.html"),path.resolve(__dirname,"..","index.html")];for(var i=0;i<c.length;i++)if(fs.existsSync(c[i]))return c[i];return c[0]}
const CHROME="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TARGET=PLAZA_TARGET();
const PORT=9900+Math.floor(Math.random()*90);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const proc=spawn(CHROME,["--headless=new","--no-sandbox","--disable-breakpad","--disable-gpu","--no-first-run",
 "--remote-debugging-port="+PORT,"--user-data-dir="+fs.mkdtempSync(path.join(os.tmpdir(),"probe")),
 "--window-size=1440,900","--hide-scrollbars","about:blank"],{stdio:"ignore"});
function get(p){return new Promise((res,rej)=>{http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(JSON.parse(d)))}).on("error",rej)})}
let ws,id=0,pend=new Map();
function send(m,p){return new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p||{}}));setTimeout(()=>{if(pend.has(i)){pend.delete(i);rej(new Error("t "+m))}},20000)})}
async function ev(e){const r=await send("Runtime.evaluate",{expression:e,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value}
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
  console.log(await ev(`(function(){
    var c=document.getElementById('grid'),g=c.getContext('2d');
    var out=[];
    [60,110,160,205,300,400,500,555,570,600].forEach(function(y){
      var d=g.getImageData(0,Math.floor(y*c.height/900),c.width,1).data;var n=0;
      for(var i=3;i<d.length;i+=4) if(d[i]>6) n++;
      out.push(y+':'+n+'/'+c.width);
    });
    return 'grid alpha rows -> '+out.join('  ');
  })()`));
  console.log(await ev(`(function(){
    var r={};
    var bs=document.getElementById('bustsvg').getBoundingClientRect();
    r.bustRect=[Math.round(bs.left),Math.round(bs.top),Math.round(bs.width),Math.round(bs.height)];
    var su=document.getElementById('sunwrap').getBoundingClientRect();
    r.sunRect=[Math.round(su.left),Math.round(su.top),Math.round(su.width),Math.round(su.height)];
    r.aeW=document.querySelector('.ae').getBoundingClientRect().height;
    r.aeLines=getComputedStyle(document.querySelector('.ae')).fontSize;
    r.gridH=document.getElementById('grid').height;
    return JSON.stringify(r);
  })()`));
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:2,mobile:false});
  await sleep(500);
  await ev("window.PLAZA.rot(0)");
  await ev("document.querySelectorAll('.win').forEach(function(w){w.classList.add('hidden')})");
  await sleep(400);
  async function crop(name,x,y,w,h){
    const s=await send("Page.captureScreenshot",{format:"png",clip:{x:x,y:y,width:w,height:h,scale:1}});
    fs.writeFileSync(path.join(__dirname,"plaza-shots",name+".png"),Buffer.from(s.data,"base64"));
  }
  await crop("cropA-leftpalms",0,0,320,900);
  await crop("cropB-rightpalms",1120,0,320,900);
  await crop("cropC-bust",520,120,400,500);
  await ev("window.PLAZA.rot(1)");await sleep(2500);
  await crop("cropD-bust-rot",520,120,400,500);
  await ev("window.PLAZA.rot(0)");await sleep(400);
  await crop("cropE-full",0,0,1440,900);
  console.log("alpha rows / geometry already checked");
  ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.log("ERR "+e.message);try{proc.kill()}catch(x){};process.exit(1)});
