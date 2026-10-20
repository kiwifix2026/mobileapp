import React from 'react';
import { Ionicons } from '@expo/vector-icons';
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
import SavedJobsScreen from '../screens/tradie/SavedJobsScreen';
import ConversationsListScreen from '../screens/shared/ConversationsListScreen';
import ChatThreadScreen from '../screens/shared/ChatThreadScreen';
import { getConversationsUnreadCount } from '../api/conversations';
import { listTradieMessages } from '../api/tradies';
import { useNotifyOnIncrease } from '../notifications/deviceNotifications';
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
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      <Stack.Screen name="SavedJobs" component={SavedJobsScreen} options={{ title: 'Saved Jobs' }} />
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
      <Stack.Screen name="SavedJobs" component={SavedJobsScreen} options={{ title: 'Saved Jobs' }} />
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
      <Stack.Screen name="SavedJobs" component={SavedJobsScreen} options={{ title: 'Saved Jobs' }} />
      <Stack.Screen name="TradieJobDetail" component={TradieJobDetailScreen} options={{ title: 'Job Details' }} />
      <Stack.Screen name="ChatThread" component={ChatThreadScreen} options={{ title: '' }} />
    </Stack.Navigator>
  );
}

// Same outline/filled Ionicons swap as PosterNavigator.tsx — see its
// TAB_ICONS comment for why the old plain-emoji tab bar was replaced.
const TAB_ICONS: Record<keyof TradieTabParamList, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  HomeTab: { active: 'home', inactive: 'home-outline' },
  JobsTab: { active: 'briefcase', inactive: 'briefcase-outline' },
  MessagesTab: { active: 'chatbubble-ellipses', inactive: 'chatbubble-ellipses-outline' },
  ProfileTab: { active: 'person', inactive: 'person-outline' },
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

  // Unread KiwiFix notifications (admin notes, invites, accepted notices) —
  // their list lives under Profile > Notifications now that the bell is gone,
  // so the Profile tab carries the badge. Same query key as the Home screen.
  const { data: messagesData } = useQuery({
    queryKey: ['tradieMessagesUnread', session?.email],
    queryFn: () => listTradieMessages(session!.token, session!.email),
    enabled: !!session,
    refetchInterval: 60000,
  });
  const unreadNotifications = messagesData?.unreadCount || 0;

  // Native phone notification when a new chat message arrives.
  useNotifyOnIncrease(unreadCount, 'New message on KiwiFix', (n) => (n === 1 ? 'You have a new message' : `You have ${n} new messages`));

  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const focusedRouteName = getFocusedRouteNameFromRoute(route) ?? '';
        return {
          headerShown: false,
          tabBarActiveTintColor: '#16A34A',
          tabBarInactiveTintColor: '#94A3B8',
          tabBarLabel: TAB_LABELS[route.name as keyof TradieTabParamList],
          tabBarIcon: ({ color, focused }) => {
            const icons = TAB_ICONS[route.name as keyof TradieTabParamList];
            return <Ionicons name={focused ? icons.active : icons.inactive} size={22} color={color} />;
          },
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
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{ tabBarBadge: unreadNotifications ? unreadNotifications : undefined }}
      />
    </Tab.Navigator>
  );
}
