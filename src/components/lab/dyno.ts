import { whileVisible } from './visibility';

const low=2000, high=7200;
const lanes=[
  {label:'BOOST',unit:'PSI',min:0,max:25,color:'#d3fa43'},
  {label:'AFR',unit:':1',min:10,max:16,color:'#89dad6'},
  {label:'TIMING',unit:'°',min:0,max:32,color:'#c4abfa'},
  {label:'KNOCK',unit:'°',min:0,max:6,color:'#ff9a77'},
];
function sample(rpm:number, calibrated:boolean) {
  const spool=1/(1+Math.exp(-(rpm-3240)/340));
  const taper=Math.max(0,(rpm-5200)/2000);
  const knock=Math.exp(-Math.pow((rpm-4880)/235,2))*(calibrated ? 0.8 : 4.4);
  const boost=spool*((calibrated?21:17)-3*taper)+.25*Math.sin(rpm/111);
  const afr=14.6-spool*(calibrated?2.9:2.4)+.11*Math.sin(rpm/143);
  const timing=24-spool*12+taper*6-knock;
  return {channels:[boost,afr,timing,knock],torque:145+boost*9.3-taper*34-knock*3.2};
}
function dyno(root:HTMLElement) {
  const canvas=root.querySelector('canvas')!;
  const ctx=canvas.getContext('2d')!;
  const plot=document.createElement('canvas');
  const bg=plot.getContext('2d')!;
  const slider=root.querySelector('input')!;
  const play=root.querySelector<HTMLButtonElement>('[data-play]')!;
  const output=root.querySelector<HTMLOutputElement>('[data-rpm]')!;
  const event=root.querySelector<HTMLElement>('[data-event]')!;
  const readings=root.querySelectorAll<HTMLOutputElement>('[data-reading]');
  const maps=root.querySelectorAll<HTMLButtonElement>('[data-map]');
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let rpm=low, calibrated=false, playing=!motion.matches, visible=false, frame=0, last=0;
  let width=0,height=0,dpr=1;
  const left=62,right=17,top=12,bottom=26;
  const x=(r:number)=>left+(r-low)/(high-low)*(width-left-right);
  function y(v:number,i:number) {
    const lane=lanes[i], h=(height-top-bottom)/4;
    return top+i*h+5+(1-(v-lane.min)/(lane.max-lane.min))*(h-10);
  }
  function background() {
    width=canvas.clientWidth; height=canvas.clientHeight; dpr=Math.min(devicePixelRatio||1,2);
    if (!width || !height) return;
    canvas.width=plot.width=Math.round(width*dpr); canvas.height=plot.height=Math.round(height*dpr);
    bg.setTransform(dpr,0,0,dpr,0,0); bg.fillStyle='#0c100f'; bg.fillRect(0,0,width,height);
    bg.font='10px monospace';
    for(let r=2000;r<=7000;r+=1000) {
      bg.strokeStyle='#27302a'; bg.beginPath(); bg.moveTo(x(r),top); bg.lineTo(x(r),height-bottom); bg.stroke();
      bg.fillStyle='#aeb8ad'; bg.fillText(r/1000+'k',x(r)-5,height-8);
    }
    lanes.forEach((lane,i)=>{
      bg.fillStyle=lane.color; bg.fillText(lane.label,7,y(lane.max,i)+9);
      bg.fillStyle='#aeb8ad'; bg.fillText(lane.min+'–'+lane.max+lane.unit,7,y(lane.min,i));
      bg.strokeStyle='#27302a'; bg.beginPath(); bg.moveTo(left,y(lane.min,i)); bg.lineTo(width-right,y(lane.min,i)); bg.stroke();
      bg.beginPath(); bg.strokeStyle=lane.color; bg.lineWidth=1.6;
      for(let r=low;r<=high;r+=20) {
        const level=y(sample(r,calibrated).channels[i],i);
        if(r===low) bg.moveTo(x(r),level); else bg.lineTo(x(r),level);
      }
      bg.stroke(); bg.lineWidth=1;
    });
  }
  let flagged=false;
  function paint() {
    if(!width || !height) return;
    const base=sample(rpm,false), tuned=sample(rpm,true), current=calibrated?tuned:base;
    ctx.setTransform(1,0,0,1,0,0); ctx.drawImage(plot,0,0);
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.strokeStyle='#eef4df'; ctx.beginPath();
    ctx.moveTo(x(rpm),top); ctx.lineTo(x(rpm),height-bottom); ctx.stroke();
    current.channels.forEach((v,i)=>{ctx.fillStyle=lanes[i].color;ctx.beginPath();ctx.arc(x(rpm),y(v,i),3,0,Math.PI*2);ctx.fill();});
    const round=Math.round(rpm/10)*10;
    slider.value=String(round); output.value=String(round);
    const delta=(v:number)=>(v>=0?'+':'')+v.toFixed(1);
    const values=[current.torque.toFixed(0),delta(tuned.torque-base.torque),delta(tuned.channels[1]-base.channels[1]),...current.channels.map(v=>v.toFixed(1))];
    readings.forEach((node,i)=>{if(node.value!==values[i]) node.value=values[i];});
    const next=current.channels[3]>.5;
    if(next && !flagged) root.dispatchEvent(new CustomEvent('dyno-warning',{bubbles:true}));
    flagged=next;
    event.textContent=current.channels[3]>.5?'Knock correction · −'+current.channels[3].toFixed(1)+'°':'Knock correction clear';
  }
  function advance(now:number) {
    if(last) rpm+=Math.min(80,now-last)*.46;
    if(rpm>=high){rpm=high;playing=false;}
    last=now; paint();
    if(playing && visible) frame=requestAnimationFrame(advance); else sync();
  }
  function sync() {
    cancelAnimationFrame(frame); last=0;
    play.textContent=playing?'Pause':rpm>=high?'Replay':'Play';
    if(visible && playing) frame=requestAnimationFrame(advance);
  }
  play.onclick=()=>{playing=!playing;if(playing && rpm>=high) rpm=low;sync();};
  slider.oninput=()=>{playing=false;rpm=Number(slider.value);sync();paint();};
  maps.forEach(button=>button.onclick=()=>{
    calibrated=button.dataset.map==='cal';
    maps.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));background();paint();
  });
  motion.addEventListener('change',()=>{if(motion.matches){playing=false;sync();}});
  const resize=new ResizeObserver(()=>{background();paint();}); resize.observe(canvas);
  whileVisible(root,active=>{visible=active;sync();});
}
export default Object.assign(dyno,{nativeDiagnostic:true});
