import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { User, LogOut, Globe, Lock, Bell, Trash2, ChevronRight, X } from 'lucide-react-native';
import { useAuth } from '../../src/AuthContext';
import { api } from '../../src/api';
import { colors, radius, spacing, shadows } from '../../src/theme';
import { t } from '../../src/i18n';

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
      Alert.alert(L.success, '');
    } catch (e: any) {
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
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)}>
                  <Text style={styles.cancelText}>{L.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="save-profile" style={styles.saveBtn} onPress={saveProfile} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{L.save}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity testID="row-edit-profile" style={styles.row} onPress={() => setEditing(true)}>
              <View style={[styles.rowIcon, { backgroundColor: '#E6F0FB' }]}><User size={18} color={colors.primary} /></View>
              <Text style={styles.rowText}>{L.editProfile}</Text>
              <ChevronRight size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          {pwModal ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{L.changePassword}</Text>
              <Text style={styles.label}>{L.oldPassword}</Text>
              <TextInput testID="old-pw" style={styles.input} value={oldPw} onChangeText={setOldPw} secureTextEntry />
              <Text style={styles.label}>{L.newPassword}</Text>
              <TextInput testID="new-pw" style={styles.input} value={newPw} onChangeText={setNewPw} secureTextEntry />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.lg }}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setPwModal(false); setOldPw(''); setNewPw(''); }}>
                  <Text style={styles.cancelText}>{L.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="save-pw" style={styles.saveBtn} onPress={changePw} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{L.save}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity testID="row-change-password" style={styles.row} onPress={() => setPwModal(true)}>
              <View style={[styles.rowIcon, { backgroundColor: '#FEF5E0' }]}><Lock size={18} color={colors.warning} /></View>
              <Text style={styles.rowText}>{L.changePassword}</Text>
              <ChevronRight size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          {/* Language */}
          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: '#E5F8EE' }]}><Globe size={18} color={colors.secondary} /></View>
            <Text style={styles.rowText}>{L.language}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity testID="lang-tr-row" style={[styles.langPill, language === 'tr' && styles.langPillActive]} onPress={() => switchLang('tr')}>
                <Text style={[styles.langPillText, language === 'tr' && styles.langPillTextActive]}>TR</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="lang-en-row" style={[styles.langPill, language === 'en' && styles.langPillActive]} onPress={() => switchLang('en')}>
                <Text style={[styles.langPillText, language === 'en' && styles.langPillTextActive]}>EN</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Notifications */}
          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: '#E6F0FB' }]}><Bell size={18} color={colors.primary} /></View>
            <Text style={styles.rowText}>{L.notifications}</Text>
            <Switch value={true} disabled />
          </View>

          {/* Logout */}
          <TouchableOpacity testID="logout-button" style={[styles.row, { marginTop: spacing.lg }]} onPress={onLogout}>
            <View style={[styles.rowIcon, { backgroundColor: '#FDEEE7' }]}><LogOut size={18} color={colors.accent} /></View>
            <Text style={[styles.rowText, { color: colors.accent }]}>{L.logout}</Text>
            <ChevronRight size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity testID="delete-account-button" style={styles.row} onPress={onDelete}>
            <View style={[styles.rowIcon, { backgroundColor: '#FDEEE7' }]}><Trash2 size={18} color={colors.accent} /></View>
            <Text style={[styles.rowText, { color: colors.accent }]}>{L.deleteAccount}</Text>
            <ChevronRight size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <Text style={styles.version}>MediAssist · v1.0</Text>
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
  avatarText: { color: '#fff', fontSize: 30, fontWeight: '800' },
  name: { fontSize: 22, fontWeight: '800', color: colors.textMain },
  email: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.md, marginBottom: 10, gap: spacing.md,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  rowIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  rowText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.textMain },
  section: {
    backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, marginBottom: 12,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textMain, marginBottom: spacing.sm },
  label: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm, marginBottom: 4, fontWeight: '600' },
  input: { backgroundColor: colors.surfaceElevated, borderRadius: radius.md, padding: 12, fontSize: 15, borderWidth: 1, borderColor: colors.borderLight, color: colors.textMain },
  cancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: radius.pill, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderLight },
  cancelText: { fontWeight: '700', color: colors.textMuted },
  saveBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: radius.pill, backgroundColor: colors.primary },
  saveText: { fontWeight: '700', color: '#fff' },
  langPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderLight },
  langPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langPillText: { fontWeight: '700', color: colors.textMuted, fontSize: 12 },
  langPillTextActive: { color: '#fff' },
  version: { textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: spacing.xl },
});
