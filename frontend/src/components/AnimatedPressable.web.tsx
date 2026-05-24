import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { hapticLight } from '../haptics';

interface AnimatedPressableProps extends PressableProps {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>) | any;
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
  ...props
}: AnimatedPressableProps) {
  return (
    <Pressable
      {...props}
      onPressIn={(e) => {
        if (!disableHaptic) hapticLight();
        onPressIn?.(e);
      }}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        state.pressed && {
          opacity: activeOpacity,
          transform: [{ scale: scaleTo }],
        },
      ]}
    >
      {children}
    </Pressable>
  );
}
