import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Svg, { Rect, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import {
  Pill,
  Calendar,
  Check,
  Clock,
  Flame,
  Star,
  Box,
  Sparkles,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
  Bell,
  AlertTriangle,
  Plus,
} from 'lucide-react-native';
import { useAuth } from '../../src/AuthContext';
import { api } from '../../src/api';
import { colors, radius, spacing, shadows } from '../../src/theme';
import { t } from '../../src/i18n';
import AnimatedPressable from '../../src/components/AnimatedPressable';
import AdherenceRing from '../../src/components/AdherenceRing';
import MedicationVisual from '../../src/components/MedicationVisual';
import { hapticSuccess, hapticMedium } from '../../src/haptics';
import { setupNotifications } from '../../src/services/notifications';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ScheduleItem = {
  medication_id: string;
  medication_name: string;
  dosage: string;
  notes: string;
  scheduled_time: string;
  scheduled_date: string;
  status: 'pending' | 'taken' | 'skipped' | 'postponed';
  original_time?: string;
  postponed_time?: string;
  stock_total?: number;
  stock_take?: number;
  medication_type?: string;
  visual_shape?: any;
  visual_color?: any;
  instructions?: string;
  meal_relation?: string;
};

type MissedDose = {
  medication_id: string;
  medication_name: string;
  scheduled_date: string;
  scheduled_time: string;
};

export default function HomeScreen() {
  const { user, language } = useAuth();
  const L = t(language);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [completedExpanded, setCompletedExpanded] = useState(false);

  const fetchDashboard = async () => {
    const [s, st, m] = await Promise.all([
      api.get('/schedule/today'),
      api.get('/stats/summary'),
      api.get('/missed-doses', { params: { days: 2 } }),
    ]);
    return {
      schedule: s.data.items as ScheduleItem[],
      stats: st.data,
      missed: (m.data.missed || []) as MissedDose[],
    };
  };

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const schedule = data?.schedule || [];
  const stats = data?.stats || null;
  const missed = useMemo(() => data?.missed || [], [data?.missed]);

  // Date Formatting for Subtitle
  const dateStr = useMemo(() => {
    const today = new Date();
    if (language === 'tr') {
      const TR_DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
      const TR_MONTHS = [
        'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
      ];
      return `${today.getDate()} ${TR_MONTHS[today.getMonth()]} ${TR_DAYS[today.getDay()]}`;
    } else {
      const EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const EN_MONTHS = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      return `${EN_DAYS[today.getDay()]}, ${EN_MONTHS[today.getMonth()]} ${today.getDate()}`;
    }
  }, [language]);

  const checkAndShowMissedAlert = useCallback(async () => {
    try {
      const lastAlerted = await AsyncStorage.getItem('last_alerted_missed');
      const currentMissedKey = missed.map(m => `${m.medication_id}-${m.scheduled_date}-${m.scheduled_time}`).join(',');

      if (lastAlerted !== currentMissedKey) {
        Alert.alert(
          language === 'tr' ? 'Hatırlatma' : 'Reminder',
          language === 'tr'
            ? `Saati geçmiş ${missed.length} adet ilacınız var! Lütfen aşağıdan kontrol edip ilaçlarınızı alın.`
            : `You have ${missed.length} overdue medications! Please check below and take your medications.`,
          [{ text: language === 'tr' ? 'Tamam' : 'OK', onPress: () => AsyncStorage.setItem('last_alerted_missed', currentMissedKey) }]
        );
      }
    } catch {
      // Missed-dose alerts are non-critical.
    }
  }, [language, missed]);

  useEffect(() => {
    if (missed.length > 0) {
      void checkAndShowMissedAlert();
    }
  }, [checkAndShowMissedAlert, missed.length]);

  const onRefresh = () => { refetch(); };

  const markDose = async (item: ScheduleItem, status: 'pending' | 'taken' | 'skipped') => {
    try {
      if (status === 'taken') hapticSuccess();
      else hapticMedium();

      await api.post('/dose-logs', {
        medication_id: item.medication_id,
        scheduled_date: item.scheduled_date,
        scheduled_time: item.original_time || item.scheduled_time,
        status,
      });

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['medications'] });
    } catch (e: any) {
      Alert.alert(L.error, e?.response?.data?.detail || 'Action failed');
    }
  };

  const postponeDose = async (item: ScheduleItem, minutes: number) => {
    try {
      hapticMedium();
      const now = new Date();
      const postponedDate = new Date(now.getTime() + minutes * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, '0');
      const postponedTimeStr = `${pad(postponedDate.getHours())}:${pad(postponedDate.getMinutes())}`;

      await api.post('/dose-logs', {
        medication_id: item.medication_id,
        scheduled_date: item.scheduled_date,
        scheduled_time: item.original_time || item.scheduled_time,
        status: 'postponed',
        postponed_time: postponedTimeStr
      });

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['medications'] });
    } catch (e: any) {
      Alert.alert(L.error, e?.response?.data?.detail || 'Postpone failed');
    }
  };

  const handlePostponePress = (item: ScheduleItem) => {
    Alert.alert(
      language === 'tr' ? 'Dozu Ertele' : 'Postpone Dose',
      language === 'tr' ? 'Ne kadar süre ertelemek istersiniz?' : 'How long would you like to postpone?',
      [
        { text: language === 'tr' ? '10 Dakika' : '10 Minutes', onPress: () => postponeDose(item, 10) },
        { text: language === 'tr' ? '30 Dakika' : '30 Minutes', onPress: () => postponeDose(item, 30) },
        { text: language === 'tr' ? '1 Saat' : '1 Hour', onPress: () => postponeDose(item, 60) },
        { text: language === 'tr' ? 'İptal' : 'Cancel', style: 'cancel' }
      ]
    );
  };

  const handleEditPress = (item: ScheduleItem) => {
    Alert.alert(
      language === 'tr' ? 'Dozu Düzenle' : 'Edit Dose Log',
      language === 'tr' ? 'Bu doz için ne yapmak istersiniz?' : 'What would you like to do for this dose?',
      [
        { text: language === 'tr' ? 'Aldım Olarak İşaretle' : 'Mark as Taken', onPress: () => markDose(item, 'taken') },
        { text: language === 'tr' ? 'Atladım Olarak İşaretle' : 'Mark as Skipped', onPress: () => markDose(item, 'skipped') },
        { text: language === 'tr' ? 'Ertele...' : 'Postpone...', onPress: () => handlePostponePress(item) },
        { text: language === 'tr' ? 'Geri Al (Sıfırla)' : 'Undo (Reset to Pending)', onPress: () => markDose(item, 'pending') },
        { text: language === 'tr' ? 'İptal' : 'Cancel', style: 'cancel' }
      ]
    );
  };

  // Group Chronological List
  const { completedDoses, activeDoses, allDoses } = useMemo(() => {
    const completed: ScheduleItem[] = [];
    const active: ScheduleItem[] = [];

    for (const item of schedule) {
      if (item.status === 'taken' || item.status === 'skipped') {
        completed.push(item);
      } else {
        active.push(item);
      }
    }
    return { completedDoses: completed, activeDoses: active, allDoses: schedule };
  }, [schedule]);

  const urgentDose = activeDoses[0] || null;

  // Active counts
  const activeMedicationsCount = stats?.active_medications ?? 0;
  const todayTaken = stats?.today_taken ?? 0;
  const todayRemaining = stats?.today_remaining ?? 0;
  const todayTotal = stats?.today_total ?? 0;
  const streakDays = stats?.streak_days ?? 0;

  const adherenceProgress = todayTotal > 0 ? Math.round((todayTaken / todayTotal) * 100) : 0;

  // User First Name fallback
  const firstName = useMemo(() => {
    return user?.name?.trim()?.split(" ")[0] || (language === 'tr' ? 'Serhat' : 'User');
  }, [user?.name, language]);

  // Motivation messages
  const { motivationTitle, motivationSub } = useMemo(() => {
    if (todayTotal === 0) {
      return {
        motivationTitle: language === 'tr' ? 'Başlamaya Hazırız' : 'Ready to Start',
        motivationSub: language === 'tr' ? 'İlaçlarınızı ekleyin.' : 'Add your medications.'
      };
    }
    if (adherenceProgress === 100) {
      return {
        motivationTitle: language === 'tr' ? 'Harika gidiyorsun!' : 'Brilliant compliance!',
        motivationSub: language === 'tr' ? 'Bugünkü tüm ilaçlarını aldın.' : 'Took all meds today.'
      };
    }
    if (adherenceProgress > 0) {
      return {
        motivationTitle: language === 'tr' ? 'Harika gidiyorsun!' : 'Doing great!',
        motivationSub: language === 'tr' ? 'Böyle devam et.' : 'Keep it up.'
      };
    }
    return {
      motivationTitle: language === 'tr' ? 'İlk Doz Zamanı' : 'First Dose Time',
      motivationSub: language === 'tr' ? 'Kaydetmeye hazır mısın?' : 'Ready to log it?'
    };
  }, [adherenceProgress, todayTotal, language]);

  const renderStockText = (item: ScheduleItem) => {
    if (item.stock_total === undefined || item.stock_total === null) {
      return language === 'tr' ? 'Stok sınırı yok' : 'No stock limit';
    }
    const remaining = item.stock_total;
    if (remaining <= 0) {
      return language === 'tr' ? 'Tükendi' : 'Out';
    }
    return language === 'tr' ? `${remaining} adet` : `${remaining} left`;
  };

  const getDoseStatusClass = (item: ScheduleItem) => {
    if (item.status === 'taken') return 'taken';
    if (item.status === 'skipped') return 'skipped';
    if (item.status === 'postponed') return 'postponed';

    const now = new Date();
    const [h, m] = item.scheduled_time.split(':').map(Number);
    const doseTime = new Date();
    doseTime.setHours(h, m, 0, 0);

    const diffMs = now.getTime() - doseTime.getTime();
    const diffMin = diffMs / 60000;

    if (diffMin > 60) return 'missed';
    if (diffMin >= 0) return 'due';
    return 'pending';
  };

  const showNotificationStatus = async () => {
    try {
      const permission = await setupNotifications();
      Alert.alert(
        L.notifications,
        permission.granted ? L.notificationsEnabled : L.notificationsBlocked
      );
    } catch {
      Alert.alert(L.error, L.notificationsBlocked);
    }
  };

  if (isLoading && !data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#007AFF" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Title & Top Action bar */}
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.mainTitle}>
            {language === 'tr' ? 'Merhaba,' : 'Hello,'} {firstName} 👋
          </Text>
          <Text style={styles.mainSubtitle}>{dateStr}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor="#007AFF" />}
      >

        {/* ── 2. GRADIENT HERO WELCOME CARD ── */}
        <View style={styles.heroCard}>
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <SvgGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#2F80ED" />
                <Stop offset="100%" stopColor="#00C6FF" />
              </SvgGradient>
            </Defs>
            <Rect width="100%" height="100%" rx={28} ry={28} fill="url(#heroGrad)" />
          </Svg>

          <View style={styles.heroLeft}>
            <Text style={styles.heroGreeting}>
              {language === 'tr' ? 'Günlük Uyumunuz 📈' : 'Daily Adherence 📈'}
            </Text>
            {todayTotal > 0 ? (
              <Text style={styles.heroSummary} numberOfLines={2}>
                {language === 'tr'
                  ? `Bugün ${todayTotal} dozun var,\n${todayTaken} tanesini aldın.`
                  : `You have ${todayTotal} doses today,\ntook ${todayTaken} of them.`}
              </Text>
            ) : (
              <Text style={styles.heroSummary} numberOfLines={2}>
                {language === 'tr' ? 'Bugün planlanmış bir\nilacınız bulunmuyor.' : 'You have no scheduled\nmedications today.'}
              </Text>
            )}

            {/* motivational star row */}
            <View style={styles.motivationRow}>
              <View style={styles.starCircle}>
                <Star size={16} color="#FFD60A" fill="#FFD60A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.motivationTitle} numberOfLines={1}>{motivationTitle}</Text>
                <Text style={styles.motivationSub} numberOfLines={1}>{motivationSub}</Text>
              </View>
            </View>
          </View>

          <View style={styles.heroRight}>
            <AdherenceRing
              progress={adherenceProgress}
              size={80}
              strokeWidth={8}
              textColor="#FFFFFF"
              trackColor="rgba(255, 255, 255, 0.25)"
              customLabel={`%${adherenceProgress}`}
              customSubLabel={language === 'tr' ? 'Uyum' : 'Adh.'}
            />
          </View>
        </View>

        {/* ── 3. TODAY HEALTH SUMMARY STRIP ── */}
        <View style={styles.statsRow}>
          {/* 1. Aktif İlaç */}
          <View style={styles.statMiniCard}>
            <View style={[styles.miniBadge, { backgroundColor: '#F1EAFD' }]}>
              <Pill size={16} color="#8F5FE8" />
            </View>
            <Text style={styles.miniNum}>{activeMedicationsCount}</Text>
            <Text style={styles.miniLabel} numberOfLines={1} adjustsFontSizeToFit>{language === 'tr' ? 'Aktif İlaç' : 'Active Meds'}</Text>
          </View>

          <View style={styles.statsDivider} />

          {/* 2. Bugünkü Doz */}
          <View style={styles.statMiniCard}>
            <View style={[styles.miniBadge, { backgroundColor: '#E3F2FD' }]}>
              <Calendar size={16} color="#1E88E5" />
            </View>
            <Text style={styles.miniNum}>{todayTotal}</Text>
            <Text style={styles.miniLabel} numberOfLines={1} adjustsFontSizeToFit>{language === 'tr' ? 'Bugünkü Doz' : 'Today Doses'}</Text>
          </View>

          <View style={styles.statsDivider} />

          {/* 3. Alınan */}
          <View style={styles.statMiniCard}>
            <View style={[styles.miniBadge, { backgroundColor: '#E8F5E9' }]}>
              <Check size={16} color="#43A047" />
            </View>
            <Text style={styles.miniNum}>{todayTaken}</Text>
            <Text style={styles.miniLabel} numberOfLines={1} adjustsFontSizeToFit>{language === 'tr' ? 'Alınan' : 'Taken'}</Text>
          </View>

          <View style={styles.statsDivider} />

          {/* 4. Kalan */}
          <View style={styles.statMiniCard}>
            <View style={[styles.miniBadge, { backgroundColor: '#FFF3E0' }]}>
              <Clock size={16} color="#FB8C00" />
            </View>
            <Text style={styles.miniNum}>{todayRemaining}</Text>
            <Text style={styles.miniLabel} numberOfLines={1} adjustsFontSizeToFit>{language === 'tr' ? 'Kalan' : 'Remaining'}</Text>
          </View>

          <View style={styles.statsDivider} />

          {/* 5. Günlük Seri */}
          <View style={styles.statMiniCard}>
            <View style={[styles.miniBadge, { backgroundColor: '#FFEBEE' }]}>
              <Flame size={16} color="#E53935" fill="#E53935" />
            </View>
            <Text style={styles.miniNum}>{streakDays}</Text>
            <Text style={styles.miniLabel} numberOfLines={1} adjustsFontSizeToFit>{language === 'tr' ? 'Günlük Seri' : 'Streak Days'}</Text>
          </View>
        </View>

        {/* Missed doses alert stripe */}
        {missed.length > 0 && (
          <View style={styles.missedCard}>
            <View style={styles.missedIconCircle}>
              <AlertTriangle size={20} color="#E53935" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.missedCardTitle}>
                {missed.length} {language === 'tr' ? 'Gecikmiş İlaç Var' : 'Overdue Medications'}
              </Text>
              <Text style={styles.missedCardSub}>
                {language === 'tr' ? 'Lütfen zamanı geçen ilaçlarınızı kontrol edin.' : 'Please review your overdue doses below.'}
              </Text>
            </View>
          </View>
        )}

        {/* ── 5. URGENT NEXT DOSE CARD ── */}
        {urgentDose ? (
          <View style={styles.sectionContainer}>
            <View style={styles.urgentCard}>
              <View style={styles.urgentHeader}>
                <View style={[
                  styles.statusBadge,
                  getDoseStatusClass(urgentDose) === 'due' || getDoseStatusClass(urgentDose) === 'missed'
                    ? styles.statusBadgeDue
                    : styles.statusBadgeUpcoming
                ]}>
                  <Text style={[
                    styles.statusBadgeText,
                    getDoseStatusClass(urgentDose) === 'due' || getDoseStatusClass(urgentDose) === 'missed'
                      ? { color: '#E53935' }
                      : { color: '#1E88E5' }
                  ]}>
                    {getDoseStatusClass(urgentDose) === 'due' || getDoseStatusClass(urgentDose) === 'missed'
                      ? (language === 'tr' ? 'ZAMANI GELDİ' : 'DUE NOW')
                      : (language === 'tr' ? 'SIRADAKİ DOZ' : 'UPCOMING DOSE')}
                  </Text>
                </View>

                {/* Small right arrow */}
                <TouchableOpacity onPress={() => handleEditPress(urgentDose)}>
                  <ChevronRight size={20} color="#C7C7CC" />
                </TouchableOpacity>
              </View>

              <View style={styles.urgentContentRow}>
                {/* Rounded visual badge with glow */}
                <View style={styles.urgentVisualOuter}>
                  <MedicationVisual
                    shape={urgentDose.visual_shape || 'capsule'}
                    color={urgentDose.visual_color || 'blue'}
                    size={48}
                  />
                </View>

                {/* Text details */}
                <View style={{ flex: 1 }}>
                  <Text style={styles.urgentMedName}>{urgentDose.medication_name}</Text>
                  <Text style={styles.urgentMedDosage}>
                    {urgentDose.dosage} · {urgentDose.medication_type || 'Tablet'}
                  </Text>
                </View>
              </View>

              {/* Sub-info block */}
              <View style={styles.urgentInfoBlock}>
                {/* Saat */}
                <View style={styles.infoCol}>
                  <Clock size={16} color="#8F9BB3" />
                  <View style={styles.infoColText}>
                    <Text style={styles.infoColVal}>{urgentDose.scheduled_time}</Text>
                    <Text style={styles.infoColLbl}>{language === 'tr' ? 'Saat' : 'Time'}</Text>
                  </View>
                </View>

                <View style={styles.verticalDivider} />

                {/* Kalan Stok */}
                <View style={styles.infoCol}>
                  <Box size={16} color="#8F9BB3" />
                  <View style={styles.infoColText}>
                    <Text style={styles.infoColVal}>{renderStockText(urgentDose)}</Text>
                    <Text style={styles.infoColLbl}>{language === 'tr' ? 'Kalan Stok' : 'Stock Left'}</Text>
                  </View>
                </View>

                <View style={styles.verticalDivider} />

                {/* Kullanım */}
                <View style={styles.infoCol}>
                  <Star size={16} color="#8F9BB3" />
                  <View style={styles.infoColText}>
                    <Text style={styles.infoColVal}>
                      {urgentDose.meal_relation || (language === 'tr' ? 'Fark etmez' : 'Anytime')}
                    </Text>
                    <Text style={styles.infoColLbl}>{language === 'tr' ? 'Kullanım' : 'Relation'}</Text>
                  </View>
                </View>
              </View>

              {/* Actions row */}
              <View style={styles.urgentActionRow}>
                {/* Aldım */}
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnTaken]}
                  onPress={() => markDose(urgentDose, 'taken')}
                >
                  <Check size={16} color="#2E7D32" style={{ marginRight: 6 }} />
                  <Text style={[styles.actionBtnText, { color: '#2E7D32' }]}>
                    {language === 'tr' ? 'Aldım' : 'Took'}
                  </Text>
                </TouchableOpacity>

                {/* Ertele */}
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnPostponed]}
                  onPress={() => handlePostponePress(urgentDose)}
                >
                  <Clock size={16} color="#EF6C00" style={{ marginRight: 6 }} />
                  <Text style={[styles.actionBtnText, { color: '#EF6C00' }]}>
                    {language === 'tr' ? 'Ertele' : 'Delay'}
                  </Text>
                </TouchableOpacity>

                {/* Atladım */}
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnSkipped]}
                  onPress={() => markDose(urgentDose, 'skipped')}
                >
                  <Plus size={16} color="#C62828" style={{ marginRight: 6, transform: [{ rotate: '45deg' }] }} />
                  <Text style={[styles.actionBtnText, { color: '#C62828' }]}>
                    {language === 'tr' ? 'Atladım' : 'Skip'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Pill size={40} color="#8F9BB3" style={{ marginBottom: 12 }} />
            <Text style={styles.emptyText}>
              {language === 'tr' ? 'Bugün için planlanmış başka dozunuz yok.' : 'No other doses scheduled for today.'}
            </Text>
          </View>
        )}

        {/* ── 6. UPCOMING DOSES TIMELINE ── */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>{language === 'tr' ? 'Günün Programı' : "Today's Schedule"}</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/medications')}>
              <Text style={styles.seeAllLink}>{language === 'tr' ? 'Tümünü Gör ›' : 'See All ›'}</Text>
            </TouchableOpacity>
          </View>

          {allDoses.length === 0 ? (
            <View style={styles.emptyCardMini}>
              <Text style={styles.emptyCardTextMini}>
                {language === 'tr' ? 'Bugünlük program boş.' : 'Schedule is empty today.'}
              </Text>
            </View>
          ) : (
            <View style={styles.timelineList}>
              {allDoses.map((item, idx) => {
                const isCompleted = item.status === 'taken' || item.status === 'skipped';
                const isDue = getDoseStatusClass(item) === 'due' || getDoseStatusClass(item) === 'missed';

                return (
                  <View key={`${item.medication_id}-${item.scheduled_time}-${idx}`} style={styles.timelineRow}>
                    {/* Left: Time and status message */}
                    <View style={styles.timelineLeftCol}>
                      <Text style={[styles.timelineTime, isDue && { color: '#E53935' }]}>
                        {item.scheduled_time}
                      </Text>
                      <Text style={[
                        styles.timelineStatusLbl,
                        isDue ? { color: '#E53935' } : isCompleted ? { color: '#43A047' } : { color: '#8F9BB3' }
                      ]}>
                        {isCompleted
                          ? (item.status === 'taken' ? (language === 'tr' ? 'Alındı' : 'Taken') : (language === 'tr' ? 'Atlandı' : 'Skipped'))
                          : isDue
                            ? (language === 'tr' ? 'Zamanı Geldi' : 'Due Now')
                            : (language === 'tr' ? 'Yaklaşan' : 'Upcoming')}
                      </Text>
                    </View>

                    {/* Middle vertical timeline line with circle */}
                    <View style={styles.timelineLineContainer}>
                      <View style={[
                        styles.timelineDot,
                        isDue ? { backgroundColor: '#E53935' } : isCompleted ? { backgroundColor: '#43A047' } : { backgroundColor: '#1E88E5' }
                      ]} />
                      {idx < allDoses.length - 1 && <View style={styles.timelineConnectorLine} />}
                    </View>

                    {/* Right Card container */}
                    <TouchableOpacity
                      style={styles.timelineRightCard}
                      activeOpacity={0.75}
                      onPress={() => handleEditPress(item)}
                    >
                      <MedicationVisual
                        shape={item.visual_shape || 'capsule'}
                        color={item.visual_color || 'blue'}
                        size={36}
                      />
                      <View style={{ flex: 1, marginLeft: 10, marginRight: 6 }}>
                        <Text style={[styles.timelineMedName, item.status === 'taken' && styles.completedTextStrike]} numberOfLines={2}>
                          {item.medication_name}
                        </Text>
                        <Text style={styles.timelineMedSub} numberOfLines={1}>
                          {item.dosage} · {item.meal_relation || (language === 'tr' ? 'Aç/Tok Belirtilmedi' : 'Anytime')}
                        </Text>
                      </View>

                      {/* Far right badge status */}
                      <View style={[
                        styles.timelineBadge,
                        isDue ? { backgroundColor: '#FFEBEE' } : isCompleted ? { backgroundColor: '#E8F5E9' } : { backgroundColor: '#E3F2FD' }
                      ]}>
                        <Text style={[
                          styles.timelineBadgeText,
                          isDue ? { color: '#E53935' } : isCompleted ? { color: '#43A047' } : { color: '#1E88E5' }
                        ]}>
                          {isDue
                            ? (language === 'tr' ? 'ZAMANI GELDİ' : 'DUE')
                            : isCompleted
                              ? (item.status === 'taken' ? (language === 'tr' ? 'ALINDI' : 'TAKEN') : (language === 'tr' ? 'ATLANDI' : 'SKIPPED'))
                              : (language === 'tr' ? 'YAKLAŞAN' : 'UPCOMING')}
                        </Text>
                      </View>
                      <ChevronRight size={16} color="#C7C7CC" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* ── 7. COMPLETED DOSES SECTION ── */}
        {completedDoses.length > 0 && (
          <View style={styles.sectionContainer}>
            <TouchableOpacity
              style={styles.collapseHeader}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setCompletedExpanded(!completedExpanded);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.collapseHeading}>
                {language === 'tr' ? `Bugün Tamamlananlar (${completedDoses.length})` : `Completed Today (${completedDoses.length})`}
              </Text>
              <View style={styles.collapseHeaderRight}>
                <Text style={styles.seeAllLink}>{language === 'tr' ? 'Tümünü Gör ›' : 'See All ›'}</Text>
                {completedExpanded ? <ChevronUp size={20} color="#8F9BB3" /> : <ChevronDown size={20} color="#8F9BB3" />}
              </View>
            </TouchableOpacity>

            {completedExpanded && (
              <View style={styles.completedList}>
                {completedDoses.map((item, idx) => (
                  <View key={`completed-${idx}`} style={styles.completedRow}>
                    {/* Circle line indicators */}
                    <View style={styles.completedLeftTextCol}>
                      <Text style={styles.completedTimeVal}>{item.scheduled_time}</Text>
                      <Text style={styles.completedTimeStatusLbl}>{language === 'tr' ? 'Alındı' : 'Taken'}</Text>
                    </View>

                    <View style={styles.completedLineContainer}>
                      <View style={styles.completedDotActive}>
                        <Check size={10} color="#FFFFFF" strokeWidth={3} />
                      </View>
                      {idx < completedDoses.length - 1 && <View style={styles.completedConnectorLine} />}
                    </View>

                    {/* card element */}
                    <TouchableOpacity
                      style={styles.completedRightCard}
                      onPress={() => handleEditPress(item)}
                    >
                      <MedicationVisual
                        shape={item.visual_shape || 'capsule'}
                        color={item.visual_color || 'blue'}
                        size={36}
                      />
                      <View style={{ flex: 1, marginLeft: 10, marginRight: 6 }}>
                        <Text style={[
                          styles.completedMedTitle,
                          item.status === 'taken' && styles.completedTextStrike
                        ]} numberOfLines={2}>
                          {item.medication_name}
                        </Text>
                        <Text style={styles.completedMedSub} numberOfLines={1}>{item.dosage} · {item.meal_relation || 'Aç/Tok'}</Text>
                      </View>

                      {/* Right Check Badge */}
                      <View style={styles.completedCheckCircleBadge}>
                        <Check size={14} color="#43A047" strokeWidth={3} />
                      </View>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── 9. HEALTH INSIGHT CARD ── */}
        <View style={styles.sectionContainer}>
          <View style={styles.insightCard}>
            <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
              <Defs>
                <SvgGradient id="insightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor="#ECE8FF" />
                  <Stop offset="100%" stopColor="#F4F1FF" />
                </SvgGradient>
              </Defs>
              <Rect width="100%" height="100%" rx={20} ry={20} fill="url(#insightGrad)" />
            </Svg>

            <View style={styles.insightHeader}>
              <View style={styles.insightIconWrapper}>
                <Sparkles size={18} color="#7F56D9" fill="#7F56D9" />
              </View>
              <Text style={styles.insightTitle}>{language === 'tr' ? 'Akıllı İçgörü' : 'Smart Insight'}</Text>
            </View>

            <View style={styles.insightBodyCol}>
              <Text style={styles.insightText}>
                {language === 'tr'
                  ? 'Akşam dozlarını daha sık kaçırıyorsun. Hatırlatma saatini değiştirmek ister misin?'
                  : 'You tend to miss your evening doses more frequently. Would you like to adjust reminder times?'}
              </Text>

              <TouchableOpacity
                style={styles.insightActionBtn}
                onPress={() => router.push('/(tabs)/medications')}
              >
                <Text style={styles.insightActionBtnText}>
                  {language === 'tr' ? 'Önerileri Gör ›' : 'View Suggestions ›'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Quick Actions Grid */}
        <View style={[styles.sectionContainer, { marginBottom: 40 }]}>
          <Text style={styles.sectionHeading}>{language === 'tr' ? 'Hızlı İşlemler' : 'Quick Actions'}</Text>
          <View style={styles.quickGrid}>
            <TouchableOpacity style={styles.quickCard} onPress={() => router.push('/medication-form')}>
              <Text style={styles.quickCardIcon}>➕</Text>
              <Text style={styles.quickCardTitle}>{language === 'tr' ? 'İlaç Ekle' : 'Add Medication'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickCard} onPress={() => router.push('/scan')}>
              <Text style={styles.quickCardIcon}>📸</Text>
              <Text style={styles.quickCardTitle}>{language === 'tr' ? 'Barkod Tara' : 'Scan Barcode'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickCard} onPress={() => router.push('/(tabs)/chat')}>
              <Text style={styles.quickCardIcon}>💬</Text>
              <Text style={styles.quickCardTitle}>{language === 'tr' ? 'AI Sohbet' : 'AI Health Chat'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickCard} onPress={() => router.push('/(tabs)/pharmacy')}>
              <Text style={styles.quickCardIcon}>📍</Text>
              <Text style={styles.quickCardTitle}>{language === 'tr' ? 'Nöbetçi Eczane' : 'Duty Pharmacy'}</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 140, // Large bottom padding so no tabs overlap
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#F8F9FA',
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1C1C1E',
    letterSpacing: -0.5,
  },
  mainSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
    marginTop: 2,
  },
  addMedBtn: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  addMedBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Gradient Hero Welcome Card ──
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    paddingVertical: 10,
    paddingHorizontal: 0,
    marginVertical: 0,
    shadowColor: '#1C84FF',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 6,
    minHeight: 250,
  },
  heroLeft: {
    flex: 1,
    paddingRight: 12,
  },
  heroGreeting: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  heroSummary: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.88)',
    marginTop: 6,
    lineHeight: 22,
    fontWeight: '600',
  },
  motivationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    gap: 8,
  },
  starCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  motivationTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  motivationSub: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 1,
  },
  heroRight: {
    width: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Today Health Summary Strip ──
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EDF1F5',
  },
  statMiniCard: {
    flex: 1,
    alignItems: 'center',
  },
  statsDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#EDF1F5',
    alignSelf: 'center',
  },
  miniBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  miniNum: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  miniLabel: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },

  // Missed alert stripe
  missedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    borderRadius: 16,
    padding: 12,
    gap: 12,
    marginBottom: 14,
  },
  missedIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFCDD2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  missedCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D32F2F',
  },
  missedCardSub: {
    fontSize: 12,
    color: '#C62828',
    marginTop: 2,
  },

  // ── Urgent Next Dose Card ("ZAMANI GELDİ") ──
  sectionContainer: {
    marginVertical: 8,
  },
  urgentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 20,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#EDF1F5',
  },
  urgentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusBadgeDue: {
    backgroundColor: '#FFEBEE',
  },
  statusBadgeUpcoming: {
    backgroundColor: '#E3F2FD',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  urgentContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  urgentVisualOuter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F2F6F9',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  urgentMedName: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1C1C1E',
    letterSpacing: -0.3,
  },
  urgentMedDosage: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '600',
    marginTop: 2,
  },
  urgentInfoBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  infoCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoColText: {
    flex: 1,
  },
  infoColVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  infoColLbl: {
    fontSize: 9,
    color: '#8F9BB3',
    fontWeight: '600',
    marginTop: 1,
  },
  verticalDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 8,
  },
  urgentActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    height: 42,
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  actionBtnTaken: {
    backgroundColor: '#E8F5E9',
  },
  actionBtnPostponed: {
    backgroundColor: '#FFF3E0',
  },
  actionBtnSkipped: {
    backgroundColor: '#FFEBEE',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Günün Programı Section ──
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 18,
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
    letterSpacing: -0.3,
  },
  seeAllLink: {
    fontSize: 13,
    color: '#8F9BB3',
    fontWeight: '600',
  },
  emptyCardMini: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCardTextMini: {
    fontSize: 13,
    color: '#8F9BB3',
    fontWeight: '500',
  },
  timelineList: {
    paddingLeft: 4,
  },
  timelineRow: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'stretch',
  },
  timelineLeftCol: {
    width: 72,
    alignItems: 'flex-start',
    paddingTop: 10,
  },
  timelineTime: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  timelineStatusLbl: {
    fontSize: 9,
    color: '#8E8E93',
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  timelineLineContainer: {
    width: 24,
    alignItems: 'center',
    position: 'relative',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#007AFF',
    marginTop: 14,
    zIndex: 2,
  },
  timelineConnectorLine: {
    position: 'absolute',
    top: 20,
    bottom: -20,
    width: 2,
    backgroundColor: '#EDF1F5',
    zIndex: 1,
  },
  timelineRightCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#EDF1F5',
  },
  timelineMedName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  timelineMedSub: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '500',
    marginTop: 1,
  },
  timelineBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 6,
  },
  timelineBadgeText: {
    fontSize: 8,
    fontWeight: '800',
  },
  completedTextStrike: {
    textDecorationLine: 'line-through',
    color: '#8F9BB3',
  },

  // ── Bugün Tamamlananlar Collapsible ──
  collapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF1F5',
    marginTop: 10,
  },
  collapseHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  collapseHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  completedList: {
    marginTop: 12,
  },
  completedRow: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'stretch',
  },
  completedLeftTextCol: {
    width: 64,
    alignItems: 'flex-start',
    paddingTop: 10,
  },
  completedTimeVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8F9BB3',
  },
  completedTimeStatusLbl: {
    fontSize: 9,
    color: '#43A047',
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  completedLineContainer: {
    width: 24,
    alignItems: 'center',
    position: 'relative',
  },
  completedDotActive: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#43A047',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 11,
    zIndex: 2,
  },
  completedConnectorLine: {
    position: 'absolute',
    top: 20,
    bottom: -20,
    width: 2,
    backgroundColor: '#EDF1F5',
    zIndex: 1,
  },
  completedRightCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 12,
    opacity: 0.8,
    borderWidth: 1,
    borderColor: '#EDF1F5',
  },
  completedMedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  completedMedSub: {
    fontSize: 11,
    color: '#8F9BB3',
    fontWeight: '500',
    marginTop: 1,
  },
  completedCheckCircleBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Health Insight Card ──
  insightCard: {
    borderRadius: 20,
    padding: 22,
    shadowColor: '#7F56D9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  insightIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#4B367C',
  },
  insightBodyCol: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
  },
  insightText: {
    fontSize: 13,
    color: '#4B367C',
    lineHeight: 19,
    fontWeight: '500',
    paddingRight: 4,
  },
  insightActionBtn: {
    backgroundColor: '#7F56D9',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  insightActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // Quick actions grid
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  quickCard: {
    width: (SCREEN_WIDTH - 42) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EDF1F5',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.01,
    shadowRadius: 6,
    elevation: 1,
  },
  quickCardIcon: {
    fontSize: 22,
    marginBottom: 8,
  },
  quickCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#EDF1F5',
  },
  emptyText: {
    fontSize: 13,
    color: '#8F9BB3',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
});
