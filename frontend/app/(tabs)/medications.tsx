import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronRight, X, Bell } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { api } from '../../src/api';
import { useAuth } from '../../src/AuthContext';
import { t } from '../../src/i18n';
import { cancelMedicationReminders } from '../../src/services/notifications';
import MedicationVisual, {
  MedicationShapeType,
  MedicationColorType,
} from '../../src/components/MedicationVisual';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Types ─────────────────────────────────────────────────────────────
type Med = {
  id: string; name: string; dosage: string;
  frequency_per_day: number; times: string[];
  duration_days?: number; notes?: string;
  start_date?: string; end_date?: string;
  is_active?: boolean; meal_relation?: string;
  stock_count?: number; stock_unit?: string;
  usage_type?: string; medication_type?: string;
  visual_shape?: MedicationShapeType;
  visual_color?: MedicationColorType;
  schedule_type?: string;
  weekdays?: number[];
  interval_days?: number;
  periodic_use_days?: number;
  periodic_break_days?: number;
  periodic_cycle_type?: string;
};

type DoseLog = { id: string; status: string; scheduled_time: string; medication_id: string };

// ─── Helpers ─────────────────────────────────────────────────────────
const today = new Date();
const todayStr = today.toISOString().split('T')[0];

const TR_MONTHS = [
  'Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
  'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık',
];
const TR_DAYS = ['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'];
const TR_DAY_SHORT = ['P','S','Ç','P','C','C','P']; // Mon-Sun

