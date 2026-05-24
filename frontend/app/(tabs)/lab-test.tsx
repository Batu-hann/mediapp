import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera as CameraIcon, Image as ImageIcon, FileText, AlertTriangle } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import Markdown from 'react-native-markdown-display';
import { api } from '../../src/api';
import { useAuth } from '../../src/AuthContext';
import { colors, radius, spacing, shadows } from '../../src/theme';
import { t } from '../../src/i18n';
import AnimatedPressable from '../../src/components/AnimatedPressable';

export default function LabTestScreen() {
  const { language } = useAuth();
  const L = t(language);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageB64, setImageB64] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(L.error, language === 'tr' ? 'Galeri izni gerekli' : 'Gallery permission required');
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
      allowsEditing: false,
    });
    if (!r.canceled && r.assets[0]) {
      setImageUri(r.assets[0].uri);
      setImageB64(r.assets[0].base64 || null);
      setResult(null);
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(L.error, language === 'tr' ? 'Kamera izni gerekli' : 'Camera permission required');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.7,
      allowsEditing: false,
    });
    if (!r.canceled && r.assets[0]) {
      setImageUri(r.assets[0].uri);
      setImageB64(r.assets[0].base64 || null);
      setResult(null);
    }
  };

  const analyze = async () => {
    if (!imageB64) {
      Alert.alert(L.error, language === 'tr' ? 'Önce bir görsel seçin' : 'Pick an image first');
      return;
    }
    setAnalyzing(true);
    setResult(null);
    try {
      const r = await api.post('/vision/scan-lab-test', { image_base64: imageB64, language });
      setResult(r.data.result);
    } catch (e: any) {
      Alert.alert(L.error, e?.response?.data?.detail || 'AI scan failed');
    } finally { setAnalyzing(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{L.labTestTitle || 'Tahlil Tarama'}</Text>
          <Text style={styles.subtitle}>{language === 'tr' ? 'Tahlil sonuçlarınızı analiz edin' : 'Analyze your lab results'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.preview}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.img} resizeMode="cover" />
          ) : (
            <View style={styles.placeholderInner}>
              <View style={styles.scanIcon}><FileText size={40} color={colors.primary} /></View>
              <Text style={styles.placeholderText}>{L.labTestEmpty || 'Tahlil sonucunuzu yükleyin'}</Text>
            </View>
          )}
        </View>

        <View style={styles.actionsRow}>
          <AnimatedPressable testID="take-photo-button" style={styles.actionBtn} onPress={takePhoto}>
            <CameraIcon size={20} color={colors.primary} />
            <Text style={styles.actionText}>{L.takePhoto}</Text>
          </AnimatedPressable>
          <AnimatedPressable testID="pick-gallery-button" style={styles.actionBtn} onPress={pickFromGallery}>
            <ImageIcon size={20} color={colors.primary} />
            <Text style={styles.actionText}>{L.fromGallery}</Text>
          </AnimatedPressable>
        </View>

        {imageUri && (
          <AnimatedPressable testID="analyze-button" style={styles.analyzeBtn} onPress={analyze} disabled={analyzing}>
            {analyzing ? (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <ActivityIndicator color={colors.textMain} />
                <Text style={styles.analyzeText}>{L.analyzing}</Text>
              </View>
            ) : (
              <Text style={styles.analyzeText}>{language === 'tr' ? '🔍 Analiz Et' : '🔍 Analyze'}</Text>
            )}
          </AnimatedPressable>
        )}

        <View style={styles.disclaimer}>
          <AlertTriangle size={14} color={colors.warning} />
          <Text style={styles.disclaimerText}>{L.aiDisclaimer}</Text>
        </View>

        {result && (
          <View testID="scan-result" style={styles.resultCard}>
            <Text style={styles.resultTitle}>{L.scanResult}</Text>
            <Markdown style={markdownStyles}>
              {result}
            </Markdown>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl, paddingTop: spacing.md, paddingBottom: spacing.md,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.textMain },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, fontWeight: '500' },
  scroll: { padding: spacing.xxl, paddingBottom: 60 },
  preview: { backgroundColor: colors.surfaceElevated, borderRadius: radius.xl, height: 280, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', ...shadows.card },
  placeholderInner: { alignItems: 'center', gap: spacing.md, padding: 20 },
  scanIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E8F5FA', justifyContent: 'center', alignItems: 'center' },
  placeholderText: { color: colors.textMuted, fontSize: 15, fontWeight: '600', textAlign: 'center', lineHeight: 22 },
  img: { width: '100%', height: '100%' },
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: spacing.lg },
  actionBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: radius.pill, backgroundColor: colors.surface, ...shadows.card },
  actionText: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  analyzeBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', marginTop: spacing.lg, ...shadows.card },
  analyzeText: { color: colors.textMain, fontWeight: '800', fontSize: 15 },
  disclaimer: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.md, backgroundColor: '#FEF6E1', borderRadius: radius.md, marginTop: spacing.lg },
  disclaimerText: { fontSize: 12, color: colors.textMain, flex: 1, lineHeight: 16, fontWeight: '500' },
  resultCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, marginTop: spacing.lg,
    ...shadows.card,
  },
  resultTitle: { fontSize: 18, fontWeight: '800', color: colors.primary, marginBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight, paddingBottom: 8 },
});

const markdownStyles = {
  body: { color: colors.textMain, fontSize: 15, lineHeight: 22 },
  paragraph: { marginTop: 0, marginBottom: 12 },
  list_item: { marginBottom: 6 },
  strong: { fontWeight: 'bold' as const },
  heading1: { fontSize: 20, fontWeight: 'bold' as const, marginTop: 10, marginBottom: 10 },
  heading2: { fontSize: 18, fontWeight: 'bold' as const, marginTop: 10, marginBottom: 10 },
  heading3: { fontSize: 16, fontWeight: 'bold' as const, marginTop: 10, marginBottom: 10 },
};
