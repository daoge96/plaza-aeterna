"use strict";
/* final: model-based grid direction + a11y/contrast/reduced-motion re-check */
const {spawn}=require("child_process");
function PLAZA_TARGET(){var c=[path.resolve(__dirname,"..","plaza-aeterna.html"),path.resolve(__dirname,"..","index.html")];for(var i=0;i<c.length;i++)if(fs.existsSync(c[i]))return c[i];return c[0]}
const fs=require("fs"),path=require("path"),http=require("http"),os=require("os");
const CHROME="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TARGET=PLAZA_TARGET();
const PORT=9990+Math.floor(Math.random()*9);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const userDir=fs.mkdtempSync(path.join(os.tmpdir(),"finprof"));
const proc=spawn(CHROME,["--headless=new","--no-sandbox","--disable-breakpad","--disable-gpu","--no-first-run",
  "--no-default-browser-check","--autoplay-policy=no-user-gesture-required","--mute-audio",
  "--remote-debugging-port="+PORT,"--user-data-dir="+userDir,"--window-size=1440,900","--hide-scrollbars","about:blank"],{stdio:"ignore"});
function get(p){return new Promise((res,rej)=>{http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej)})}
let ws,id=0,pend=new Map(),errs=[];
function send(m,p){return new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p||{}}));setTimeout(()=>{if(pend.has(i)){pend.delete(i);rej(new Error("timeout "+m))}},20000)})}
async function ev(e){const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails.exception&&r.exceptionDetails.exception.description));return r.result.value}
const L=console.log;
async function metrics(w,h,mobile){await send("Emulation.setDeviceMetricsOverride",{width:w,height:h,deviceScaleFactor:1,mobile:!!mobile})}
async function shot(){const r=await send("Page.captureScreenshot",{format:"png"});return r.data}
async function key(k,code,vk){await send("Input.dispatchKeyEvent",{type:"rawKeyDown",key:k,code:code||k,windowsVirtualKeyCode:vk||0});
  await send("Input.dispatchKeyEvent",{type:"keyUp",key:k,code:code||k,windowsVirtualKeyCode:vk||0});await sleep(60)}
function rl(c){c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)}
function ctr(a,b){const l1=.2126*rl(a[0])+.7152*rl(a[1])+.0722*rl(a[2]),l2=.2126*rl(b[0])+.7152*rl(b[1])+.0722*rl(b[2]);
  const h=Math.max(l1,l2),l=Math.min(l1,l2);return (h+.05)/(l+.05)}
