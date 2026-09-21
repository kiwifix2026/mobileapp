import React from 'react';
import { ImageBackground, View, StyleSheet, ViewStyle } from 'react-native';

// Shared app-wide background — the fern/NZ-map image (assets/app-fern-bg.png)
// behind every screen except RoleSelectScreen (which has its own dedicated
// landing artwork). Was removed entirely per feedback, then brought back but
// toned down: a semi-opaque white scrim sits over the image so it reads as a
// faint watermark instead of a bold green backdrop, while still keeping
// #F8FAFC as the base fill (matches when the image is loading, and tints the
// scrim so it doesn't look stark white). Every screen's wrapping stays
// identical — only the visual fill changed, no per-screen edits needed.
export default function ScreenBackground({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <ImageBackground
      source={require('../../assets/app-fern-bg.png')}
      style={[styles.bg, style]}
      resizeMode="cover"
    >
      <View style={styles.scrim}>{children}</View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#F8FAFC' },
  // rgba white scrim over the image — high opacity keeps the fern pattern
  // barely visible (a faint texture) rather than the previous fully-opaque
  // photo. Bump the alpha down further if it still reads too strong.
  scrim: { flex: 1, backgroundColor: 'rgba(248, 250, 252, 0.88)' },
});
