'use client';

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
            {line}
            {j < lines.length - 1 && <br />}
          </span>
        ))}
      </p>,
    );
  });
  return <div className="text-[15px] font-normal text-text-secondary leading-7">{nodes}</div>;
}
