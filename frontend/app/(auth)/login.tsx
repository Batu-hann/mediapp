import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { useAuth } from '../../src/AuthContext';
import { colors, radius, spacing, shadows } from '../../src/theme';
import { t } from '../../src/i18n';

export default function Login() {
  const { login, language, setLanguage } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const L = t(language);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert(L.error, language === 'tr' ? 'E-posta ve şifre gerekli.' : 'Email and password required.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      Alert.alert(L.error, e?.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.langSwitch}>
            <TouchableOpacity
              testID="lang-tr-button"
              style={[styles.langBtn, language === 'tr' && styles.langBtnActive]}
              onPress={() => setLanguage('tr')}
            >
              <Text style={[styles.langText, language === 'tr' && styles.langTextActive]}>TR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="lang-en-button"
              style={[styles.langBtn, language === 'en' && styles.langBtnActive]}
              onPress={() => setLanguage('en')}
            >
              <Text style={[styles.langText, language === 'en' && styles.langTextActive]}>EN</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.logoWrap}>
            <View style={styles.logoCircle}>
              <Heart size={36} color={colors.primary} fill={colors.primary} strokeWidth={2} />
            </View>
            <Text style={styles.brand}>MediAssist</Text>
            <Text style={styles.welcome}>{L.welcome}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>{L.loginTitle}</Text>

            <Text style={styles.label}>{L.email}</Text>
            <TextInput
              testID="login-email-input"
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="email@example.com"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.label}>{L.password}</Text>
            <TextInput
              testID="login-password-input"
              style={styles.input}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
            />

            <TouchableOpacity
              testID="login-submit-button"
              style={styles.primaryBtn}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{L.login}</Text>}
            </TouchableOpacity>

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>{L.noAccount}</Text>
              <Link href="/(auth)/register" asChild>
                <TouchableOpacity testID="goto-register-link"><Text style={styles.link}>{L.register}</Text></TouchableOpacity>
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
  langSwitch: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  langBtn: {
    paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surface,
  },
  langBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langText: { color: colors.textMuted, fontWeight: '600' },
  langTextActive: { color: '#fff' },
  logoWrap: { alignItems: 'center', marginTop: spacing.xxxl, marginBottom: spacing.xxxl },
  logoCircle: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: '#E6F0FB',
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg,
    ...shadows.floating,
  },
  brand: { fontSize: 32, fontWeight: '800', color: colors.textMain, letterSpacing: -0.5 },
  welcome: { fontSize: 16, color: colors.textMuted, marginTop: 4 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xxl,
    borderWidth: 1, borderColor: colors.borderLight, ...shadows.card,
  },
  title: { fontSize: 24, fontWeight: '700', color: colors.textMain, marginBottom: spacing.lg },
  label: { fontSize: 13, color: colors.textMuted, marginTop: spacing.md, marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.md, paddingHorizontal: spacing.lg,
    paddingVertical: 14, fontSize: 16, color: colors.textMain,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 16,
    alignItems: 'center', marginTop: spacing.xxl,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  footerText: { color: colors.textMuted, fontSize: 14 },
  link: { color: colors.primary, fontSize: 14, fontWeight: '700' },
});
