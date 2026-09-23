import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, Video, useCurrentFrame, interpolate } from 'remotion';
export const StorylineVideo: React.FC<{ project: any }> = ({ project }) => {
  const frame = useCurrentFrame();
  const scenes = Array.isArray(project?.scenes) && project.scenes.length ? project.scenes : [{ text: project?.script || '', imageUrl: project?.imageUrl }];
  const framesPerScene = Math.max(1, Math.floor((project?.duration || 300) * 30 / scenes.length));
  const index = Math.min(scenes.length - 1, Math.floor(frame / framesPerScene));
  const scene = scenes[index] || {};
  const opacity = interpolate(frame % framesPerScene, [0, 12, framesPerScene - 12, framesPerScene], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ backgroundColor: '#111', color: '#fff', fontFamily: 'sans-serif' }}><AbsoluteFill style={{ opacity }}>{scene.imageUrl ? <Img src={scene.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}<AbsoluteFill style={{ background: 'linear-gradient(transparent 55%, rgba(0,0,0,.8))' }} /><div style={{ position: 'absolute', bottom: 100, left: 100, right: 100, fontSize: 52, lineHeight: 1.5, textShadow: '0 2px 8px #000' }}>{scene.text || ''}</div>{scene.audioUrl ? <Audio src={scene.audioUrl} /> : null}</AbsoluteFill></AbsoluteFill>;
};
