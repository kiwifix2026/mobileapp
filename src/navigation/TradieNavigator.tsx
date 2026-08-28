import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { TradieStackParamList, TradieTabParamList } from './types';
import BrowseJobsScreen from '../screens/tradie/BrowseJobsScreen';
import TradieJobDetailScreen from '../screens/tradie/TradieJobDetailScreen';
import MyApplicationsScreen from '../screens/tradie/MyApplicationsScreen';
import TradieJobInvitesScreen from '../screens/tradie/TradieJobInvitesScreen';
import NotificationsScreen from '../screens/tradie/NotificationsScreen';
import EditProfileScreen from '../screens/tradie/EditProfileScreen';
import ViewProfileScreen from '../screens/tradie/ViewProfileScreen';
import ProfileMenuScreen from '../screens/tradie/ProfileMenuScreen';
import ConversationsListScreen from '../screens/shared/ConversationsListScreen';
import ChatThreadScreen from '../screens/shared/ChatThreadScreen';
import { getConversationsUnreadCount } from '../api/conversations';
import { useAuth } from '../auth/AuthContext';

const Stack = createNativeStackNavigator<TradieStackParamList>();
const Tab = createBottomTabNavigator<TradieTabParamList>();

// Bottom-tab shell — Home (dashboard) / Jobs (my applications) / Messages /
// Profile — replacing the earlier single stack-only navigator. Each tab is
// its own Stack.Navigator so a tradie can still drill into job details,
// chat, or profile screens from whichever tab they're on, while the tab bar
// itself stays put. See PosterNavigator.tsx for the same pattern on the
// job-poster side, and TradieStackParamList's doc comment in types.ts for
// why every tab-stack shares one flat param-list type.
function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="BrowseJobs" component={BrowseJobsScreen} options={{ headerShown: false }} />
      {/* Registered here too so the dashboard's "Active Jobs"/"Jobs
          Completed" stat cards can push straight into a filtered view —
          navigation.navigate only finds a screen within the CURRENT
          Stack.Navigator, so it needs to exist in both Home and Jobs. */}
      <Stack.Screen name="MyApplications" component={MyApplicationsScreen} options={{ title: 'My Applications' }} />
      <Stack.Screen name="TradieJobInvites" component={TradieJobInvitesScreen} options={{ title: 'Job Invites' }} />
      <Stack.Screen name="TradieJobDetail" component={TradieJobDetailScreen} options={{ title: 'Job Details' }} />
      <Stack.Screen name="ChatThread" component={ChatThreadScreen} options={{ title: '' }} />
    </Stack.Navigator>
  );
}
function JobsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="MyApplications" component={MyApplicationsScreen} options={{ title: 'My Applications' }} />
      <Stack.Screen name="TradieJobInvites" component={TradieJobInvitesScreen} options={{ title: 'Job Invites' }} />
      <Stack.Screen name="TradieJobDetail" component={TradieJobDetailScreen} options={{ title: 'Job Details' }} />
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
      <Stack.Screen name="ProfileMenu" component={ProfileMenuScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ViewProfile" component={ViewProfileScreen} options={{ title: 'My Profile' }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit Profile' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      {/* Notifications can push straight into a job's details (see its
          jobId link) — registered here too so that still works from the
          Profile tab, not just Home/Jobs. */}
      <Stack.Screen name="TradieJobDetail" component={TradieJobDetailScreen} options={{ title: 'Job Details' }} />
      <Stack.Screen name="ChatThread" component={ChatThreadScreen} options={{ title: '' }} />
    </Stack.Navigator>
  );
}

const TAB_ICONS: Record<keyof TradieTabParamList, string> = {
  HomeTab: '🏠',
  JobsTab: '📋',
  MessagesTab: '💬',
  ProfileTab: '👤',
};
const TAB_LABELS: Record<keyof TradieTabParamList, string> = {
  HomeTab: 'Home',
  JobsTab: 'Jobs',
  MessagesTab: 'Messages',
  ProfileTab: 'Profile',
};

// EditProfile has its own full-screen form footer (Save changes) — with the
// tab bar also showing underneath it, the two fixed bottom bars stacked and
// clipped the last field. Hide the tab bar whenever EditProfile is focused.
const FULL_SCREEN_ROUTES = new Set(['EditProfile']);

export default function TradieNavigator() {
  const { session } = useAuth();

  // Same live unread-conversations badge as PosterNavigator.tsx — polls the
  // count the Messages list itself uses so the tab shows a number as soon as
  // something new comes in.
  const { data: unreadCount } = useQuery({
    queryKey: ['conversationsUnread', session?.email],
    queryFn: () => getConversationsUnreadCount('tradie', session!.token, session!.email),
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
          tabBarLabel: TAB_LABELS[route.name as keyof TradieTabParamList],
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>{TAB_ICONS[route.name as keyof TradieTabParamList]}</Text>,
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
