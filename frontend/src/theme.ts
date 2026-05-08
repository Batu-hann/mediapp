export const colors = {
  primary: '#4A90D9',
  primaryHover: '#3A7CB8',
  secondary: '#34C47C',
  secondaryHover: '#2CA367',
  accent: '#E88D67',
  base: '#FCFBF8',
  surface: '#FFFFFF',
  surfaceElevated: '#F7FAFC',
  chatAi: '#F0F4F8',
  textMain: '#1A202C',
  textMuted: '#718096',
  textInverse: '#FFFFFF',
  borderLight: '#EDF2F7',
  borderMedium: '#E2E8F0',
  success: '#34C47C',
  warning: '#F6AD55',
  error: '#E88D67',
  info: '#4A90D9',
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 9999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

export const shadows = {
  card: {
    shadowColor: '#1A202C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  floating: {
    shadowColor: '#4A90D9',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 5,
  },
};

export const fontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};
