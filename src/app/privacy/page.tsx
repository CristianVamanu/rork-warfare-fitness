export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-12 max-w-2xl mx-auto">
      <h1 className="text-2xl font-black text-white mb-6">Privacy Policy</h1>

      <div className="space-y-6 text-sm text-text-secondary leading-relaxed">
        <section>
          <h2 className="text-base font-bold text-white mb-2">1. Data We Collect</h2>
          <p>We collect information you provide directly: name, email address, weight unit preference, fitness goals, workout logs, nutrition logs, and any content you post in community channels.</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-white mb-2">2. How We Use Your Data</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>To provide personalised workout and nutrition tracking</li>
            <li>To send you notifications and coaching messages you have opted into</li>
            <li>To manage membership and access control</li>
            <li>To improve the platform</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold text-white mb-2">3. Data Storage</h2>
          <p>Your data is stored securely in Google Firebase (Firestore and Authentication). Firebase stores data in Google-operated data centres and is covered by Google&apos;s security standards.</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-white mb-2">4. Data Sharing</h2>
          <p>We do not sell your personal data. Your data may be shared with your assigned trainer/coach as part of the coaching relationship. Third-party services (Stripe for payments, OpenAI for AI features) receive only the minimum data necessary to function.</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-white mb-2">5. Your Rights</h2>
          <p>You may request access to, correction of, or deletion of your personal data at any time by contacting your trainer or the platform operator.</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-white mb-2">6. Cookies</h2>
          <p>This platform uses Firebase Authentication session cookies to keep you logged in. No third-party advertising cookies are used.</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-white mb-2">7. Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time. Continued use of the platform after any changes constitutes acceptance.</p>
        </section>

        <p className="text-text-tertiary text-xs pt-4 border-t border-white/10">Last updated: {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
