import React from 'react';
import { Tabs } from 'expo-router';
import { Home, Pill, MessageCircle, MapPin, User } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { useAuth } from '../../src/AuthContext';
import { t } from '../../src/i18n';

export default function TabsLayout() {
  const { language } = useAuth();
  const L = t(language);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#A0AEC0',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: colors.borderLight,
          height: 70,
          paddingTop: 8,
          paddingBottom: 12,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: L.home,
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} strokeWidth={2} />,
          tabBarTestID: 'tab-home',
        }}
      />
      <Tabs.Screen
        name="medications"
        options={{
          title: L.medications,
          tabBarIcon: ({ color, size }) => <Pill size={size} color={color} strokeWidth={2} />,
          tabBarTestID: 'tab-medications',
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: L.chat,
          tabBarIcon: ({ color, size }) => <MessageCircle size={size} color={color} strokeWidth={2} />,
          tabBarTestID: 'tab-chat',
        }}
      />
      <Tabs.Screen
        name="pharmacy"
        options={{
          title: L.pharmacy,
          tabBarIcon: ({ color, size }) => <MapPin size={size} color={color} strokeWidth={2} />,
          tabBarTestID: 'tab-pharmacy',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: L.profile,
          tabBarIcon: ({ color, size }) => <User size={size} color={color} strokeWidth={2} />,
          tabBarTestID: 'tab-profile',
        }}
      />
    </Tabs>
  );
}
