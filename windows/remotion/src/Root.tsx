import {Composition} from 'remotion';
import {KblVideo, defaultKblProps, type KblVideoProps} from './KblVideo';

export const FPS = 30;

export const Root = () => (
  <Composition<KblVideoProps>
    id="KBLVideo"
    component={KblVideo}
    defaultProps={defaultKblProps}
    fps={FPS}
    width={1080}
    height={1920}
    durationInFrames={FPS * 30}
    calculateMetadata={({props}) => ({
      durationInFrames: Math.max(FPS * 10, Math.round((Number(props.totalSeconds) || 30) * FPS)),
    })}
  />
);
