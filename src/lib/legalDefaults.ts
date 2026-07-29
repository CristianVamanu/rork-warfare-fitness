export const DEFAULT_PRIVACY_POLICY = `## 1. Data We Collect
We collect information you provide directly: name, email address, weight unit preference, fitness goals, workout logs, nutrition logs, and any content you post in community channels.

## 2. How We Use Your Data
To provide personalised workout and nutrition tracking. To send you notifications and coaching messages you have opted into. To manage membership and access control. To improve the platform.

## 3. Data Storage
Your data is stored securely in Google Firebase (Firestore and Authentication). Firebase stores data in Google-operated data centres and is covered by Google's security standards.

## 4. Data Sharing
We do not sell your personal data. Your data may be shared with your assigned trainer/coach as part of the coaching relationship. Third-party services (Stripe for payments, OpenAI for AI features) receive only the minimum data necessary to function.

## 5. Your Rights
You may request access to, correction of, or deletion of your personal data at any time by contacting your trainer or the platform operator.

## 6. Cookies
This platform uses Firebase Authentication session cookies to keep you logged in. No third-party advertising cookies are used.

## 7. Changes to This Policy
We may update this Privacy Policy from time to time. Continued use of the platform after any changes constitutes acceptance.`;

export const DEFAULT_TERMS = `## 1. Acceptance of Terms
By creating an account and using this platform you agree to be bound by these Terms & Conditions. If you do not agree, do not use the platform.

## 2. Health & Safety Disclaimer
All workout programs, nutrition guidance, coaching advice, and content provided on this platform are for informational and educational purposes only. They do not constitute medical advice, diagnosis, or treatment.
Always consult a qualified physician or licensed healthcare professional before beginning any exercise or nutrition program, especially if you have any pre-existing medical conditions, injuries, or health concerns.
Exercise involves inherent risks including, but not limited to, muscular injury, cardiovascular events, and falls. You assume all such risks.
The platform owner and trainer(s) accept no liability whatsoever for any injury, illness, death, property damage, or other adverse outcome arising from your use of this platform or any programs therein.
You use this platform entirely at your own risk.

## 3. User Conduct
You agree not to post content that is unlawful, defamatory, harassing, abusive, or otherwise objectionable. The platform administrator may remove content or suspend accounts at their sole discretion.

## 4. Memberships & Payments
Membership fees, if applicable, are set by the platform operator and are non-refundable except where required by applicable law. You authorise the trainer to grant or revoke membership access at any time.

## 5. Intellectual Property
All workout programs, content, and materials are the property of the platform operator. You may not copy, distribute, or reproduce them without written permission.

## 6. Limitation of Liability
To the maximum extent permitted by law, the platform owner, operators, trainers, and any affiliated persons shall not be liable for any direct, indirect, incidental, special, consequential, or punitive damages arising out of your use of or inability to use the platform.

## 7. Changes to Terms
We reserve the right to update these Terms at any time. Continued use of the platform following any changes constitutes acceptance of the new Terms.`;

// Separate terms for the B2B/white-label install offer (/trainers) — a
// one-time setup service on the client's own infrastructure, not a
// consumer membership, so the consumer DEFAULT_TERMS above (health
// disclaimers, membership billing language, etc.) doesn't fit this
// relationship at all.
export const DEFAULT_B2B_TERMS = `## 1. Scope of Service
These terms govern the one-time white-label setup service ("the Service"): installing, branding, and configuring the platform on the client's own domain and server infrastructure. They are separate from, and do not apply to, the consumer-facing Terms & Conditions that govern individual athlete accounts on this platform.

## 2. One-Time Fee, No Recurring Charge
The Service is billed as a one-time setup fee agreed with the client before work begins. There is no recurring platform fee, no per-client fee, and no ongoing percentage of the client's own revenue, unless a separate optional maintenance/support agreement is explicitly agreed in writing.

## 3. Client Ownership
Once delivered, the installed instance runs on the client's own domain and infrastructure. The client is responsible for their own hosting, domain, and any third-party service costs (e.g. their own Firebase project, Stripe account) going forward.

## 4. Deliverables & Timeline
Setup timelines quoted are estimates, not guarantees, and may vary based on the client's responsiveness (providing branding assets, domain access, and account credentials in a timely manner) and the scope agreed at the time of purchase.

## 5. Support Window
A fixed period of post-launch setup support is included as agreed at the time of purchase. Support, feature requests, or changes requested after that window are available separately as a paid add-on, never assumed to be included.

## 6. No Guarantee of Business Results
The Service provides software and setup — it does not guarantee the client's own business outcomes (client acquisition, revenue, retention). The client is solely responsible for their own pricing, marketing, and client relationships.

## 7. Liability
To the maximum extent permitted by law, the platform operator's liability arising from the Service is limited to the amount actually paid for the Service. The operator is not liable for indirect, incidental, or consequential damages arising from the client's use of the delivered instance.

## 8. Changes to These Terms
These B2B Terms may be updated from time to time. The terms in effect at the time of purchase govern that specific engagement.`;
