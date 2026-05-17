import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, Linking, ActivityIndicator, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { MapPin, Phone, Clock, Navigation, Map as MapIcon } from 'lucide-react-native';
import * as Location from 'expo-location';
import { api } from '../../src/api';
import { useAuth } from '../../src/AuthContext';
import { colors, radius, spacing, shadows } from '../../src/theme';
import { t } from '../../src/i18n';

type Pharmacy = {
  id: string; name: string; address: string; phone: string;
  hours: string; on_call: boolean; lat: number; lon: number; distance_m: number;
};

const FILTER_OPTIONS = [500, 1000, 2000, 5000];

// Default Istanbul center for web preview / when permission denied
const DEFAULT_LOC = { lat: 41.0082, lon: 28.9784 };

export default function PharmacyScreen() {
  const { language } = useAuth();
  const L = t(language);
  const [tab, setTab] = useState<'all' | 'oncall'>('all');
  const [radiusM, setRadiusM] = useState(2000);
  const [list, setList] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locDenied, setLocDenied] = useState(false);

  const fetchLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocDenied(true);
        return DEFAULT_LOC;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const c = { lat: loc.coords.latitude, lon: loc.coords.longitude };
      setCoords(c);
      setLocDenied(false);
      return c;
    } catch {
      setLocDenied(true);
      return DEFAULT_LOC;
    }
  };

  const load = async () => {
    setLoading(true);
    const c = coords || await fetchLocation();
    try {
      const r = await api.get('/pharmacies/nearby', {
        params: { lat: c.lat, lon: c.lon, radius_m: radiusM, on_call_only: tab === 'oncall' },
      });
      setList(r.data.pharmacies);
    } catch (e: any) {
      Alert.alert(L.error, e?.response?.data?.detail || 'Failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [tab, radiusM]));

  const callPharmacy = (phone: string) => {
    if (!phone) return Alert.alert(L.error, 'Telefon numarası bulunamadı');
    const url = `tel:${phone.replace(/\s/g, '')}`;
    Linking.openURL(url).catch(() => Alert.alert(L.error, 'Cannot open dialer'));
  };

  const openMap = (p: Pharmacy) => {
    if (!p.lat || !p.lon) return Alert.alert(L.error, 'Konum bilgisi bulunamadı');
    const url = Platform.select({
      ios: `maps:0,0?q=${p.name}@${p.lat},${p.lon}`,
      android: `geo:0,0?q=${p.lat},${p.lon}(${p.name})`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`
    });
    if (url) {
      Linking.openURL(url).catch(() => Alert.alert(L.error, 'Harita uygulaması açılamadı'));
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{L.nearbyPharmacies}</Text>
        {locDenied && (
          <Text style={styles.locDenied}>{language === 'tr' ? 'İstanbul varsayılan konumu kullanılıyor' : 'Using Istanbul default'}</Text>
        )}
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity testID="tab-all" style={[styles.tab, tab === 'all' && styles.tabActive]} onPress={() => setTab('all')}>
          <Text style={[styles.tabText, tab === 'all' && styles.tabTextActive]}>{L.allPharmacies}</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="tab-oncall" style={[styles.tab, tab === 'oncall' && styles.tabActive]} onPress={() => setTab('oncall')}>
          <Text style={[styles.tabText, tab === 'oncall' && styles.tabTextActive]}>{L.onCallPharmacies}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((r) => (
          <TouchableOpacity
            key={r}
            testID={`filter-${r}`}
            style={[styles.filterChip, radiusM === r && styles.filterChipActive]}
            onPress={() => setRadiusM(r)}
          >
            <Text style={[styles.filterText, radiusM === r && styles.filterTextActive]}>
              {r < 1000 ? `${r}m` : `${r / 1000}km`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 50 }} />
      ) : list.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><MapPin size={36} color={colors.primary} /></View>
          <Text style={styles.emptyText}>{language === 'tr' ? 'Bu mesafede eczane bulunamadı' : 'No pharmacies found in this range'}</Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.xxl, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          renderItem={({ item, index }) => (
            <View testID={`pharmacy-${index}`} style={styles.card}>
              <View style={styles.iconWrap}><MapPin size={20} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={styles.name}>{item.name}</Text>
                  {item.on_call && (
                    <View style={styles.dutyBadge}>
                      <Text style={styles.dutyText}>{L.onDuty}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.addr}>{item.address}</Text>
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Navigation size={12} color={colors.textMuted} />
                    <Text style={styles.metaText}>{L.distance(item.distance_m)}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Clock size={12} color={colors.textMuted} />
                    <Text style={styles.metaText}>{item.hours}</Text>
                  </View>
                </View>
                <View style={styles.actionRow}>
                  <TouchableOpacity testID={`call-${index}`} style={styles.callBtn} onPress={() => callPharmacy(item.phone)}>
                    <Phone size={14} color="#fff" />
                    <Text style={styles.callText}>{item.phone || L.call}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity testID={`map-${index}`} style={styles.mapBtn} onPress={() => openMap(item)}>
                    <MapIcon size={14} color={colors.primary} />
                    <Text style={styles.mapText}>{language === 'tr' ? 'Yol Tarifi' : 'Directions'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  header: { paddingHorizontal: spacing.xxl, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 28, fontWeight: '800', color: colors.textMain, letterSpacing: -0.5 },
  locDenied: { fontSize: 11, color: colors.warning, marginTop: 2 },
  tabRow: { flexDirection: 'row', marginHorizontal: spacing.xxl, backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4, marginVertical: spacing.sm, borderWidth: 1, borderColor: colors.borderLight },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.pill },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: '#fff' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.xxl, paddingBottom: spacing.sm },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
  filterChipActive: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  filterText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  filterTextActive: { color: '#fff' },
  card: {
    flexDirection: 'row', backgroundColor: colors.surface,
    borderRadius: radius.xl, padding: spacing.lg, marginBottom: 12, gap: spacing.md,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E6F0FB', justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '700', color: colors.textMain },
  addr: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: colors.textMuted },
  dutyBadge: { backgroundColor: colors.secondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  dutyText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.secondary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  callText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  mapBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E6F0FB', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  mapText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xxl },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.chatAi, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
});
