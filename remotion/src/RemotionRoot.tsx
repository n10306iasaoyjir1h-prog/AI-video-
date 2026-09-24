import React from 'react';
import { Composition } from 'remotion';
import { StorylineVideo } from './StorylineVideo';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="StorylineVideo"
    component={StorylineVideo}
    durationInFrames={30 * 300}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{ project: {} }}
  />
);
