'use client';

import { PaywallGate } from '@/components/ui/PaywallGate';
import { FastingScreen } from '@/components/fasting/FastingScreen';

export default function FastingPage() {
  return <PaywallGate feature="fasting" noTaste><FastingScreen /></PaywallGate>;
}
