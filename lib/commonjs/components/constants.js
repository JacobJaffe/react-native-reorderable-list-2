"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SCALE_ANIMATION_CONFIG_DEFAULT = exports.OPACITY_ANIMATION_CONFIG_DEFAULT = exports.AUTOSCROLL_CONFIG = void 0;
var _reactNativeReanimated = require("react-native-reanimated");
const AUTOSCROLL_CONFIG = exports.AUTOSCROLL_CONFIG = {
  // Autoscroll speed in pixels per second at the inner and outer edge of the autoscroll area,
  // scaled by `autoscrollSpeedScale`.
  minSpeed: 150,
  maxSpeed: 1200,
  // Upper bound for the time delta of a single frame, prevents big jumps after dropped frames.
  maxFrameDelta: 34,
  // Time delta used when the previous frame time is not available (e.g. first frame).
  defaultFrameDelta: 1000 / 60
};
const DURATION_START = 150;
const DURATION_END = 200;
const SCALE_ANIMATION_CONFIG_DEFAULT = exports.SCALE_ANIMATION_CONFIG_DEFAULT = {
  start: {
    toValue: 1.025,
    easing: _reactNativeReanimated.Easing.in(_reactNativeReanimated.Easing.ease),
    duration: DURATION_START
  },
  end: {
    toValue: 1,
    easing: _reactNativeReanimated.Easing.out(_reactNativeReanimated.Easing.ease),
    duration: DURATION_END
  }
};
const OPACITY_ANIMATION_CONFIG_DEFAULT = exports.OPACITY_ANIMATION_CONFIG_DEFAULT = {
  start: {
    toValue: 0.75,
    easing: _reactNativeReanimated.Easing.in(_reactNativeReanimated.Easing.ease),
    duration: DURATION_START
  },
  end: {
    toValue: 1,
    easing: _reactNativeReanimated.Easing.out(_reactNativeReanimated.Easing.ease),
    duration: DURATION_END
  }
};
//# sourceMappingURL=constants.js.map