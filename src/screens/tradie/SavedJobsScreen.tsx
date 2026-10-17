import React, { useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import type { TradieStackParamList } from '../../navigation/types';
import { useSavedJobs } from '../../api/useSavedJobs';
import ScreenBackground from '../../components/ScreenBackground';

type Props = NativeStackScreenProps<TradieStackParamList, 'SavedJobs'>;

// Port of tradie-dashboard.html's "🔖 Saved Jobs" card as its own screen.
export default function SavedJobsScreen({ navigation }: Props) {
  const { saved, isLoading, refetch, toggle } = useSavedJobs();
  const tabBarHeight = useBottomTabBarHeight();
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={saved}
            keyExtractor={(j) => j.id}
            contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 20 }]}
            ListEmptyComponent={
              <Text style={styles.empty}>No saved jobs yet — tap ☆ Save on a job to keep it here for later.</Text>
            }
            renderItem={({ item }) => (
              <Pressable style={styles.card} onPress={() => navigation.navigate('TradieJobDetail', { jobId: item.id })}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.category}>{item.category}</Text>
                  <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
                  {(item.suburb || item.city) && (
                    <Text style={styles.loc}>📍 {[item.suburb, item.city].filter(Boolean).join(', ')}</Text>
                  )}
                  {item.status !== 'OPEN' && <Text style={styles.closed}>No longer open</Text>}
                </View>
                <Pressable hitSlop={8} onPress={() => toggle(item.id)} style={styles.unsaveBtn}>
                  <Text style={styles.unsaveText}>★ Saved</Text>
                </Pressable>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: 16, paddingTop: 20 },
  empty: { fontSize: 14, color: '#475569', fontWeight: '500', textAlign: 'center', marginTop: 60, paddingHorizontal: 24 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 16, padding: 16, marginBottom: 10,
    shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  category: { fontSize: 16, fontWeight: '800', color: '#14251B' },
  desc: { fontSize: 14, color: '#475569', marginTop: 4, lineHeight: 20 },
  loc: { fontSize: 13, color: '#64748B', marginTop: 6 },
  closed: { fontSize: 12, color: '#B45309', fontWeight: '700', marginTop: 6 },
  unsaveBtn: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  unsaveText: { color: '#16A34A', fontWeight: '700', fontSize: 12 },
});
