// A tela usa a série inteira. O cursor e as setas consultam os pontos horários sem arredondar o eixo do tempo.
export function grafico(canvas, leitura, moeda, horario) {
  let serie = [], indice = 0, esquerda = 0, largura = 0;
  const ctx = canvas.getContext('2d');
  const compacto = new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});
  function desenhar() {
    if (!serie.length || !canvas.clientWidth) return;
    const w = canvas.clientWidth, h = canvas.clientHeight, escala = window.devicePixelRatio || 1;
    canvas.width = Math.round(w*escala); canvas.height = Math.round(h*escala);
    ctx.scale(escala,escala); ctx.font='12px monospace';
    esquerda = 53; largura = w-esquerda-12;
    const topo=12, base=h-27, primeiro=serie[0].t, ultimo=serie.at(-1).t;
    let minimo=Infinity,maximo=-Infinity;
    for (const p of serie) { minimo=Math.min(minimo,p.bot,p.hold); maximo=Math.max(maximo,p.bot,p.hold); }
    const folga=Math.max((maximo-minimo)*0.09,Math.abs(maximo)*0.0002,0.01);
    minimo-=folga; maximo+=folga;
    const x=t => primeiro===ultimo ? esquerda+largura/2 : esquerda+(t-primeiro)/(ultimo-primeiro)*largura;
    const y=v => base-(v-minimo)/(maximo-minimo)*(base-topo);
    ctx.lineWidth=1;
    for (let i=0;i<=4;i++) {
      const v=minimo+(maximo-minimo)*i/4, py=y(v);
      ctx.strokeStyle='#34392e';ctx.beginPath();ctx.moveTo(esquerda,py);ctx.lineTo(w-12,py);ctx.stroke();
      ctx.fillStyle='#abb19f';ctx.textAlign='right';ctx.fillText(compacto.format(v),esquerda-7,py+4);
    }
    const curto=t=>horario(t,ultimo-primeiro<86400000?'hora':'dia');
    ctx.textAlign='left';ctx.fillText(curto(primeiro),esquerda,h-6);
    if(ultimo>primeiro){ctx.textAlign='right';ctx.fillText(curto(ultimo),w-12,h-6);}
    for(const [lado,cor,traco] of [['hold','#a8c8e5',[6,4]],['bot','#d3fa43',[]]]) {
      ctx.strokeStyle=cor;ctx.lineWidth=1.8;ctx.setLineDash(traco);ctx.beginPath();
      serie.forEach((p,i)=>i?ctx.lineTo(x(p.t),y(p[lado])):ctx.moveTo(x(p.t),y(p[lado])));
      ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=cor;
      const p=serie[indice];ctx.beginPath();ctx.arc(x(p.t),y(p[lado]),3.5,0,2*Math.PI);ctx.fill();
    }
    const p=serie[indice];
    leitura.textContent=horario(p.t)+' · Bot '+moeda(p.bot)+' · Hold '+moeda(p.hold);
  }
  canvas.addEventListener('pointermove',e=>{
    if(!serie.length) return;
    const r=canvas.getBoundingClientRect();
    indice=Math.max(0,Math.min(serie.length-1,Math.round((e.clientX-r.left-esquerda)/largura*(serie.length-1))));
    desenhar();
  });
  canvas.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
    e.preventDefault();indice=e.key==='Home'?0:e.key==='End'?serie.length-1:
      Math.max(0,Math.min(serie.length-1,indice+(e.key==='ArrowLeft'?-1:1)));
    leitura.setAttribute('aria-live','polite');desenhar();
  });
  new ResizeObserver(desenhar).observe(canvas);
  return pontos=>{serie=pontos;indice=pontos.length-1;desenhar();};
}
