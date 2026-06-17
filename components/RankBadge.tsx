import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getUserRankTier } from '@/contexts/RankingContext';

type Props = {
  points: number;
  size?: 'sm' | 'md' | 'lg';
};

export default function RankBadge({ points, size = 'md' }: Props) {
  const tier = getUserRankTier(points);
  const s = size === 'sm'
    ? { fontSize: 10, padding: 4, iconSize: 12 }
    : size === 'lg'
    ? { fontSize: 14, padding: 8, iconSize: 18 }
    : { fontSize: 12, padding: 6, iconSize: 14 };

  return (
    <View style={[styles.badge, { borderColor: tier.color, paddingHorizontal: s.padding, paddingVertical: s.padding / 2 }]}>
      <Text style={{ fontSize: s.iconSize }}>{tier.icon}</Text>
      <Text style={[styles.label, { color: tier.color, fontSize: s.fontSize }]}>
        {tier.label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  label: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
