import React from 'react';
import { Tabs } from 'expo-router';
import { Home, Pill, MessageCircle, MapPin, User, FileText } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { colors } from '../../src/theme';
import { useAuth } from '../../src/AuthContext';
import { t } from '../../src/i18n';

const makeTabButton = (testID: string) => (props: any) => (
  <Pressable {...props} testID={testID} android_ripple={{ color: 'transparent' }}>
    {props.children}
  </Pressable>
);

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
          tabBarButton: makeTabButton('tab-home'),
        }}
      />
      <Tabs.Screen
        name="medications"
        options={{
          title: L.medications,
          tabBarIcon: ({ color, size }) => <Pill size={size} color={color} strokeWidth={2} />,
          tabBarButton: makeTabButton('tab-medications'),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: L.chat,
          tabBarIcon: ({ color, size }) => <MessageCircle size={size} color={color} strokeWidth={2} />,
          tabBarButton: makeTabButton('tab-chat'),
        }}
      />
      <Tabs.Screen
        name="lab-test"
        options={{
          title: L.scanLabTest || 'Tahlil',
          tabBarIcon: ({ color, size }) => <FileText size={size} color={color} strokeWidth={2} />,
          tabBarButton: makeTabButton('tab-lab-test'),
        }}
      />
      <Tabs.Screen
        name="pharmacy"
        options={{
          title: L.pharmacy,
          tabBarIcon: ({ color, size }) => <MapPin size={size} color={color} strokeWidth={2} />,
          tabBarButton: makeTabButton('tab-pharmacy'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: L.profile,
          tabBarIcon: ({ color, size }) => <User size={size} color={color} strokeWidth={2} />,
          tabBarButton: makeTabButton('tab-profile'),
        }}
      />
    </Tabs>
  );
}
