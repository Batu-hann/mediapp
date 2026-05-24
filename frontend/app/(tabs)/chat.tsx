import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList, Platform, ScrollView,
  Alert, ActivityIndicator, Keyboard, TouchableWithoutFeedback, KeyboardAvoidingView,
  useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import {
  Send, Trash2, MessageCircle, Sparkles, Menu, Plus, Edit2, X, Check,
  Volume2, VolumeX, RotateCw, Pencil, Search
} from 'lucide-react-native';
import Markdown from 'react-native-markdown-display';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, interpolate,
  withRepeat, withSequence, withDelay, withTiming
} from 'react-native-reanimated';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Speech from 'expo-speech';

import { api } from '../../src/api';
import { useAuth } from '../../src/AuthContext';
import { radius, spacing, shadows } from '../../src/theme';
import { t } from '../../src/i18n';
import AnimatedPressable from '../../src/components/AnimatedPressable';
import { hapticLight, hapticSuccess, hapticError } from '../../src/haptics';

// Premium Dark Theme specifically for the AI Workspace
const chatTheme = {
  bg: '#0E1116',
  surface: '#161B22',
  surfaceHover: '#1D232C',
  border: '#2C3544',
  textMain: '#F0F6FC',
  textMuted: '#8B949E',
  primary: '#2F81F7',
  cyan: '#39C5CF',
  userBubble: '#2F81F7',
  aiBubble: '#1E242B',
  danger: '#F85149',
};

const DRAWER_WIDTH = 290;

type Msg = { id: string; role: 'user' | 'assistant'; content: string; timestamp: string };
type Conversation = { id: string; title: string; updated_at: string; created_at: string };

// Pulsing Typing Dot
function TypingDot({ delay }: { delay: number }) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.6, { duration: 400 })
        ),
        -1,
        true
      )
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.4, { duration: 400 })
        ),
        -1,
        true
      )
    );
  }, [delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: chatTheme.cyan,
          marginHorizontal: 3,
        },
        animatedStyle,
      ]}
    />
  );
}

// Typing Indicator Row
function TypingIndicator() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 }}>
      <TypingDot delay={0} />
      <TypingDot delay={150} />
      <TypingDot delay={300} />
    </View>
  );
}

// Typewriter Simulated Stream Component
function TypewriterText({ content, onComplete }: { content: string; onComplete: () => void }) {
  const [displayedText, setDisplayedText] = useState('');
  
  useEffect(() => {
    const words = content.split(' ');
    let currentIdx = 0;
    let textAccumulator = '';
    
    const interval = setInterval(() => {
      if (currentIdx >= words.length) {
        clearInterval(interval);
        onComplete();
        return;
      }
      
      textAccumulator += (currentIdx === 0 ? '' : ' ') + words[currentIdx];
      setDisplayedText(textAccumulator);
      currentIdx++;
    }, 25);
    
    return () => clearInterval(interval);
  }, [content, onComplete]);

  return <Markdown style={markdownStyles}>{displayedText}</Markdown>;
}

