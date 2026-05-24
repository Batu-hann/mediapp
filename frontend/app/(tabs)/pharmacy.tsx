import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Alert, Linking, Platform, TouchableOpacity, Modal, TextInput, Animated
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Phone, Clock, Navigation, Map as MapIcon, List, X, Search, ChevronDown, AlertCircle, RefreshCw } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import AppMapView, { Marker, PROVIDER_GOOGLE } from '../../src/components/MapWrapper';
import { api } from '../../src/api';
import { useAuth } from '../../src/AuthContext';
import { colors, radius, spacing, shadows } from '../../src/theme';
import { t } from '../../src/i18n';
import AnimatedPressable from '../../src/components/AnimatedPressable';

type Pharmacy = {
  id: string; name: string; address: string; phone: string;
  hours: string; on_call: boolean; lat: number; lon: number; distance_m: number;
  city?: string; district?: string; isOnDuty?: boolean;
  latitude?: number; longitude?: number;
};

const FILTER_OPTIONS = [500, 1000, 2000, 5000];

// Default Istanbul center for web preview / when permission denied
const DEFAULT_LOC = { lat: 41.0082, lon: 28.9784 };

const FALLBACK_CITIES = [
  { name: 'İstanbul', slug: 'istanbul' },
  { name: 'Ankara', slug: 'ankara' },
  { name: 'İzmir', slug: 'izmir' },
  { name: 'Bursa', slug: 'bursa' },
  { name: 'Antalya', slug: 'antalya' },
  { name: 'Adana', slug: 'adana' },
  { name: 'Konya', slug: 'konya' },
  { name: 'Gaziantep', slug: 'gaziantep' },
  { name: 'Kocaeli', slug: 'kocaeli' },
  { name: 'Mersin', slug: 'mersin' },
];

