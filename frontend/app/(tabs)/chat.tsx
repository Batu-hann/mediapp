import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Send, Trash2, MessageCircle } from 'lucide-react-native';
import { api } from '../../src/api';
import { useAuth } from '../../src/AuthContext';
import { colors, radius, spacing, shadows } from '../../src/theme';
import { t } from '../../src/i18n';

type Msg = { id: string; role: 'user' | 'assistant'; content: string; timestamp: string };

export default function ChatScreen() {
  const { language } = useAuth();
  const L = t(language);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const listRef = useRef<FlatList<Msg>>(null);

  const load = async () => {
    try {
      const r = await api.get('/chat/history');
      setMessages(r.data.messages);
    } finally {
      setInitialLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, loading]);

  const send = async () => {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { id: 'tmp-' + Date.now(), role: 'user', content: text.trim(), timestamp: new Date().toISOString() };
    setMessages((m) => [...m, userMsg]);
    const payload = text.trim();
    setText('');
    setLoading(true);
    try {
      const r = await api.post('/chat/send', { message: payload, language });
      setMessages((m) => [
        ...m.filter((x) => x.id !== userMsg.id),
        r.data.user_message, r.data.ai_message,
      ]);
    } catch (e: any) {
      Alert.alert(L.error, e?.response?.data?.detail || 'AI error');
      setMessages((m) => m.filter((x) => x.id !== userMsg.id));
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = () => {
    Alert.alert(L.clearChat, L.confirmClear, [
      { text: L.cancel, style: 'cancel' },
      {
        text: L.yes, style: 'destructive', onPress: async () => {
          try { await api.delete('/chat/history'); setMessages([]); } catch {}
        }
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{L.chatTitle}</Text>
          <Text style={styles.subtitle}>{language === 'tr' ? 'Sağlık asistanın 7/24 yanında' : 'Your health assistant 24/7'}</Text>
        </View>
        {messages.length > 0 && (
          <TouchableOpacity testID="clear-chat-button" style={styles.clearBtn} onPress={clearHistory}>
            <Trash2 size={18} color={colors.accent} />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
        {initialLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 50 }} />
        ) : messages.length === 0 ? (
          <View testID="chat-empty" style={styles.empty}>
            <View style={styles.emptyIcon}><MessageCircle size={36} color={colors.primary} /></View>
            <Text style={styles.emptyText}>{L.chatEmpty}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 20 }}
            renderItem={({ item, index }) => (
              <View
                testID={`msg-${item.role}-${index}`}
                style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleAi]}
              >
                <Text style={item.role === 'user' ? styles.userText : styles.aiText}>{item.content}</Text>
                <Text style={[styles.time, item.role === 'user' && { color: 'rgba(255,255,255,0.7)' }]}>
                  {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            )}
            ListFooterComponent={
              loading ? (
                <View testID="typing-indicator" style={[styles.bubble, styles.bubbleAi]}>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <View style={styles.dot} />
                    <View style={styles.dot} />
                    <View style={styles.dot} />
                  </View>
                </View>
              ) : null
            }
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            testID="chat-input"
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={L.chatPlaceholder}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={500}
          />
          <TouchableOpacity testID="chat-send-button" style={[styles.sendBtn, (!text.trim() || loading) && { opacity: 0.5 }]} onPress={send} disabled={!text.trim() || loading}>
            <Send size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl, paddingTop: spacing.md, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.textMain },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  clearBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FDEEE7', justifyContent: 'center', alignItems: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xxl },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.chatAi, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: 18, marginBottom: 10 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  bubbleAi: { alignSelf: 'flex-start', backgroundColor: colors.chatAi, borderBottomLeftRadius: 6 },
  userText: { color: '#fff', fontSize: 15, lineHeight: 21 },
  aiText: { color: colors.textMain, fontSize: 15, lineHeight: 21 },
  time: { fontSize: 10, color: colors.textMuted, marginTop: 4, alignSelf: 'flex-end' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.borderLight },
  input: {
    flex: 1, backgroundColor: colors.surfaceElevated, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: 12, fontSize: 15, color: colors.textMain,
    maxHeight: 100, borderWidth: 1, borderColor: colors.borderLight,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted },
});
