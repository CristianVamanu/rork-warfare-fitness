'use client';

// Catches errors that escape all the way to the root layout — the last
// line of defense. Shows a plain reload prompt rather than a blank white
// screen. Previously also reported to Sentry; the SDK was removed (see
// next.config.js), so the error is logged to the console instead.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  console.error('[GlobalError]', error);

  return (
    <html>
      <body style={{ background: '#0a0a0a', color: '#fff', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', textAlign: 'center', padding: 24 }}>
        <div>
          <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: '#999', marginBottom: 20, fontSize: 14 }}>Try reloading the page.</p>
          <button
            onClick={() => reset()}
            style={{ background: '#F5A623', color: '#000', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 600, cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
