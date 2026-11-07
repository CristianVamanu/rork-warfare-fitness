import { LEGAL_OPERATOR } from '@/lib/legalDefaults';

/** Who runs the platform, for footers and legal pages. */
export function OperatorLine({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[11px] text-text-tertiary ${className}`}>
      Operated by {LEGAL_OPERATOR.name}, registered in England and Wales
      {LEGAL_OPERATOR.number ? `, company no. ${LEGAL_OPERATOR.number}` : ''}.
      {LEGAL_OPERATOR.address ? ` ${LEGAL_OPERATOR.address}.` : ''}
      {LEGAL_OPERATOR.email ? <> Contact: <a href={`mailto:${LEGAL_OPERATOR.email}`} className="underline underline-offset-2 hover:text-white">{LEGAL_OPERATOR.email}</a></> : null}
    </p>
  );
}
