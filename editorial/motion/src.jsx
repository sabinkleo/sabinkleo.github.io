import React from 'react';
import {AbsoluteFill, Composition, Easing, interpolate, registerRoot, Sequence, useCurrentFrame} from 'remotion';
import '@fontsource-variable/bricolage-grotesque';
import './style.css';

const formatDate = (date) => date.split('-').reverse().join('/');
const ease = Easing.bezier(.2, .75, .24, 1);

function enter(frame, delay = 0) {
  return interpolate(frame, [delay, delay + 20], [0, 1], {
    easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
}

function Reveal({children, delay = 0, distance = 28, axis = 'Y', className}) {
  const p = enter(useCurrentFrame(), delay);
  return <div className={className} style={{opacity: p, transform: `translate${axis}(${distance * (1-p)}px)`}}>{children}</div>;
}

function Network({labels, repeat}) {
  const frame = useCurrentFrame();
  const p = repeat ? frame % 52 / 52 : enter(frame, 15);
  const position = repeat
    ? (p < .5 ? {x: 125 + 550*p/.5, y: 100} : {x: 675 - 550*(p-.5)/.5, y: 235})
    : {x: 125 + 550*p, y: 104};
  return <div className="network">
    <svg viewBox="0 0 800 330" aria-hidden="true">
      {repeat
        ? <path d="M125 100 H650 Q710 100 710 167 Q710 235 650 235 H150 Q90 235 90 167 Q90 100 150 100" fill="none" stroke="currentColor" strokeWidth="6" strokeDasharray="10 12"/>
        : <path d="M125 104 H675 M645 84 L675 104 L645 124" fill="none" stroke="currentColor" strokeWidth="6"/>}
      <circle cx={position.x} cy={position.y} r="19" fill="var(--accent)" stroke="var(--paper)" strokeWidth="4"/>
    </svg>
    <div className="network-labels">{labels.map((label, i) =>
      <Reveal key={label} delay={i * 8} className="tile">{label}</Reveal>)}</div>
    {repeat && <div className="cycle">↶ Consulta de novo</div>}
  </div>;
}

function Gate({labels}) {
  const p = enter(useCurrentFrame(), 12);
  return <div className="gate">
    <Reveal className="gate-label">{labels[0]}</Reveal>
    <div className="gate-bars" style={{transform: `scaleY(${p})`}} aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6].map(i => <i key={i}/>)}
    </div>
    <Reveal delay={19} className="gate-result">{labels[1]}</Reveal>
  </div>;
}

function Comparison({comparison}) {
  return <div>
    <div className="compare">
      {['left', 'right'].map((side, i) => <Reveal key={side} delay={i*9} axis="X" distance={i ? 65 : -65} className="parcel-card">
        <span>{comparison[`${side}_label`]}</span>
        <strong>{comparison[`${side}_value`]}</strong>
      </Reveal>)}
    </div>
    <Reveal delay={17} className="graphic-note">{comparison.note}</Reveal>
  </div>;
}

function Steps({labels, stacked}) {
  return <div className={stacked ? 'steps stacked' : 'steps'}>
    {labels.map((label, i) => <Reveal key={label} delay={i*12} axis="X" distance={-42} className="step">
      <span>{stacked ? (i ? '↓' : '↑') : i+1}</span>{label}
    </Reveal>)}
  </div>;
}

function Source({plan}) {
  return <div className="sources">
    <Reveal className="source"><span>Fonte original</span><strong>{plan.lead_source.publisher}</strong><time>{formatDate(plan.lead_source.date)}</time></Reveal>
    <Reveal delay={9} className="source"><span>Edição</span><strong>Vértice Intelligence</strong><time>{formatDate(plan.edition_date)}</time></Reveal>
  </div>;
}

function Timeline({plan}) {
  const p = enter(useCurrentFrame(), 10);
  return <div className="timeline">
    <div><b>{formatDate(plan.event_date)}</b><span>Data do fato</span></div>
    <div><b>{formatDate(plan.edition_date)}</b><span>Data da edição</span></div>
    <i style={{transform:`scaleX(${p})`}} aria-hidden="true"/>
  </div>;
}

function Graphic({scene, plan}) {
  switch (scene.visual_type) {
    case 'loop': return <Network labels={scene.labels} repeat/>;
    case 'signal': return <Network labels={scene.labels}/>;
    case 'gate': return <Gate labels={scene.labels}/>;
    case 'sequence': return <Steps labels={scene.labels}/>;
    case 'stack': return <Steps labels={scene.labels} stacked/>;
    case 'comparison': return <Comparison comparison={scene.comparison}/>;
    case 'source': return <Source plan={plan}/>;
    case 'timeline': return <Timeline plan={plan}/>;
    default: return <Reveal className="sum-graphic"><span aria-hidden="true">◫</span>{plan.lead_source.publisher}</Reveal>;
  }
}

function Scene({scene, index, plan}) {
  const frame = useCurrentFrame();
  const duration = scene.end_frame - scene.start_frame;
  const archive = plan.edition_type === 'educational';
  const longText = scene.text.length > 135;
  return <AbsoluteFill className={`edition ${plan.palette} panel-${index}`}>
    <div className="shape" aria-hidden="true" style={{transform:`translate(${frame*.25}px,${frame*-.16}px) rotate(${frame*.16}deg)`}}/>
    <main className="layout">
      <div className="brand"><b>◢</b> Vértice Intelligence <span>{String(index+1).padStart(2,'0')} / 05</span></div>
      <div className="eyebrow">{archive ? `Guia baseado em anúncio de ${plan.event_date.slice(0,4)}` : 'Observatório · '+formatDate(plan.event_date)}</div>
      <h1 className={scene.title.length > 48 ? 'long' : ''} style={{transform:`translateY(${16*(1-enter(frame))}px)`}}>{scene.title}</h1>
      <div className="graphic"><Graphic {...{scene,plan}}/></div>
      <div className={`body ${longText ? 'long' : ''}`}>{scene.text}</div>
      <div className="footer"><span>{plan.brazil_status === 'unconfirmed' && index === 2 ? 'Disponibilidade no Brasil a confirmar' : 'verticelabs.me/observatorio'}</span><i style={{transform:`scaleX(${(frame+1)/duration})`}}/></div>
    </main>
  </AbsoluteFill>;
}

function MotionReel({plan}) {
  if (!plan) throw new Error('Pass a validated scene plan through --props.');
  return plan.scenes.map((scene, index) => <Sequence key={scene.purpose} from={scene.start_frame} durationInFrames={scene.end_frame-scene.start_frame}>
    <Scene {...{scene,index,plan}}/>
  </Sequence>);
}

registerRoot(() => <Composition id="ObservatorioMotion" component={MotionReel}
  durationInFrames={810} fps={30} width={1080} height={1920}
  defaultProps={{plan:null}}
  calculateMetadata={({props}) => ({durationInFrames:props.plan?.duration_frames ?? 810})}/>);
