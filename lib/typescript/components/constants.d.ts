import { WithTimingConfig } from 'react-native-reanimated';
export declare const AUTOSCROLL_CONFIG: {
    minSpeed: number;
    maxSpeed: number;
    maxFrameDelta: number;
    defaultFrameDelta: number;
};
interface AnimationConfig {
    start: WithTimingConfig & {
        toValue: number;
    };
    end: WithTimingConfig & {
        toValue: number;
    };
}
export declare const SCALE_ANIMATION_CONFIG_DEFAULT: AnimationConfig;
export declare const OPACITY_ANIMATION_CONFIG_DEFAULT: AnimationConfig;
export {};
//# sourceMappingURL=constants.d.ts.map