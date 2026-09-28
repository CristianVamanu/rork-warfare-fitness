/**
 * The legal entity behind the platform. Shown in footers, on the legal
 * pages and in the default Terms and Privacy text. Fill in the company
 * number and registered office from Companies House; leave a field empty
 * to hide it until you have it.
 */
export const LEGAL_OPERATOR = {
  name: 'Davcris Ltd',
  number: '',
  address: '',
  email: '',
};

export const DEFAULT_PRIVACY_POLICY = `## Who we are
This platform is operated by Davcris Ltd, a company registered in England and Wales, which is the data controller for your personal data. Contact details are in the footer of every page.

## 1. Data We Collect
We collect information you provide directly: name, email address, weight unit preference, fitness goals, workout logs, nutrition logs, and any content you post in community channels.

## 2. How We Use Your Data
To provide personalised workout and nutrition tracking. To send you notifications and coaching messages you have opted into. To manage membership and access control. To improve the platform.

## 3. Data Storage
Your data is stored securely in Google Firebase (Firestore and Authentication). Firebase stores data in Google-operated data centres and is covered by Google's security standards.

## 4. Data Sharing
We do not sell your personal data. Your data may be shared with your assigned trainer/coach as part of the coaching relationship. Third-party services (Stripe for payments, OpenAI for AI features) receive only the minimum data necessary to function.

## 5. Your Rights
Under UK and EU data protection law you may access, correct, export or delete your personal data, object to or restrict its processing, and withdraw consent at any time. You can delete your account and its data yourself from Settings. For anything else, contact us using the details in the footer. You also have the right to complain to the Information Commissioner's Office (ico.org.uk) or your local supervisory authority.

## 6. Cookies and Analytics
Essential cookies keep you signed in and are always on. With your consent, given through the cookie banner, we also load the Meta Pixel and Google Analytics to measure our advertising and to understand how the site is used, and a third-party chat widget on public pages. You can change your choice at any time from Settings. Rejecting these never limits the app.

## 6a. AI Features
Some features use artificial intelligence, including analysis of food photos, barcode matches, meal ideas and generated training suggestions. Photos and text you submit to those features are sent to OpenAI to produce the result and are not used by OpenAI to train its models under our agreement with them. The results are estimates and can be inaccurate.

## 7. Changes to This Policy
We may update this Privacy Policy from time to time. Continued use of the platform after any changes constitutes acceptance.`;

export const DEFAULT_TERMS = `## 1. Acceptance of Terms
This platform is operated by Davcris Ltd, a company registered in England and Wales ("we", "us"). By creating an account and using this platform you agree to be bound by these Terms & Conditions. If you do not agree, do not use the platform.

You must be at least 18 years old to create an account. By registering you confirm that you are.

## 2. Health & Safety Disclaimer
All workout programs, nutrition guidance, coaching advice, and content provided on this platform are for informational and educational purposes only. They do not constitute medical advice, diagnosis, or treatment.
Always consult a qualified physician or licensed healthcare professional before beginning any exercise or nutrition program, especially if you have any pre-existing medical conditions, injuries, or health concerns.
Exercise involves inherent risks including, but not limited to, muscular injury, cardiovascular events, and falls. You assume all such risks.
The platform owner and trainer(s) accept no liability whatsoever for any injury, illness, death, property damage, or other adverse outcome arising from your use of this platform or any programs therein.
You use this platform entirely at your own risk.

## 3. User Conduct
You agree not to post content that is unlawful, defamatory, harassing, abusive, or otherwise objectionable. The platform administrator may remove content or suspend accounts at their sole discretion.

## 4. Memberships, Payments & Cancellation
Membership is a recurring subscription. Unless stated otherwise at checkout, it begins with an introductory period at the price shown and then renews automatically at the plan price and interval shown at checkout until you cancel. You can cancel at any time from your profile; access continues to the end of the period already paid for and no further charges are made.

Because the service is digital and starts immediately, by completing checkout you request that we begin the service at once and you acknowledge that, once it has begun, your statutory 14-day right to cancel no longer applies to the period already supplied. This does not affect your right to cancel future renewals, or any refund you are entitled to by law where the service is faulty or not as described. Requests for refunds outside those cases are considered at our discretion.

Payments are processed by Stripe. We do not store your card details.

## 5. Intellectual Property
All workout programs, content, and materials are the property of the platform operator. You may not copy, distribute, or reproduce them without written permission.

## 5a. AI Features and Estimates
Food analysis, barcode matching, meal ideas and any generated training suggestions are produced with artificial intelligence and are estimates. They can be wrong, sometimes significantly. They are not medical or dietary advice. Check food labels and portions yourself, and take advice from a doctor or registered dietitian before changing what you eat for a medical condition, pregnancy, or an allergy.

## 6. Limitation of Liability
Nothing in these Terms excludes or limits our liability for death or personal injury caused by our negligence, for fraud, or for anything else that cannot be excluded by law. Subject to that, to the maximum extent permitted by law, the platform owner, operators, trainers, and any affiliated persons shall not be liable for any direct, indirect, incidental, special, consequential, or punitive damages arising out of your use of or inability to use the platform.

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
