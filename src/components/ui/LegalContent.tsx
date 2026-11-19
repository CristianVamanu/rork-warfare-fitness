'use client';

import { EmailLink } from './EmailLink';

/**
 * Minimal markdown-lite renderer for admin-editable legal pages.
 * Convention: a line starting with "## " is a section heading; blank
 * lines separate paragraphs; single newlines within a paragraph become <br/>.
 *
 * A heading may sit directly on top of its first paragraph with no blank
 * line between (that is how the default texts are written), so only the
 * first line of such a block is the heading and the rest is body copy.
 * Earlier this rendered the whole block as a bold white heading, which is
 * why the pages read as shouting.
 *
 * Headings are set as small tracked-out readouts with a hairline, the same
 * treatment as section labels elsewhere in the app, and body copy is
 * regular weight so a long document reads calmly.
 */
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

/**
 * A line of text with any email address in it rendered through EmailLink.
 * Left as plain text, Cloudflare rewrites the address in the HTML and the
 * page fails hydration (see EmailLink). It also makes the address tappable.
 */
function withEmails(line: string): React.ReactNode {
  const out: React.ReactNode[] = []; let last = 0;
  for (const m of line.matchAll(EMAIL)) {
    const i = m.index ?? 0;
    if (i > last) out.push(line.slice(last, i));
    out.push(<EmailLink key={i} email={m[0]} className="underline underline-offset-2 hover:text-white" />);
    last = i + m[0].length;
  }
  if (out.length === 0) return line;
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function LegalContent({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).filter(Boolean);
  const nodes: React.ReactNode[] = [];
  blocks.forEach((block, i) => {
    let body = block;
    if (block.startsWith('## ')) {
      const nl = block.indexOf('\n');
      const heading = (nl === -1 ? block : block.slice(0, nl)).replace(/^##\s*/, '');
      body = nl === -1 ? '' : block.slice(nl + 1);
      nodes.push(
        <div key={`h${i}`} className={`flex items-center gap-3 ${nodes.length === 0 ? '' : 'mt-8'} mb-2`}>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">{heading}</h2>
          <span className="flex-1 h-px bg-gradient-to-r from-accent/25 to-transparent" />
        </div>,
      );
    }
    if (!body.trim()) return;
    const lines = body.split('\n');
    nodes.push(
      <p key={`p${i}`} className="mb-4 last:mb-0">
        {lines.map((line, j) => (
          <span key={j}>
            {withEmails(line)}
            {j < lines.length - 1 && <br />}
          </span>
        ))}
      </p>,
    );
  });
  return <div className="text-[15px] font-normal text-text-secondary leading-7">{nodes}</div>;
}
