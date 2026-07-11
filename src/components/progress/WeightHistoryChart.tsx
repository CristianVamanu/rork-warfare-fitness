'use client';

import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

export default function WeightHistoryChart({ data, unit }: { data: { date: string; weightKg: number }[]; unit: 'kg' | 'lbs' }) {
  const display = data.map((d) => ({
    date: d.date.slice(5), // MM-DD
    weight: unit === 'lbs' ? Math.round(d.weightKg * 2.20462 * 10) / 10 : d.weightKg,
  }));

  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={display}>
        <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
        <Tooltip
          contentStyle={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
          labelStyle={{ color: '#94a3b8' }}
          formatter={(v: number) => [`${v} ${unit}`, 'Weight']}
        />
        <Line type="monotone" dataKey="weight" stroke="#F5A623" strokeWidth={2.5} dot={{ fill: '#F5A623', r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