const FALLBACK_DISTRICTS: Record<string, { name: string; slug: string }[]> = {
  istanbul: [
    { name: 'Adalar', slug: 'adalar' }, { name: 'Arnavutköy', slug: 'arnavutkoy' },
    { name: 'Ataşehir', slug: 'atasehir' }, { name: 'Avcılar', slug: 'avcilar' },
    { name: 'Bağcılar', slug: 'bagcilar' }, { name: 'Bahçelievler', slug: 'bahcelievler' },
    { name: 'Bakırköy', slug: 'bakirkoy' }, { name: 'Başakşehir', slug: 'basaksehir' },
    { name: 'Bayrampaşa', slug: 'bayrampasa' }, { name: 'Beşiktaş', slug: 'besiktas' },
    { name: 'Beykoz', slug: 'beykoz' }, { name: 'Beylikdüzü', slug: 'beylikduzu' },
    { name: 'Beyoğlu', slug: 'beyoglu' }, { name: 'Büyükçekmece', slug: 'buyukcekmece' },
    { name: 'Çatalca', slug: 'catalca' }, { name: 'Çekmeköy', slug: 'cekmekoy' },
    { name: 'Esenler', slug: 'esenler' }, { name: 'Esenyurt', slug: 'esenyurt' },
    { name: 'Eyüpsultan', slug: 'eyupsultan' }, { name: 'Fatih', slug: 'fatih' },
    { name: 'Gaziosmanpaşa', slug: 'gaziosmanpasa' }, { name: 'Güngören', slug: 'gungoren' },
    { name: 'Kadıköy', slug: 'kadikoy' }, { name: 'Kağıthane', slug: 'kagithane' },
    { name: 'Kartal', slug: 'kartal' }, { name: 'Küçükçekmece', slug: 'kucukcekmece' },
    { name: 'Maltepe', slug: 'maltepe' }, { name: 'Pendik', slug: 'pendik' },
    { name: 'Sancaktepe', slug: 'sancaktepe' }, { name: 'Sarıyer', slug: 'sariyer' },
    { name: 'Silivri', slug: 'silivri' }, { name: 'Sultanbeyli', slug: 'sultanbeyli' },
    { name: 'Sultangazi', slug: 'sultangazi' }, { name: 'Şile', slug: 'sile' },
    { name: 'Şişli', slug: 'sisli' }, { name: 'Tuzla', slug: 'tuzla' },
    { name: 'Ümraniye', slug: 'umraniye' }, { name: 'Üsküdar', slug: 'uskudar' },
    { name: 'Zeytinburnu', slug: 'zeytinburnu' }
  ],
  ankara: [
    { name: 'Akyurt', slug: 'akyurt' }, { name: 'Altındağ', slug: 'altindag' },
    { name: 'Ayaş', slug: 'ayas' }, { name: 'Bala', slug: 'bala' },
    { name: 'Beypazarı', slug: 'beypazari' }, { name: 'Çamlıdere', slug: 'camlidere' },
    { name: 'Çankaya', slug: 'cankaya' }, { name: 'Çubuk', slug: 'cubuk' },
    { name: 'Elmadağ', slug: 'elmadag' }, { name: 'Etimesgut', slug: 'etimesgut' },
    { name: 'Evren', slug: 'evren' }, { name: 'Gölbaşı', slug: 'golbasi' },
    { name: 'Güdül', slug: 'gudul' }, { name: 'Haymana', slug: 'haymana' },
    { name: 'Kahramankazan', slug: 'kahramankazan' }, { name: 'Kalecik', slug: 'kalecik' },
    { name: 'Keçiören', slug: 'kecioren' }, { name: 'Kızılcahamam', slug: 'kizilcahamam' },
    { name: 'Mamak', slug: 'mamak' }, { name: 'Nallıhan', slug: 'nallihan' },
    { name: 'Polatlı', slug: 'polatli' }, { name: 'Pursaklar', slug: 'pursaklar' },
    { name: 'Sincan', slug: 'sincan' }, { name: 'Şereflikoçhisar', slug: 'sereflikochisar' },
    { name: 'Yenimahalle', slug: 'yenimahalle' }
  ],
  izmir: [
    { name: 'Aliağa', slug: 'aliaga' }, { name: 'Balçova', slug: 'balcova' },
    { name: 'Bayındır', slug: 'bayindir' }, { name: 'Bayraklı', slug: 'bayrakli' },
    { name: 'Bergama', slug: 'bergama' }, { name: 'Beydağ', slug: 'beydag' },
    { name: 'Bornova', slug: 'bornova' }, { name: 'Buca', slug: 'buca' },
    { name: 'Çeşme', slug: 'cesme' }, { name: 'Çiğli', slug: 'cigli' },
    { name: 'Dikili', slug: 'dikili' }, { name: 'Foça', slug: 'foca' },
    { name: 'Gaziemir', slug: 'gaziemir' }, { name: 'Güzelbahçe', slug: 'guzelbahce' },
    { name: 'Karabağlar', slug: 'karabaglar' }, { name: 'Karaburun', slug: 'karaburun' },
    { name: 'Karşıyaka', slug: 'karsiyaka' }, { name: 'Kemalpaşa', slug: 'kemalpasa' },
    { name: 'Kınık', slug: 'kinik' }, { name: 'Kiraz', slug: 'kiraz' },
    { name: 'Konak', slug: 'konak' }, { name: 'Menderes', slug: 'menderes' },
    { name: 'Menemen', slug: 'menemen' }, { name: 'Narlıdere', slug: 'narlidere' },
    { name: 'Ödemiş', slug: 'odemis' }, { name: 'Seferihisar', slug: 'seferihisar' },
    { name: 'Selçuk', slug: 'selcuk' }, { name: 'Tire', slug: 'tire' },
    { name: 'Torbalı', slug: 'torbali' }, { name: 'Urla', slug: 'urla' }
  ]
};

const SkeletonCard = () => {
  const animatedValue = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 0.8,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <Animated.View style={[styles.card, { opacity: animatedValue }]}>
      <View style={[styles.iconWrap, { backgroundColor: 'rgba(0,0,0,0.05)' }]} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ width: '60%', height: 16, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 4 }} />
        <View style={{ width: '90%', height: 12, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 4 }} />
        <View style={{ width: '40%', height: 12, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 4 }} />
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <View style={{ flex: 1, height: 32, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 16 }} />
          <View style={{ flex: 1, height: 32, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 16 }} />
        </View>
      </View>
    </Animated.View>
  );
};

