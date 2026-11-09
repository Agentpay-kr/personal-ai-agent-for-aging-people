import React from 'react';
import { ActivityIndicator, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Compass, MessageCircle, ListChecks, UserRound } from 'lucide-react-native';
import { ThemeProvider, useTheme } from './design/Theme';
import { CompanionProvider, useCompanion } from './data/CompanionStore';
import type { RootStackParams, TabParams } from './data/types';
import { Copy, feedback, IconButton } from './components/ui';
import { ConnectScreen } from './screens/ConnectScreen';
import { OwnerConsentScreen } from './screens/OwnerConsentScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ChatScreen } from './screens/ChatScreen';
import { TasksScreen } from './screens/TasksScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { TaskScreen } from './screens/TaskScreen';

const Stack = createNativeStackNavigator<RootStackParams>();
const Tabs = createBottomTabNavigator<TabParams>();
function MainTabs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  return <Tabs.Navigator initialRouteName="Chat" screenListeners={{ tabPress: feedback }} screenOptions={{
    headerShown: false, tabBarHideOnKeyboard: true, tabBarAllowFontScaling: true, tabBarActiveTintColor: colors.accentInk, tabBarInactiveTintColor: colors.muted,
    tabBarButton: ({ children, style, onPress, ...props }) => <Pressable {...props} onPress={event => { if (Platform.OS === 'web') event.preventDefault(); onPress?.(event); }} style={[style, { borderRadius: 21, overflow: 'hidden' }]}>{children}</Pressable>,
    tabBarActiveBackgroundColor: colors.accent, sceneStyle: { backgroundColor: colors.canvas },
    tabBarStyle: { backgroundColor: colors.surface, borderTopWidth: 0, height: 72 + Math.max(0, fontScale - 1) * 32, paddingTop: 7, paddingBottom: 7, paddingHorizontal: 6, marginHorizontal: 16, marginBottom: Math.max(insets.bottom, 12), borderRadius: 36, elevation: 3, shadowColor: '#181818', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 4 } },
    tabBarItemStyle: { borderRadius: 21, marginHorizontal: 3, minHeight: 56 }, tabBarLabelStyle: { fontSize: 12, fontWeight: '600', marginTop: 2 }, tabBarIconStyle: { height: 28 },
  }}>
    <Tabs.Screen name="Chat" component={ChatScreen} options={{ title: '대화', tabBarButtonTestID: 'nav-chat', tabBarIcon: ({ color }) => <MessageCircle size={22} color={color} strokeWidth={1.7} /> }} />
    <Tabs.Screen name="Home" component={HomeScreen} options={{ title: '둘러보기', tabBarAccessibilityLabel: '둘러보기', tabBarButtonTestID: 'nav-home', tabBarIcon: ({ color }) => <Compass size={22} color={color} strokeWidth={1.7} /> }} />
    <Tabs.Screen name="Tasks" component={TasksScreen} options={{ title: '부탁', tabBarButtonTestID: 'nav-tasks', tabBarIcon: ({ color }) => <ListChecks size={22} color={color} strokeWidth={1.7} /> }} />
    <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title: '나의 몰라', tabBarButtonTestID: 'nav-profile', tabBarIcon: ({ color }) => <UserRound size={22} color={color} strokeWidth={1.7} /> }} />
  </Tabs.Navigator>;
}
function Navigation() {
  const { colors, dark, reducedMotion } = useTheme();
  const { loading, data, busy, error, connectionUrl, connect } = useCompanion();
  if (loading) return <View style={{ flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', gap: 20 }}><ActivityIndicator color={colors.action} /><Copy variant="caption" muted>우리의 공간을 불러와요</Copy></View>;
  if (!data.me.id) return <ConnectScreen defaultUrl={connectionUrl} busy={busy} error={error} onConnect={connect} />;
  if (data.me.consent !== 'active') return <OwnerConsentScreen />;
  return <NavigationContainer<RootStackParams> theme={{ ...(dark ? DarkTheme : DefaultTheme), colors: { ...(dark ? DarkTheme : DefaultTheme).colors, background: colors.canvas, card: colors.canvas, text: colors.ink, primary: colors.action, border: colors.line } }} linking={{ prefixes: ['molla://'], config: { screens: { Main: { screens: { Home: 'explore', Chat: '', Tasks: 'tasks', Profile: 'profile' } }, Task: 'task/:id' } } }}>
    <StatusBar style={dark ? 'light' : 'dark'} />
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: reducedMotion ? 'none' : 'default' }}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="Task" component={TaskScreen} options={({ navigation }) => ({ headerShown: true, title: '부탁 확인', presentation: Platform.OS === 'ios' ? 'modal' : 'card', headerBackVisible: false, headerLeft: () => <IconButton icon={ArrowLeft} label="대화로 돌아가기" onPress={() => navigation.goBack()} />, headerShadowVisible: false, headerTintColor: colors.ink, headerStyle: { backgroundColor: colors.canvas } })} />
    </Stack.Navigator>
  </NavigationContainer>;
}
export default function App() {
  return <SafeAreaProvider><ThemeProvider editorial={false}><CompanionProvider><Navigation /></CompanionProvider></ThemeProvider></SafeAreaProvider>;
}
