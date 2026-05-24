import { Platform, type ViewStyle } from 'react-native';

export const colors = {
  primary: '#7DCEE9',
  primaryHover: '#65B8D3',
  secondary: '#A8D08D',
  secondaryHover: '#8EBB72',
  accent: '#B9A4EE',
  base: '#DFE9EE',
  surface: '#FFFFFF',
  surfaceElevated: '#F2F6F9',
  chatAi: '#F2F6F9',
  textMain: '#1A202C',
  textMuted: '#8F9BB3',
  textInverse: '#FFFFFF',
  borderLight: '#EDF1F5',
  borderMedium: '#E2E8F0',
  success: '#A8D08D',
  warning: '#F6D365',
  error: '#F15C5C',
  info: '#7DCEE9',
};

export const radius = { sm: 12, md: 16, lg: 24, xl: 32, pill: 9999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

type NativeShadow = {
  color: string;
  offset: { width: number; height: number };
  opacity: number;
  radius: number;
  elevation: number;
};

const shadow = (webBoxShadow: string, native: NativeShadow): ViewStyle => {
  if (Platform.OS === 'web') {
    return { boxShadow: webBoxShadow } as ViewStyle;
  }

  return {
    shadowColor: native.color,
    shadowOffset: native.offset,
    shadowOpacity: native.opacity,
    shadowRadius: native.radius,
    elevation: native.elevation,
  };
};

export const shadows = {
  card: shadow('0 10px 20px rgba(160, 174, 192, 0.10)', {
    color: '#A0AEC0',
    offset: { width: 0, height: 10 },
    opacity: 0.1,
    radius: 20,
    elevation: 3,
  }),
  floating: shadow('0 12px 24px rgba(160, 174, 192, 0.15)', {
    color: '#A0AEC0',
    offset: { width: 0, height: 12 },
    opacity: 0.15,
    radius: 24,
    elevation: 6,
  }),
  tabBar: shadow('0 10px 20px rgba(160, 174, 192, 0.20)', {
    color: '#A0AEC0',
    offset: { width: 0, height: 10 },
    opacity: 0.2,
    radius: 20,
    elevation: 10,
  }),
  inputBar: shadow('0 -8px 18px rgba(96, 199, 232, 0.25)', {
    color: '#60C7E8',
    offset: { width: 0, height: 8 },
    opacity: 0.25,
    radius: 18,
    elevation: 8,
  }),
};

export const fontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};