export default function ChatScreen() {
  const { language } = useAuth();
  const L = t(language);
  const queryClient = useQueryClient();
  const { width: windowWidth } = useWindowDimensions();
  const isLargeScreen = windowWidth >= 768;

  // Get dynamic tab bar height with safe fallback
  let tabBarHeight = 88;
  try {
    tabBarHeight = useBottomTabBarHeight();
  } catch (err) {
    tabBarHeight = 88;
  }

  // Keyboard visibility listener to adjust bottom padding dynamically when typing
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Sidebar Open/Closed state for desktop/large screens
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Conversation Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Speech TTS state
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  // Message Editing state
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editMsgText, setEditMsgText] = useState('');

  // Track typewriter typed message IDs
  const [typedMessageIds, setTypedMessageIds] = useState<Set<string>>(new Set());

  const listRef = useRef<FlatList<Msg>>(null);
  const isInitialLoad = useRef(true);

  // Drawer Animation (for mobile)
  const drawerTranslateX = useSharedValue(-DRAWER_WIDTH);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleDrawer = (open: boolean) => {
    if (isLargeScreen) return;
    hapticLight();
    setDrawerOpen(open);
    drawerTranslateX.value = withSpring(open ? 0 : -DRAWER_WIDTH, {
      damping: 20, stiffness: 200, mass: 0.8
    });
    if (!open) Keyboard.dismiss();
  };

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drawerTranslateX.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drawerTranslateX.value, [-DRAWER_WIDTH, 0], [0, 0.5]),
    pointerEvents: drawerTranslateX.value === -DRAWER_WIDTH ? 'none' : 'auto',
  }));

  // Stop speech if conversation changes
  useEffect(() => {
    Speech.stop();
    setSpeakingMsgId(null);
  }, [activeConvId]);

  // Fetch Conversations
  const { data: conversations = [], isLoading: loadingConvs } = useQuery({
    queryKey: ['chatConversations'],
    queryFn: async () => {
      const r = await api.get('/chat/conversations');
      const list = r.data.conversations as Conversation[];
      // If initial mount and list is populated, auto-select latest
      if (isInitialLoad.current && list.length > 0 && !activeConvId) {
        setActiveConvId(list[0].id);
        isInitialLoad.current = false;
      }
      return list;
    },
    staleTime: 1000 * 60,
  });

  // Fetch active conversation messages (Disabled if in "New Chat" activeConvId = null)
  const { data: messages = [], isLoading: loadingMsgs } = useQuery({
    queryKey: ['chatHistory', activeConvId],
    queryFn: async () => {
      if (!activeConvId) return [];
      const r = await api.get('/chat/history', { params: { conversation_id: activeConvId } });
      return r.data.messages as Msg[];
    },
    enabled: activeConvId !== null,
    staleTime: 1000 * 60,
  });

  // Populate typedMessageIds with existing messages on load so they don't re-typewriter
  useEffect(() => {
    if (messages.length > 0 && typedMessageIds.size === 0) {
      setTypedMessageIds(new Set(messages.map(m => m.id)));
    }
  }, [messages, typedMessageIds]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [messages, loading]);

  const activeConversationTitle = useMemo(() => {
    if (!activeConvId) return L.newChat || 'Yeni Sohbet';
    const c = conversations.find(x => x.id === activeConvId);
    return c ? c.title : L.chatTitle || 'AI Sohbet';
  }, [activeConvId, conversations, L]);

  // Actions
  const createNewChat = () => {
    setActiveConvId(null);
    queryClient.setQueryData(['chatHistory', null], []);
    toggleDrawer(false);
  };

  const selectConversation = (id: string) => {
    setActiveConvId(id);
    toggleDrawer(false);
  };

  const send = async (overrideText?: string) => {
    const message = (overrideText ?? text).trim();
    if (!message || loading) return;
    
    const userMsg: Msg = { 
      id: 'tmp-' + Date.now(), role: 'user', content: message, timestamp: new Date().toISOString() 
    };

    // Optimistic UI update
    queryClient.setQueryData(['chatHistory', activeConvId], (old: Msg[] = []) => [...old, userMsg]);
    setText('');
    setLoading(true);

    try {
      const payload = { message, language, conversation_id: activeConvId };
      console.log("[CHAT] Sending payload:", payload);
      
      const r = await api.post('/chat/message', payload);
      console.log("AI RESPONSE:", r.data);
      
      const newConvId = r.data.conversation.id;

      // Update active ID
      if (activeConvId !== newConvId) {
        setActiveConvId(newConvId);
      }
      
      // Update cache
      queryClient.setQueryData(['chatHistory', newConvId], (old: Msg[] = []) => [
        ...old.filter((x) => x.id !== userMsg.id),
        r.data.user_message,
        r.data.ai_message,
      ]);
      
      // Add user message to typed to skip typewriter, but let AI message trigger typewriter
      setTypedMessageIds(prev => {
        const next = new Set(prev);
        next.add(r.data.user_message.id);
        return next;
      });

      // Clear new chat optimistic state
      if (!activeConvId) {
        queryClient.setQueryData(['chatHistory', null], []);
      }
      
      queryClient.invalidateQueries({ queryKey: ['chatConversations'] });
      hapticSuccess();
    } catch (e: any) {
      console.log("CHAT ERROR:", e);
      if (e?.response) {
        console.log("CHAT ERROR RESPONSE STATUS:", e.response.status);
        console.log("CHAT ERROR RESPONSE DATA:", e.response.data);
      }
      hapticError();
      Alert.alert(
        L.error || "Hata", 
        e?.response?.data?.detail || e?.message || 'AI error'
      );
      queryClient.setQueryData(['chatHistory', activeConvId], (old: Msg[] = []) => old.filter((x) => x.id !== userMsg.id));
    } finally {
      setLoading(false);
    }
  };

  const deleteChat = (id: string, title: string) => {
    console.log("[deleteChat] Initiating delete for conversation ID:", id, "title:", title);

    const performDelete = async () => {
      console.log("[deleteChat] User confirmed. Sending API delete request to /chat/conversations/" + id);
      try {
        const response = await api.delete(`/chat/conversations/${id}`);
        console.log("[deleteChat] API deletion response:", response.status, response.data);
        
        // Invalidate the cache to trigger a re-fetch of conversations list
        await queryClient.invalidateQueries({ queryKey: ['chatConversations'] });
        console.log("[deleteChat] Query cache invalidated.");

        // If the deleted conversation was the active one, start a new chat
        if (activeConvId === id) {
          console.log("[deleteChat] Active conversation deleted. Creating a new chat...");
          createNewChat();
        }
        hapticSuccess();
      } catch (err: any) {
        console.error("[deleteChat] Error during delete operation:", err);
        const errorDetail = err?.response?.data?.detail || err?.message || 'Unknown error';
        Alert.alert(
          L.error || 'Hata', 
          (language === 'tr' ? 'Sohbet silinirken hata oluştu: ' : 'Error deleting conversation: ') + errorDetail
        );
        hapticError();
      }
    };

    if (Platform.OS === 'web') {
      const confirmMessage = `${L.deleteConfirmTitle || L.deleteChat || 'Sohbeti Sil'}\n\n${L.deleteConfirmChat || 'Bu sohbet geçmişini silmek istediğinize emin misiniz?'}`;
      if (window.confirm(confirmMessage)) {
        performDelete();
      } else {
        console.log("[deleteChat] Deletion cancelled by user (web confirm).");
      }
    } else {
      Alert.alert(
        L.deleteConfirmTitle || L.deleteChat || 'Sohbeti Sil', 
        L.deleteConfirmChat || 'Bu sohbet geçmişini silmek istediğinize emin misiniz?', 
        [
          { 
            text: L.cancel || 'İptal', 
            style: 'cancel',
            onPress: () => console.log("[deleteChat] Deletion cancelled by user (dialog cancel).")
          },
          {
            text: L.delete || 'Sil', 
            style: 'destructive', 
            onPress: performDelete
          }
        ]
      );
    }
  };

  const startRename = (c: Conversation) => {
    setEditingConvId(c.id);
    setEditTitle(c.title);
  };

  const saveRename = async () => {
    if (!editingConvId || !editTitle.trim()) {
      setEditingConvId(null);
      return;
    }
    try {
      await api.patch(`/chat/conversations/${editingConvId}`, { title: editTitle.trim() });
      queryClient.invalidateQueries({ queryKey: ['chatConversations'] });
    } catch {}
    setEditingConvId(null);
  };

  // Text-to-Speech toggle
  const toggleSpeech = async (msgId: string, contentText: string) => {
    try {
      if (speakingMsgId === msgId) {
        await Speech.stop();
        setSpeakingMsgId(null);
      } else {
        await Speech.stop();
        setSpeakingMsgId(msgId);
        
        // Clean markdown structures for TTS reading
        const cleanText = contentText
          .replace(/[#*`_-]/g, '')
          .replace(/⚠️ Bu bilgi yalnızca genel sağlık amaçlıdır\..*$/i, '');

        await Speech.speak(cleanText, {
          language: language === 'tr' ? 'tr-TR' : 'en-US',
          onDone: () => setSpeakingMsgId(null),
          onError: () => setSpeakingMsgId(null),
        });
      }
    } catch {
      setSpeakingMsgId(null);
    }
  };

  // Edit message
  const startEditMessage = (msg: Msg) => {
    setEditingMsgId(msg.id);
    setEditMsgText(msg.content);
  };

  const saveEditMessage = async (msgId: string) => {
    const trimmedText = editMsgText.trim();
    if (!trimmedText || loading) return;

    setLoading(true);
    setEditingMsgId(null);

    try {
      const r = await api.put(`/chat/message/${msgId}`, { content: trimmedText, language });
      // Update history list in cache
      queryClient.setQueryData(['chatHistory', activeConvId], r.data.messages);

      // Trigger typewriter for new AI message
      setTypedMessageIds(prev => {
        const next = new Set(prev);
        if (r.data.ai_message) {
          next.delete(r.data.ai_message.id);
        }
        return next;
      });

      queryClient.invalidateQueries({ queryKey: ['chatConversations'] });
      hapticSuccess();
    } catch (e: any) {
      hapticError();
      Alert.alert(L.error, e?.response?.data?.detail || 'Edit error');
    } finally {
      setLoading(false);
    }
  };

  // Regenerate last response
  const regenerateLastResponse = async () => {
    if (!activeConvId || loading) return;

    setLoading(true);

    try {
      const r = await api.post(`/chat/conversations/${activeConvId}/regenerate`);
      // Update history cache
      queryClient.setQueryData(['chatHistory', activeConvId], r.data.messages);

      // Trigger typewriter for new AI message
      setTypedMessageIds(prev => {
        const next = new Set(prev);
        if (r.data.ai_message) {
          next.delete(r.data.ai_message.id);
        }
        return next;
      });

      hapticSuccess();
    } catch (e: any) {
      hapticError();
      Alert.alert(L.error, e?.response?.data?.detail || 'Regenerate error');
    } finally {
      setLoading(false);
    }
  };

  // Filter conversations based on Search Query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    return conversations.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [conversations, searchQuery]);

  // Group conversations by date
  const groupedConversations = useMemo(() => {
    const today: Conversation[] = [];
    const yesterday: Conversation[] = [];
    const last7: Conversation[] = [];
    const older: Conversation[] = [];
    
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const startOfLast7 = startOfToday - (86400000 * 7);

    filteredConversations.forEach(c => {
      const ts = new Date(c.updated_at).getTime();
      if (ts >= startOfToday) today.push(c);
      else if (ts >= startOfYesterday) yesterday.push(c);
      else if (ts >= startOfLast7) last7.push(c);
      else older.push(c);
    });

    return [
      { title: L.today || 'Bugün', data: today },
      { title: L.yesterday || 'Dün', data: yesterday },
      { title: L.last7Days || 'Son 7 Gün', data: last7 },
      { title: L.older || 'Daha Eski', data: older },
    ].filter(g => g.data.length > 0);
  }, [filteredConversations, L]);

  const quickPrompts = language === 'tr'
    ? ['Uyku kalitesi önerileri', 'Beslenme planı oluştur', 'Daha detaylı anlat', 'İlaç yan etkileri']
    : ['Sleep quality tips', 'Create nutrition plan', 'Explain in detail', 'Medication side effects'];

  const PromptRail = () => (
    <View style={styles.promptContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promptRail}>
        {quickPrompts.map((prompt) => (
          <AnimatedPressable
            key={prompt}
            style={styles.promptChip}
            onPress={() => send(prompt)}
            disabled={loading}
          >
            <Sparkles size={14} color={chatTheme.cyan} />
            <Text style={styles.promptText}>{prompt}</Text>
          </AnimatedPressable>
        ))}
      </ScrollView>
    </View>
  );

  // Swipe Action Renderer
  const renderRightActions = (id: string, title: string) => (
    <AnimatedPressable
      style={styles.swipeDeleteBtn}
      onPress={() => deleteChat(id, title)}
    >
      <Trash2 size={18} color="#FFFFFF" />
    </AnimatedPressable>
  );

  // Reusable Sidebar content containing conversations search, and list
  const SidebarContent = () => (
    <View style={{ flex: 1, backgroundColor: chatTheme.surface }}>
      <View style={styles.drawerHeader}>
        <AnimatedPressable style={styles.newChatBtn} onPress={createNewChat}>
          <Sparkles size={18} color={chatTheme.bg} />
          <Text style={styles.newChatText}>{L.newChat || 'Yeni Sohbet'}</Text>
        </AnimatedPressable>
        {!isLargeScreen && (
          <AnimatedPressable style={styles.closeDrawerBtn} onPress={() => toggleDrawer(false)}>
            <X size={24} color={chatTheme.textMuted} />
          </AnimatedPressable>
        )}
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Search size={16} color={chatTheme.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={language === 'tr' ? 'Sohbetlerde ara...' : 'Search chats...'}
          placeholderTextColor={chatTheme.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          keyboardAppearance="dark"
        />
        {searchQuery ? (
          <AnimatedPressable onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
            <X size={16} color={chatTheme.textMuted} />
          </AnimatedPressable>
        ) : null}
      </View>

      <ScrollView style={styles.drawerScroll} contentContainerStyle={{ paddingBottom: 40 }}>
        {groupedConversations.map((group, gIdx) => (
          <View key={gIdx} style={styles.drawerGroup}>
            <Text style={styles.drawerGroupTitle}>{group.title}</Text>
            {group.data.map(conv => {
              const isActive = conv.id === activeConvId;
              const isEditing = conv.id === editingConvId;
              return (
                <Swipeable
                  key={conv.id}
                  renderRightActions={() => renderRightActions(conv.id, conv.title)}
                  friction={1.5}
                  rightThreshold={35}
                >
                  <AnimatedPressable 
                    style={[styles.drawerItem, isActive && styles.drawerItemActive]}
                    onPress={() => {
                      if (!isEditing) selectConversation(conv.id);
                    }}
                  >
                    <MessageCircle size={18} color={isActive ? chatTheme.textMain : chatTheme.textMuted} />
                    
                    {isEditing ? (
                      <TextInput
                        style={styles.renameInput}
                        value={editTitle}
                        onChangeText={setEditTitle}
                        autoFocus
                        onBlur={saveRename}
                        onSubmitEditing={saveRename}
                        returnKeyType="done"
                        keyboardAppearance="dark"
                      />
                    ) : (
                      <Text style={[styles.drawerItemText, isActive && styles.drawerItemTextActive]} numberOfLines={1}>
                        {conv.title}
                      </Text>
                    )}

                    {isActive && !isEditing && (
                      <View style={styles.drawerItemActions}>
                        <AnimatedPressable onPress={() => startRename(conv)} style={{ padding: 4 }}>
                          <Edit2 size={13} color={chatTheme.textMuted} />
                        </AnimatedPressable>
                        <AnimatedPressable onPress={() => deleteChat(conv.id, conv.title)} style={{ padding: 4 }}>
                          <Trash2 size={13} color={chatTheme.danger} />
                        </AnimatedPressable>
                      </View>
                    )}
                    {isEditing && (
                      <AnimatedPressable onPress={saveRename} style={{ padding: 4 }}>
                        <Check size={16} color={chatTheme.cyan} />
                      </AnimatedPressable>
                    )}
                  </AnimatedPressable>
                </Swipeable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.mainLayout}>
        {/* Static Left Sidebar for Web/Tablet */}
        {isLargeScreen && sidebarOpen && (
          <View style={styles.staticSidebar}>
            <SidebarContent />
          </View>
        )}

        {/* Right Active Chat Workspace */}
        <View style={styles.chatArea}>
          {/* Header */}
          <View style={styles.header}>
            {isLargeScreen ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <AnimatedPressable style={styles.headerIconBtn} onPress={() => setSidebarOpen(prev => !prev)} scaleTo={0.85}>
                  <Menu size={20} color={chatTheme.textMain} />
                </AnimatedPressable>
                <View style={styles.branding}>
                  <Sparkles size={16} color={chatTheme.cyan} />
                  <Text style={styles.brandingText}>MediAssist AI</Text>
                </View>
              </View>
            ) : (
              <AnimatedPressable style={styles.headerIconBtn} onPress={() => toggleDrawer(true)}>
                <Menu size={24} color={chatTheme.textMain} />
              </AnimatedPressable>
            )}
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle} numberOfLines={1}>{activeConversationTitle}</Text>
            </View>
            <AnimatedPressable style={styles.headerIconBtn} onPress={createNewChat}>
              <Plus size={24} color={chatTheme.textMain} />
            </AnimatedPressable>
          </View>

          {/* Main Workspace Area */}
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <View style={{ flex: 1 }}>
                {loadingMsgs && activeConvId ? (
                  <ActivityIndicator color={chatTheme.primary} style={{ marginTop: 50 }} />
                ) : messages.length === 0 ? (
                  <View style={styles.empty}>
                    <View style={styles.emptyLogo}>
                      <Sparkles size={40} color={chatTheme.cyan} />
                    </View>
                    <Text style={styles.emptyLead}>{L.chatEmpty?.split('!')[0]}!</Text>
                    <Text style={styles.emptyText}>
                      {language === 'tr' ? 'Neyle ilgili konuşmak istersiniz?' : 'What would you like to talk about?'}
                    </Text>
                    <PromptRail />
                  </View>
                ) : (
                  <FlatList
                    ref={listRef}
                    data={messages}
                    keyExtractor={(m) => m.id}
                    contentContainerStyle={styles.messageList}
                    keyboardDismissMode="on-drag"
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item, index }) => {
                      const isUser = item.role === 'user';
                      const isEditing = item.id === editingMsgId;
                      const isSpeaking = item.id === speakingMsgId;
                      const isLatestAiMessage = !isUser && index === messages.length - 1;
                      const shouldAnimate = isLatestAiMessage && !typedMessageIds.has(item.id);

                      return (
                        <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAi]}>
                          {!isUser && (
                            <View style={styles.aiAvatar}>
                              <Sparkles size={14} color={chatTheme.bg} />
                            </View>
                          )}
                          <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
                            {isUser ? (
                              isEditing ? (
                                <View style={styles.editContainer}>
                                  <TextInput
                                    style={styles.editInput}
                                    value={editMsgText}
                                    onChangeText={setEditMsgText}
                                    multiline
                                    keyboardAppearance="dark"
                                    autoFocus
                                  />
                                  <View style={styles.editActions}>
                                    <AnimatedPressable style={styles.editActionBtn} onPress={() => setEditingMsgId(null)}>
                                      <X size={14} color={chatTheme.textMuted} />
                                    </AnimatedPressable>
                                    <AnimatedPressable style={styles.editActionBtn} onPress={() => saveEditMessage(item.id)}>
                                      <Check size={14} color={chatTheme.cyan} />
                                    </AnimatedPressable>
                                  </View>
                                </View>
                              ) : (
                                <View>
                                  <Text style={styles.userText}>{item.content}</Text>
                                  <View style={styles.bubbleActionRowUser}>
                                    <AnimatedPressable onPress={() => startEditMessage(item)} style={styles.bubbleActionBtn}>
                                      <Pencil size={11} color="#C8D1D9" />
                                    </AnimatedPressable>
                                  </View>
                                </View>
                              )
                            ) : (
                              <View>
                                {shouldAnimate ? (
                                  <TypewriterText
                                    content={item.content}
                                    onComplete={() => {
                                      setTypedMessageIds(prev => {
                                        const next = new Set(prev);
                                        next.add(item.id);
                                        return next;
                                      });
                                    }}
                                  />
                                ) : (
                                  <Markdown style={markdownStyles}>
                                    {item.content}
                                  </Markdown>
                                )}
                                
                                <View style={styles.bubbleActionRowAi}>
                                  <AnimatedPressable onPress={() => toggleSpeech(item.id, item.content)} style={styles.bubbleActionBtn}>
                                    {isSpeaking ? (
                                      <VolumeX size={14} color={chatTheme.cyan} />
                                    ) : (
                                      <Volume2 size={14} color={chatTheme.textMuted} />
                                    )}
                                  </AnimatedPressable>

                                  {isLatestAiMessage && !loading && (
                                    <AnimatedPressable onPress={regenerateLastResponse} style={styles.bubbleActionBtn}>
                                      <RotateCw size={13} color={chatTheme.textMuted} />
                                    </AnimatedPressable>
                                  )}
                                </View>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    }}
                    ListFooterComponent={
                      loading ? (
                        <View style={[styles.messageRow, styles.messageRowAi]}>
                           <View style={styles.aiAvatar}>
                              <Sparkles size={14} color={chatTheme.bg} />
                           </View>
                          <View style={[styles.bubble, styles.bubbleAi, { paddingHorizontal: 16, paddingVertical: 12 }]}>
                            <TypingIndicator />
                          </View>
                        </View>
                      ) : null
                    }
                  />
                )}

                {/* Input Bar */}
                <View style={[
                  styles.inputContainer,
                  { paddingBottom: isKeyboardVisible ? (Platform.OS === 'ios' ? 16 : 12) : (tabBarHeight + 12) }
                ]}>
                  <View style={styles.inputGlass}>
                    <TextInput
                      style={styles.input}
                      value={text}
                      onChangeText={setText}
                      placeholder={L.chatPlaceholder}
                      placeholderTextColor={chatTheme.textMuted}
                      multiline
                      maxLength={1000}
                      keyboardAppearance="dark"
                    />
                    <AnimatedPressable 
                      style={[styles.sendBtn, !text.trim() && { opacity: 0.5, backgroundColor: chatTheme.surfaceHover }]} 
                      onPress={() => send()} 
                      disabled={!text.trim() || loading}
                      scaleTo={0.85}
                    >
                      <Send size={18} color={text.trim() ? '#FFF' : chatTheme.textMuted} />
                    </AnimatedPressable>
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </View>

      {/* Drawer Overlay for Mobile */}
      {!isLargeScreen && drawerOpen && (
        <TouchableWithoutFeedback onPress={() => toggleDrawer(false)}>
          <Animated.View style={[styles.drawerOverlay, overlayStyle]} />
        </TouchableWithoutFeedback>
      )}

      {/* Sidebar Drawer for Mobile */}
      {!isLargeScreen && (
        <Animated.View style={[styles.drawer, drawerStyle]}>
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
            <SidebarContent />
          </SafeAreaView>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: chatTheme.bg },
  mainLayout: { flex: 1, flexDirection: 'row' },
  staticSidebar: {
    width: 290,
    height: '100%',
    borderRightWidth: 1,
    borderRightColor: chatTheme.border,
    backgroundColor: chatTheme.surface,
  },
  chatArea: { flex: 1, height: '100%', backgroundColor: chatTheme.bg },
  branding: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4 },
  brandingText: { color: chatTheme.textMain, fontSize: 16, fontWeight: '800' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, height: 56,
    borderBottomWidth: 1, borderBottomColor: chatTheme.border,
  },
  headerIconBtn: {
    width: 40, height: 40, justifyContent: 'center', alignItems: 'center',
    borderRadius: radius.pill,
  },
  headerTitleContainer: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.md },
  headerTitle: { color: chatTheme.textMain, fontSize: 16, fontWeight: '700' },
  
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xxl },
  emptyLogo: { 
    width: 80, height: 80, borderRadius: 40, backgroundColor: chatTheme.surfaceHover, 
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg,
    borderWidth: 1, borderColor: chatTheme.border,
  },
  emptyLead: { color: chatTheme.textMain, fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: spacing.sm },
  emptyText: { color: chatTheme.textMuted, fontSize: 16, textAlign: 'center', marginBottom: spacing.xxl },
  
  promptContainer: { width: '100%', marginTop: spacing.xl },
  promptRail: { gap: spacing.md, paddingHorizontal: spacing.md },
  promptChip: {
    backgroundColor: chatTheme.surface,
    borderWidth: 1, borderColor: chatTheme.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  promptText: { color: chatTheme.textMain, fontSize: 14, fontWeight: '600' },

  messageList: { padding: spacing.lg, paddingBottom: 120 },
  messageRow: { width: '100%', marginBottom: spacing.lg, flexDirection: 'row' },
  messageRowUser: { justifyContent: 'flex-end' },
  messageRowAi: { justifyContent: 'flex-start' },
  
  aiAvatar: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: chatTheme.cyan,
    justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm,
    marginTop: 4,
  },
  
  bubble: { 
    maxWidth: '85%', paddingHorizontal: 16, paddingVertical: 12, 
    borderRadius: 20,
  },
  bubbleUser: { 
    backgroundColor: chatTheme.userBubble, 
    borderBottomRightRadius: 4,
  },
  bubbleAi: { 
    backgroundColor: chatTheme.aiBubble, 
    borderTopLeftRadius: 4,
    borderWidth: 1, borderColor: chatTheme.border,
  },
  userText: { color: '#FFFFFF', fontSize: 16, lineHeight: 22 },
  
  bubbleActionRowUser: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
    opacity: 0.6,
  },
  bubbleActionRowAi: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 6,
    gap: spacing.md,
    opacity: 0.8,
  },
  bubbleActionBtn: {
    padding: 4,
    borderRadius: radius.sm,
  },
  
  editContainer: {
    width: '100%',
    minWidth: 180,
  },
  editInput: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
    borderBottomWidth: 1,
    borderBottomColor: chatTheme.border,
    paddingBottom: 4,
    marginBottom: 8,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  editActionBtn: {
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: chatTheme.surfaceHover,
  },

  inputContainer: {
    paddingHorizontal: spacing.lg, paddingBottom: Platform.OS === 'ios' ? 24 : spacing.lg, paddingTop: spacing.md,
    backgroundColor: chatTheme.bg,
  },
  inputGlass: {
    flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: chatTheme.surface,
    borderRadius: 24,
    borderWidth: 1, borderColor: chatTheme.border,
    paddingHorizontal: spacing.md, paddingVertical: 8,
  },
  input: {
    flex: 1, color: chatTheme.textMain, fontSize: 16,
    maxHeight: 120, minHeight: 36, paddingTop: 8, paddingBottom: 8,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18, 
    backgroundColor: chatTheme.primary, 
    justifyContent: 'center', alignItems: 'center',
    marginLeft: spacing.sm, marginBottom: 2,
  },

  drawerOverlay: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: '#000000', zIndex: 10,
  },
  drawer: {
    position: 'absolute', top: 0, bottom: 0, left: 0,
    width: DRAWER_WIDTH, backgroundColor: chatTheme.surface,
    zIndex: 20, borderRightWidth: 1, borderRightColor: chatTheme.border,
    ...shadows.floating,
  },
  drawerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: chatTheme.border,
  },
  newChatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: chatTheme.textMain, paddingHorizontal: spacing.lg, paddingVertical: 12,
    borderRadius: radius.pill, flex: 1, marginRight: spacing.md,
  },
  newChatText: { color: chatTheme.bg, fontSize: 15, fontWeight: '700' },
  closeDrawerBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: chatTheme.bg,
    borderWidth: 1,
    borderColor: chatTheme.border,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.md,
    height: 38,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: chatTheme.textMain,
    fontSize: 14,
    padding: 0,
  },

  drawerScroll: { flex: 1, padding: spacing.lg },
  drawerGroup: { marginBottom: spacing.xl },
  drawerGroupTitle: { color: chatTheme.textMuted, fontSize: 12, fontWeight: '700', marginBottom: spacing.sm, marginLeft: spacing.xs, textTransform: 'uppercase' },
  drawerItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: spacing.md,
    borderRadius: radius.lg, marginBottom: 2, gap: spacing.md,
    backgroundColor: chatTheme.surface,
  },
  drawerItemActive: { backgroundColor: chatTheme.surfaceHover },
  drawerItemText: { flex: 1, color: chatTheme.textMain, fontSize: 15, fontWeight: '500' },
  drawerItemTextActive: { fontWeight: '700' },
  drawerItemActions: { flexDirection: 'row', gap: 4 },
  renameInput: {
    flex: 1, color: chatTheme.textMain, fontSize: 15, fontWeight: '500',
    backgroundColor: chatTheme.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm,
  },
  swipeDeleteBtn: {
    backgroundColor: chatTheme.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
    height: '100%',
    borderRadius: radius.md,
    marginBottom: 2,
  },
});

const markdownStyles = {
  body: { color: chatTheme.textMain, fontSize: 16, lineHeight: 24 },
  paragraph: { marginTop: 0, marginBottom: 12 },
  list_item: { marginBottom: 6 },
  strong: { fontWeight: 'bold' as const, color: '#FFFFFF' },
  code_inline: { backgroundColor: chatTheme.bg, paddingHorizontal: 4, borderRadius: 4, color: chatTheme.cyan },
  fence: { backgroundColor: chatTheme.bg, padding: 12, borderRadius: 8, borderColor: chatTheme.border, borderWidth: 1 },
};
