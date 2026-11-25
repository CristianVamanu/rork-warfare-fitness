/**
 * Illustrations for the fasting screens. Drawn here as plain SVG so they are
 * ours, load instantly and stay sharp. Each sits on a soft warm blob.
 */
const Blob = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 320 280" className="w-full max-w-[320px] mx-auto" aria-hidden>
    <path d="M40 150c0-60 50-78 96-96 50-20 104-34 140 14 30 40 24 110-6 150-34 44-110 46-166 40-44-5-64-50-64-108z" fill="#FBEBD9" />
    {children}
  </svg>
);

export const ART: Record<string, React.ReactNode> = {
  plate: (
    <Blob>
      <ellipse cx="160" cy="236" rx="92" ry="9" fill="#EBCFB4" />
      <circle cx="160" cy="150" r="88" fill="#FFFDF8" stroke="#EAD9C4" strokeWidth="5" />
      <circle cx="160" cy="150" r="58" fill="none" stroke="#F3E7D6" strokeWidth="3" />
      <path d="M150 112c26-8 50 14 46 42-4 26-34 38-54 24-22-16-18-58 8-66z" fill="#F4795B" />
      <path d="M152 124c16-4 30 10 28 26M146 138c10-2 20 6 20 18" stroke="#FBB9A6" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M186 120l16 12-18 10z" fill="#F6C945" /><path d="M186 120l8 11" stroke="#fff" strokeWidth="2" />
      <ellipse cx="128" cy="170" rx="16" ry="9" fill="#3BAA6B" transform="rotate(-30 128 170)" />
      <ellipse cx="196" cy="176" rx="14" ry="8" fill="#3BAA6B" transform="rotate(25 196 176)" />
      <circle cx="232" cy="74" r="17" fill="#E9503F" /><circle cx="232" cy="74" r="6" fill="#F8A79C" />
      <path d="M70 96c10-14 22-22 36-26M76 88l-2-12M86 80l0-12M96 74l4-10" stroke="#3BAA6B" strokeWidth="4" strokeLinecap="round" fill="none" />
      <rect x="108" y="96" width="9" height="78" rx="4.5" fill="#E8956F" /><path d="M112 172l44 54" stroke="#E8956F" strokeWidth="9" strokeLinecap="round" />
    </Blob>),
  question: (
    <Blob>
      <ellipse cx="192" cy="238" rx="34" ry="6" fill="#EBCFB4" /><ellipse cx="120" cy="230" rx="24" ry="5" fill="#EBCFB4" />
      <path d="M160 108c0-30 22-48 50-46 28 2 46 24 42 50-4 24-26 32-36 46-6 8-6 16-6 24" fill="none" stroke="#E2703A" strokeWidth="26" strokeLinecap="round" />
      <circle cx="210" cy="222" r="15" fill="#E2703A" />
      <path d="M98 132c0-18 12-28 28-26 16 2 24 16 20 30-3 12-14 16-20 24-3 4-3 8-3 12" fill="none" stroke="#F0A07E" strokeWidth="16" strokeLinecap="round" />
      <circle cx="123" cy="214" r="10" fill="#F0A07E" />
    </Blob>),
  calendar: (
    <Blob>
      <ellipse cx="160" cy="240" rx="88" ry="8" fill="#EBCFB4" />
      <rect x="84" y="78" width="152" height="156" rx="14" fill="#FFFDF8" />
      <path d="M84 92a14 14 0 0114-14h124a14 14 0 0114 14v24H84z" fill="#F0926B" />
      <rect x="112" y="60" width="14" height="40" rx="7" fill="#FFF1E6" /><rect x="194" y="60" width="14" height="40" rx="7" fill="#FFF1E6" />
      {[[106, 134], [146, 134], [186, 134], [106, 174]].map(([x, y]) => (
        <g key={`${x}${y}`}><rect x={x} y={y} width="30" height="30" rx="5" fill="#DDF3E4" /><path d={`M${x + 7} ${y + 16}l6 6 11-13`} stroke="#33B26A" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>))}
      <rect x="148" y="176" width="26" height="26" rx="4" fill="none" stroke="#E5484D" strokeWidth="5" />
    </Blob>),
  food: (
    <Blob>
      <ellipse cx="170" cy="238" rx="96" ry="8" fill="#EBCFB4" />
      <path d="M196 96c38 0 62 44 58 86-3 34-26 54-56 54s-56-22-58-56c-3-40 20-84 56-84z" fill="#3FBF8F" />
      <path d="M196 110c30 0 48 36 45 70-2 28-20 42-44 42s-44-16-46-44c-2-32 16-68 45-68z" fill="#EEF0D2" />
      <circle cx="197" cy="176" r="30" fill="#D9735A" /><path d="M182 168c4-10 14-14 22-12" stroke="#EFA08B" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M92 196c8-22 30-30 44-18 12 10 8 34-8 46-16 10-44-4-36-28z" fill="#B5673C" /><path d="M104 200c6-8 16-10 22-6" stroke="#8C4A28" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M132 190c12-14 32-12 38 4 5 14-6 32-22 36-18 4-28-24-16-40z" fill="#EBCF9B" /><path d="M146 200c6-4 12-2 14 4" stroke="#CDA865" strokeWidth="3" fill="none" strokeLinecap="round" />
    </Blob>),
  weights: (
    <Blob>
      <ellipse cx="170" cy="240" rx="100" ry="8" fill="#EBCFB4" />
      <path d="M172 118c0-22 16-34 38-34s38 12 38 34" fill="none" stroke="#FAC6A0" strokeWidth="16" />
      <circle cx="210" cy="176" r="58" fill="#FAC6A0" />
      <rect x="70" y="182" width="200" height="14" rx="7" fill="#FFFDF8" />
      <ellipse cx="112" cy="189" rx="22" ry="50" fill="#9A8CF5" /><ellipse cx="104" cy="189" rx="16" ry="50" fill="#6E5FD6" />
      <ellipse cx="226" cy="189" rx="22" ry="50" fill="#9A8CF5" /><ellipse cx="234" cy="189" rx="16" ry="50" fill="#6E5FD6" />
      <ellipse cx="246" cy="189" rx="10" ry="18" fill="#F6B07F" />
    </Blob>),
  ready: (
    <Blob>
      <ellipse cx="160" cy="240" rx="64" ry="7" fill="#EBCFB4" />
      <circle cx="160" cy="150" r="82" fill="#35BE94" />
      <path d="M124 152l26 26 48-56" stroke="#fff" strokeWidth="18" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Blob>),
  warning: (
    <svg viewBox="0 0 200 200" className="w-40 mx-auto" aria-hidden>
      <circle cx="104" cy="104" r="84" fill="#E8C7A6" /><circle cx="98" cy="98" r="84" fill="#FDE9C8" />
      <rect x="88" y="46" width="20" height="74" rx="10" fill="#F0862B" />
      <path d="M92 46c0-10 4-14 6-16 2 4 8 6 8 16" fill="#3BAA6B" />
      <circle cx="98" cy="146" r="12" fill="#E9503F" />
    </svg>),
};
