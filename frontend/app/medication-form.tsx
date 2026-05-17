import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { X, Plus, Trash2, Clock } from 'lucide-react-native';
import { api } from '../src/api';
import { useAuth } from '../src/AuthContext';
import { colors, radius, spacing, shadows } from '../src/theme';
import { t } from '../src/i18n';
import { scheduleMedicationReminders, cancelMedicationReminders } from '../src/services/notifications';

export default function MedicationForm() {
  const { language } = useAuth();
  const L = t(language);
  const params = useLocalSearchParams<{ id?: string; prefill?: string }>();
  const router = useRouter();
  const isEdit = !!params.id;

  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('1');
  const [times, setTimes] = useState<string[]>(['08:00']);
  const [duration, setDuration] = useState('7');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (params.id) {
        setPageLoading(true);
        try {
          const r = await api.get(`/medications/${params.id}`);
          const m = r.data;
          setName(m.name); setDosage(m.dosage);
          setFrequency(String(m.frequency_per_day));
          setTimes(m.times); setDuration(String(m.duration_days));
          setNotes(m.notes || '');
        } catch {}
        setPageLoading(false);
      } else if (params.prefill) {
        try {
          const p = JSON.parse(params.prefill as string);
          if (p.name) setName(p.name);
          if (p.dosage) setDosage(p.dosage);
        } catch {}
      }
    })();
  }, [params.id, params.prefill]);

  const updateTime = (i: number, v: string) => {
    const next = [...times]; next[i] = v; setTimes(next);
  };

  const addTime = () => setTimes([...times, '12:00']);
  const removeTime = (i: number) => {
    if (times.length === 1) return;
    setTimes(times.filter((_, idx) => idx !== i));
  };

  const save = async () => {
    if (!name.trim() || !dosage.trim() || times.length === 0) {
      Alert.alert(L.error, language === 'tr' ? 'Lütfen tüm alanları doldurun.' : 'Please fill all fields.');
      return;
    }
    const freq = Math.max(1, parseInt(frequency) || 1);
    const dur = Math.max(1, parseInt(duration) || 1);

    setLoading(true);
    try {
      const payload = {
        name: name.trim(), dosage: dosage.trim(),
        frequency_per_day: freq, times,
        duration_days: dur, notes,
      };
      let savedId = params.id as string | undefined;
      if (isEdit && savedId) {
        await api.put(`/medications/${savedId}`, payload);
      } else {
        const r = await api.post('/medications', payload);
        savedId = r.data.id;
      }
      // Schedule daily local notifications (calendar trigger, repeats=true)
      if (savedId) {
        try {
          await scheduleMedicationReminders({
            medicationId: savedId,
            medicationName: payload.name,
            dosage: payload.dosage,
            times: payload.times,
          });
        } catch (e) { /* notifications optional on web */ }
      }
      router.back();
    } catch (e: any) {
      Alert.alert(L.error, e?.response?.data?.detail || 'Failed');
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity testID="close-form" style={styles.closeBtn} onPress={() => router.back()}>
            <X size={22} color={colors.textMain} />
          </TouchableOpacity>
          <Text style={styles.title}>{isEdit ? L.edit : L.addMedication}</Text>
          <View style={{ width: 44 }} />
        </View>

        {pageLoading ? (
          <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 100 }} />
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>{L.medName}</Text>
            <TextInput testID="med-name-input" style={styles.input} value={name} onChangeText={setName} />

            <Text style={styles.label}>{L.dosage}</Text>
            <TextInput testID="med-dosage-input" style={styles.input} value={dosage} onChangeText={setDosage} placeholder={L.dosageHint} placeholderTextColor={colors.textMuted} />

            <Text style={styles.label}>{L.frequencyPerDay}</Text>
            <TextInput testID="med-freq-input" style={styles.input} value={frequency} onChangeText={setFrequency} keyboardType="number-pad" />

            <Text style={styles.label}>{L.timesOfDay}</Text>
            {times.map((tm, i) => (
              <View key={i} style={styles.timeRow}>
                <View style={styles.timeIcon}><Clock size={16} color={colors.primary} /></View>
                <TextInput
                  testID={`time-input-${i}`}
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={tm}
                  onChangeText={(v) => updateTime(i, v)}
                  placeholder="08:00"
                  placeholderTextColor={colors.textMuted}
                />
                {times.length > 1 && (
                  <TouchableOpacity testID={`remove-time-${i}`} style={styles.removeTimeBtn} onPress={() => removeTime(i)}>
                    <Trash2 size={14} color={colors.accent} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity testID="add-time-btn" style={styles.addTimeBtn} onPress={addTime}>
              <Plus size={14} color={colors.primary} />
              <Text style={styles.addTimeText}>{L.addTime}</Text>
            </TouchableOpacity>

            <Text style={styles.label}>{L.duration}</Text>
            <TextInput testID="med-duration-input" style={styles.input} value={duration} onChangeText={setDuration} keyboardType="number-pad" />

            <Text style={styles.label}>{L.notes}</Text>
            <TextInput
              testID="med-notes-input"
              style={[styles.input, { height: 80 }]}
              value={notes}
              onChangeText={setNotes}
              placeholder={L.notesHint}
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <TouchableOpacity testID="save-med-button" style={styles.saveBtn} onPress={save} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{L.save}</Text>}
            </TouchableOpacity>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  closeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceElevated, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: colors.textMain },
  scroll: { padding: spacing.xxl, paddingBottom: 100 },
  label: { fontSize: 13, color: colors.textMuted, marginTop: spacing.lg, marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12,
    fontSize: 15, color: colors.textMain, borderWidth: 1, borderColor: colors.borderLight,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  timeIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E6F0FB', justifyContent: 'center', alignItems: 'center' },
  removeTimeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FDEEE7', justifyContent: 'center', alignItems: 'center' },
  addTimeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: '#E6F0FB', marginTop: 6 },
  addTimeText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', marginTop: spacing.xxl },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
