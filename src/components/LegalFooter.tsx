import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';

// Same footer line the web app shows on every page:
// "© <year> KiwiFix · PENZO GROUP LIMITED · Terms & Conditions · Privacy Policy".
// The two pages live on the public site (terms.html / privacy.html), so this
// just opens them in the system browser rather than duplicating the legal
// text inside the app.
const TERMS_URL = 'https://kiwifix.nz/terms.html';
const PRIVACY_URL = 'https://kiwifix.nz/privacy.html';

export default function LegalFooter({ style }: { style?: object }) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.links}>
        <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={6}>
          <Text style={styles.link}>Terms &amp; Conditions</Text>
        </Pressable>
        <Text style={styles.dot}>·</Text>
        <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={6}>
          <Text style={styles.link}>Privacy Policy</Text>
        </Pressable>
      </View>
      <Text style={styles.copy}>© {new Date().getFullYear()} KiwiFix · PENZO GROUP LIMITED</Text>
    </View>
  );
}

// Inline "By continuing, you agree to KiwiFix's Terms & Conditions." line
// for the sign-in / sign-up screens — same sentence as web's login pages.
export function TermsAgreement({ style }: { style?: object }) {
  return (
    <Text style={[styles.agree, style]}>
      By continuing, you agree to KiwiFix's{' '}
      <Text style={styles.agreeLink} onPress={() => Linking.openURL(TERMS_URL)}>
        Terms &amp; Conditions
      </Text>
      .
    </Text>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 16, gap: 6 },
  links: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  link: { fontSize: 12, color: '#475569', textDecorationLine: 'underline', fontWeight: '600' },
  dot: { fontSize: 12, color: '#94A3B8' },
  copy: { fontSize: 11, color: '#64748B' },
  agree: { fontSize: 12.5, color: '#64748B', textAlign: 'center', marginTop: 12 },
  agreeLink: { color: '#15803D', fontWeight: '600' },
});
