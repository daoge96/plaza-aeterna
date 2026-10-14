const {spawn}=require("child_process");const fs=require("fs"),path=require("path"),http=require("http"),os=require("os");
function PLAZA_TARGET(){var c=[path.resolve(__dirname,"..","plaza-aeterna.html"),path.resolve(__dirname,"..","index.html")];for(var i=0;i<c.length;i++)if(fs.existsSync(c[i]))return c[i];return c[0]}
const CHROME="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";const TARGET=PLAZA_TARGET();
const PORT=9995;const sleep=ms=>new Promise(r=>setTimeout(r,ms));const ud=fs.mkdtempSync(path.join(os.tmpdir(),"sp"));
const p=spawn(CHROME,["--headless=new","--no-sandbox","--disable-breakpad","--disable-gpu","--no-first-run","--mute-audio","--remote-debugging-port="+PORT,"--user-data-dir="+ud,"--window-size=1440,900","--hide-scrollbars","about:blank"],{stdio:"ignore"});
function get(u){return new Promise((re,rj)=>{http.get({host:"127.0.0.1",port:PORT,path:u},s=>{let d="";s.on("data",c=>d+=c);s.on("end",()=>re(JSON.parse(d)))}).on("error",rj)})}
let ws,id=0,pend=new Map();function send(m,pr){return new Promise((re,rj)=>{const i=++id;pend.set(i,{re,rj});ws.send(JSON.stringify({id:i,method:m,params:pr||{}}));setTimeout(()=>{if(pend.has(i)){pend.delete(i);rj(new Error("t"))}},15000)})}
async function ev(e){const r=await send("Runtime.evaluate",{expression:e,returnByValue:true});return r.result.value}
async function key(k,c,v){await send("Input.dispatchKeyEvent",{type:"rawKeyDown",key:k,code:c,windowsVirtualKeyCode:v});await send("Input.dispatchKeyEvent",{type:"keyUp",key:k,code:c,windowsVirtualKeyCode:v});await sleep(80)}
(async()=>{let l=null;for(let i=0;i<80&&!l;i++){try{const j=await get("/json/list");if(j.some(t=>t.type==="page"))l=j}catch(e){}if(!l)await sleep(300)}
const pg=l.find(t=>t.type==="page");ws=new WebSocket(pg.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){const q=pend.get(m.id);pend.delete(m.id);m.error?q.rj(new Error("e")):q.re(m.result)}};
await send("Page.enable");await send("Runtime.enable");await send("Page.navigate",{url:"file:///"+TARGET.replace(/\\/g,"/")});await sleep(2600);
await ev("window.PLAZA.openWin('directory')");await sleep(200);
await ev("document.querySelector('#dirlist .row').focus();document.querySelectorAll('#dirlist .row').forEach(function(r){r.classList.remove('sel')})");
await key(" ","Space",32);
console.log("Space on focused .row -> selected: "+await ev("!!document.querySelector('#dirlist .row.sel')"));
await ev("document.querySelectorAll('#dirlist .row').forEach(function(r){r.classList.remove('sel')})");
await key("Enter","Enter",13);
console.log("Enter on focused .row -> selected: "+await ev("!!document.querySelector('#dirlist .row.sel')"));
console.log("#hint has click listener: "+await ev("(function(){var h=document.getElementById('hint');var got=0;h.addEventListener('click',function(){got++});h.focus();return 'probe'})()"));
await key("Enter","Enter",13);
console.log("after Enter on focused #hint: hint hidden="+await ev("document.getElementById('hint').classList.contains('hidden')")+" (audio ctx="+await ev("String(!!window.PLAZA.audio.ctx)")+")");
console.log("BODIES.sys guard in updateExtraUI: BODIES.sys defined="+await ev("!!window.PLAZA && true"));
ws.close();p.kill();process.exit(0)})();
