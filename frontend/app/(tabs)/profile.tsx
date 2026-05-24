import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch, Alert, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { User, LogOut, Globe, Lock, Bell, Trash2, ChevronRight } from 'lucide-react-native';
import { useAuth } from '../../src/AuthContext';
import { api } from '../../src/api';
import { colors, radius, spacing, shadows } from '../../src/theme';
import { t } from '../../src/i18n';
import AnimatedPressable from '../../src/components/AnimatedPressable';
import { hapticSuccess, hapticError, hapticLight } from '../../src/haptics';
import { cancelAllMedicationReminders, setupNotifications } from '../../src/services/notifications';

export default function ProfileScreen() {
  const { user, logout, language, setLanguage, setUser } = useAuth();
  const L = t(language);
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [surname, setSurname] = useState(user?.surname || '');
  const [phone, setPhone] = useState(user?.phone_number || '');
  const [notificationsEnabled, setNotificationsEnabled] = useState(user?.notifications_enabled ?? true);

  React.useEffect(() => {
    setNotificationsEnabled(user?.notifications_enabled ?? true);
  }, [user?.notifications_enabled]);

  const onLogout = () => {
    Alert.alert(L.logout, L.confirmLogout, [
      { text: L.cancel, style: 'cancel' },
      { text: L.yes, style: 'destructive', onPress: async () => { await logout(); router.replace('/(auth)/login'); } }
    ]);
  };

  const onDelete = () => {
    Alert.alert(L.deleteAccount, L.confirmDelete, [
      { text: L.cancel, style: 'cancel' },
      {
        text: L.delete, style: 'destructive', onPress: async () => {
          try {
            await api.delete('/auth/account');
            await logout();
            router.replace('/(auth)/login');
          } catch (e: any) { Alert.alert(L.error, e?.response?.data?.detail || 'Failed'); }
        }
      }
    ]);
  };

  const saveProfile = async () => {
    setBusy(true);
    try {
      const r = await api.put('/auth/profile', { name, surname, phone_number: phone, language });
      setUser(r.data);
      setEditing(false);
      hapticSuccess();
      Alert.alert(L.success, '');
    } catch (e: any) {
      hapticError();
      Alert.alert(L.error, e?.response?.data?.detail || 'Failed');
    } finally { setBusy(false); }
  };

  const changePw = async () => {
    if (!oldPw || newPw.length < 6) {
      Alert.alert(L.error, language === 'tr' ? 'Geçerli alanlar girin' : 'Enter valid fields'); return;
    }
    setBusy(true);
    try {
      await api.post('/auth/change-password', { old_password: oldPw, new_password: newPw });
      Alert.alert(L.success, '');
      setPwModal(false); setOldPw(''); setNewPw('');
    } catch (e: any) {
      Alert.alert(L.error, e?.response?.data?.detail || 'Failed');
    } finally { setBusy(false); }
  };

  const switchLang = async (l: 'tr' | 'en') => {
    setLanguage(l);
    if (user) {
      try { await api.put('/auth/profile', { language: l }); } catch {}
    }
  };

  const toggleNotifications = async (enabled: boolean) => {
    const previous = notificationsEnabled;
    setNotificationsEnabled(enabled);
    setBusy(true);
    try {
      let nextEnabled = enabled;
      if (enabled) {
        const permission = await setupNotifications();
        nextEnabled = permission.granted;
        if (!permission.granted) {
          Alert.alert(
            L.error,
            language === 'tr'
              ? 'Bildirim izni verilmedi. Ayarlardan izin verdikten sonra tekrar deneyin.'
              : 'Notification permission was not granted. Enable it in settings and try again.'
          );
        }
      } else {
        await cancelAllMedicationReminders();
      }

      const r = await api.put('/auth/profile', { notifications_enabled: nextEnabled });
      setUser(r.data);
      setNotificationsEnabled(r.data.notifications_enabled ?? nextEnabled);
      hapticSuccess();
    } catch (e: any) {
      setNotificationsEnabled(previous);
      hapticError();
      Alert.alert(L.error, e?.response?.data?.detail || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.headerCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(user?.name || 'U')[0]}{(user?.surname || '')[0]}</Text>
            </View>
            <Text testID="profile-name" style={styles.name}>{user?.name} {user?.surname}</Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>

          {/* Edit profile */}
          {editing ? (
            <View style={styles.section}>
              <Text style={styles.label}>{L.name}</Text>
              <TextInput testID="edit-name" style={styles.input} value={name} onChangeText={setName} />
              <Text style={styles.label}>{L.surname}</Text>
              <TextInput testID="edit-surname" style={styles.input} value={surname} onChangeText={setSurname} />
              <Text style={styles.label}>{L.phone}</Text>
              <TextInput testID="edit-phone" style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.lg }}>
                <AnimatedPressable style={styles.cancelBtn} onPress={() => setEditing(false)}>
                  <Text style={styles.cancelText}>{L.cancel}</Text>
                </AnimatedPressable>
                <AnimatedPressable testID="save-profile" style={styles.saveBtn} onPress={saveProfile} disabled={busy}>
                  {busy ? <ActivityIndicator color={colors.textMain} /> : <Text style={styles.saveText}>{L.save}</Text>}
                </AnimatedPressable>
              </View>
            </View>
          ) : (
            <AnimatedPressable testID="row-edit-profile" style={styles.row} onPress={() => setEditing(true)}>
              <View style={[styles.rowIcon, { backgroundColor: '#E8F5FA' }]}><User size={18} color={colors.primary} /></View>
              <Text style={styles.rowText}>{L.editProfile}</Text>
              <ChevronRight size={18} color={colors.textMuted} />
            </AnimatedPressable>
          )}

          {pwModal ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{L.changePassword}</Text>
              <Text style={styles.label}>{L.oldPassword}</Text>
              <TextInput testID="old-pw" style={styles.input} value={oldPw} onChangeText={setOldPw} secureTextEntry />
              <Text style={styles.label}>{L.newPassword}</Text>
              <TextInput testID="new-pw" style={styles.input} value={newPw} onChangeText={setNewPw} secureTextEntry />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.lg }}>
                <AnimatedPressable style={styles.cancelBtn} onPress={() => { setPwModal(false); setOldPw(''); setNewPw(''); }}>
                  <Text style={styles.cancelText}>{L.cancel}</Text>
                </AnimatedPressable>
                <AnimatedPressable testID="save-pw" style={styles.saveBtn} onPress={changePw} disabled={busy}>
                  {busy ? <ActivityIndicator color={colors.textMain} /> : <Text style={styles.saveText}>{L.save}</Text>}
                </AnimatedPressable>
              </View>
            </View>
          ) : (
            <AnimatedPressable testID="row-change-password" style={styles.row} onPress={() => setPwModal(true)}>
              <View style={[styles.rowIcon, { backgroundColor: '#FEF6E1' }]}><Lock size={18} color={colors.warning} /></View>
              <Text style={styles.rowText}>{L.changePassword}</Text>
              <ChevronRight size={18} color={colors.textMuted} />
            </AnimatedPressable>
          )}

          {/* Language */}
          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: '#EDF7E8' }]}><Globe size={18} color={colors.success} /></View>
            <Text style={styles.rowText}>{L.language}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <AnimatedPressable testID="lang-tr-row" style={[styles.langPill, language === 'tr' && styles.langPillActive]} onPress={() => { switchLang('tr'); hapticLight(); }}>
                <Text style={[styles.langPillText, language === 'tr' && styles.langPillTextActive]}>TR</Text>
              </AnimatedPressable>
              <AnimatedPressable testID="lang-en-row" style={[styles.langPill, language === 'en' && styles.langPillActive]} onPress={() => { switchLang('en'); hapticLight(); }}>
                <Text style={[styles.langPillText, language === 'en' && styles.langPillTextActive]}>EN</Text>
              </AnimatedPressable>
            </View>
          </View>

          {/* Notifications */}
          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: '#E8F5FA' }]}><Bell size={18} color={colors.primary} /></View>
            <Text style={styles.rowText}>{L.notifications}</Text>
            <Switch
              testID="notifications-switch"
              value={notificationsEnabled}
              onValueChange={toggleNotifications}
              disabled={busy}
              trackColor={{ false: colors.borderLight, true: colors.primary }}
              thumbColor={notificationsEnabled ? colors.surface : colors.textMuted}
            />
          </View>

          {/* Logout */}
          <AnimatedPressable testID="logout-button" style={[styles.row, { marginTop: spacing.lg }]} onPress={onLogout}>
            <View style={[styles.rowIcon, { backgroundColor: '#FCEAEA' }]}><LogOut size={18} color={colors.error} /></View>
            <Text style={[styles.rowText, { color: colors.error }]}>{L.logout}</Text>
            <ChevronRight size={18} color={colors.textMuted} />
          </AnimatedPressable>

          <AnimatedPressable testID="delete-account-button" style={styles.row} onPress={onDelete}>
            <View style={[styles.rowIcon, { backgroundColor: '#FCEAEA' }]}><Trash2 size={18} color={colors.error} /></View>
            <Text style={[styles.rowText, { color: colors.error }]}>{L.deleteAccount}</Text>
            <ChevronRight size={18} color={colors.textMuted} />
          </AnimatedPressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  scroll: { padding: spacing.xxl, paddingBottom: 120 },
  headerCard: { alignItems: 'center', marginBottom: spacing.xl },
  avatar: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md, ...shadows.floating,
  },
  avatarText: { color: colors.textMain, fontSize: 30, fontWeight: '800' },
  name: { fontSize: 22, fontWeight: '800', color: colors.textMain },
  email: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: radius.xl, padding: spacing.md, marginBottom: 10, gap: spacing.md,
    ...shadows.card,
  },
  rowIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  rowText: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textMain },
  section: {
    backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, marginBottom: 12,
    ...shadows.card,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.textMain, marginBottom: spacing.sm },
  label: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm, marginBottom: 4, fontWeight: '600' },
  input: { backgroundColor: colors.surfaceElevated, borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.textMain },
  cancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: radius.pill, backgroundColor: colors.surfaceElevated },
  cancelText: { fontWeight: '700', color: colors.textMuted },
  saveBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: radius.pill, backgroundColor: colors.primary },
  saveText: { fontWeight: '800', color: colors.textMain },
  langPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceElevated },
  langPillActive: { backgroundColor: colors.primary },
  langPillText: { fontWeight: '700', color: colors.textMuted, fontSize: 12 },
  langPillTextActive: { color: colors.textMain },
});
