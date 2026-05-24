import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface AdherenceRingProps {
  progress: number; // 0–100
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  customLabel?: string;
  customSubLabel?: string;
  textColor?: string;
  trackColor?: string;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function AdherenceRing({
  progress = 0,
  size = 72,
  strokeWidth = 7,
  showLabel = true,
  customLabel,
  customSubLabel,
  textColor,
  trackColor = '#E5E7EB',
}: AdherenceRingProps) {
  const safeProgress = isNaN(progress) ? 0 : Math.min(Math.max(progress, 0), 100);
  const innerRadius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * innerRadius;
  const cx = size / 2;
  const cy = size / 2;

  const animProgress = useSharedValue(0);

  useEffect(() => {
    animProgress.value = withTiming(safeProgress, {
      duration: 900,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [safeProgress]);

  const animatedProps = useAnimatedProps(() => {
    const offset = circumference - (animProgress.value / 100) * circumference;
    return {
      strokeDashoffset: offset,
    };
  });

  // Color by rate
  const ringColor = safeProgress >= 80 ? '#34D399' : safeProgress >= 50 ? '#FBBF24' : '#F87171';
  const ringEnd = safeProgress >= 80 ? '#10B981' : safeProgress >= 50 ? '#F59E0B' : '#EF4444';
  const gradId = `ring_${Math.round(safeProgress)}`;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={ringColor} />
            <Stop offset="100%" stopColor={ringEnd} />
          </LinearGradient>
        </Defs>
        <G rotation="-90" origin={`${cx}, ${cy}`}>
          {/* Track */}
          <Circle
            cx={cx}
            cy={cy}
            r={innerRadius}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress */}
          <AnimatedCircle
            cx={cx}
            cy={cy}
            r={innerRadius}
            stroke={`url(#${gradId})`}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            animatedProps={animatedProps}
            strokeLinecap="round"
          />
        </G>
      </Svg>

      {/* Center label */}
      {showLabel && (
        <View style={styles.labelContainer} pointerEvents="none">
          <Text style={[styles.percent, { fontSize: Math.floor(size * 0.23), color: textColor || '#111827' }]}>
            {customLabel || `${Math.round(safeProgress)}%`}
          </Text>
          <Text style={[styles.sub, { fontSize: Math.floor(size * 0.13), color: textColor ? 'rgba(255,255,255,0.7)' : '#9CA3AF' }]}>
            {customSubLabel || 'uyum'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  labelContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  percent: {
    fontWeight: '900',
    color: '#111827',
    letterSpacing: -0.5,
  },
  sub: {
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.3,
    marginTop: -1,
  },
});