export default function PharmacyScreen() {
  const { language } = useAuth();
  const L = t(language);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [tab, setTab] = useState<'all' | 'oncall'>('all');
  const [radiusM, setRadiusM] = useState(2000);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locDenied, setLocDenied] = useState(false);
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(null);
  const mapRef = useRef<any>(null);

  // New Search & Dropdown States
  const [searchMode, setSearchMode] = useState<'gps' | 'city'>('gps');
  const [selectedCity, setSelectedCity] = useState<{ name: string; slug: string } | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<{ name: string; slug: string } | null>(null);
  const [cityModalVisible, setCityModalVisible] = useState(false);
  const [districtModalVisible, setDistrictModalVisible] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [districtSearch, setDistrictSearch] = useState('');

  // Fetch cities lists (with fallback)
  const { data: cities = FALLBACK_CITIES } = useQuery({
    queryKey: ['cities'],
    queryFn: async () => {
      try {
        const r = await api.get('/pharmacies/cities');
        return r.data.cities;
      } catch {
        return FALLBACK_CITIES;
      }
    }
  });

  // Fetch districts list (with fallback)
  const { data: districts = [] } = useQuery({
    queryKey: ['districts', selectedCity?.slug],
    queryFn: async () => {
      if (!selectedCity) return [];
      try {
        const r = await api.get('/pharmacies/districts', { params: { city: selectedCity.slug } });
        return r.data.districts;
      } catch {
        return FALLBACK_DISTRICTS[selectedCity.slug] || [{ name: 'Merkez', slug: 'merkez' }];
      }
    },
    enabled: !!selectedCity
  });

  const checkStatus = (p: Pharmacy) => {
    if (p.on_call || p.isOnDuty) return 'on_call';
    try {
      const now = new Date();
      if (now.getDay() === 0) return 'closed'; // Sunday
      if (!p.hours || p.hours.indexOf('-') === -1) return 'open';
      const parts = p.hours.split('-');
      const [sh, sm] = parts[0].trim().split(':').map(Number);
      const [eh, em] = parts[1].trim().split(':').map(Number);
      if (isNaN(sh) || isNaN(eh)) return 'open';
      const currentMin = now.getHours() * 60 + now.getMinutes();
      const startMin = sh * 60 + (sm || 0);
      const endMin = eh * 60 + (em || 0);
      if (currentMin >= startMin && currentMin <= endMin) return 'open';
      return 'closed';
    } catch {
      return 'closed';
    }
  };

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

  // Main Pharmacies Query
  const { data: list = [], isLoading: loading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['pharmacies', searchMode, tab, radiusM, selectedCity?.slug, selectedDistrict?.slug],
    queryFn: async () => {
      if (searchMode === 'gps') {
        let c = coords;
        if (!c) {
          c = await fetchLocation();
        }
        const endpoint = tab === 'oncall' ? '/pharmacies/duty/nearby' : '/pharmacies/all/nearby';
        const r = await api.get(endpoint, {
          params: { lat: c.lat, lon: c.lon, radius_m: radiusM },
        });
        return r.data.pharmacies as Pharmacy[];
      } else {
        if (!selectedCity) return [];
        const endpoint = tab === 'oncall' ? '/pharmacies/duty/by-city' : '/pharmacies/all/by-city';
        const r = await api.get(endpoint, {
          params: { city: selectedCity.slug, district: selectedDistrict?.slug || undefined },
        });
        return r.data.pharmacies as Pharmacy[];
      }
    },
    enabled: searchMode === 'gps' || !!selectedCity,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const onRefresh = () => refetch();

  const callPharmacy = (phone: string) => {
    if (!phone) return Alert.alert(L.error, language === 'tr' ? 'Telefon numarası bulunamadı' : 'Phone number not found');
    const url = `tel:${phone.replace(/\s/g, '')}`;
    Linking.openURL(url).catch(() => Alert.alert(L.error, 'Cannot open dialer'));
  };

  const openMap = (p: Pharmacy) => {
    const latVal = p.lat || p.latitude;
    const lonVal = p.lon || p.longitude;
    if (!latVal || !lonVal) return Alert.alert(L.error, language === 'tr' ? 'Konum bilgisi bulunamadı' : 'Location coordinates not found');
    const url = Platform.select({
      ios: `maps:0,0?q=${p.name}@${latVal},${lonVal}`,
      android: `geo:0,0?q=${latVal},${lonVal}(${p.name})`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${latVal},${lonVal}`
    });
    if (url) {
      Linking.openURL(url).catch(() => Alert.alert(L.error, 'Harita uygulaması açılamadı'));
    }
  };

  // Center map on list updates when mode is map
  useEffect(() => {
    if (viewMode === 'map' && list.length > 0 && mapRef.current) {
      const first = list[0];
      const flat = first.lat || first.latitude;
      const flon = first.lon || first.longitude;
      if (flat && flon) {
        mapRef.current.animateToRegion({
          latitude: flat,
          longitude: flon,
          latitudeDelta: searchMode === 'gps' ? 0.04 : 0.08,
          longitudeDelta: searchMode === 'gps' ? 0.04 : 0.08,
        }, 1000);
      }
    }
  }, [list, viewMode, searchMode]);

  // Filter cities & districts locally
  const filteredCities = cities.filter((c: any) =>
    c.name.toLowerCase().includes(citySearch.toLowerCase())
  );

  const filteredDistricts = districts.filter((d: any) =>
    d.name.toLowerCase().includes(districtSearch.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* HEADER SECTION */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{L.findPharmacy}</Text>
          {locDenied && searchMode === 'gps' && (
            <Text style={styles.locDenied}>{language === 'tr' ? 'Varsayılan İstanbul konumu kullanılıyor' : 'Using default Istanbul location'}</Text>
          )}
        </View>
        <View style={styles.viewToggle}>
          <AnimatedPressable
            style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
            onPress={() => setViewMode('list')}
            disableHaptic
          >
            <List size={20} color={viewMode === 'list' ? colors.textMain : colors.textMuted} />
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.toggleBtn, viewMode === 'map' && styles.toggleBtnActive]}
            onPress={() => setViewMode('map')}
            disableHaptic
          >
            <MapIcon size={20} color={viewMode === 'map' ? colors.textMain : colors.textMuted} />
          </AnimatedPressable>
        </View>
      </View>

      {/* SEARCH MODE SELECTOR */}
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeTab, searchMode === 'gps' && styles.modeTabActive]}
          onPress={() => setSearchMode('gps')}
        >
          <MapPin size={16} color={searchMode === 'gps' ? '#fff' : colors.textMuted} />
          <Text style={[styles.modeTabText, searchMode === 'gps' && styles.modeTabTextActive]}>
            {language === 'tr' ? 'Yakınımdakiler' : 'Nearby'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeTab, searchMode === 'city' && styles.modeTabActive]}
          onPress={() => {
            setSearchMode('city');
            if (!selectedCity) {
              setCityModalVisible(true);
            }
          }}
        >
          <Search size={16} color={searchMode === 'city' ? '#fff' : colors.textMuted} />
          <Text style={[styles.modeTabText, searchMode === 'city' && styles.modeTabTextActive]}>
            {language === 'tr' ? 'İl/İlçe Arama' : 'Search by City'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* CITY & DISTRICT SELECTOR UI (Only shown in city search mode) */}
      {searchMode === 'city' && (
        <View style={styles.dropdownsRow}>
          <TouchableOpacity
            style={styles.dropdownBtn}
            onPress={() => {
              setCitySearch('');
              setCityModalVisible(true);
            }}
          >
            <Text style={styles.dropdownBtnText} numberOfLines={1}>
              {selectedCity ? selectedCity.name : (language === 'tr' ? 'İl Seçin' : 'Select City')}
            </Text>
            <ChevronDown size={16} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.dropdownBtn, !selectedCity && styles.dropdownBtnDisabled]}
            disabled={!selectedCity}
            onPress={() => {
              setDistrictSearch('');
              setDistrictModalVisible(true);
            }}
          >
            <Text style={styles.dropdownBtnText} numberOfLines={1}>
              {selectedDistrict ? selectedDistrict.name : (language === 'tr' ? 'İlçe Seçin' : 'Select District')}
            </Text>
            <ChevronDown size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* TABS (ALL / ON-CALL) */}
      <View style={styles.tabRow}>
        <AnimatedPressable testID="tab-all" style={[styles.tab, tab === 'all' && styles.tabActive]} onPress={() => setTab('all')}>
          <Text style={[styles.tabText, tab === 'all' && styles.tabTextActive]}>{L.allPharmacies}</Text>
        </AnimatedPressable>
        <AnimatedPressable testID="tab-oncall" style={[styles.tab, tab === 'oncall' && styles.tabActive]} onPress={() => setTab('oncall')}>
          <Text style={[styles.tabText, tab === 'oncall' && styles.tabTextActive]}>{L.onCallPharmacies}</Text>
        </AnimatedPressable>
      </View>

      {/* RADIUS OPTIONS (Only shown in GPS Mode) */}
      {searchMode === 'gps' && (
        <View style={styles.filterRow}>
          {FILTER_OPTIONS.map((r) => (
            <AnimatedPressable
              key={r}
              testID={`filter-${r}`}
              style={[styles.filterChip, radiusM === r && styles.filterChipActive]}
              onPress={() => setRadiusM(r)}
            >
              <Text style={[styles.filterText, radiusM === r && styles.filterTextActive]}>
                {r < 1000 ? `${r}m` : `${r / 1000}km`}
              </Text>
            </AnimatedPressable>
          ))}
        </View>
      )}

      {/* CONTENT BODY */}
      {loading && list.length === 0 && viewMode === 'list' ? (
        <View style={{ flex: 1, paddingHorizontal: spacing.xxl, paddingTop: spacing.md }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : isError ? (
        <View style={styles.centerState}>
          <AlertCircle size={48} color={colors.error} style={{ marginBottom: spacing.md }} />
          <Text style={styles.centerTitle}>{language === 'tr' ? 'Hata Oluştu' : 'Error Occurred'}</Text>
          <Text style={styles.centerSub}>
            {(error as any)?.response?.data?.detail || (error instanceof Error ? error.message : String(error))}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <RefreshCw size={16} color="#fff" />
            <Text style={styles.retryBtnText}>{language === 'tr' ? 'Yeniden Dene' : 'Try Again'}</Text>
          </TouchableOpacity>
        </View>
      ) : searchMode === 'city' && !selectedCity ? (
        <View style={styles.centerState}>
          <Search size={48} color={colors.textMuted} style={{ marginBottom: spacing.md }} />
          <Text style={styles.centerTitle}>{language === 'tr' ? 'Arama Yapın' : 'Search'}</Text>
          <Text style={styles.centerSub}>{language === 'tr' ? 'Eczaneleri listelemek için lütfen yukarıdan il seçin.' : 'Please select a city from above to list pharmacies.'}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => setCityModalVisible(true)}>
            <Text style={styles.retryBtnText}>{language === 'tr' ? 'İl Seçin' : 'Select City'}</Text>
          </TouchableOpacity>
        </View>
      ) : list.length === 0 ? (
        <View style={styles.centerState}>
          <MapPin size={48} color={colors.textMuted} style={{ marginBottom: spacing.md }} />
          <Text style={styles.centerTitle}>{language === 'tr' ? 'Eczane Bulunamadı' : 'No Pharmacies Found'}</Text>
          <Text style={styles.centerSub}>{language === 'tr' ? 'Kriterlere uygun eczane kaydı bulunamadı.' : 'No pharmacy records match the selected criteria.'}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => refetch()}>
            <RefreshCw size={16} color="#fff" />
            <Text style={styles.retryBtnText}>{language === 'tr' ? 'Yenile' : 'Refresh'}</Text>
          </TouchableOpacity>
        </View>
      ) : viewMode === 'map' && Platform.OS !== 'web' ? (
        <View style={{ flex: 1, position: 'relative' }}>
          <AppMapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={{ flex: 1 }}
            initialRegion={{
              latitude: coords?.lat || DEFAULT_LOC.lat,
              longitude: coords?.lon || DEFAULT_LOC.lon,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            showsUserLocation={searchMode === 'gps'}
            onPress={() => setSelectedPharmacy(null)}
          >
            {list.map((p) => {
              const flat = p.lat || p.latitude;
              const flon = p.lon || p.longitude;
              if (!flat || !flon) return null;
              const status = checkStatus(p);
              const color = status === 'on_call' ? colors.error : status === 'open' ? colors.success : colors.textMuted;
              return (
                <Marker
                  key={p.id}
                  coordinate={{ latitude: flat, longitude: flon }}
                  onPress={(e) => {
                    e.stopPropagation();
                    setSelectedPharmacy(p);
                  }}
                >
                  <View style={styles.markerContainer}>
                    <View style={[styles.markerIconBg, { borderColor: color }]}>
                      <MapPin size={16} color={color} />
                    </View>
                    <Text style={styles.markerName} numberOfLines={1}>
                      {p.name.replace('Eczanesi', '').replace('Eczane', '').trim()}
                    </Text>
                  </View>
                </Marker>
              );
            })}
          </AppMapView>
          {isRefetching && (
            <View style={styles.mapLoadingOverlay}>
              <RefreshCw size={16} color={colors.primary} />
            </View>
          )}
          
          {/* MAP BOTTOM CARD DETAILS */}
          {selectedPharmacy && (
            <View style={styles.mapBottomCard}>
              {Platform.OS === 'ios' && (
                <BlurView intensity={35} style={StyleSheet.absoluteFill} tint="light" />
              )}
              <TouchableOpacity style={styles.closeCardBtn} onPress={() => setSelectedPharmacy(null)}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingRight: 30 }}>
                <Text style={styles.name}>{selectedPharmacy.name}</Text>
                {(selectedPharmacy.on_call || selectedPharmacy.isOnDuty) && (
                  <View style={styles.dutyBadge}>
                    <Text style={styles.dutyText}>{L.onDuty}</Text>
                  </View>
                )}
                {checkStatus(selectedPharmacy) === 'open' && !(selectedPharmacy.on_call || selectedPharmacy.isOnDuty) && (
                  <View style={[styles.dutyBadge, { backgroundColor: colors.success + '20' }]}>
                    <Text style={[styles.dutyText, { color: colors.success }]}>Açık</Text>
                  </View>
                )}
                {checkStatus(selectedPharmacy) === 'closed' && (
                  <View style={[styles.dutyBadge, { backgroundColor: '#F0F0F0' }]}>
                    <Text style={[styles.dutyText, { color: colors.textMuted }]}>Kapalı</Text>
                  </View>
                )}
              </View>
              <Text style={styles.addr}>{selectedPharmacy.address}</Text>
              <View style={styles.metaRow}>
                {searchMode === 'gps' && selectedPharmacy.distance_m !== undefined && (
                  <View style={styles.metaItem}>
                    <Navigation size={12} color={colors.textMuted} />
                    <Text style={styles.metaText}>{L.distance(selectedPharmacy.distance_m)}</Text>
                  </View>
                )}
                <View style={styles.metaItem}>
                  <Clock size={12} color={colors.textMuted} />
                  <Text style={styles.metaText}>{selectedPharmacy.hours}</Text>
                </View>
              </View>
              <View style={styles.actionRow}>
                <AnimatedPressable style={styles.callBtn} onPress={() => callPharmacy(selectedPharmacy.phone)}>
                  <Phone size={14} color="#fff" />
                  <Text style={styles.callText}>{selectedPharmacy.phone || L.call}</Text>
                </AnimatedPressable>
                <AnimatedPressable style={styles.mapBtn} onPress={() => openMap(selectedPharmacy)}>
                  <MapIcon size={14} color={colors.primary} />
                  <Text style={styles.mapText}>{language === 'tr' ? 'Yol Tarifi' : 'Directions'}</Text>
                </AnimatedPressable>
              </View>
            </View>
          )}
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.xxl, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />}
          renderItem={({ item, index }) => {
            const status = checkStatus(item);
            return (
              <View testID={`pharmacy-${index}`} style={styles.card}>
                {Platform.OS === 'ios' && (
                  <BlurView intensity={25} style={StyleSheet.absoluteFill} tint="light" />
                )}
                <View style={styles.iconWrap}><MapPin size={20} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={styles.name}>{item.name}</Text>
                    {(item.on_call || item.isOnDuty) && (
                      <View style={styles.dutyBadge}>
                        <Text style={styles.dutyText}>{L.onDuty}</Text>
                      </View>
                    )}
                    {status === 'open' && !(item.on_call || item.isOnDuty) && (
                      <View style={[styles.dutyBadge, { backgroundColor: colors.success + '20' }]}>
                        <Text style={[styles.dutyText, { color: colors.success }]}>Açık</Text>
                      </View>
                    )}
                    {status === 'closed' && (
                      <View style={[styles.dutyBadge, { backgroundColor: '#F0F0F0' }]}>
                        <Text style={[styles.dutyText, { color: colors.textMuted }]}>Kapalı</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.addr}>{item.address}</Text>
                  <View style={styles.metaRow}>
                    {searchMode === 'gps' && item.distance_m !== undefined && (
                      <View style={styles.metaItem}>
                        <Navigation size={12} color={colors.textMuted} />
                        <Text style={styles.metaText}>{L.distance(item.distance_m)}</Text>
                      </View>
                    )}
                    <View style={styles.metaItem}>
                      <Clock size={12} color={colors.textMuted} />
                      <Text style={styles.metaText}>{item.hours}</Text>
                    </View>
                  </View>
                  <View style={styles.actionRow}>
                    <AnimatedPressable testID={`call-${index}`} style={styles.callBtn} onPress={() => callPharmacy(item.phone)}>
                      <Phone size={14} color="#fff" />
                      <Text style={styles.callText}>{item.phone || L.call}</Text>
                    </AnimatedPressable>
                    <AnimatedPressable testID={`map-${index}`} style={styles.mapBtn} onPress={() => openMap(item)}>
                      <MapIcon size={14} color={colors.primary} />
                      <Text style={styles.mapText}>{language === 'tr' ? 'Yol Tarifi' : 'Directions'}</Text>
                    </AnimatedPressable>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* CITY SELECTION MODAL */}
      <Modal
        visible={cityModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCityModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={45} style={StyleSheet.absoluteFill} tint="dark" />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
          )}
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{language === 'tr' ? 'İl Seçin' : 'Select City'}</Text>
              <TouchableOpacity onPress={() => setCityModalVisible(false)}>
                <X size={20} color={colors.textMain} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBarContainer}>
              <Search size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder={language === 'tr' ? 'İl adı arayın...' : 'Search city...'}
                value={citySearch}
                onChangeText={setCitySearch}
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <FlatList
              data={filteredCities}
              keyExtractor={(item) => item.slug}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, selectedCity?.slug === item.slug && styles.modalItemActive]}
                  onPress={() => {
                    setSelectedCity(item);
                    setSelectedDistrict(null); // clear district on city change
                    setCityModalVisible(false);
                    // Open district modal immediately for better UX
                    setDistrictSearch('');
                    setTimeout(() => setDistrictModalVisible(true), 300);
                  }}
                >
                  <Text style={[styles.modalItemText, selectedCity?.slug === item.slug && styles.modalItemTextActive]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* DISTRICT SELECTION MODAL */}
      <Modal
        visible={districtModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDistrictModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={45} style={StyleSheet.absoluteFill} tint="dark" />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
          )}
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedCity?.name} - {language === 'tr' ? 'İlçe Seçin' : 'Select District'}
              </Text>
              <TouchableOpacity onPress={() => setDistrictModalVisible(false)}>
                <X size={20} color={colors.textMain} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBarContainer}>
              <Search size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder={language === 'tr' ? 'İlçe adı arayın...' : 'Search district...'}
                value={districtSearch}
                onChangeText={setDistrictSearch}
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <FlatList
              data={filteredDistricts}
              keyExtractor={(item) => item.slug}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, selectedDistrict?.slug === item.slug && styles.modalItemActive]}
                  onPress={() => {
                    setSelectedDistrict(item);
                    setDistrictModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalItemText, selectedDistrict?.slug === item.slug && styles.modalItemTextActive]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xxl, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 28, fontWeight: '800', color: colors.textMain, letterSpacing: -0.5 },
  locDenied: { fontSize: 11, color: colors.warning, marginTop: 2 },
  
  // Search Mode Selector Styles
  modeRow: { flexDirection: 'row', gap: 10, marginHorizontal: spacing.xxl, marginVertical: spacing.xs },
  modeTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  modeTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeTabText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  modeTabTextActive: { color: '#fff' },

  // Dropdown select button styles
  dropdownsRow: { flexDirection: 'row', gap: 10, marginHorizontal: spacing.xxl, marginVertical: spacing.xs },
  dropdownBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', ...shadows.card },
  dropdownBtnDisabled: { opacity: 0.5 },
  dropdownBtnText: { fontSize: 13, fontWeight: '600', color: colors.textMain, flex: 1 },

  // Tabs styles
  tabRow: { flexDirection: 'row', marginHorizontal: spacing.xxl, backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4, marginVertical: spacing.sm },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.pill },
  tabActive: { backgroundColor: colors.secondary },
  tabText: { fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.textMain },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.xxl, paddingBottom: spacing.sm },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceElevated },
  filterChipActive: { backgroundColor: colors.secondary },
  filterText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  filterTextActive: { color: colors.textMain },

  // Card design (Glassmorphism inspired)
  card: {
    flexDirection: 'row', backgroundColor: 'rgba(255, 255, 255, 0.70)',
    borderRadius: radius.xl, padding: spacing.lg, marginBottom: 12, gap: spacing.md,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.45)',
    ...shadows.card, overflow: 'hidden',
  },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E8F5FA', justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '800', color: colors.textMain, flexShrink: 1 },
  addr: { fontSize: 13, color: colors.textMuted, marginTop: 4, flexShrink: 1 },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
  dutyBadge: { backgroundColor: colors.secondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  dutyText: { color: colors.textMain, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  
  // Action buttons
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  callBtn: { flex: 1, minWidth: 110, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.secondary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, justifyContent: 'center' },
  callText: { color: colors.textMain, fontWeight: '800', fontSize: 13, flexShrink: 1 },
  mapBtn: { flex: 1, minWidth: 110, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E8F5FA', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, justifyContent: 'center' },
  mapText: { color: colors.primary, fontWeight: '800', fontSize: 13, flexShrink: 1 },
  
  // Map layouts
  viewToggle: { flexDirection: 'row', backgroundColor: colors.surfaceElevated, borderRadius: radius.pill, padding: 4 },
  toggleBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill },
  toggleBtnActive: { backgroundColor: colors.surface, ...shadows.card },
  markerContainer: { alignItems: 'center', justifyContent: 'center' },
  markerIconBg: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', borderWidth: 2, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  markerName: { fontSize: 10, fontWeight: '800', color: colors.textMain, backgroundColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 4, borderRadius: 4, marginTop: 2, overflow: 'hidden' },
  mapLoadingOverlay: { position: 'absolute', top: 20, right: 20, backgroundColor: '#fff', padding: 8, borderRadius: 20, ...shadows.card },
  mapBottomCard: { position: 'absolute', bottom: 100, left: 20, right: 20, backgroundColor: 'rgba(255, 255, 255, 0.85)', borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.45)', ...shadows.card, overflow: 'hidden' },
  closeCardBtn: { position: 'absolute', top: 12, right: 12, zIndex: 10, padding: 4 },

  // Center States (Empty, Search prompt, errors)
  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xxl },
  centerTitle: { fontSize: 18, fontWeight: '700', color: colors.textMain, marginBottom: 4 },
  centerSub: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 16, marginBottom: 16 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.error, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.pill },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xxl },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E8F5FA', justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', fontWeight: '600', paddingHorizontal: 20 },

  // Selection Modal styles
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, minHeight: '60%', maxHeight: '85%', paddingHorizontal: spacing.xxl, paddingTop: spacing.xl },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.textMain },
  searchBarContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceElevated, borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.md },
  searchInput: { flex: 1, fontSize: 14, color: colors.textMain, padding: 0 },
  modalItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  modalItemActive: { backgroundColor: 'rgba(0,0,0,0.02)' },
  modalItemText: { fontSize: 15, color: colors.textMain, fontWeight: '500' },
  modalItemTextActive: { color: colors.primary, fontWeight: '700' },
});
