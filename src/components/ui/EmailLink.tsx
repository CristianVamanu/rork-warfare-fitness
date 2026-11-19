'use client';

/**
 * An email address that survives Cloudflare's email obfuscation.
 *
 * Cloudflare rewrites any address it finds in the HTML to "[email protected]"
 * and any mailto: link to its own decoder URL. React then hydrates against
 * text it did not write, throws a hydration error and re-renders the whole
 * subtree in the browser, on every page that shows the address.
 *
 * So the server HTML never contains a recognisable address: the text is
 * split around the @ (still reads and copies as one address), and the
 * mailto: link is only attached once the page is running.
 */
import { useEffect, useState } from 'react';

export function EmailLink({ email, className }: { email: string; className?: string }) {
  const [href, setHref] = useState<string | undefined>(undefined);
  useEffect(() => { setHref(`mailto:${email}`); }, [email]);
  const at = email.indexOf('@');
  if (at < 1) return <a href={href} className={className}>{email}</a>;
  return <a href={href} className={className}>{email.slice(0, at)}<span>@</span>{email.slice(at + 1)}</a>;
}
