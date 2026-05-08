import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, Camera as CameraIcon, Image as ImageIcon, Plus, AlertTriangle, Pill } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../src/api';
import { useAuth } from '../src/AuthContext';
import { colors, radius, spacing, shadows } from '../src/theme';
import { t } from '../src/i18n';

type ScanResult = {
  medication_name: string;
  active_ingredients: string[];
  common_uses: string;
  side_effects: string[];
  dosage_info: string;
  warnings: string[];
  identifiable: boolean;
  confidence: string;
};

export default function ScanScreen() {
  const { language } = useAuth();
  const L = t(language);
  const router = useRouter();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageB64, setImageB64] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

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
      const r = await api.post('/vision/scan-medication', { image_base64: imageB64, language });
      setResult(r.data);
    } catch (e: any) {
      Alert.alert(L.error, e?.response?.data?.detail || 'AI scan failed');
    } finally { setAnalyzing(false); }
  };

  const addToList = () => {
    if (!result) return;
    router.replace({
      pathname: '/medication-form',
      params: { prefill: JSON.stringify({ name: result.medication_name, dosage: result.dosage_info?.split(' ')[0] || '' }) },
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity testID="close-scan" style={styles.closeBtn} onPress={() => router.back()}>
          <X size={22} color={colors.textMain} />
        </TouchableOpacity>
        <Text style={styles.title}>{L.scanTitle}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Image preview */}
        <View style={styles.preview}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.img} resizeMode="cover" />
          ) : (
            <View style={styles.placeholderInner}>
              <View style={styles.scanIcon}><Pill size={40} color={colors.primary} /></View>
              <Text style={styles.placeholderText}>{language === 'tr' ? 'İlaç fotoğrafı seçin' : 'Pick a medication photo'}</Text>
            </View>
          )}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity testID="take-photo-button" style={styles.actionBtn} onPress={takePhoto}>
            <CameraIcon size={20} color={colors.primary} />
            <Text style={styles.actionText}>{L.takePhoto}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="pick-gallery-button" style={styles.actionBtn} onPress={pickFromGallery}>
            <ImageIcon size={20} color={colors.primary} />
            <Text style={styles.actionText}>{L.fromGallery}</Text>
          </TouchableOpacity>
        </View>

        {imageUri && (
          <TouchableOpacity testID="analyze-button" style={styles.analyzeBtn} onPress={analyze} disabled={analyzing}>
            {analyzing ? (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.analyzeText}>{L.analyzing}</Text>
              </View>
            ) : (
              <Text style={styles.analyzeText}>{language === 'tr' ? '🔍 Analiz Et' : '🔍 Analyze'}</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <AlertTriangle size={14} color={colors.warning} />
          <Text style={styles.disclaimerText}>{L.aiDisclaimer}</Text>
        </View>

        {/* Result */}
        {result && (
          <View testID="scan-result" style={styles.resultCard}>
            <Text style={styles.resultName}>{result.medication_name}</Text>
            {!result.identifiable && (
              <Text style={styles.notIdentified}>{L.notIdentified}</Text>
            )}

            {result.active_ingredients?.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{L.activeIngredients}</Text>
                {result.active_ingredients.map((i, idx) => (
                  <Text key={idx} style={styles.bullet}>• {i}</Text>
                ))}
              </View>
            )}

            {!!result.common_uses && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{L.commonUses}</Text>
                <Text style={styles.body}>{result.common_uses}</Text>
              </View>
            )}

            {!!result.dosage_info && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{L.dosageInfo}</Text>
                <Text style={styles.body}>{result.dosage_info}</Text>
              </View>
            )}

            {result.side_effects?.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{L.sideEffects}</Text>
                {result.side_effects.map((i, idx) => (
                  <Text key={idx} style={styles.bullet}>• {i}</Text>
                ))}
              </View>
            )}

            {result.warnings?.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.accent }]}>⚠️ {L.warnings}</Text>
                {result.warnings.map((i, idx) => (
                  <Text key={idx} style={[styles.bullet, { color: colors.accent }]}>• {i}</Text>
                ))}
              </View>
            )}

            {result.identifiable && (
              <TouchableOpacity testID="add-to-list-button" style={styles.addToListBtn} onPress={addToList}>
                <Plus size={16} color="#fff" />
                <Text style={styles.addToListText}>{L.addToList}</Text>
              </TouchableOpacity>
            )}
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
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  closeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceElevated, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: colors.textMain },
  scroll: { padding: spacing.xxl, paddingBottom: 60 },
  preview: { backgroundColor: colors.chatAi, borderRadius: radius.xl, height: 240, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: colors.borderLight },
  placeholderInner: { alignItems: 'center', gap: spacing.md },
  scanIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E6F0FB', justifyContent: 'center', alignItems: 'center' },
  placeholderText: { color: colors.textMuted, fontSize: 14, fontWeight: '500' },
  img: { width: '100%', height: '100%' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: spacing.lg },
  actionBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
  actionText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  analyzeBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', marginTop: spacing.lg },
  analyzeText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disclaimer: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.md, backgroundColor: '#FEF5E0', borderRadius: radius.md, marginTop: spacing.lg },
  disclaimerText: { fontSize: 12, color: colors.textMain, flex: 1, lineHeight: 16 },
  resultCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, marginTop: spacing.lg,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  resultName: { fontSize: 22, fontWeight: '800', color: colors.textMain, marginBottom: spacing.sm },
  notIdentified: { fontSize: 13, color: colors.warning, fontStyle: 'italic', marginBottom: 8 },
  section: { marginTop: spacing.md },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.primary, marginBottom: 6 },
  bullet: { fontSize: 14, color: colors.textMain, lineHeight: 22 },
  body: { fontSize: 14, color: colors.textMain, lineHeight: 22 },
  addToListBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: spacing.lg, backgroundColor: colors.secondary, borderRadius: radius.pill, paddingVertical: 14 },
  addToListText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
