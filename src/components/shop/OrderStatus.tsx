import type { ShopOrderStatus } from '@/types';

/** One vocabulary for order status across the member pages and admin. */
export const STATUS_LABEL: Record<ShopOrderStatus, { label: string; tone: string; step: number }> = {
  pending_payment: { label: 'Awaiting payment', tone: 'text-white/50 border-white/20', step: 0 },
  paid: { label: 'Paid', tone: 'text-accent border-accent/40', step: 1 },
  submitted: { label: 'Sent to production', tone: 'text-accent border-accent/40', step: 2 },
  in_production: { label: 'In production', tone: 'text-accent border-accent/40', step: 2 },
  shipped: { label: 'Shipped', tone: 'text-emerald-300 border-emerald-400/40', step: 3 },
  delivered: { label: 'Delivered', tone: 'text-emerald-300 border-emerald-400/40', step: 4 },
  cancelled: { label: 'Cancelled', tone: 'text-white/50 border-white/20', step: 0 },
  failed: { label: 'Needs attention', tone: 'text-amber-300 border-amber-400/40', step: 1 },
};

const STEPS = ['Paid', 'Production', 'Shipped', 'Delivered'];

export function StatusPill({ status }: { status: ShopOrderStatus }) {
  const s = STATUS_LABEL[status] ?? STATUS_LABEL.paid;
  return <span className={`inline-flex px-2.5 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wider ${s.tone}`}>{s.label}</span>;
}

/** The four-step tracker: paid → production → shipped → delivered. */
export function StatusTrack({ status }: { status: ShopOrderStatus }) {
  const step = STATUS_LABEL[status]?.step ?? 0;
  if (status === 'cancelled' || status === 'pending_payment') return null;
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Order progress">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = step >= n;
        return (
          <li key={label} className="text-center">
            <div className={`h-1.5 rounded-full ${done ? 'bg-accent shadow-glow-sm' : 'bg-white/15'}`} />
            <p className={`text-[10px] mt-1.5 font-semibold uppercase tracking-wider ${done ? 'text-accent' : 'text-white/40'}`}>{label}</p>
          </li>
        );
      })}
    </ol>
  );
}
