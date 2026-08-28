import React, { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';

// Mirrors the web app's ADDRESS AUTOCOMPLETE block in app.js almost exactly
// (Photon/OSM, free, no key — see kiwifix_address_geocoding memory for the
// known NZ suburb/city accuracy limitations this works around). Kept as its
// own component since both job posting and (eventually) profile address
// editing need the same confirm-a-full-address behaviour.
const NZ_BBOX = '165.7,-47.3,178.6,-34.3';

export type ConfirmedAddress = {
  display: string;
  region: string;
  city: string;
  suburb: string;
  street: string;
  houseNumber: string;
  postcode: string;
};

type PhotonResult = ConfirmedAddress & { isFull: boolean };

function parsePhotonFeatures(features: any[]): PhotonResult[] {
  return features
    .filter((f) => f.properties?.country === 'New Zealand')
    .map((f) => {
      const p = f.properties || {};
      const rawCity = p.city || p.town || p.village || '';
      const county = p.county || '';
      const countyCity = /city$/i.test(county.trim()) ? county.replace(/\s*city$/i, '').trim() : '';
      const cityName = countyCity || (p.state === 'Auckland' ? 'Auckland' : rawCity);
      const suburbName = [p.suburb, p.district, p.locality, p.neighbourhood].find(
        (v) => v && v !== cityName && v !== rawCity,
      );
      const regionName = p.state || '';
      const houseNumber = p.housenumber || '';
      const street = p.street || '';
      const postcode = p.postcode || '';
      const suburb = suburbName || cityName || '';
      const parts: string[] = [];
      if (houseNumber || street) parts.push([houseNumber, street].filter(Boolean).join(' '));
      if (suburb) parts.push(suburb);
      if (cityName) parts.push(cityName);
      if (postcode) parts.push(postcode);
      if (!parts.length && p.name) parts.push(p.name);
      const display = parts.join(', ') || p.name || '';
      const isFull = !!(houseNumber && street);
      return { display, region: regionName, city: cityName, suburb, street, houseNumber, postcode, isFull };
    });
}

type Props = {
  label: string;
  value: ConfirmedAddress | null;
  onChange: (value: ConfirmedAddress | null) => void;
};

export default function AddressAutocompleteField({ label, value, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PhotonResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(text.trim())}&bbox=${NZ_BBOX}&limit=8&lang=en`;
        const res = await fetch(url);
        const data = await res.json();
        const parsed = parsePhotonFeatures(data.features || []).filter((r) => r.isFull);
        setResults(parsed);
      } catch {
        setResults([]);
      } finally {
        setSearched(true);
        setLoading(false);
      }
    }, 350);
  };

  if (value) {
    return (
      <View style={styles.wrap}>
        <View style={styles.confirmedTop}>
          <Text style={styles.label}>{label}</Text>
          <Pressable onPress={() => { onChange(null); setQuery(''); setResults([]); setSearched(false); }}>
            <Text style={styles.changeBtn}>Change</Text>
          </Pressable>
        </View>
        <View style={styles.confirmedCard}>
          <Text style={styles.confirmedStreet}>{[value.houseNumber, value.street].filter(Boolean).join(' ')}</Text>
          <Text style={styles.confirmedSub}>
            {value.suburb ? `${value.suburb}, ` : ''}
            <Text style={styles.confirmedCity}>{value.city}</Text>
            {value.postcode ? ` ${value.postcode}` : ''}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder="Start typing your house number and street…"
        value={query}
        onChangeText={search}
      />
      {loading && <ActivityIndicator style={styles.loading} size="small" />}
      {!loading && searched && query.trim().length >= 3 && (
        <View style={styles.dropdown}>
          {results.length ? (
            results.map((r, i) => (
              <Pressable
                key={i}
                style={styles.option}
                onPress={() => {
                  onChange(r);
                  setResults([]);
                  setSearched(false);
                }}
              >
                <Text style={styles.optionStreet}>{[r.houseNumber, r.street].filter(Boolean).join(' ')}</Text>
                <Text style={styles.optionSub}>
                  {r.suburb ? `${r.suburb}, ` : ''}
                  <Text style={styles.optionCity}>{r.city}</Text>
                  {r.postcode ? ` ${r.postcode}` : ''}
                </Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.empty}>Keep typing your house number and street name for a full address match</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 8, color: '#334155' },
  input: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  loading: { marginTop: 8 },
  dropdown: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, marginTop: 6, overflow: 'hidden',
  },
  option: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  optionStreet: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  optionSub: { fontSize: 13, color: '#64748B', marginTop: 2 },
  optionCity: { fontWeight: '700', color: '#334155' },
  empty: { fontSize: 13, color: '#94A3B8', padding: 12 },
  confirmedTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  changeBtn: { color: '#2563EB', fontWeight: '600', fontSize: 13 },
  confirmedCard: {
    borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  confirmedStreet: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  confirmedSub: { fontSize: 13, color: '#64748B', marginTop: 4 },
  confirmedCity: { fontWeight: '700', color: '#334155' },
});
