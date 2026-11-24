import React from 'react';
import {
  AbsoluteFill, Audio, Composition, Img, interpolate, OffthreadVideo,
  registerRoot, Sequence, staticFile, useCurrentFrame,
} from 'remotion';
import '@fontsource-variable/bricolage-grotesque';

const shots = [
  {at: 0, duration: 75, zoom: 1.10},
  {at: 75, duration: 105, zoom: 1.26},
  {at: 180, duration: 120, zoom: 1.14},
  {at: 300, duration: 60, zoom: 1.25},
];
const green = '#B6FF00';

function Shot({shot, title, company, moving}) {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, 10], [shot.zoom + .055, shot.zoom], {
    extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{background: '#121423', fontFamily: 'Bricolage Grotesque Variable'}}>
    <Img src={staticFile('poster.jpg')} style={{width: '100%', height: '100%', objectFit: 'cover',
      filter: 'blur(42px) brightness(.34) saturate(1.2)', transform: 'scale(1.16)'}} />
    <div style={{position: 'absolute', left: 43, top: 406, width: 994, height: 994,
      overflow: 'hidden', borderRadius: 30, background: '#171929', boxShadow: '0 20px 100px #10101c',
      border: '2px solid ' + green, boxSizing: 'border-box'}}>
      {moving
        ? <OffthreadVideo muted src={staticFile('footage.mp4')} trimBefore={shot.at}
            style={{width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(' + zoom + ')'}} />
        : <Img src={staticFile('poster.jpg')}
            style={{width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(' + zoom + ')'}} />}
    </div>
    <div style={{position: 'absolute', left: 94, top: 65, color: green, width: 892, height: 320,
      display: 'flex', alignItems: 'end', fontSize: title.length > 100 ? 58 : title.length > 66 ? 69 : 83,
      fontWeight: 850, lineHeight: 1, letterSpacing: -2, textWrap: 'balance',
      textShadow: '0 8px 30px #10101c', overflow: 'hidden'}}>
      {title}
    </div>
    <div style={{position: 'absolute', left: 94, top: 1405, color: '#fff', fontSize: 26,
      lineHeight: '30px', fontWeight: 700}}>Fonte: {company}</div>
  </AbsoluteFill>;
}

function Reel({titles, company, moving}) {
  return <>
    {shots.map((shot, index) =>
      <Sequence key={shot.at} from={shot.at} durationInFrames={shot.duration}>
        <Shot shot={shot} title={titles[index]} company={company} moving={moving} />
      </Sequence>)}
    <Audio src={staticFile('track.wav')} />
  </>;
}

registerRoot(() => <Composition id="EditorialReel" component={Reel} durationInFrames={360}
  fps={30} width={1080} height={1920} />);
