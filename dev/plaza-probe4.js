"use strict";
/* responsive edge-case probe */
const {spawn}=require("child_process");const fs=require("fs"),path=require("path"),http=require("http"),os=require("os");
function PLAZA_TARGET(){var c=[path.resolve(__dirname,"..","plaza-aeterna.html"),path.resolve(__dirname,"..","index.html")];for(var i=0;i<c.length;i++)if(fs.existsSync(c[i]))return c[i];return c[0]}
const CHROME="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TARGET=PLAZA_TARGET();
const OUT=path.join(__dirname,"plaza-shots");fs.mkdirSync(OUT,{recursive:true});
const PORT=9900+Math.floor(Math.random()*90);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const proc=spawn(CHROME,["--headless=new","--no-sandbox","--disable-breakpad","--disable-gpu","--no-first-run",
 "--remote-debugging-port="+PORT,"--user-data-dir="+fs.mkdtempSync(path.join(os.tmpdir(),"probe4")),
 "--hide-scrollbars","about:blank"],{stdio:"ignore"});
function get(p){return new Promise((res,rej)=>{http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(JSON.parse(d)))}).on("error",rej)})}
let ws,id=0,pend=new Map();
function send(m,p){return new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p||{}}));setTimeout(()=>{if(pend.has(i)){pend.delete(i);rej(new Error("t "+m))}},25000)})}
async function ev(e){const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails).slice(0,300));return r.result.value}
let bad=0;
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
  await ev("window.PLAZA.openWin('sys');window.PLAZA.openWin('cam');window.PLAZA.openWin('bin')");
  await sleep(400);
  const sizes=[[320,568,"320x568"],[360,640,"360x640"],[390,844,"390x844"],[414,896,"414x896"],[720,900,"720x900"],[721,900,"721x900"],[740,380,"740x380-landscape"],[900,500,"900x500"],[1024,768,"1024x768"],[1920,1080,"1920x1080"]];
  for(const [w,h,name] of sizes){
    await send("Emulation.setDeviceMetricsOverride",{width:w,height:h,deviceScaleFactor:1,mobile:w<=720});
    await sleep(500);
    const r=JSON.parse(await ev(`(function(){
      var o={};
      o.docW=document.documentElement.scrollWidth; o.win=window.innerWidth;
      o.bodyOverflowX=getComputedStyle(document.body).overflowX;
      var desk=document.getElementById('desktop').getBoundingClientRect();
      o.desk=[Math.round(desk.left),Math.round(desk.top),Math.round(desk.right),Math.round(desk.bottom)];
      var vis=0,clip=0,wide=0;
      document.querySelectorAll('.win:not(.hidden)').forEach(function(x){
        var b=x.getBoundingClientRect(); vis++;
        if(b.right>window.innerWidth+1||b.left<-1) wide++;
        if(b.bottom>window.innerHeight+1||b.top<-1) clip++;
      });
      o.visWins=vis;o.offX=wide;o.clippedY=clip;
      var ic=document.getElementById('icons').getBoundingClientRect();
      var tb=document.getElementById('taskbar').getBoundingClientRect();
      o.iconsOverlapsTaskbar=ic.bottom>tb.top+1;
      var dt=document.getElementById('desktop');
      o.deskBottomVsIcons=Math.round(dt.getBoundingClientRect().bottom-ic.top);
      o.iconsH=Math.round(ic.height);
      o.staticWins=getComputedStyle(document.querySelector('.win')).position;
      var st=document.getElementById('start'),cl=document.getElementById('clock');
      o.startVisible=st.getBoundingClientRect().width>10;
      o.clockVisible=cl.getBoundingClientRect().width>10;
      o.hintBottom=Math.round(document.getElementById('hint').getBoundingClientRect().bottom);
      o.iconsTop=Math.round(ic.top);
      var bust=document.getElementById('bustwrap').getBoundingClientRect();
      o.bust=[Math.round(bust.width),Math.round(bust.height)];
      o.bustOnScreen=bust.bottom<=window.innerHeight+2 && bust.top>-260;
      o.tinyText=(function(){var n=0;document.querySelectorAll('#icons .il').forEach(function(e){if(parseFloat(getComputedStyle(e).fontSize)<7.5)n++});return n})();
      return JSON.stringify(o);
    })()`));
    const problems=[];
    if(r.docW>r.win+1){
      problems.push("H-OVERFLOW "+r.docW+">"+r.win);
      const who=await ev(`(function(){var out=[];document.querySelectorAll('body *').forEach(function(e){var b=e.getBoundingClientRect();if(b.right>window.innerWidth+1&&b.width>0)out.push((e.id?'#'+e.id:e.tagName+'.'+e.className)+'@'+Math.round(b.left)+'+'+Math.round(b.width))});return out.slice(0,8).join(' | ')})()`);
      problems.push("WHO: "+who);
    }
    if(r.wide)problems.push("win off-screen X x"+r.wide);
    const cards = w<=720 || h<=540;
    if(r.iconsH>80&&cards)problems.push("icon strip too tall "+r.iconsH);
    if(r.iconsOverlapsTaskbar)problems.push("icons overlap taskbar");
    if(r.offX)problems.push("win off-screen X x"+r.offX);
    if(!r.startVisible||!r.clockVisible)problems.push("start/clock hidden");
    if(!r.bustOnScreen)problems.push("bust off-screen");
    if(r.tinyText)problems.push("tiny icon text x"+r.tinyText);
    if(cards&&r.staticWins!=="static")problems.push("not static in card mode");
    if(!cards&&r.staticWins==="static")problems.push("static in desktop mode");
    if(cards&&r.deskBottomVsIcons>0)problems.push("desktop content overlaps icon strip "+r.deskBottomVsIcons);
    if(problems.length)bad++;
    console.log((problems.length?"FAIL ":"ok   ")+name.padEnd(18)+"doc="+r.docW+"/"+r.win+" deskBottomVsIcons="+r.deskBottomVsIcons+" iconsH="+r.iconsH+" bust="+r.bust.join("x")+(problems.length?"  -> "+problems.join("; "):""));
    if(w===320||w===740){const s=await send("Page.captureScreenshot",{format:"png"});fs.writeFileSync(path.join(OUT,"edge-"+name+".png"),Buffer.from(s.data,"base64"))}
  }
  console.log(bad?("\n"+bad+" size(s) with problems"):"\nall sizes clean");
  ws.close();proc.kill();process.exit(bad?1:0);
})().catch(e=>{console.log("ERR "+e.message+"\n"+e.stack);try{proc.kill()}catch(x){};process.exit(2)});
