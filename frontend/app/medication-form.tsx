import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Dimensions,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { X, Plus, ChevronRight, ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { api } from '../src/api';
import MedicationVisual, {
  MedicationShapeType,
  MedicationColorType,
} from '../src/components/MedicationVisual';
import { useAuth } from '../src/AuthContext';
import { t } from '../src/i18n';
import { scheduleMedicationReminders, cancelMedicationReminders } from '../src/services/notifications';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

// Med forms matching the screen requirements
const SHAPES: MedicationShapeType[] = [
  'capsule', 'tablet', 'oval', 'oblong', 'bottle', 'liquid', 'tube', 'cream',
  'patch', 'drop', 'syrup', 'injection', 'inhaler'
];

const COLORS: MedicationColorType[] = [
  'blue', 'teal', 'green', 'purple', 'pink', 'orange', 'yellow', 'gray', 'red', 'indigo', 'mint'
];

const PLAN_OPTIONS = [
  { id: 'everyday', title: 'Her Gün', subtitle: 'Dozu aynı zamanda alın' },
  { id: 'periodic', title: 'Periyodik Plana Göre', subtitle: '21 gün boyunca her gün alın ve 7 gün ara verin' },
  { id: 'specific_days', title: 'Haftanın Belirli Günlerinde', subtitle: 'Pazartesi günleri, hafta içi' },
  { id: 'every_few_days', title: 'Birkaç Günde Bir', subtitle: 'Her iki günde bir, her 3 günde bir' }
];

const TYPES = ['Tablet', 'Kapsül', 'Şurup', 'İğne', 'Krem', 'Damla', 'İnhalatör', 'Sprey', 'Toz', 'Jel'];

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export default function MedicationForm() {
  const { language } = useAuth();
  const L = t(language);
  const params = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const isEdit = !!params.id;

  // Wizard Step State (1 to 8)
  const [step, setStep] = useState(1);
  const progress = useSharedValue(1);

  // Form Field States
  const [name, setName] = useState('');
  const [medicationType, setMedicationType] = useState('Tablet');
  const [dosage, setDosage] = useState('1');
  const [planType, setPlanType] = useState('everyday');
  // Start with an empty time input so user can enter desired time manually
  const [times, setTimes] = useState<string[]>(['']);
  const [startDate, setStartDate] = useState(new Date());

  // Custom Time Picker States
  const [showTimePickerSheet, setShowTimePickerSheet] = useState(false);
  const [selectedTimeIndex, setSelectedTimeIndex] = useState<number | null>(null);
  const [tempHour, setTempHour] = useState('09');
  const [tempMinute, setTempMinute] = useState('00');
  const [durationDays, setDurationDays] = useState<string>(''); // empty means continuous / no end
  const [endDate, setEndDate] = useState<Date | null>(null);
  
  // Custom Scheduling parameters
  const [weekdays, setWeekdays] = useState<number[]>([0]); // 0=Mon, ..., 6=Sun
  const [intervalDays, setIntervalDays] = useState<number>(2); // Her X Günde Bir
  const [periodicUseDays, setPeriodicUseDays] = useState<number>(21); // Kullan
  const [periodicBreakDays, setPeriodicBreakDays] = useState<number>(7); // Ara Ver
  const [periodicCycleType, setPeriodicCycleType] = useState<string>('day');

  // Sheet/Modal Triggers
  const [showPlanSheet, setShowPlanSheet] = useState(false);
  const [showIntervalSheet, setShowIntervalSheet] = useState(false);
  const [showUseDaysSheet, setShowUseDaysSheet] = useState(false);
  const [showBreakDaysSheet, setShowBreakDaysSheet] = useState(false);
  const [showDurationModal, setShowDurationModal] = useState(false);
  const [calendarActive, setCalendarActive] = useState<'start' | 'end' | null>(null);
  
  // Design states
  const [visualShape, setVisualShape] = useState<MedicationShapeType>('capsule');
  const [leftColor, setLeftColor] = useState<MedicationColorType>('blue');
  const [rightColor, setRightColor] = useState<MedicationColorType>('blue');
  const [bgColor, setBgColor] = useState<MedicationColorType>('blue');

  // Optional info
  const [displayName, setDisplayName] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);

  // Load Data on edit
  useEffect(() => {
    if (params.id) {
      setPageLoading(true);
      api.get(`/medications/${params.id}`)
        .then(r => {
          const m = r.data;
          setName(m.name);
          setDosage(m.dosage || '1');
          setTimes(m.times && m.times.length ? m.times : ['']);
          if (m.medication_type) setMedicationType(m.medication_type);
          if (m.visual_shape) setVisualShape(m.visual_shape);
          if (m.visual_color) {
            setLeftColor(m.visual_color);
            setRightColor(m.visual_color);
            setBgColor(m.visual_color);
          }
          if (m.schedule_type) {
            setPlanType(m.schedule_type);
          } else if (m.usage_type) {
            setPlanType(m.usage_type === 'needed' ? 'as_needed' : 'everyday');
          }
          if (m.start_date) setStartDate(new Date(m.start_date));
          if (m.end_date && m.end_date !== 'Yok') setEndDate(new Date(m.end_date));
          if (m.weekdays) setWeekdays(m.weekdays);
          if (m.interval_days) setIntervalDays(m.interval_days);
          if (m.periodic_use_days) setPeriodicUseDays(m.periodic_use_days);
          if (m.periodic_break_days) setPeriodicBreakDays(m.periodic_break_days);
          if (m.periodic_cycle_type) setPeriodicCycleType(m.periodic_cycle_type);
          if (m.duration_days) setDurationDays(String(m.duration_days));
          if (m.notes) setNotes(m.notes);
        })
        .catch(console.error)
        .finally(() => setPageLoading(false));
    }
  }, [params.id]);

  const changeStep = (target: number) => {
    if (target > step) {
      if (step === 1 && !name.trim()) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        Alert.alert('Hata', 'Lütfen ilaç adını girin.');
        return;
      }
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setStep(target);
  };

  const handleAddTime = () => {
    // Add an empty time so the user can enter the desired time manually
    setTimes([...times, '']);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const handleRemoveTime = (index: number) => {
    // Allow removing any time, including the last one. Resulting list may be empty.
    const next = times.filter((_, i) => i !== index);
    setTimes(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const handleTimeChange = (index: number, val: string) => {
    const next = [...times];
    next[index] = val;
    setTimes(next);
  };

  const openTimePicker = (index: number, currentTime: string) => {
    let h = '09';
    let m = '00';
    if (currentTime && currentTime.includes(':')) {
      const parts = currentTime.split(':');
      if (parts[0]) h = parts[0];
      if (parts[1]) m = parts[1];
    }
    setTempHour(h);
    setTempMinute(m);
    setSelectedTimeIndex(index);
    setShowTimePickerSheet(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const handleConfirmTime = () => {
    if (selectedTimeIndex !== null) {
      const newTime = `${tempHour}:${tempMinute}`;
      handleTimeChange(selectedTimeIndex, newTime);
    }
    setShowTimePickerSheet(false);
    setSelectedTimeIndex(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const saveMedication = async () => {
    if (loading) return;
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});

    let durDaysVal = null;
    if (endDate && startDate) {
      durDaysVal = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }

    const validTimes = times.map(t => t.trim()).filter(t => t !== '');

    const payload = {
      name: name.trim(),
      dosage: dosage.trim() || '1 doz',
      frequency_per_day: planType === 'as_needed' ? 0 : validTimes.length,
      times: planType === 'as_needed' ? [] : validTimes,
      duration_days: durDaysVal,
      notes: notes.trim(),
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate ? endDate.toISOString().split('T')[0] : 'Yok',
      notifications_enabled: true,
      usage_type: planType === 'as_needed' ? 'needed' : 'continuous',
      medication_type: medicationType,
      visual_shape: visualShape,
      visual_color: leftColor,
      archived: false,
      schedule_type: planType,
      weekdays: planType === 'specific_days' ? weekdays : null,
      interval_days: planType === 'every_few_days' ? intervalDays : null,
      periodic_use_days: planType === 'periodic' ? periodicUseDays : null,
      periodic_break_days: planType === 'periodic' ? periodicBreakDays : null,
      periodic_cycle_type: planType === 'periodic' ? periodicCycleType : 'day',
    };

    try {
      let savedId = params.id as string | undefined;
      if (isEdit && savedId) {
        await api.put(`/medications/${savedId}`, payload);
      } else {
        const r = await api.post('/medications', payload);
        savedId = r.data.id;
      }

      if (savedId && times.length > 0 && planType !== 'as_needed') {
        await scheduleMedicationReminders({
          medicationId: savedId,
          medicationName: payload.name,
          dosage: payload.dosage,
          times: payload.times,
        }).catch(console.warn);
      }

      Alert.alert('Başarılı', 'İlaç kaydedildi', [
        { text: 'Tamam', onPress: () => router.back() }
      ]);
    } catch (e: any) {
      console.error(e);
      Alert.alert('Hata', e?.response?.data?.detail || 'Kaydetme başarısız oldu.');
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#007AFF" size="large" />
      </View>
    );
  }

  const formatDateDisplay = (d: Date) => {
    return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  };

  const getNextBreakStr = () => {
    try {
      const nextBreakDate = new Date(startDate.getTime());
      nextBreakDate.setDate(startDate.getDate() + periodicUseDays);
      return `${nextBreakDate.getDate()} ${TR_MONTHS[nextBreakDate.getMonth()]}`;
    } catch {
      return '';
    }
  };

  const dateStr = formatDateDisplay(startDate);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        
        {/* Nav Header */}
        <View style={s.header}>
          <TouchableOpacity style={s.navBtn} onPress={() => step > 1 ? changeStep(step - 1) : router.back()}>
            {step > 1 ? <ChevronLeft size={24} color="#007AFF" /> : <X size={24} color="#8E8E93" />}
          </TouchableOpacity>
          <Text style={s.headerTitle}>{isEdit ? 'İlacı Düzenle' : 'İlaç Ekle'}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          
          {/* STEP 1: İlaç Adı */}
          {step === 1 && (
            <Animated.View style={s.stepWrap}>
              <Text style={s.title}>İlacın Adı Nedir?</Text>
              <TextInput
                style={s.input}
                placeholder="İlaç Adı"
                value={name}
                onChangeText={setName}
                autoFocus
              />
              <TouchableOpacity style={s.primaryBtn} onPress={() => changeStep(2)}>
                <Text style={s.primaryBtnText}>İleri</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* STEP 2: İlaç Türü */}
          {step === 2 && (
            <Animated.View style={s.stepWrap}>
              <Text style={s.title}>Bu nasıl bir ilaç?</Text>
              <View style={s.listGroup}>
                {TYPES.map((t, idx) => (
                  <TouchableOpacity
                    key={t}
                    style={[s.listItem, medicationType === t && s.listItemActive, idx === TYPES.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => setMedicationType(t)}
                  >
                    <Text style={[s.listItemText, medicationType === t && s.listItemTextActive]}>{t}</Text>
                    {medicationType === t && <Text style={{ color: '#007AFF', fontWeight: 'bold' }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={s.primaryBtn} onPress={() => changeStep(3)}>
                <Text style={s.primaryBtnText}>İleri</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* STEP 3: Doz */}
          {step === 3 && (
            <Animated.View style={s.stepWrap}>
              <Text style={s.title}>Bir doz ne kadar?</Text>
              <TextInput
                style={s.input}
                placeholder="Örn: 1 tablet, 5 ml, 500 mg"
                value={dosage}
                onChangeText={setDosage}
                autoFocus
              />
              <TouchableOpacity style={s.primaryBtn} onPress={() => changeStep(4)}>
                <Text style={s.primaryBtnText}>İleri</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* STEP 4: Plan */}
          {step === 4 && (
            <Animated.View style={s.stepWrap}>
              <Text style={s.title}>Bunu ne zaman alacaksınız?</Text>
              <Text style={s.subtitle}>Plan Seçenekleri</Text>
              
              <View style={s.listGroup}>
                {PLAN_OPTIONS.map((opt, idx) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[s.listItem, planType === opt.id && s.listItemActive, idx === PLAN_OPTIONS.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => setPlanType(opt.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.listItemText, planType === opt.id && s.listItemTextActive]}>{opt.title}</Text>
                      <Text style={s.listItemSub}>{opt.subtitle}</Text>
                    </View>
                    {planType === opt.id && <Text style={{ color: '#007AFF', fontWeight: 'bold' }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={s.primaryBtn} onPress={() => changeStep(5)}>
                <Text style={s.primaryBtnText}>İleri</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* STEP 5: Zamanlamayı Düzenle */}
          {step === 5 && (
            <Animated.View style={s.stepWrap}>
              <Text style={s.title}>Zamanlamayı Düzenle</Text>
              
              {/* Sıklık Seçici */}
              <View style={s.listGroup}>
                <View style={[s.listItem, { justifyContent: 'space-between' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, color: '#8E8E93', fontWeight: '500', marginBottom: 2 }}>Bunu ne zaman alacaksınız?</Text>
                    <Text style={s.listItemText}>
                      {PLAN_OPTIONS.find(o => o.id === planType)?.title || 'Her Gün'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowPlanSheet(true)}>
                    <Text style={{ color: '#007AFF', fontSize: 17, fontWeight: '500' }}>Değiştir</Text>
                  </TouchableOpacity>
                </View>

                {/* Sıklık Detayları */}
                {planType === 'everyday' && (
                  <View style={[s.listItem, { justifyContent: 'space-between', borderBottomWidth: 0 }]}>
                    <Text style={s.listItemText}>Her</Text>
                    <Text style={{ color: '#8E8E93', fontSize: 17 }}>Gün</Text>
                  </View>
                )}

                {planType === 'every_few_days' && (
                  <TouchableOpacity
                    style={[s.listItem, { justifyContent: 'space-between', borderBottomWidth: 0 }]}
                    onPress={() => setShowIntervalSheet(true)}
                  >
                    <Text style={s.listItemText}>Aralık</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ color: '#007AFF', fontSize: 17 }}>
                        {`Her ${intervalDays === 2 ? 'İki' : intervalDays} Günde Bir`}
                      </Text>
                      <Text style={{ color: '#C7C7CC', fontSize: 17 }}>›</Text>
                    </View>
                  </TouchableOpacity>
                )}

                {planType === 'periodic' && (
                  <View style={[s.listItem, { justifyContent: 'space-between', borderBottomWidth: 0 }]}>
                    <Text style={s.listItemText}>Her</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ color: '#8E8E93', fontSize: 17 }}>Gün</Text>
                      <Text style={{ color: '#8E8E93', fontSize: 12 }}>↕</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Haftanın Belirli Günleri Seçici */}
              {planType === 'specific_days' && (
                <View style={{ marginBottom: 24 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#8E8E93', marginBottom: 8 }}>Şu günlerde:</Text>
                  <View style={s.weekdaysRow}>
                    {['P', 'S', 'Ç', 'P', 'C', 'C', 'P'].map((dayLabel, idx) => {
                      const isSel = weekdays.includes(idx);
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={[s.weekdayCircle, isSel && s.weekdayCircleSelected]}
                          onPress={() => {
                            if (weekdays.includes(idx)) {
                              if (weekdays.length > 1) {
                                setWeekdays(weekdays.filter(d => d !== idx));
                              }
                            } else {
                              setWeekdays([...weekdays, idx].sort());
                            }
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          }}
                        >
                          <Text style={[s.weekdayText, isSel && s.weekdayTextSelected]}>
                            {dayLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: '#C6C6C8', marginTop: 12 }} />
                </View>
              )}

              {/* Saatler listesi */}
              {planType !== 'as_needed' && (
                <>
                  <Text style={s.sectionHeader}>Saat kaçta?</Text>
                  <View style={s.listGroup}>
                    {times.map((time, idx) => (
                      <View key={idx} style={[s.listItem, { justifyContent: 'space-between' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <TouchableOpacity onPress={() => handleRemoveTime(idx)} style={s.minusBtn}>
                            <Text style={s.minusBtnText}>−</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={s.timePressable}
                            onPress={() => openTimePicker(idx, time)}
                          >
                            <Text style={[s.timeText, !time && s.timeTextPlaceholder]}>
                              {time || 'Saat Seçin'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={{ color: '#8E8E93', fontSize: 15 }}>1 {medicationType.toLowerCase()}</Text>
                      </View>
                    ))}

                    <TouchableOpacity style={[s.listItem, { borderBottomWidth: 0 }]} onPress={handleAddTime}>
                      <Text style={{ color: '#007AFF', fontSize: 17, fontWeight: '500' }}>+ Bir Zaman Ekleyin</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={{ fontSize: 13, color: '#8E8E93', marginHorizontal: 4, marginTop: 8, marginBottom: 24, lineHeight: 18 }}>
                    Bir zaman belirlerseniz Sağlık, ilaçlarınızı almanız için bir bildirim gönderir.
                  </Text>
                </>
              )}

              {/* Döngü Nedir? */}
              {planType === 'periodic' && (
                <>
                  <Text style={s.sectionHeader}>Döngü Nedir?</Text>
                  <View style={s.listGroup}>
                    <TouchableOpacity
                      style={[s.listItem, { justifyContent: 'space-between' }]}
                      onPress={() => setShowUseDaysSheet(true)}
                    >
                      <Text style={s.listItemText}>Kullan:</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ color: '#007AFF', fontSize: 17 }}>{periodicUseDays} gün</Text>
                        <Text style={{ color: '#C7C7CC', fontSize: 17 }}>↕</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[s.listItem, { justifyContent: 'space-between', borderBottomWidth: 0 }]}
                      onPress={() => setShowBreakDaysSheet(true)}
                    >
                      <Text style={s.listItemText}>Ara Ver:</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ color: '#007AFF', fontSize: 17 }}>{periodicBreakDays} gün</Text>
                        <Text style={{ color: '#C7C7CC', fontSize: 17 }}>↕</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                  <Text style={{ fontSize: 13, color: '#8E8E93', marginHorizontal: 4, marginTop: -14, marginBottom: 24 }}>
                    {`Sonraki Ara: ${getNextBreakStr()}`}
                  </Text>
                </>
              )}

              {/* Süre */}
              {planType !== 'as_needed' && (
                <>
                  <Text style={s.sectionHeader}>Süre</Text>
                  <View style={s.listGroup}>
                    <View style={[s.listItem, { paddingVertical: 12 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, color: '#8E8E93', fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 }}>BAŞLANGIÇ TARİHİ</Text>
                        <Text style={{ fontSize: 17, color: '#000000', fontWeight: '500' }}>
                          {`${startDate.getDate()} ${TR_MONTHS[startDate.getMonth()]} ${startDate.getFullYear() === new Date().getFullYear() ? '(Bugün)' : startDate.getFullYear()}`}
                        </Text>
                      </View>
                      <View style={{ width: StyleSheet.hairlineWidth, height: 36, backgroundColor: '#C6C6C8', marginHorizontal: 12 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, color: '#8E8E93', fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 }}>BİTİŞ TARİHİ</Text>
                        <Text style={{ fontSize: 17, color: '#000000', fontWeight: '500' }}>
                          {endDate ? `${endDate.getDate()} ${TR_MONTHS[endDate.getMonth()]}` : 'Yok'}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[s.listItem, { borderBottomWidth: 0, justifyContent: 'center' }]}
                      onPress={() => setShowDurationModal(true)}
                    >
                      <Text style={{ color: '#007AFF', fontSize: 17, fontWeight: '500' }}>Düzenle</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              <TouchableOpacity style={s.primaryBtn} onPress={() => changeStep(6)}>
                <Text style={s.primaryBtnText}>İleri</Text>
              </TouchableOpacity>

              {/* Custom Time Picker Sheet Modal */}
              <Modal transparent visible={showTimePickerSheet} animationType="slide" onRequestClose={() => setShowTimePickerSheet(false)}>
                <View style={s.modalOverlay}>
                  <View style={[s.modalSheet, { maxHeight: '60%' }]}>
                    <View style={s.modalHeader}>
                      <Text style={s.modalHeaderTitle}>Saat Seçin</Text>
                      <TouchableOpacity onPress={() => setShowTimePickerSheet(false)}>
                        <X size={24} color="#8E8E93" />
                      </TouchableOpacity>
                    </View>
                    
                    <View style={{ flexDirection: 'row', padding: 16, gap: 16 }}>
                      {/* Hour Column */}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: '#8E8E93', fontWeight: '600', marginBottom: 8, textAlign: 'center' }}>SAAT</Text>
                        <ScrollView style={{ height: 200 }} showsVerticalScrollIndicator={false}>
                          {HOURS.map((h) => {
                            const isSel = tempHour === h;
                            return (
                              <TouchableOpacity
                                key={h}
                                style={[s.timePickerItem, isSel && s.timePickerItemActive]}
                                onPress={() => {
                                  setTempHour(h);
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                                }}
                              >
                                <Text style={[s.timePickerItemText, isSel && s.timePickerItemTextActive]}>
                                  {h}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>

                      {/* Minute Column */}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: '#8E8E93', fontWeight: '600', marginBottom: 8, textAlign: 'center' }}>DAKİKA</Text>
                        <ScrollView style={{ height: 200 }} showsVerticalScrollIndicator={false}>
                          {MINUTES.map((m) => {
                            const isSel = tempMinute === m;
                            return (
                              <TouchableOpacity
                                key={m}
                                style={[s.timePickerItem, isSel && s.timePickerItemActive]}
                                onPress={() => {
                                  setTempMinute(m);
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                                }}
                              >
                                <Text style={[s.timePickerItemText, isSel && s.timePickerItemTextActive]}>
                                  {m}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
                      <TouchableOpacity
                        style={[s.primaryBtn, { flex: 1, backgroundColor: '#E5E5EA', marginTop: 0 }]}
                        onPress={() => setShowTimePickerSheet(false)}
                      >
                        <Text style={[s.primaryBtnText, { color: '#000000' }]}>İptal</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.primaryBtn, { flex: 1, marginTop: 0 }]}
                        onPress={handleConfirmTime}
                      >
                        <Text style={s.primaryBtnText}>Kaydet</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>

              {/* Plan Type Picker Sheet Modal */}
              <Modal transparent visible={showPlanSheet} animationType="slide" onRequestClose={() => setShowPlanSheet(false)}>
                <View style={s.modalOverlay}>
                  <View style={s.modalSheet}>
                    <View style={s.modalHeader}>
                      <Text style={s.modalHeaderTitle}>Bunu ne zaman alacaksınız?</Text>
                      <TouchableOpacity onPress={() => setShowPlanSheet(false)}>
                        <X size={24} color="#8E8E93" />
                      </TouchableOpacity>
                    </View>
                    <ScrollView>
                      {PLAN_OPTIONS.map((opt) => (
                        <TouchableOpacity
                          key={opt.id}
                          style={s.modalItem}
                          onPress={() => {
                            setPlanType(opt.id);
                            setShowPlanSheet(false);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={s.modalItemText}>{opt.title}</Text>
                            <Text style={s.modalItemSub}>{opt.subtitle}</Text>
                          </View>
                          {planType === opt.id && <Text style={s.checkmark}>✓</Text>}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              </Modal>

              {/* Interval Picker Sheet Modal */}
              <Modal transparent visible={showIntervalSheet} animationType="slide" onRequestClose={() => setShowIntervalSheet(false)}>
                <View style={s.modalOverlay}>
                  <View style={s.modalSheet}>
                    <View style={s.modalHeader}>
                      <Text style={s.modalHeaderTitle}>Aralık Seçin</Text>
                      <TouchableOpacity onPress={() => setShowIntervalSheet(false)}>
                        <X size={24} color="#8E8E93" />
                      </TouchableOpacity>
                    </View>
                    <ScrollView style={{ maxHeight: 300 }}>
                      {Array.from({ length: 98 }, (_, i) => i + 2).map((val) => {
                        const lbl = `Her ${val === 2 ? 'İki' : val} Günde Bir`;
                        return (
                          <TouchableOpacity
                            key={val}
                            style={s.modalItem}
                            onPress={() => {
                              setIntervalDays(val);
                              setShowIntervalSheet(false);
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            }}
                          >
                            <Text style={s.modalItemText}>{lbl}</Text>
                            {intervalDays === val && <Text style={s.checkmark}>✓</Text>}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
              </Modal>

              {/* Use Days Picker Sheet */}
              <Modal transparent visible={showUseDaysSheet} animationType="slide" onRequestClose={() => setShowUseDaysSheet(false)}>
                <View style={s.modalOverlay}>
                  <View style={s.modalSheet}>
                    <View style={s.modalHeader}>
                      <Text style={s.modalHeaderTitle}>Kullanma Süresi</Text>
                      <TouchableOpacity onPress={() => setShowUseDaysSheet(false)}>
                        <X size={24} color="#8E8E93" />
                      </TouchableOpacity>
                    </View>
                    <ScrollView style={{ maxHeight: 300 }}>
                      {Array.from({ length: 99 }, (_, i) => i + 1).map((val) => (
                        <TouchableOpacity
                          key={val}
                          style={s.modalItem}
                          onPress={() => {
                            setPeriodicUseDays(val);
                            setShowUseDaysSheet(false);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          }}
                        >
                          <Text style={s.modalItemText}>{val} gün</Text>
                          {periodicUseDays === val && <Text style={s.checkmark}>✓</Text>}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              </Modal>

              {/* Break Days Picker Sheet */}
              <Modal transparent visible={showBreakDaysSheet} animationType="slide" onRequestClose={() => setShowBreakDaysSheet(false)}>
                <View style={s.modalOverlay}>
                  <View style={s.modalSheet}>
                    <View style={s.modalHeader}>
                      <Text style={s.modalHeaderTitle}>Ara Verme Süresi</Text>
                      <TouchableOpacity onPress={() => setShowBreakDaysSheet(false)}>
                        <X size={24} color="#8E8E93" />
                      </TouchableOpacity>
                    </View>
                    <ScrollView style={{ maxHeight: 300 }}>
                      {Array.from({ length: 100 }, (_, i) => i).map((val) => (
                        <TouchableOpacity
                          key={val}
                          style={s.modalItem}
                          onPress={() => {
                            setPeriodicBreakDays(val);
                            setShowBreakDaysSheet(false);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          }}
                        >
                          <Text style={s.modalItemText}>{val === 0 ? 'Ara Yok' : `${val} gün`}</Text>
                          {periodicBreakDays === val && <Text style={s.checkmark}>✓</Text>}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              </Modal>

              {/* Duration Edit Modal */}
              <Modal transparent visible={showDurationModal} animationType="slide" onRequestClose={() => setShowDurationModal(false)}>
                <View style={s.modalOverlay}>
                  <View style={[s.modalSheet, { flex: 0.9, backgroundColor: '#F2F2F7', paddingBottom: 0 }]}>
                    <View style={[s.modalHeader, { borderBottomWidth: 0, backgroundColor: '#F2F2F7' }]}>
                      <TouchableOpacity onPress={() => setShowDurationModal(false)} style={s.modalCloseBtn}>
                        <X size={18} color="#000" />
                      </TouchableOpacity>
                      <Text style={s.modalHeaderTitle}>Süreyi Düzenleyin</Text>
                      <TouchableOpacity
                        onPress={() => {
                          setShowDurationModal(false);
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                        }}
                        style={s.modalDoneBtn}
                      >
                        <Text style={s.modalDoneBtnText}>✓</Text>
                      </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={{ padding: 16 }}>
                      <View style={s.listGroup}>
                        {/* Başlangıç Tarihi */}
                        <TouchableOpacity
                          style={[s.listItem, { justifyContent: 'space-between', flexDirection: 'column', alignItems: 'stretch' }]}
                          onPress={() => {
                            setCalendarActive(calendarActive === 'start' ? null : 'start');
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={s.listItemText}>Başlangıç Tarihi</Text>
                            <View style={s.pillBtn}>
                              <Text style={s.pillBtnText}>{formatDateDisplay(startDate)}</Text>
                            </View>
                          </View>
                          {calendarActive === 'start' && (
                            <CustomCalendar
                              value={startDate}
                              onChange={(d) => {
                                setStartDate(d);
                                if (endDate && d > endDate) {
                                  setEndDate(null);
                                }
                              }}
                            />
                          )}
                        </TouchableOpacity>

                        {/* Bitiş Tarihi */}
                        <TouchableOpacity
                          style={[s.listItem, { justifyContent: 'space-between', flexDirection: 'column', alignItems: 'stretch', borderBottomWidth: 0 }]}
                          onPress={() => {
                            setCalendarActive(calendarActive === 'end' ? null : 'end');
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={s.listItemText}>Bitiş Tarihi</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <View style={s.pillBtn}>
                                <Text style={s.pillBtnText}>{endDate ? formatDateDisplay(endDate) : 'Yok'}</Text>
                              </View>
                              {endDate && (
                                <TouchableOpacity
                                  style={s.clearBtn}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    setEndDate(null);
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                                  }}
                                >
                                  <X size={10} color="#FFF" />
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                          {calendarActive === 'end' && (
                            <CustomCalendar
                              value={endDate || new Date()}
                              onChange={(d) => {
                                if (d >= startDate) {
                                  setEndDate(d);
                                } else {
                                  Alert.alert('Geçersiz Tarih', 'Bitiş tarihi başlangıç tarihinden önce olamaz.');
                                }
                              }}
                            />
                          )}
                        </TouchableOpacity>
                      </View>

                      <View style={s.listGroup}>
                        <View style={[s.listItem, { justifyContent: 'space-between', borderBottomWidth: 0 }]}>
                          <Text style={s.listItemText}>Plan Süresi</Text>
                          <Text style={s.listItemValueText}>
                            {endDate
                              ? `${Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1} gün`
                              : 'Süresiz'}
                          </Text>
                        </View>
                      </View>
                    </ScrollView>
                  </View>
                </View>
              </Modal>
            </Animated.View>
          )}

          {/* STEP 6: Şekil Seçin */}
          {step === 6 && (
            <Animated.View style={s.stepWrap}>
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <MedicationVisual shape={visualShape} color={leftColor} size={100} />
              </View>

              <Text style={s.title}>Şekli Seçin</Text>
              
              <View style={s.grid}>
                {SHAPES.slice(0, 8).map(sh => (
                  <TouchableOpacity
                    key={sh}
                    style={[s.gridItem, visualShape === sh && s.gridItemActive]}
                    onPress={() => setVisualShape(sh)}
                  >
                    <MedicationVisual shape={sh} color={visualShape === sh ? leftColor : 'gray'} size={50} />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.sectionHeader}>Daha Fazlası</Text>
              <View style={s.grid}>
                {SHAPES.slice(8).map(sh => (
                  <TouchableOpacity
                    key={sh}
                    style={[s.gridItem, visualShape === sh && s.gridItemActive]}
                    onPress={() => setVisualShape(sh)}
                  >
                    <MedicationVisual shape={sh} color={visualShape === sh ? leftColor : 'gray'} size={50} />
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={s.primaryBtn} onPress={() => changeStep(7)}>
                <Text style={s.primaryBtnText}>İleri</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* STEP 7: Renkleri Seçin */}
          {step === 7 && (
            <Animated.View style={s.stepWrap}>
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <MedicationVisual shape={visualShape} color={leftColor} size={100} />
              </View>

              <Text style={s.title}>Renkleri Seçin</Text>

              <Text style={s.sectionHeader}>Sol Taraf / Genel Renk</Text>
              <View style={s.colorRow}>
                {COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[s.colorCircle, { backgroundColor: c === 'blue' ? '#0A84FF' : c === 'teal' ? '#32ADE6' : c === 'green' ? '#30D158' : c === 'purple' ? '#BF5AF2' : c === 'pink' ? '#FF375F' : c === 'orange' ? '#FF9F0A' : c === 'yellow' ? '#FFD60A' : c === 'gray' ? '#8E8E93' : c === 'red' ? '#FF3B30' : c === 'indigo' ? '#5E5CE6' : '#00C7BE' }, leftColor === c && s.colorCircleActive]}
                    onPress={() => { setLeftColor(c); setRightColor(c); setBgColor(c); }}
                  />
                ))}
              </View>

              <TouchableOpacity style={s.primaryBtn} onPress={() => changeStep(8)}>
                <Text style={s.primaryBtnText}>İleri</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* STEP 8: Gözden Geçir & Bitti */}
          {step === 8 && (
            <Animated.View style={s.stepWrap}>
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <MedicationVisual shape={visualShape} color={leftColor} size={100} />
              </View>

              <Text style={s.title}>Ayrıntıları Gözden Geçirin</Text>

              <View style={s.listGroup}>
                <View style={s.listItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.listItemLabel}>İlaç Adı</Text>
                    <TextInput style={s.listItemValueInput} value={name} onChangeText={setName} />
                  </View>
                </View>
                <View style={s.listItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.listItemLabel}>Tür</Text>
                    <Text style={s.listItemValueText}>{medicationType}</Text>
                  </View>
                </View>
                <View style={s.listItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.listItemLabel}>Plan</Text>
                    <Text style={s.listItemValueText}>
                      {times.join(', ')} ({PLAN_OPTIONS.find(o => o.id === planType)?.title})
                    </Text>
                  </View>
                </View>
                <View style={[s.listItem, { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.listItemLabel}>İsteğe Bağlı Ayrıntılar</Text>
                    <TextInput
                      style={s.listItemValueInput}
                      value={notes}
                      onChangeText={setNotes}
                      placeholder="Notlar ekle..."
                    />
                  </View>
                </View>
              </View>

              <TouchableOpacity style={s.saveBtn} onPress={saveMedication} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Bitti</Text>}
              </TouchableOpacity>
            </Animated.View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CustomCalendar({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const [currentMonth, setCurrentMonth] = useState(new Date(value.getFullYear(), value.getMonth(), 1));

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const totalDays = new Date(year, month + 1, 0).getDate();
  let firstDayIndex = new Date(year, month, 1).getDay();
  firstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

  const daysArray = [];
  for (let i = 0; i < firstDayIndex; i++) {
    daysArray.push(null);
  }
  for (let d = 1; d <= totalDays; d++) {
    daysArray.push(new Date(year, month, d));
  }

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const isSelected = (d: Date | null) => {
    if (!d) return false;
    return d.getDate() === value.getDate() &&
      d.getMonth() === value.getMonth() &&
      d.getFullYear() === value.getFullYear();
  };

  const isToday = (d: Date | null) => {
    if (!d) return false;
    const now = new Date();
    return d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
  };

  return (
    <View style={cal.container}>
      <View style={cal.header}>
        <TouchableOpacity onPress={handlePrevMonth} style={cal.headerBtn}>
          <ChevronLeft size={16} color="#007AFF" />
        </TouchableOpacity>
        <Text style={cal.headerTitle}>{TR_MONTHS[month]} {year}</Text>
        <TouchableOpacity onPress={handleNextMonth} style={cal.headerBtn}>
          <ChevronRight size={16} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <View style={cal.weekdaysRow}>
        {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'].map((dayLabel, idx) => (
          <Text key={idx} style={cal.weekdayText}>{dayLabel}</Text>
        ))}
      </View>

      <View style={cal.grid}>
        {daysArray.map((dayDate, idx) => {
          if (!dayDate) {
            return <View key={`empty-${idx}`} style={cal.dayCell} />;
          }
          const selected = isSelected(dayDate);
          const today = isToday(dayDate);
          return (
            <TouchableOpacity
              key={`day-${idx}`}
              style={[cal.dayCell, selected && cal.dayCellSelected]}
              onPress={() => onChange(dayDate)}
            >
              <Text style={[cal.dayText, selected && cal.dayTextSelected, today && !selected && cal.dayTextToday]}>
                {dayDate.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const cal = StyleSheet.create({
  container: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, marginTop: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E5E5EA' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  headerBtn: { padding: 6 },
  headerTitle: { fontSize: 15, fontWeight: '600', color: '#000000' },
  weekdaysRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 6 },
  weekdayText: { fontSize: 12, color: '#8E8E93', fontWeight: '500', width: 36, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, height: 32, justifyContent: 'center', alignItems: 'center', marginVertical: 2 },
  dayCellSelected: { backgroundColor: '#007AFF', borderRadius: 16 },
  dayText: { fontSize: 14, color: '#000000' },
  dayTextSelected: { color: '#FFFFFF', fontWeight: '600' },
  dayTextToday: { color: '#007AFF', fontWeight: '700' },
});

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2F2F7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#C6C6C8',
    backgroundColor: '#F2F2F7',
  },
  navBtn: { padding: 8 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#000000' },
  scroll: { paddingBottom: 40 },
  stepWrap: { padding: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#000000', marginBottom: 20 },
  subtitle: { fontSize: 15, fontWeight: '600', color: '#8E8E93', marginBottom: 8, textTransform: 'uppercase' },
  sectionHeader: { fontSize: 15, fontWeight: '600', color: '#8E8E93', marginTop: 24, marginBottom: 8, textTransform: 'uppercase', paddingHorizontal: 4 },
  input: {
    backgroundColor: '#FFFFFF', borderRadius: 10, padding: 16,
    fontSize: 17, color: '#000000', marginBottom: 20,
    shadowColor: '#000000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 2, elevation: 1,
  },
  listGroup: {
    backgroundColor: '#FFFFFF', borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 2, elevation: 1,
    marginBottom: 24,
  },
  listItem: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#C6C6C8',
  },
  listItemActive: { backgroundColor: '#F2F2F7' },
  listItemText: { fontSize: 17, color: '#000000', fontWeight: '500' },
  listItemTextActive: { color: '#007AFF' },
  listItemSub: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  listItemLabel: { fontSize: 13, color: '#8E8E93', fontWeight: '500', marginBottom: 2 },
  listItemValueText: { fontSize: 17, color: '#000000' },
  listItemValueInput: { fontSize: 17, color: '#000000', padding: 0 },
  primaryBtn: {
    backgroundColor: '#007AFF', borderRadius: 14, padding: 16,
    alignItems: 'center', marginTop: 10,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  minusBtn: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#FF3B30',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  minusBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', lineHeight: 20 },
  timeInput: { fontSize: 17, color: '#000000', fontWeight: '500', minWidth: 60 },
  timePressable: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#E5E5EA',
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    fontSize: 17,
    color: '#000000',
    fontWeight: '600',
  },
  timeTextPlaceholder: {
    color: '#8E8E93',
  },
  timePickerItem: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    marginVertical: 2,
  },
  timePickerItemActive: {
    backgroundColor: '#007AFF',
  },
  timePickerItemText: {
    fontSize: 18,
    color: '#000000',
    fontWeight: '500',
  },
  timePickerItemTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  gridItem: {
    width: (SCREEN_WIDTH - 68) / 4, height: (SCREEN_WIDTH - 68) / 4,
    borderRadius: 14, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 2, elevation: 1,
  },
  gridItemActive: { borderWidth: 2, borderColor: '#007AFF' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 10 },
  colorCircle: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#C6C6C8' },
  colorCircleActive: { borderWidth: 3, borderColor: '#000000' },
  saveBtn: {
    backgroundColor: '#007AFF', borderRadius: 14, padding: 16,
    alignItems: 'center', marginTop: 24,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  // Advanced Schedule Styles
  weekdaysRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, marginVertical: 12 },
  weekdayCircle: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  weekdayCircleSelected: { backgroundColor: '#007AFF' },
  weekdayText: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  weekdayTextSelected: { color: '#FFFFFF' },
  planOtherBtn: { backgroundColor: '#E8F0FE', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 16, alignSelf: 'center', marginTop: 10 },
  planOtherBtnText: { color: '#007AFF', fontSize: 15, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#C6C6C8' },
  modalHeaderTitle: { fontSize: 17, fontWeight: '600', color: '#000000' },
  modalItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA' },
  modalItemText: { fontSize: 17, color: '#000000', fontWeight: '500' },
  modalItemSub: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  checkmark: { color: '#007AFF', fontSize: 17, fontWeight: 'bold' },
  pillBtn: { backgroundColor: '#E5E5EA', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  pillBtnText: { color: '#000000', fontSize: 15, fontWeight: '500' },
  clearBtn: { backgroundColor: '#8E8E93', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  modalCloseBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#E5E5EA', justifyContent: 'center', alignItems: 'center' },
  modalDoneBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center' },
  modalDoneBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
});
