import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { hapticLight } from '../haptics';

const AnimatedPressableCore = Animated.createAnimatedComponent(Pressable);

interface AnimatedPressableProps extends PressableProps {
  style?: StyleProp<ViewStyle> | any;
  children: React.ReactNode;
  scaleTo?: number;
  activeOpacity?: number;
  disableHaptic?: boolean;
}

export default function AnimatedPressable({
  style,
  children,
  scaleTo = 0.95,
  activeOpacity = 0.8,
  disableHaptic = false,
  onPressIn,
  onPressOut,
  ...props
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    };
  });

  return (
    <AnimatedPressableCore
      {...props}
      style={[style, animatedStyle]}
      onPressIn={(e: any) => {
        if (!disableHaptic) hapticLight();
        scale.value = withSpring(scaleTo, { damping: 15, stiffness: 200 });
        opacity.value = withSpring(activeOpacity);
        if (onPressIn) onPressIn(e);
      }}
      onPressOut={(e: any) => {
        scale.value = withSpring(1, { damping: 15, stiffness: 200 });
        opacity.value = withSpring(1);
        if (onPressOut) onPressOut(e);
      }}
    >
      {children}
    </AnimatedPressableCore>
  );
}
