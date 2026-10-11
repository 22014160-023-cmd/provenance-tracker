let audioCtx=null;
function initAudio(){
  if(!audioCtx){const C=window.AudioContext||window.webkitAudioContext;if(C)audioCtx=new C()}
  if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
  return audioCtx;
}
window.addEventListener('load',initAudio);
['pointerdown','touchstart','mousedown','keydown','scroll','mousemove']
  .forEach(ev=>window.addEventListener(ev,()=>initAudio(),{once:true,passive:true}));
function playPop(r){
  const ctx=initAudio();if(!ctx||ctx.state!=='running')return;
  const bf=900-r*500,osc=ctx.createOscillator(),g=ctx.createGain(),fi=ctx.createBiquadFilter();
  osc.type='sine';osc.frequency.setValueAtTime(bf,ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(bf*2.2,ctx.currentTime+0.06);
  fi.type='bandpass';fi.frequency.value=bf*1.5;fi.Q.value=8;
  g.gain.setValueAtTime(0.0001,ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.20,ctx.currentTime+0.005);
  g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.18);
  osc.connect(fi).connect(g).connect(ctx.destination);
  osc.start();osc.stop(ctx.currentTime+0.22);
}
const tints=['rgba(255,180,220,0.55)','rgba(180,220,255,0.55)',
  'rgba(200,255,220,0.55)','rgba(255,240,180,0.55)',
  'rgba(230,190,255,0.55)','rgba(180,255,240,0.55)'];
function spawnBubble(){
  const layer=document.getElementById('bubbleLayer');if(!layer)return;
  const b=document.createElement('div');b.className='bubble';
  const size=24+Math.random()*90,dur=6+Math.random()*6;
  b.style.width=size+'px';b.style.height=size+'px';
  b.style.left=(Math.random()*100)+'vw';
  b.style.setProperty('--drift',((Math.random()-0.5)*120)+'px');
  b.style.setProperty('--tint',tints[Math.floor(Math.random()*tints.length)]);
  b.style.animationDuration=dur+'s, 3.2s';
  const popAt=(0.65+Math.random()*0.3)*dur*1000;
  setTimeout(()=>{if(!b.parentNode)return;b.classList.add('pop');
    playPop(size/88);setTimeout(()=>b.remove(),500)},popAt);
  layer.appendChild(b);setTimeout(()=>b.remove(),dur*1000+800);
}
document.addEventListener('DOMContentLoaded',()=>{
  if(!document.getElementById('bubbleLayer')){
    const l=document.createElement('div');l.id='bubbleLayer';document.body.prepend(l);
  }
  setInterval(spawnBubble,340);
  for(let i=0;i<8;i++)setTimeout(spawnBubble,i*150);
});
