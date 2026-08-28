import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AuthStackParamList } from './types';
import RoleSelectScreen from '../screens/auth/RoleSelectScreen';
import EmailEntryScreen from '../screens/auth/EmailEntryScreen';
import OtpScreen from '../screens/auth/OtpScreen';
import TradieVerifyOtpScreen from '../screens/auth/TradieVerifyOtpScreen';
import TradieOnboardingScreen from '../screens/auth/TradieOnboardingScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="RoleSelect" component={RoleSelectScreen} options={{ headerShown: false }} />
      <Stack.Screen name="EmailEntry" component={EmailEntryScreen} options={{ title: '' }} />
      <Stack.Screen name="Otp" component={OtpScreen} options={{ title: '' }} />
      <Stack.Screen name="TradieVerifyOtp" component={TradieVerifyOtpScreen} options={{ title: '' }} />
      <Stack.Screen name="TradieOnboarding" component={TradieOnboardingScreen} options={{ title: 'New Tradie' }} />
    </Stack.Navigator>
  );
}