async function main(){
  let list=null;for(let i=0;i<90&&!list;i++){try{const l=await get("/json/list");if(Array.isArray(l)&&l.some(t=>t.type==="page"))list=l}catch(e){}if(!list)await sleep(300)}
  const page=list.find(t=>t.type==="page");ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result);return}
    if(m.method==="Runtime.exceptionThrown")errs.push("EXC "+(m.params.exceptionDetails.exception&&m.params.exceptionDetails.exception.description));
    if(m.method==="Runtime.consoleAPICalled"&&["error","warning"].includes(m.params.type))errs.push("CONSOLE."+m.params.type)};
  await send("Page.enable");await send("Runtime.enable");await metrics(1440,900,false);
  await send("Page.navigate",{url:"file:///"+TARGET.replace(/\\/g,"/")});await sleep(2400);

  L("== MODEL-BASED grid direction (exact drawGrid projection used as the warp) ==");
  const band=`(function(){var c=document.getElementById('grid'),g=c.getContext('2d'),W=c.width,H=c.height,hy=H*0.625,y,o=[];
    for(y=Math.round(hy)+8;y<H;y++){var d=g.getImageData(0,y,W,1).data,s=0,x;for(x=0;x<W;x+=2)s+=(d[x*4]+d[x*4+1]+d[x*4+2])/3;o.push(s/(W/2))}
    return o})()`;
  for(const dtms of [500,900,1300]){
    const A=await ev(band);await sleep(dtms);const B=await ev(band);
    const hy=900*0.625,bot=900-hy,NR=6.5,dphi=0.42*(dtms/1000);
    function score(sign){let s=0,n=0;
      for(let i=0;i<A.length;i++){const y0=hy+8+i;const n0=NR*bot/(y0-hy);const n1=n0+sign*dphi;if(n1<=0.2)continue;
        const y1=hy+bot*NR/n1;const j=Math.round(y1-(hy+8));if(j<0||j>=B.length)continue;s+=A[i]*B[j];n++}
      return n? s/n : 0}
    const down=score(-1),up=score(+1);
    L("  dt="+dtms+"ms  score(model says lines move DOWN)="+down.toFixed(0)+"   score(model says UP)="+up.toFixed(0)+"   => "+(down>up?"DOWN / TOWARD VIEWER":"UP / away"));
  }

  L("\n== A11Y re-check ==");
  L("  rows[role=option]="+await ev("document.querySelectorAll('#dirlist .row[role=option]').length")+"  rows with aria-selected="+await ev("document.querySelectorAll('#dirlist .row[aria-selected]').length"));
  await ev("document.querySelector('#dirlist .row').click()");
  L("  after click select: .sel exists="+await ev("!!document.querySelector('#dirlist .row.sel')")+" aria-selected set="+await ev("!!document.querySelector('#dirlist .row.sel[aria-selected]')"));
  await ev("document.querySelector('#dirlist').focus()");
  await key("ArrowDown","ArrowDown",40);
  L("  ArrowDown on listbox: activeElement="+await ev("document.activeElement.id||document.activeElement.tagName")+" (no roving focus = listbox pattern incomplete)");
  await ev("document.querySelector('#dirlist .row').focus()");
  await key(" ","Space",32);
  L("  Space on focused .row selects? "+await ev("!!document.querySelector('#dirlist .row.sel')")+"   Enter: ");
  await ev("document.querySelector('#dirlist .row').classList.remove('sel')");
  await key("Enter","Enter",13);
  L("      Enter on focused .row selects? "+await ev("!!document.querySelector('#dirlist .row.sel')"));
  await ev("document.getElementById('shutdown').classList.add('on');document.getElementById('shutdown').focus()");
  await key("Enter","Enter",13);
  L("  #shutdown Enter dismiss: "+await ev("!document.getElementById('shutdown').classList.contains('on')"));
  await ev("document.getElementById('shutdown').classList.remove('on')");
  await ev("document.body.focus()");
  const stops=[];
  for(let i=0;i<26;i++){await key("Tab","Tab",9);const a=await ev("(function(){var a=document.activeElement;if(!a)return '-';\n    var s=getComputedStyle(a);return (a.id||a.dataset.open||a.className||a.tagName)+'|'+s.outlineStyle})()");stops.push(a);if(a==="-")break}
  L("  tab order: "+JSON.stringify(stops.map(s=>s.split("|")[0])));
  L("  stops with outline:none -> "+JSON.stringify(stops.filter(s=>s.endsWith("|none")).map(s=>s.split("|")[0])));
  L("  aria-live regions: "+await ev("document.querySelectorAll('[aria-live]').length")+"  values="+await ev("[].slice.call(document.querySelectorAll('[aria-live]')).map(function(e){return e.id+':'+e.getAttribute('aria-live')}).join(',')"));
  L("  #midilog aria-live='off' -> sequencer log is silent to AT; #midiMsg has no live region");

  L("\n== CONTRAST (real composited pixels, text hidden) ==");
  for(const [sel,name] of [["#sign .s1","sign title"],["#sign .s3","sign japanese"],["#icons .icon .il","icon label"],["#clock","clock"]]){
    const i2=await ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;var b=e.getBoundingClientRect();var s=getComputedStyle(e);
      return {x:Math.round(b.left),y:Math.round(b.top),w:Math.max(1,Math.round(b.width)),h:Math.max(1,Math.round(b.height)),color:s.color,fs:s.fontSize,fw:s.fontWeight}})()`);
    if(!i2){L("  "+name+": absent");continue}
    await ev(`(function(){document.querySelector(${JSON.stringify(sel)}).style.visibility='hidden'})()`);
    const png=await shot();
    await ev(`(function(){document.querySelector(${JSON.stringify(sel)}).style.visibility=''})()`);
    const px=await ev(`(function(){return new Promise(function(res){var im=new Image();im.onload=function(){var c=document.createElement('canvas');c.width=im.width;c.height=im.height;
      var g=c.getContext('2d');g.drawImage(im,0,0);var d=g.getImageData(${i2.x},${i2.y},${i2.w},${i2.h}).data,R=0,G=0,B=0,n=0;
      for(var k=0;k<d.length;k+=4){R+=d[k];G+=d[k+1];B+=d[k+2];n++}res([R/n,G/n,B/n])};im.src='data:image/png;base64,${png}'})})()`);
    const m=i2.color.match(/[\d.]+/g).map(Number),a=m.length>3?m[3]:1;
    const t=[m[0]*a+px[0]*(1-a),m[1]*a+px[1]*(1-a),m[2]*a+px[2]*(1-a)];
    const c=ctr(t,px);
    L("  "+name+": "+i2.color+" @ "+i2.fs+"/"+i2.fw+" over rgb("+px.map(v=>v.toFixed(0))+") = "+c.toFixed(2)+":1 "+(c>=4.5?"AA":c>=3?"AA-large-only":"FAIL"));
  }

  L("\n== other ==");
  const q=await ev(`(function(){var n=0,qs=0,o=document.querySelector.bind(document);
    document.querySelector=function(s){qs++;return o(s)};
    return new Promise(function(res){var f=0;function t(){f++;if(f<61)requestAnimationFrame(t);else{document.querySelector=o;res({f:f,qs:qs})}}requestAnimationFrame(t)})})()`);
  L("  per-frame document.querySelector: "+(q.qs/q.f).toFixed(2)+" over "+q.f+" frames (updateMidiUI/updateExtraUI)");
  L("  dead code: line 1298 '$$(\".icon\").forEach(function(){});' -> runs before buildIcons(), empty body");
  L("  dead code: A.startStep always 0; '-A.startStep*0' at startSeq is a no-op");
  L("  'if(!quiet&&(fresh||true))' -> fresh never used");
  L("  xlink:href used anywhere: "+await ev("document.documentElement.outerHTML.includes('xlink:href')"));
  await send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
  await send("Page.navigate",{url:"file:///"+TARGET.replace(/\\/g,"/")});await sleep(2300);
  const t1=await ev("window.PLAZA.bust()");await sleep(1200);const t2=await ev("window.PLAZA.bust()");
  L("  RM: theta delta over 1.2s = "+(t2-t1).toFixed(5)+"  (bust STOPS under RM = "+(Math.abs(t2-t1)<1e-9)+")");
  L("  RM: .gl.hit animationName="+await ev("(function(){var i=document.querySelector('#icons .icon');i.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));var h=document.querySelector('.gl.hit');return h?getComputedStyle(h).animationName:'none'})()"));
  L("  RM: .win.spawning animationName="+await ev("(function(){window.PLAZA.openWin('bin');return getComputedStyle(document.getElementById('win-bin')).animationName})()"));
  L("  RM: scrollIntoView behaviour still 'smooth' (openWin line 1204)");
  await send("Emulation.setEmulatedMedia",{features:[]});
  L("\n  errors: "+errs.length+" "+errs.slice(0,3).join(" | "));
  ws.close();proc.kill();process.exit(0);
}
main().catch(e=>{L("ERR "+e.message+"\n"+e.stack);try{proc.kill()}catch(x){};process.exit(3)});