function getWeekDates(): Date[] {
  const d = new Date(today);
  const dow = d.getDay(); // 0=Sun
  const mon = new Date(d);
  mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(mon);
    x.setDate(mon.getDate() + i);
    return x;
  });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isMedicationScheduledOn(m: Med, date: Date): boolean {
  const targetStr = date.toISOString().split('T')[0];

  // Determine effective schedule type
  const stype = m.schedule_type || (m.usage_type === 'needed' ? 'as_needed' : 'everyday');
  
  // PRN meds are never "scheduled" on a specific day
  if (stype === 'as_needed' || m.usage_type === 'needed') return false;

  // Date range guards
  if (m.start_date && m.start_date.length >= 10 && targetStr < m.start_date) return false;
  
  const endOk = !m.end_date || m.end_date === '' || m.end_date === 'Yok';
  if (!endOk && m.end_date && m.end_date.length >= 10) {
    if (targetStr > m.end_date) return false;
  }

  if (stype === 'everyday') {
    return true;
  } else if (stype === 'specific_days') {
    const jsDay = date.getDay(); // 0=Sun
    const weekdayIndex = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon
    return (m.weekdays || []).includes(weekdayIndex);
  } else if (stype === 'every_few_days') {
    if (!m.start_date || m.start_date.length < 10) return false;
    const start = new Date(m.start_date + 'T00:00:00');
    const target = new Date(targetStr + 'T00:00:00');
    const diffDays = Math.round((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return false;
    const interval = m.interval_days || 2;
    return diffDays % interval === 0;
  } else if (stype === 'periodic') {
    if (!m.start_date || m.start_date.length < 10) return false;
    const start = new Date(m.start_date + 'T00:00:00');
    const target = new Date(targetStr + 'T00:00:00');
    const diffDays = Math.round((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return false;
    const useDays = m.periodic_use_days || 21;
    const breakDays = m.periodic_break_days || 7;
    const cycleLen = useDays + breakDays;
    if (cycleLen <= 0) return true;
    return (diffDays % cycleLen) < useDays;
  }

  return true;
}

function groupByTime(meds: Med[]): Record<string, Med[]> {
  const g: Record<string, Med[]> = {};
  for (const m of meds) {
    if (m.is_active === false) continue;
    if (m.usage_type === 'needed') continue;
    for (const time of (m.times || [])) {
      if (!g[time]) g[time] = [];
      g[time].push(m);
    }
  }
  return g;
}

function formatFrequency(m: Med): string {
  const base = `${m.dosage || '1 doz'} · ${m.frequency_per_day}×/gün`;
  return base;
}

// ─── Week Strip ─────────────────────────────────────────────────────────
function WeekStrip({
  dates,
  selected,
  onSelect,
  meds,
}: {
  dates: Date[];
  selected: Date;
  onSelect: (d: Date) => void;
  meds: Med[];
}) {
  return (
    <View style={ws.row}>
      {dates.map((d, i) => {
        const isToday = isSameDay(d, today);
        const isSelected = isSameDay(d, selected);
        // Count regular (non-PRN) active meds scheduled on this day
        const scheduledCount = meds.filter(
          m =>
            m.is_active !== false &&
            m.usage_type !== 'needed' &&
            m.schedule_type !== 'as_needed' &&
            (m.frequency_per_day || 0) > 0 &&
            isMedicationScheduledOn(m, d)
        ).length;
        const hasMeds = scheduledCount > 0;

        return (
          <TouchableOpacity
            key={i}
            style={ws.dayCol}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onSelect(d); }}
            activeOpacity={0.7}
          >
            <Text style={[ws.letter, (isSelected || isToday) && ws.letterActive]}>
              {TR_DAY_SHORT[i]}
            </Text>

            {/* Day number circle */}
            <View
              style={[
                ws.dayCircle,
                isToday && ws.dayCircleToday,
                isSelected && !isToday && ws.dayCircleSelected,
              ]}
            >
              <Text
                style={[
                  ws.dayNumber,
                  isToday && ws.dayNumberToday,
                  isSelected && !isToday && ws.dayNumberSelected,
                ]}
              >
                {d.getDate()}
              </Text>
            </View>

            {/* Medication indicator dot */}
            {hasMeds ? (
              <View
                style={[
                  ws.medDot,
                  isSelected && ws.medDotSelected,
                  isToday && ws.medDotToday,
                ]}
              />
            ) : (
              <View style={ws.medDotEmpty} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const ws = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  dayCol: { alignItems: 'center', gap: 3 },
  letter: { fontSize: 12, fontWeight: '600', color: '#8E8E93', letterSpacing: 0.2 },
  letterActive: { color: '#1C1C1E', fontWeight: '700' },
  // Day number circle
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCircleToday: {
    backgroundColor: '#1C1C1E',
  },
  dayCircleSelected: {
    backgroundColor: '#007AFF',
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  dayNumberToday: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dayNumberSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  // Medication indicator dot
  medDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#007AFF',
  },
  medDotSelected: {
    backgroundColor: '#007AFF',
  },
  medDotToday: {
    backgroundColor: '#FFFFFF',
    opacity: 0.85,
  },
  medDotEmpty: {
    width: 5,
    height: 5,
  },
});

// ─── Dose Log Modal ─────────────────────────────────────────────────────
function DoseModal({
  med,
  time,
  onClose,
  onLog,
}: {
  med: Med | null;
  time: string;
  onClose: () => void;
  onLog: (medId: string, time: string, status: 'taken' | 'skipped') => Promise<void>;
}) {
  const [logging, setLogging] = useState<string | null>(null);

  if (!med) return null;

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const handleLog = async (status: 'taken' | 'skipped') => {
    setLogging(status);
    await onLog(med.id, time, status);
    setLogging(null);
    onClose();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={dm.overlay}>
        <View style={dm.sheet}>
          {/* Header */}
          <View style={dm.header}>
            <TouchableOpacity style={dm.closeBtn} onPress={onClose}>
              <X size={14} color="#3C3C43" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {/* Time */}
          <View style={dm.timeSection}>
            <MedicationVisual shape={med.visual_shape || 'capsule'} color={med.visual_color || 'blue'} size={56} />
            <Text style={dm.timeLabel}>Kaydedilme saati:</Text>
            <Text style={dm.timeValue}>{timeStr}</Text>
          </View>

          {/* Med card */}
          <View style={dm.medCard}>
            <View style={{ flex: 1 }}>
              <Text style={dm.medName}>{med.name}</Text>
              <Text style={dm.medSub}>
                {med.medication_type || 'Tablet'}
              </Text>
              <TouchableOpacity style={{ marginTop: 2 }}>
                <Text style={dm.medDose}>
                  {med.dosage || '1 doz'} – {time}
                  {'  '}
                  <Text style={{ color: '#007AFF' }}>›</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Action buttons */}
          <View style={dm.actions}>
            <TouchableOpacity
              style={dm.skipBtn}
              onPress={() => handleLog('skipped')}
              disabled={logging !== null}
            >
              {logging === 'skipped'
                ? <ActivityIndicator color="#007AFF" size="small" />
                : <Text style={dm.skipText}>Atlandı</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={dm.takenBtn}
              onPress={() => handleLog('taken')}
              disabled={logging !== null}
            >
              {logging === 'taken'
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={dm.takenText}>✓ Alındı</Text>}
            </TouchableOpacity>
          </View>

          {/* Bitti */}
          <TouchableOpacity style={dm.doneBtn} onPress={onClose}>
            <Text style={dm.doneText}>Bitti</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const dm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  header: { alignItems: 'flex-start', padding: 16 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: '#E5E5EA',
    justifyContent: 'center', alignItems: 'center',
  },
  timeSection: { alignItems: 'center', paddingBottom: 20, gap: 8 },
  timeLabel: { fontSize: 17, fontWeight: '500', color: '#1C1C1E' },
  timeValue: { fontSize: 34, fontWeight: '700', color: '#1C1C1E', letterSpacing: -0.5 },
  medCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, backgroundColor: '#F2F2F7',
    borderRadius: 14, padding: 14, marginBottom: 16,
  },
  medName: { fontSize: 17, fontWeight: '600', color: '#1C1C1E' },
  medSub: { fontSize: 14, color: '#8E8E93', marginTop: 2 },
  medDose: { fontSize: 14, color: '#1C1C1E', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  skipBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#E8F0FE', alignItems: 'center',
  },
  skipText: { fontSize: 16, fontWeight: '600', color: '#007AFF' },
  takenBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#007AFF', alignItems: 'center',
  },
  takenText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  doneBtn: { alignItems: 'center', paddingVertical: 12 },
  doneText: { fontSize: 16, color: '#8E8E93', fontWeight: '500' },
});

// ─── Edit Meds Modal ────────────────────────────────────────────────────────
function EditMedsModal({
  meds,
  onClose,
  onAdd,
  onDelete,
}: {
  meds: Med[];
  onClose: () => void;
  onAdd: () => void;
  onDelete: (m: Med) => void;
}) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={em.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={em.header}>
          <View style={{ width: 40 }} />
          <Text style={em.headerTitle}>İlaç Listesini Düzenleyin</Text>
          <TouchableOpacity style={em.doneBtn} onPress={onClose}>
            <Text style={em.doneBtnText}>✓</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 }}>
          {/* İlaç Ekleyin */}
          <TouchableOpacity style={em.addRow} onPress={onAdd} activeOpacity={0.7}>
            <Text style={em.addRowText}>İlaç Ekleyin</Text>
          </TouchableOpacity>

          {/* Şu Anki İlaçlar */}
          {meds.length > 0 && (
            <>
              <Text style={em.sectionLabel}>Şu Anki İlaçlar</Text>
              <View style={em.listGroup}>
                {meds.map((med, idx) => (
                  <View
                    key={med.id}
                    style={[em.medRow, idx < meds.length - 1 && em.medRowBorder]}
                  >
                    {/* Red delete button */}
                    <TouchableOpacity
                      style={em.deleteBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                        Alert.alert(
                          'İlacı Sil',
                          `"${med.name}" silinsin mi? Bu işlem geri alınamaz.`,
                          [
                            { text: 'İptal', style: 'cancel' },
                            {
                              text: 'Sil',
                              style: 'destructive',
                              onPress: () => onDelete(med),
                            },
                          ]
                        );
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={em.deleteBtnIcon}>−</Text>
                    </TouchableOpacity>

                    {/* Med visual */}
                    <MedicationVisual
                      shape={med.visual_shape || 'capsule'}
                      color={med.visual_color || 'blue'}
                      size={40}
                    />

                    {/* Med info */}
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={em.medName}>{med.name}</Text>
                      <Text style={em.medSub}>{med.medication_type || 'Tablet'}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          {meds.length === 0 && (
            <View style={em.emptyBox}>
              <Text style={em.emptyText}>Henüz ilaç eklenmedi</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const em = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F2F2F7',
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#1C1C1E' },
  doneBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  addRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  addRowText: { fontSize: 17, color: '#007AFF', fontWeight: '500' },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  listGroup: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
  },
  medRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  medRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  deleteBtnIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  medName: { fontSize: 16, fontWeight: '600', color: '#1C1C1E' },
  medSub: { fontSize: 13, color: '#8E8E93', marginTop: 1 },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 28,
    alignItems: 'center',
  },
  emptyText: { fontSize: 15, color: '#8E8E93' },
});

// ─── Main Screen ─────────────────────────────────────────────────────────
export default function MedicationsScreen() {
  const { language } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const weekDates = getWeekDates();
  const [selectedDate, setSelectedDate] = useState(today);
  const [showBanner, setShowBanner] = useState(true);
  const [doseModal, setDoseModal] = useState<{ med: Med; time: string } | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // ── Data ────────────────────────────────────────────────────────────
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['medications'],
    queryFn: async () => {
      const res = await api.get('/medications');
      return res.data as Med[];
    },
    staleTime: 1000 * 60 * 2,
    retry: 1,
  });

  const meds = data || [];
  const activeMeds = meds.filter(m => m.is_active !== false);
  const regularMeds = activeMeds.filter(m => m.usage_type !== 'needed' && m.schedule_type !== 'as_needed' && (m.frequency_per_day || 0) > 0);
  const scheduledMeds = regularMeds.filter(m => isMedicationScheduledOn(m, selectedDate));
  const timeGroups = groupByTime(scheduledMeds);
  const sortedTimes = Object.keys(timeGroups).sort();

  // ── Dose log ─────────────────────────────────────────────────────────
  const logDose = useCallback(
    async (medId: string, time: string, status: 'taken' | 'skipped') => {
      Haptics.notificationAsync(
        status === 'taken'
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      ).catch(() => {});
      await api.post('/dose-logs', {
        medication_id: medId,
        scheduled_date: todayStr,
        scheduled_time: time,
        status,
      });
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    [queryClient]
  );

  const onDeleteMed = (m: Med) => {
    Alert.alert('İlacı Sil', `"${m.name}" silinsin mi?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/medications/${m.id}`);
            await cancelMedicationReminders(m.id).catch(() => {});
            queryClient.invalidateQueries({ queryKey: ['medications'] });
          } catch (e: any) {
            Alert.alert('Hata', e?.response?.data?.detail || 'Silinemedi');
          }
        },
      },
    ]);
  };

  // ── Date display ───────────────────────────────────────────────────────
  const isToday = isSameDay(selectedDate, today);
  const dateLabel = isToday
    ? `Bugün, ${today.getDate()} ${TR_MONTHS[today.getMonth()]}`
    : `${TR_DAYS[(selectedDate.getDay() + 6) % 7]}, ${selectedDate.getDate()} ${TR_MONTHS[selectedDate.getMonth()]}`;

  if (isLoading && !data) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.loadingCenter}>
          <ActivityIndicator color="#007AFF" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Navigation title */}
      <View style={s.navBar}>
        <Text style={s.navTitle}>İlaçlar</Text>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#8E8E93" />
        }
      >
        {/* ── DATE HEADER ─────────────────────────────────────── */}
        <View style={s.dateHeader}>
          <Text style={s.dateTitle}>{dateLabel}</Text>
        </View>

        {/* ── WEEK STRIP ──────────────────────────────────────── */}
        <WeekStrip
          dates={weekDates}
          selected={selectedDate}
          onSelect={setSelectedDate}
          meds={activeMeds}
        />

        <View style={{ height: 20 }} />

        {/* ── NOTIFICATION BANNER ─────────────────────────────── */}
        {showBanner && (
          <Animated.View entering={FadeIn} style={s.banner}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={s.bannerIcon}>
                <Bell size={20} color="#007AFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.bannerTitle}>Takip Anımsatıcıları Kullanılabilir</Text>
                <Text style={s.bannerBody}>
                  Sağlık, takip anımsatıcıları gönderebilir ve onları Kritik Uyarılar olarak teslim eder.
                </Text>
                <TouchableOpacity onPress={() => Linking.openSettings()}>
                  <Text style={s.bannerLink}>Bildirim Ayarlarını Düzenle</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity style={s.bannerClose} onPress={() => setShowBanner(false)}>
              <X size={12} color="#8E8E93" strokeWidth={2.5} />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── GÜNLÜK SECTION ──────────────────────────────────── */}
        <Text style={s.sectionHeader}>Günlük</Text>

        {sortedTimes.length === 0 ? (
          <View style={s.emptyDaily}>
            <Text style={s.emptyDailyText}>Bu gün için ilaç planı yok</Text>
          </View>
        ) : (
          sortedTimes.map((time) => {
            const medsAtTime = timeGroups[time];
            return (
              <Animated.View
                key={time}
                entering={FadeInDown.springify()}
                style={s.timeGroup}
              >
                {/* Time header */}
                <View style={s.timeGroupHeader}>
                  <Text style={s.timeGroupTime}>{time}</Text>
                  <TouchableOpacity
                    style={s.timeGroupAdd}
                    onPress={() => {
                      if (medsAtTime[0]) setDoseModal({ med: medsAtTime[0], time });
                    }}
                  >
                    <Plus size={16} color="#007AFF" strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>

                {/* Meds in this time slot */}
                {medsAtTime.map((med, idx) => (
                  <TouchableOpacity
                    key={med.id}
                    style={[s.medRow, idx < medsAtTime.length - 1 && s.medRowBorder]}
                    onPress={() => setDoseModal({ med, time })}
                    activeOpacity={0.7}
                  >
                    <MedicationVisual
                      shape={med.visual_shape || 'capsule'}
                      color={med.visual_color || 'blue'}
                      size={40}
                    />
                    <Text style={s.medRowName}>{med.name}</Text>
                    <ChevronRight size={14} color="#C7C7CC" strokeWidth={2} />
                  </TouchableOpacity>
                ))}
              </Animated.View>
            );
          })
        )}


        <View style={{ height: 24 }} />

        {/* ── İLAÇLARINIZ SECTION ──────────────────────────────────────── */}
        <View style={s.myMedsHeader}>
          <Text style={s.sectionHeader}>İlaçlarınız</Text>
          <TouchableOpacity onPress={() => setShowEditModal(true)}>
            <Text style={s.editLink}>Düzenle</Text>
          </TouchableOpacity>
        </View>

        {meds.length === 0 ? (
          <View style={s.emptyMeds}>
            <Text style={s.emptyMedsText}>Henüz ilaç eklenmedi</Text>
          </View>
        ) : (
          meds.map((med, i) => (
            <Animated.View key={med.id} entering={FadeInDown.delay(i * 40).springify()}>
              <TouchableOpacity
                style={s.medCard}
                onPress={() => router.push({ pathname: '/medication-form', params: { id: med.id } })}
                onLongPress={() => onDeleteMed(med)}
                activeOpacity={0.75}
              >
                {/* Left: colored square with shape */}
                <View style={s.medCardVisual}>
                  <MedicationVisual
                    shape={med.visual_shape || 'capsule'}
                    color={med.visual_color || 'blue'}
                    size={56}
                    variant="card"
                  />
                </View>

                {/* Right: info */}
                <View style={s.medCardInfo}>
                  <Text style={s.medCardName}>{med.name}</Text>
                  <Text style={s.medCardType}>
                    {med.medication_type || 'Tablet'}
                  </Text>
                  <View style={s.medCardScheduleRow}>
                    <Text style={s.medCardSchedule}>
                      📅 {(() => {
                        const stype = med.schedule_type || (med.usage_type === 'needed' ? 'as_needed' : 'everyday');
                        if (stype === 'as_needed' || med.frequency_per_day === 0) {
                          return 'Gerektiğinde';
                        } else if (stype === 'everyday') {
                          return `Her Gün · ${med.frequency_per_day}×`;
                        } else if (stype === 'specific_days') {
                          const labels = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
                          const daysStr = (med.weekdays || []).map(d => labels[d]).join(', ');
                          return daysStr ? `${daysStr} · ${med.frequency_per_day}×` : 'Belirli Günler';
                        } else if (stype === 'every_few_days') {
                          return `Her ${med.interval_days || 2} Günde Bir · ${med.frequency_per_day}×`;
                        } else if (stype === 'periodic') {
                          return `Periyodik (${med.periodic_use_days}G Kullan / ${med.periodic_break_days}G Ara)`;
                        }
                        return 'Düzenli';
                      })()}
                    </Text>
                  </View>
                  {med.is_active === false && (
                    <View style={s.archivedBadge}>
                      <Text style={s.archivedText}>Arşivlendi</Text>
                    </View>
                  )}
                </View>

                <ChevronRight size={16} color="#C7C7CC" strokeWidth={2} />
              </TouchableOpacity>
            </Animated.View>
          ))
        )}

        {/* İlaç Ekle button */}
        <TouchableOpacity
          style={s.addMedBtn}
          onPress={() => router.push('/medication-form')}
          testID="add-medication-button"
        >
          <Text style={s.addMedText}>İlaç Ekle</Text>
        </TouchableOpacity>

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* Dose log modal */}
      {doseModal && (
        <DoseModal
          med={doseModal.med}
          time={doseModal.time}
          onClose={() => setDoseModal(null)}
          onLog={logDose}
        />
      )}

      {/* Edit Meds modal */}
      {showEditModal && (
        <EditMedsModal
          meds={meds}
          onClose={() => setShowEditModal(false)}
          onAdd={() => { setShowEditModal(false); router.push('/medication-form'); }}
          onDelete={async (med) => {
            try {
              await api.delete(`/medications/${med.id}`);
              await cancelMedicationReminders(med.id).catch(() => {});
              queryClient.invalidateQueries({ queryKey: ['medications'] });
            } catch (e: any) {
              Alert.alert('Hata', e?.response?.data?.detail || 'Silinemedi');
            }
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2F2F7' },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 0 },

  // Nav
  navBar: {
    alignItems: 'center', paddingVertical: 8,
    backgroundColor: '#F2F2F7',
  },
  navTitle: {
    fontSize: 17, fontWeight: '600', color: '#1C1C1E',
  },

  // Date header
  dateHeader: {
    alignItems: 'center', paddingTop: 8, paddingBottom: 12,
  },
  dateTitle: {
    fontSize: 24, fontWeight: '700', color: '#1C1C1E', letterSpacing: -0.3,
  },

  // Banner
  banner: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#fff', borderRadius: 14,
    marginHorizontal: 16, padding: 14, marginBottom: 16, gap: 4,
  },
  bannerIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#E8F0FE', justifyContent: 'center', alignItems: 'center',
  },
  bannerTitle: { fontSize: 15, fontWeight: '600', color: '#1C1C1E', marginBottom: 4 },
  bannerBody: { fontSize: 13, color: '#3C3C43', lineHeight: 18 },
  bannerLink: { fontSize: 13, color: '#007AFF', fontWeight: '500', marginTop: 6 },
  bannerClose: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#E5E5EA',
    justifyContent: 'center', alignItems: 'center',
  },

  // Section header
  sectionHeader: {
    fontSize: 22, fontWeight: '700', color: '#1C1C1E',
    paddingHorizontal: 16, marginBottom: 8,
  },

  // Time groups
  timeGroup: {
    backgroundColor: '#E8F4FD', borderRadius: 14,
    marginHorizontal: 16, marginBottom: 10, overflow: 'hidden',
  },
  timeGroupHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  timeGroupTime: { fontSize: 17, fontWeight: '600', color: '#1C1C1E' },
  timeGroupPrn: { fontSize: 15, fontWeight: '500', color: '#1C1C1E', flex: 1, paddingRight: 8 },
  timeGroupAdd: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  medRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#D1E9F8',
  },
  medRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  medRowName: { flex: 1, fontSize: 16, fontWeight: '500', color: '#1C1C1E' },

  // Empty daily
  emptyDaily: {
    backgroundColor: '#E8F4FD', borderRadius: 14,
    marginHorizontal: 16, marginBottom: 10,
    paddingVertical: 20, alignItems: 'center',
  },
  emptyDailyText: { fontSize: 14, color: '#8E8E93' },

  // İlaçlarınız section
  myMedsHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingRight: 16, marginBottom: 8,
  },
  editLink: { fontSize: 16, color: '#007AFF', fontWeight: '400' },
  medCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    marginHorizontal: 16, marginBottom: 10,
    overflow: 'hidden',
  },
  medCardVisual: {
    width: 80, height: 80, backgroundColor: '#E5E5EA',
    justifyContent: 'center', alignItems: 'center',
  },
  medCardInfo: { flex: 1, padding: 12 },
  medCardName: { fontSize: 17, fontWeight: '600', color: '#1C1C1E' },
  medCardType: { fontSize: 14, color: '#8E8E93', marginTop: 2 },
  medCardScheduleRow: { marginTop: 4 },
  medCardSchedule: { fontSize: 13, color: '#8E8E93' },
  archivedBadge: {
    marginTop: 4, alignSelf: 'flex-start',
    backgroundColor: '#F2F2F7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 50,
  },
  archivedText: { fontSize: 11, color: '#8E8E93', fontWeight: '600' },

  // Add med button
  addMedBtn: {
    marginHorizontal: 16, marginTop: 4, marginBottom: 8,
    backgroundColor: '#fff', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  addMedText: { fontSize: 16, color: '#007AFF', fontWeight: '500' },

  // Empty meds
  emptyMeds: {
    backgroundColor: '#fff', borderRadius: 14,
    marginHorizontal: 16, marginBottom: 10,
    paddingVertical: 24, alignItems: 'center',
  },
  emptyMedsText: { fontSize: 15, color: '#8E8E93' },
});
