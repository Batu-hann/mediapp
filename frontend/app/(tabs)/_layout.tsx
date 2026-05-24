import React from 'react';
import { Tabs } from 'expo-router';
import { Home, Pill, MessageCircle, MapPin, User, FileText } from 'lucide-react-native';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../src/AuthContext';
import { t } from '../../src/i18n';

// ─── Animated Tab Button ────────────────────────────────
const AnimatedView = Animated.createAnimatedComponent(View);

function TabIcon({
  icon,
  focused,
  label,
}: {
  icon: React.ReactNode;
  focused: boolean;
  label: string;
}) {
  const scale = useSharedValue(1);
  const dotOpacity = useSharedValue(focused ? 1 : 0);

  React.useEffect(() => {
    dotOpacity.value = withSpring(focused ? 1 : 0, { damping: 18, stiffness: 200 });
    if (focused) {
      scale.value = withSpring(1.12, { damping: 12, stiffness: 280 });
      setTimeout(() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 200 });
      }, 120);
    }
  }, [focused]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
    transform: [{ scaleX: dotOpacity.value }],
  }));

  return (
    <View style={styles.tabIconContainer}>
      <AnimatedView style={[styles.tabIconWrapper, iconStyle, focused && styles.tabIconFocused]}>
        {icon}
      </AnimatedView>
      <AnimatedView style={[styles.activeDot, dotStyle]} />
    </View>
  );
}

// ─── Custom Tab Button ──────────────────────────────────
const makeTabButton = (testID: string, label: string) => {
  const TabButton = (props: any) => {
    const scale = useSharedValue(1);

    const handlePressIn = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      scale.value = withSpring(0.88, { damping: 15, stiffness: 300 });
    };

    const handlePressOut = () => {
      scale.value = withSpring(1, { damping: 14, stiffness: 220 });
    };

    const animStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    return (
      <AnimatedView
        style={[props.style, styles.tabButtonOuter, animStyle]}
        {...(props.accessibilityState || {})}
      >
        <View
          testID={testID}
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          // @ts-ignore
          onStartShouldSetResponder={() => true}
          onResponderGrant={() => {
            handlePressIn();
            if (props.onPress) props.onPress();
          }}
          onResponderRelease={handlePressOut}
        >
          {props.children}
        </View>
      </AnimatedView>
    );
  };
  TabButton.displayName = `TabButton(${testID})`;
  return TabButton;
};

// ─── Tab Bar Background ─────────────────────────────────
function FloatingTabBarBackground() {
  return (
    <BlurView
      intensity={Platform.OS === 'ios' ? 60 : 80}
      tint="light"
      style={StyleSheet.absoluteFill}
    />
  );
}

// ─── Layout ─────────────────────────────────────────────
export default function TabsLayout() {
  const { language } = useAuth();
  const L = t(language);

  const tabs = [
    { name: 'home', label: L.home, icon: Home, testID: 'tab-home' },
    { name: 'medications', label: L.medications, icon: Pill, testID: 'tab-medications' },
    { name: 'chat', label: L.chat, icon: MessageCircle, testID: 'tab-chat' },
    { name: 'lab-test', label: L.scanLabTest || 'Tahlil', icon: FileText, testID: 'tab-lab-test' },
    { name: 'pharmacy', label: L.pharmacy, icon: MapPin, testID: 'tab-pharmacy' },
    { name: 'profile', label: L.profile, icon: User, testID: 'tab-profile' },
  ];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => <FloatingTabBarBackground />,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      {tabs.map(({ name, label, icon: Icon, testID }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: label,
            tabBarIcon: ({ focused }) => (
              <TabIcon
                focused={focused}
                label={label}
                icon={
                  <Icon
                    size={22}
                    color={focused ? '#007AFF' : '#8E8E93'}
                    strokeWidth={focused ? 2.2 : 1.8}
                  />
                }
              />
            ),
            tabBarButton: makeTabButton(testID, label),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    height: 62,
    borderRadius: 32,
    borderTopWidth: 0,
    backgroundColor: 'rgba(255,255,255,0.75)',
    paddingBottom: 0,
    paddingTop: 0,
    // Soft premium shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
    elevation: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  tabItem: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 62,
  },
  tabButtonOuter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    height: 62,
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tabIconWrapper: {
    width: 44,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
  },
  tabIconFocused: {
    backgroundColor: 'rgba(0, 122, 255, 0.08)',
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#007AFF',
  },
});
