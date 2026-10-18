import {Easing, WithTimingConfig} from 'react-native-reanimated';

export const AUTOSCROLL_CONFIG = {
  // Autoscroll speed in pixels per second, scaled by `autoscrollSpeedScale`.
  speed: 600,
  // Upper bound for the time delta of a single frame, prevents big jumps after dropped frames.
  maxFrameDelta: 34,
  // Time delta used when the previous frame time is not available (e.g. first frame).
  defaultFrameDelta: 1000 / 60,
};

// TODO: temporary, remove before upstreaming.
export const AUTOSCROLL_DEBUG = __DEV__;

const DURATION_START = 150;
const DURATION_END = 200;

interface AnimationConfig {
  start: WithTimingConfig & {toValue: number};
  end: WithTimingConfig & {toValue: number};
}

export const SCALE_ANIMATION_CONFIG_DEFAULT: AnimationConfig = {
  start: {
    toValue: 1.025,
    easing: Easing.in(Easing.ease),
    duration: DURATION_START,
  },
  end: {
    toValue: 1,
    easing: Easing.out(Easing.ease),
    duration: DURATION_END,
  },
};

export const OPACITY_ANIMATION_CONFIG_DEFAULT: AnimationConfig = {
  start: {
    toValue: 0.75,
    easing: Easing.in(Easing.ease),
    duration: DURATION_START,
  },
  end: {
    toValue: 1,
    easing: Easing.out(Easing.ease),
    duration: DURATION_END,
  },
};
