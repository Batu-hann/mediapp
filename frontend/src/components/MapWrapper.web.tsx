import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { colors } from '../theme';

export const MapView = React.forwardRef((props: any, ref: any) => (
  <View style={[props.style, styles.container]}>
    <MapPin size={48} color={colors.primary} style={{ opacity: 0.5, marginBottom: 16 }} />
    <Text style={styles.text}>Harita görünümü web tarayıcılarında desteklenmemektedir.</Text>
    <Text style={styles.subtext}>Lütfen mobil cihazınızdan (iOS/Android) bağlanın.</Text>
  </View>
));
MapView.displayName = 'MapView';

export const Marker = () => <>{null}</>;
export const Callout = () => <>{null}</>;
export const PROVIDER_GOOGLE = 'google';

export default MapView;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textMain,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  }
});
