import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pill, Camera, MessageCircle, MapPin, Flame, CheckCircle2, Clock, XCircle, Plus } from 'lucide-react-native';
import { useAuth } from '../../src/AuthContext';
import { api } from '../../src/api';
import { colors, radius, spacing, shadows } from '../../src/theme';
import { t } from '../../src/i18n';

type ScheduleItem = {
  medication_id: string;
  medication_name: string;
  dosage: string;
  notes: string;
  scheduled_time: string;
  scheduled_date: string;
  status: 'pending' | 'taken' | 'skipped';
};

export default function HomeScreen() {
  const { user, language } = useAuth();
  const L = t(language);
  const router = useRouter();
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [s, st] = await Promise.all([api.get('/schedule/today'), api.get('/stats/summary')]);
      setSchedule(s.data.items);
      setStats(st.data);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = () => { setRefreshing(true); load(); };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return L.goodMorning;
    if (h < 18) return L.goodAfternoon;
    return L.goodEvening;
  };

  const markDose = async (item: ScheduleItem, status: 'taken' | 'skipped') => {
    try {
      await api.post('/dose-logs', {
        medication_id: item.medication_id,
        scheduled_date: item.scheduled_date,
        scheduled_time: item.scheduled_time,
        status,
      });
      load();
    } catch (e: any) {
      Alert.alert(L.error, e?.response?.data?.detail || 'Action failed');
    }
  };

  const isUpcoming = (time: string) => {
    const now = new Date();
    const [h, m] = time.split(':').map(Number);
    const dose = new Date();
    dose.setHours(h, m, 0, 0);
    const diff = (dose.getTime() - now.getTime()) / 60000;
    return diff >= 0 && diff <= 120;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>{greeting()},</Text>
          <Text testID="user-greeting" style={styles.userName}>{user?.name} 👋</Text>
        </View>

        {/* Streak */}
        {stats && stats.streak_days > 0 && (
          <View testID="streak-card" style={styles.streakCard}>
            <View style={styles.streakIcon}>
              <Flame size={28} color={colors.accent} fill={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.streakNum}>{stats.streak_days} {L.streakDays}</Text>
              <Text style={styles.streakSub}>{stats.streak_days} {L.streakMessage}</Text>
            </View>
          </View>
        )}

        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <View testID="summary-active" style={[styles.summaryCard, { borderLeftColor: colors.primary }]}>
            <Text style={styles.summaryNum}>{stats?.active_medications ?? 0}</Text>
            <Text style={styles.summaryLabel}>{L.activeMeds}</Text>
          </View>
          <View testID="summary-taken" style={[styles.summaryCard, { borderLeftColor: colors.success }]}>
            <Text style={styles.summaryNum}>{stats?.today_taken ?? 0}</Text>
            <Text style={styles.summaryLabel}>{L.takenToday}</Text>
          </View>
          <View testID="summary-remaining" style={[styles.summaryCard, { borderLeftColor: colors.warning }]}>
            <Text style={styles.summaryNum}>{stats?.today_remaining ?? 0}</Text>
            <Text style={styles.summaryLabel}>{L.remaining}</Text>
          </View>
        </View>

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>{L.quickActions}</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity testID="action-add-med" style={styles.actionCard} onPress={() => router.push('/medication-form')}>
            <View style={[styles.actionIcon, { backgroundColor: '#E6F0FB' }]}><Plus size={24} color={colors.primary} /></View>
            <Text style={styles.actionText}>{L.addMedication}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="action-scan" style={styles.actionCard} onPress={() => router.push('/scan')}>
            <View style={[styles.actionIcon, { backgroundColor: '#FDEEE7' }]}><Camera size={24} color={colors.accent} /></View>
            <Text style={styles.actionText}>{L.scanMedication}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="action-chat" style={styles.actionCard} onPress={() => router.push('/(tabs)/chat')}>
            <View style={[styles.actionIcon, { backgroundColor: '#E5F8EE' }]}><MessageCircle size={24} color={colors.secondary} /></View>
            <Text style={styles.actionText}>{L.openChat}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="action-pharmacy" style={styles.actionCard} onPress={() => router.push('/(tabs)/pharmacy')}>
            <View style={[styles.actionIcon, { backgroundColor: '#FEF5E0' }]}><MapPin size={24} color={colors.warning} /></View>
            <Text style={styles.actionText}>{L.findPharmacy}</Text>
          </TouchableOpacity>
        </View>

        {/* Today schedule */}
        <Text style={styles.sectionTitle}>{L.todaySchedule}</Text>
        {schedule.length === 0 ? (
          <View testID="empty-today" style={styles.emptyCard}>
            <View style={styles.emptyIcon}><Pill size={32} color={colors.primary} /></View>
            <Text style={styles.emptyText}>{L.noMedsToday}</Text>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {schedule.map((item, idx) => {
              const upcoming = item.status === 'pending' && isUpcoming(item.scheduled_time);
              return (
                <View
                  key={`${item.medication_id}-${item.scheduled_time}`}
                  testID={`dose-item-${idx}`}
                  style={[styles.doseCard, upcoming && styles.doseCardUpcoming]}
                >
                  <View style={styles.timeBubble}>
                    <Text style={styles.timeText}>{item.scheduled_time}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={styles.doseName}>{item.medication_name}</Text>
                    <Text style={styles.doseDosage}>{item.dosage}</Text>
                    {!!item.notes && <Text style={styles.doseNotes}>{item.notes}</Text>}
                  </View>
                  {item.status === 'pending' ? (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        testID={`mark-taken-${idx}`}
                        style={[styles.smallBtn, { backgroundColor: colors.secondary }]}
                        onPress={() => markDose(item, 'taken')}
                      >
                        <CheckCircle2 size={16} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`mark-skipped-${idx}`}
                        style={[styles.smallBtn, { backgroundColor: colors.borderMedium }]}
                        onPress={() => markDose(item, 'skipped')}
                      >
                        <XCircle size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ) : item.status === 'taken' ? (
                    <View style={[styles.statusPill, { backgroundColor: '#E5F8EE' }]}>
                      <CheckCircle2 size={14} color={colors.secondary} />
                      <Text style={[styles.statusText, { color: colors.secondary }]}>{L.taken}</Text>
                    </View>
                  ) : (
                    <View style={[styles.statusPill, { backgroundColor: '#FDEEE7' }]}>
                      <XCircle size={14} color={colors.accent} />
                      <Text style={[styles.statusText, { color: colors.accent }]}>{L.skipped}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  scroll: { padding: spacing.xxl, paddingBottom: 120 },
  header: { marginBottom: spacing.xl },
  greeting: { fontSize: 16, color: colors.textMuted, fontWeight: '500' },
  userName: { fontSize: 30, fontWeight: '800', color: colors.textMain, letterSpacing: -0.5, marginTop: 4 },
  streakCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: '#FDEEE7', ...shadows.card,
  },
  streakIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FDEEE7', justifyContent: 'center', alignItems: 'center' },
  streakNum: { fontSize: 18, fontWeight: '800', color: colors.textMain },
  streakSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.lg },
  summaryCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderLeftWidth: 4, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    borderTopColor: colors.borderLight, borderRightColor: colors.borderLight, borderBottomColor: colors.borderLight,
  },
  summaryNum: { fontSize: 22, fontWeight: '800', color: colors.textMain },
  summaryLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.textMain, marginTop: spacing.lg, marginBottom: spacing.md },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: spacing.md },
  actionCard: {
    width: '47%', backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, alignItems: 'flex-start', borderWidth: 1, borderColor: colors.borderLight,
  },
  actionIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  actionText: { fontSize: 14, fontWeight: '700', color: colors.textMain },
  emptyCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xxl, alignItems: 'center',
    borderWidth: 1, borderColor: colors.borderLight,
  },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.chatAi, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md },
  emptyText: { color: colors.textMuted, fontSize: 14, fontWeight: '500' },
  doseCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  doseCardUpcoming: { borderColor: colors.primary, backgroundColor: '#F4F9FE' },
  timeBubble: {
    width: 60, paddingVertical: 8, borderRadius: radius.md,
    backgroundColor: '#E6F0FB', alignItems: 'center',
  },
  timeText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  doseName: { fontSize: 15, fontWeight: '700', color: colors.textMain },
  doseDosage: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  doseNotes: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  smallBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  statusText: { fontSize: 12, fontWeight: '700' },
});
