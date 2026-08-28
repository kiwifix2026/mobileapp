import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { PosterStackParamList, PosterTabParamList } from './types';
import HomeScreen from '../screens/poster/HomeScreen';
import MyJobsScreen from '../screens/poster/MyJobsScreen';
import PostJobScreen from '../screens/poster/PostJobScreen';
import JobDetailScreen from '../screens/poster/JobDetailScreen';
import ProfileScreen from '../screens/poster/ProfileScreen';
import ConversationsListScreen from '../screens/shared/ConversationsListScreen';
import ChatThreadScreen from '../screens/shared/ChatThreadScreen';
import { getConversationsUnreadCount } from '../api/conversations';
import { useAuth } from '../auth/AuthContext';

const Stack = createNativeStackNavigator<PosterStackParamList>();
const Tab = createBottomTabNavigator<PosterTabParamList>();

// Bottom-tab shell — Home (dashboard) / Jobs (full posted-jobs list) /
// Messages / Profile — replacing the earlier single stack-only navigator.
// See TradieNavigator.tsx for the tradie-side equivalent and
// PosterStackParamList's doc comment in types.ts for why every tab-stack
// shares one flat param-list type instead of each having its own.
function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PostJob" component={PostJobScreen} options={{ title: 'Post a Job' }} />
      <Stack.Screen name="JobDetail" component={JobDetailScreen} options={{ title: 'Job Details' }} />
      <Stack.Screen name="ChatThread" component={ChatThreadScreen} options={{ title: '' }} />
      {/* Home's "See all →" pushes the full list here too, rather than
          switching tabs — keeps that link a simple in-stack push. */}
      <Stack.Screen name="MyJobs" component={MyJobsScreen} options={{ title: 'My Jobs' }} />
    </Stack.Navigator>
  );
}
function JobsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="MyJobs" component={MyJobsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PostJob" component={PostJobScreen} options={{ title: 'Post a Job' }} />
      <Stack.Screen name="JobDetail" component={JobDetailScreen} options={{ title: 'Job Details' }} />
      <Stack.Screen name="ChatThread" component={ChatThreadScreen} options={{ title: '' }} />
    </Stack.Navigator>
  );
}
function MessagesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="Conversations" component={ConversationsListScreen} options={{ title: 'Messages' }} />
      <Stack.Screen name="ChatThread" component={ChatThreadScreen} options={{ title: '' }} />
    </Stack.Navigator>
  );
}
function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

const TAB_ICONS: Record<keyof PosterTabParamList, string> = {
  HomeTab: '🏠',
  JobsTab: '📋',
  MessagesTab: '💬',
  ProfileTab: '👤',
};
const TAB_LABELS: Record<keyof PosterTabParamList, string> = {
  HomeTab: 'Home',
  JobsTab: 'Jobs',
  MessagesTab: 'Messages',
  ProfileTab: 'Profile',
};

// PostJob has its own full-screen wizard footer (Back/Next/Publish) — with
// the tab bar also showing underneath it, the two fixed bottom bars stacked
// and clipped the last bit of scrollable content. Hide the tab bar whenever
// PostJob is the focused screen within a tab's nested stack.
const FULL_SCREEN_ROUTES = new Set(['PostJob']);

export default function PosterNavigator() {
  const { session } = useAuth();

  // Polls the same unread-conversations count the Messages list itself uses
  // (see ConversationsListScreen/api/conversations.ts) so the tab icon shows
  // a number the moment something new comes in, not just once you open it.
  const { data: unreadCount } = useQuery({
    queryKey: ['conversationsUnread', session?.email],
    queryFn: () => getConversationsUnreadCount('customer', session!.token),
    enabled: !!session,
    refetchInterval: 20000,
  });

  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const focusedRouteName = getFocusedRouteNameFromRoute(route) ?? '';
        return {
          headerShown: false,
          tabBarActiveTintColor: '#16A34A',
          tabBarInactiveTintColor: '#94A3B8',
          tabBarLabel: TAB_LABELS[route.name as keyof PosterTabParamList],
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>{TAB_ICONS[route.name as keyof PosterTabParamList]}</Text>,
          tabBarStyle: FULL_SCREEN_ROUTES.has(focusedRouteName) ? { display: 'none' } : undefined,
        };
      }}
    >
      <Tab.Screen name="HomeTab" component={HomeStack} />
      <Tab.Screen name="JobsTab" component={JobsStack} />
      <Tab.Screen
        name="MessagesTab"
        component={MessagesStack}
        options={{ tabBarBadge: unreadCount ? unreadCount : undefined }}
      />
      <Tab.Screen name="ProfileTab" component={ProfileStack} />
    </Tab.Navigator>
  );
}
