import React from 'react';
import { View, Text, Pressable, StyleSheet, ImageBackground, SafeAreaView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'RoleSelect'>;

// Full-bleed hero background (assets/landing.png) — logo, headline, and
// subtitle are already baked into the image itself. Using ImageBackground
// (fills via flex:1, children render on top natively) rather than a
// manually-sized Image + percentage/aspectRatio wrapper — that's what broke
// on the earlier two-card version, since a plain Image's percentage width
// doesn't reliably resolve when nested inside a flex sibling. ImageBackground
// doesn't have that problem because it isn't fighting its own children for
// layout — it just fills whatever bounds `style` gives it.
export default function RoleSelectScreen({ navigation }: Props) {
  return (
    <ImageBackground
      source={require('../../../assets/landing.png')}
      style={styles.bg}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.buttonStack}>
          <Pressable
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => navigation.navigate('EmailEntry', { role: 'customer' })}
          >
            <Text style={styles.btnPrimaryText}>I'm a Job Poster →</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnSecondary]}
            onPress={() => navigation.navigate('EmailEntry', { role: 'tradie' })}
          >
            <Text style={styles.btnSecondaryText}>I'm a Tradie →</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1, justifyContent: 'flex-end' },
  buttonStack: { paddingHorizontal: 24, paddingBottom: 32, gap: 12 },
  btn: { borderRadius: 28, paddingVertical: 17, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#16A34A' },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnSecondary: { backgroundColor: '#fff' },
  btnSecondaryText: { color: '#14532D', fontWeight: '800', fontSize: 16 },
});
