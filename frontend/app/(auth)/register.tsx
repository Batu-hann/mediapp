import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useAuth } from '../../src/AuthContext';
import { colors, radius, spacing, shadows } from '../../src/theme';
import { t } from '../../src/i18n';

export default function Register() {
  const { register, language } = useAuth();
  const router = useRouter();
  const L = t(language);

  const [form, setForm] = useState({
    name: '', surname: '', email: '', password: '',
    date_of_birth: '', phone_number: '',
  });
  const [loading, setLoading] = useState(false);

  const update = (k: string, v: string) => setForm({ ...form, [k]: v });

  const handleSubmit = async () => {
    if (!form.name || !form.surname || !form.email || !form.password || !form.date_of_birth || !form.phone_number) {
      Alert.alert(L.error, language === 'tr' ? 'Lütfen tüm alanları doldurun.' : 'Please fill all fields.');
      return;
    }
    if (form.password.length < 6) {
      Alert.alert(L.error, language === 'tr' ? 'Şifre en az 6 karakter olmalı.' : 'Password must be at least 6 chars.');
      return;
    }
    setLoading(true);
    try {
      await register({ ...form, email: form.email.trim().toLowerCase() });
    } catch (e: any) {
      Alert.alert(L.error, e?.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity testID="back-button" style={styles.back} onPress={() => router.back()}>
            <ArrowLeft size={22} color={colors.textMain} />
          </TouchableOpacity>

          <Text style={styles.title}>{L.registerTitle}</Text>

          <View style={styles.card}>
            {[
              { key: 'name', label: L.name, autoCap: 'words' },
              { key: 'surname', label: L.surname, autoCap: 'words' },
              { key: 'email', label: L.email, autoCap: 'none', kbd: 'email-address' },
              { key: 'password', label: L.password, autoCap: 'none', secure: true },
              { key: 'date_of_birth', label: L.dob, autoCap: 'none', placeholder: '1990-01-15' },
              { key: 'phone_number', label: L.phone, autoCap: 'none', kbd: 'phone-pad' },
            ].map((f) => (
              <View key={f.key}>
                <Text style={styles.label}>{f.label}</Text>
                <TextInput
                  testID={`register-${f.key.replace(/_/g, '-')}-input`}
                  style={styles.input}
                  value={(form as any)[f.key]}
                  onChangeText={(v) => update(f.key, v)}
                  autoCapitalize={f.autoCap as any}
                  secureTextEntry={!!(f as any).secure}
                  keyboardType={(f as any).kbd || 'default'}
                  placeholder={(f as any).placeholder || ''}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            ))}

            <TouchableOpacity
              testID="register-submit-button"
              style={styles.primaryBtn}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{L.register}</Text>}
            </TouchableOpacity>

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>{L.haveAccount}</Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity><Text style={styles.link}>{L.login}</Text></TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  scroll: { flexGrow: 1, padding: spacing.xxl },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.borderLight },
  title: { fontSize: 28, fontWeight: '800', color: colors.textMain, marginBottom: spacing.lg, letterSpacing: -0.5 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xxl, borderWidth: 1, borderColor: colors.borderLight, ...shadows.card },
  label: { fontSize: 13, color: colors.textMuted, marginTop: spacing.md, marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 16, color: colors.textMain,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', marginTop: spacing.xxl },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  footerText: { color: colors.textMuted, fontSize: 14 },
  link: { color: colors.primary, fontSize: 14, fontWeight: '700' },
});
