'use client';

/**
 * Minimal markdown-lite renderer for admin-editable legal pages.
 * Convention: lines starting with "## " become section headings; blank
 * lines separate paragraphs; single newlines within a paragraph become <br/>.
 */
export function LegalContent({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).filter(Boolean);
  return (
    <div className="space-y-6 text-sm text-text-secondary leading-relaxed">
      {blocks.map((block, i) => {
        if (block.startsWith('## ')) {
          return (
            <h2 key={i} className="text-base font-bold text-white mb-2">
              {block.replace(/^##\s*/, '')}
            </h2>
          );
        }
        return (
          <p key={i}>
            {block.split('\n').map((line, j) => (
              <span key={j}>
                {line}
                {j < block.split('\n').length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
