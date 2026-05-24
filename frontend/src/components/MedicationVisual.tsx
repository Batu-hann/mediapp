import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Path, Circle, Rect, Ellipse, G, Defs, LinearGradient, Stop,
} from 'react-native-svg';

export type MedicationShapeType =
  | 'capsule' | 'tablet' | 'oval' | 'round' | 'oblong'
  | 'bottle' | 'liquid' | 'tube' | 'patch' | 'drop'
  | 'syrup' | 'injection' | 'inhaler' | 'cream';

export type MedicationColorType =
  | 'blue' | 'teal' | 'green' | 'purple' | 'pink'
  | 'orange' | 'yellow' | 'gray' | 'red' | 'indigo' | 'mint';

// Apple Health solid background colors
const BG: Record<MedicationColorType, string> = {
  blue:   '#0A84FF',
  teal:   '#32ADE6',
  green:  '#30D158',
  purple: '#BF5AF2',
  pink:   '#FF375F',
  orange: '#FF9F0A',
  yellow: '#FFD60A',
  gray:   '#8E8E93',
  red:    '#FF3B30',
  indigo: '#5E5CE6',
  mint:   '#00C7BE',
};

// White shape rendered inside the colored circle
function ShapeIcon({ shape }: { shape: MedicationShapeType }) {
  const w = '100%';
  const shadow = 'rgba(0,0,0,0.15)';

  switch (shape) {
    case 'capsule':
    case 'oblong':
      return (
        <G>
          {/* Body */}
          <Rect x={12} y={22} width={40} height={20} rx={10} fill="white" />
          {/* Inner shadow bottom */}
          <Rect x={12} y={34} width={40} height={8} rx={4} fill={shadow} />
          {/* Highlight top */}
          <Ellipse cx={32} cy={27} rx={14} ry={5} fill="rgba(255,255,255,0.4)" />
        </G>
      );

    case 'tablet':
    case 'round':
      return (
        <G>
          <Circle cx={32} cy={32} r={16} fill="white" />
          {/* Score line */}
          <Rect x={18} y={30.5} width={28} height={3} rx={1.5} fill={shadow} />
          {/* Highlight */}
          <Ellipse cx={26} cy={24} rx={7} ry={4} fill="rgba(255,255,255,0.5)" />
        </G>
      );

    case 'oval':
      return (
        <G>
          <Ellipse cx={32} cy={32} rx={18} ry={13} fill="white" />
          <Ellipse cx={26} cy={27} rx={7} ry={4} fill="rgba(255,255,255,0.4)" />
          <Ellipse cx={32} cy={38} rx={14} ry={5} fill={shadow} />
        </G>
      );

    case 'drop':
    case 'liquid':
      return (
        <G>
          <Path d="M32,12 C32,12 18,26 18,36 C18,44 24,50 32,50 C40,50 46,44 46,36 C46,26 32,12 32,12 Z"
            fill="white" />
          <Path d="M23,34 C23,28 30,18 30,18" fill="none" stroke="rgba(255,255,255,0.5)"
            strokeWidth={3} strokeLinecap="round" />
        </G>
      );

    case 'syrup':
    case 'bottle':
      return (
        <G>
          {/* Bottle body */}
          <Path d="M24,20 L40,20 L43,26 L43,48 L21,48 L21,26 Z" fill="white" />
          {/* Neck */}
          <Rect x={27} y={14} width={10} height={8} rx={2} fill="white" />
          {/* Cap */}
          <Rect x={26} y={11} width={12} height={5} rx={2} fill="rgba(255,255,255,0.7)" />
          {/* Label highlight */}
          <Rect x={25} y={28} width={14} height={12} rx={3} fill="rgba(255,255,255,0.25)" />
          {/* Shine */}
          <Path d="M23,22 L23,40" stroke="rgba(255,255,255,0.5)" strokeWidth={2.5} strokeLinecap="round" />
        </G>
      );

    case 'tube':
    case 'cream':
      return (
        <G>
          {/* Tube body */}
          <Rect x={20} y={18} width={24} height={26} rx={3} fill="white" />
          {/* Top crimp */}
          <Rect x={18} y={14} width={28} height={6} rx={1.5} fill="rgba(255,255,255,0.85)" />
          {/* Nozzle */}
          <Rect x={28} y={42} width={8} height={7} rx={2} fill="rgba(255,255,255,0.9)" />
          {/* Shine */}
          <Path d="M22,20 L22,38" stroke="rgba(255,255,255,0.5)" strokeWidth={2} strokeLinecap="round" />
        </G>
      );

    case 'patch':
      return (
        <G>
          {/* Patch body */}
          <Rect x={13} y={13} width={38} height={38} rx={8} fill="white" />
          {/* Center circle */}
          <Circle cx={32} cy={32} r={10} fill="rgba(255,255,255,0.6)" />
          <Circle cx={32} cy={32} r={6} fill="white" opacity={0.9} />
          {/* Corner dots */}
          {[20, 44].flatMap(x => [20, 44].map(y => (
            <Circle key={`${x}${y}`} cx={x} cy={y} r={2} fill="rgba(255,255,255,0.5)" />
          )))}
          {/* Highlight */}
          <Ellipse cx={22} cy={19} rx={5} ry={3} fill="rgba(255,255,255,0.35)" />
        </G>
      );

    case 'injection':
      return (
        <G>
          {/* Needle tip */}
          <Path d="M32,8 L32,16" stroke="rgba(255,255,255,0.7)" strokeWidth={1.5} />
          {/* Barrel */}
          <Rect x={26} y={16} width={12} height={28} rx={2} fill="white" />
          {/* Plunger */}
          <Rect x={29} y={42} width={6} height={8} fill="rgba(255,255,255,0.7)" />
          <Rect x={25} y={49} width={14} height={3} rx={1.5} fill="rgba(255,255,255,0.9)" />
          {/* Scale marks */}
          {[22, 28, 34].map(y => (
            <Rect key={y} x={27} y={y} width={5} height={1.5} rx={0.75}
              fill="rgba(255,255,255,0.45)" />
          ))}
          {/* Shine */}
          <Path d="M27,18 L27,40" stroke="rgba(255,255,255,0.4)" strokeWidth={2} strokeLinecap="round" />
        </G>
      );

    case 'inhaler':
      return (
        <G>
          {/* Main body */}
          <Path d="M22,14 L34,14 L34,42 L40,46 L37,50 L25,50 L22,44 Z" fill="white" />
          {/* Canister */}
          <Rect x={25} y={9} width={7} height={6} rx={1.5} fill="rgba(255,255,255,0.8)" />
          {/* Nozzle */}
          <Path d="M34,39 L40,43 L38,48 L32,44 Z" fill="rgba(255,255,255,0.85)" />
          {/* Shine */}
          <Path d="M24,16 L24,38" stroke="rgba(255,255,255,0.4)" strokeWidth={2} strokeLinecap="round" />
        </G>
      );

    default:
      return (
        <G>
          <Rect x={14} y={24} width={36} height={16} rx={8} fill="white" />
          <Ellipse cx={24} cy={28} rx={8} ry={4} fill="rgba(255,255,255,0.35)" />
        </G>
      );
  }
}

interface MedicationVisualProps {
  shape?: MedicationShapeType;
  color?: MedicationColorType;
  size?: number;
  glow?: boolean;
  variant?: 'circle' | 'card'; // circle = round, card = rounded square (for list view)
}

export default function MedicationVisual({
  shape = 'capsule',
  color = 'blue',
  size = 56,
  glow = false,
  variant = 'circle',
}: MedicationVisualProps) {
  const bg = BG[color] || BG.blue;
  const br = variant === 'circle' ? size / 2 : size * 0.22;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: br,
          backgroundColor: bg,
        },
        glow && {
          shadowColor: bg,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.55,
          shadowRadius: 14,
          elevation: 10,
        },
      ]}
    >
      <Svg width={size * 0.70} height={size * 0.70} viewBox="0 0 64 64">
        <ShapeIcon shape={shape} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
});
