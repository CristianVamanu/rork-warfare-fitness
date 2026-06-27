export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-12 max-w-2xl mx-auto">
      <h1 className="text-2xl font-black text-white mb-6">Terms & Conditions</h1>

      <div className="space-y-6 text-sm text-text-secondary leading-relaxed">
        <section>
          <h2 className="text-base font-bold text-white mb-2">1. Acceptance of Terms</h2>
          <p>By creating an account and using this platform you agree to be bound by these Terms & Conditions. If you do not agree, do not use the platform.</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-white mb-2">2. Health & Safety Disclaimer</h2>
          <p className="font-semibold text-yellow-400 mb-2">⚠️ Important — please read carefully.</p>
          <p>All workout programs, nutrition guidance, coaching advice, and content provided on this platform are for <strong className="text-white">informational and educational purposes only</strong>. They do not constitute medical advice, diagnosis, or treatment.</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Always consult a qualified physician or licensed healthcare professional before beginning any exercise or nutrition program, especially if you have any pre-existing medical conditions, injuries, or health concerns.</li>
            <li>Exercise involves inherent risks including, but not limited to, muscular injury, cardiovascular events, and falls. You assume all such risks.</li>
            <li>The platform owner and trainer(s) accept <strong className="text-white">no liability whatsoever</strong> for any injury, illness, death, property damage, or other adverse outcome arising from your use of this platform or any programs therein.</li>
            <li>You use this platform entirely <strong className="text-white">at your own risk</strong>.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold text-white mb-2">3. User Conduct</h2>
          <p>You agree not to post content that is unlawful, defamatory, harassing, abusive, or otherwise objectionable. The platform administrator may remove content or suspend accounts at their sole discretion.</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-white mb-2">4. Memberships & Payments</h2>
          <p>Membership fees, if applicable, are set by the platform operator and are non-refundable except where required by applicable law. You authorise the trainer to grant or revoke membership access at any time.</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-white mb-2">5. Intellectual Property</h2>
          <p>All workout programs, content, and materials are the property of the platform operator. You may not copy, distribute, or reproduce them without written permission.</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-white mb-2">6. Limitation of Liability</h2>
          <p>To the maximum extent permitted by law, the platform owner, operators, trainers, and any affiliated persons shall not be liable for any direct, indirect, incidental, special, consequential, or punitive damages arising out of your use of or inability to use the platform.</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-white mb-2">7. Changes to Terms</h2>
          <p>We reserve the right to update these Terms at any time. Continued use of the platform following any changes constitutes acceptance of the new Terms.</p>
        </section>

        <p className="text-text-tertiary text-xs pt-4 border-t border-white/10">Last updated: {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
