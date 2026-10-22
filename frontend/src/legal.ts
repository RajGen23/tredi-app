// The official TradaBooks legal documents, mirrored from tredibooks.com so they read
// offline. Keep the wording in step with the website when it changes there.
export type LegalDoc = { title: string; updated: string; intro: string; sections: { h: string; p: string[] }[]; web: string };

export const SUPPORT_EMAIL = "sales@tredihq.com";
export const SUPPORT_PHONE = "+2347063921091";
export const SUPPORT_WHATSAPP = "+2347063921091";
export const LEGAL_EMAIL = "support@tredibooks.com";
export const SITE = "https://tredibooks.com";
export const TERMS_URL = `${SITE}/terms`;
export const PRIVACY_URL = `${SITE}/privacy-policy`;
export const DELETION_URL = `${SITE}/account-deletion`;

export const TERMS: LegalDoc = {
  title: "Terms & conditions",
  updated: "Last updated 12 October 2025",
  web: TERMS_URL,
  intro:
    "Welcome to TradaBooks — a business management platform built to help traders manage stock, sales, customers and shop representatives. These Terms govern your access to and use of the TradaBooks mobile application and related services, operated by TradaBooks Technologies Ltd. By registering for, accessing or using the Services you agree to be bound by these Terms and our Privacy Policy. If you are using the Services for a company, you confirm you have authority to bind that entity.",
  sections: [
    { h: "2. Definitions", p: [
      "Trader: a business owner who subscribes to the Services to manage one or more shops.",
      "Rep: a shop representative, employee or agent assigned by a Trader to manage sales, inventory or customer interactions.",
      "Admin: a user given enhanced permissions by a Trader to oversee operations in the platform.",
      "Content: all data, information, text, graphics or materials uploaded, stored or processed through the Services by you or your authorised users.",
      "Platform Operators: TradaBooks Technologies Ltd and its authorised personnel involved in running the platform.",
    ] },
    { h: "3. Accounts and registration", p: [
      "3.1 Eligibility — you must be at least 18 years old and able to enter a binding contract.",
      "3.2 Accuracy — you agree to give accurate, current and complete information at registration and to keep it updated.",
      "3.3 Account security — you are responsible for safeguarding your login details and for all activity under your account. Tell us at once about any unauthorised access.",
      "3.4a Trader responsibility — Traders are solely responsible for the acts and omissions of their Reps and Admins. All data submitted by a Rep or Admin is owned by the Trader's account.",
      "3.4b Rep access — a Rep's access is granted and may be revoked by the Trader at any time. Traders have full access to and ownership of all data entered by their Reps.",
    ] },
    { h: "4. Services and subscription plans", p: [
      "4.1 TradaBooks provides digital tools for business management, including inventory tracking, sales monitoring, customer management and shop representative coordination, as detailed in the app.",
      "4.2 Subscription tiers are offered with features, limits and prices shown in the app, and these may change over time.",
      "4.3 Billing and renewal — subscriptions renew automatically at the end of each billing cycle unless cancelled before renewal. You can cancel or change your plan in your account settings.",
      "4.4 We may modify, suspend or discontinue any part of the Services with reasonable notice, and are not liable for doing so.",
    ] },
    { h: "5. User obligations and acceptable use", p: [
      "5.1 Use the Services only for lawful purposes. You are solely responsible for all Content you upload or manage.",
      "5.2 You shall not: infringe intellectual property or privacy rights; upload unlawful, defamatory, harassing or obscene content; send spam or breach communication laws; attempt unauthorised access to the system or servers; use the Services in a way that damages or impairs the platform; or impersonate anyone or misrepresent your affiliation.",
      "5.3 Data backup — you are responsible for keeping backup copies of your data. TradaBooks is not liable for loss or corruption of data.",
    ] },
    { h: "6. Data ownership and privacy", p: [
      "6.1 You retain ownership of all Content you submit. You grant TradaBooks a worldwide, royalty-free, non-exclusive licence to use, store and process your data solely to provide and improve the Services.",
      "6.2 TradaBooks may use anonymised and aggregated data from your usage for analytics, performance improvement and business insights.",
      "6.3 On termination your data may be kept for up to 90 days for backup and compliance before permanent deletion. You may request an export within that period.",
      "6.4 TradaBooks complies with the Nigeria Data Protection Act (NDPA) and other applicable privacy regulations. See the Privacy Policy for detail.",
    ] },
    { h: "7. Intellectual property", p: [
      "All rights, title and interest in the TradaBooks platform — software, design, trademarks and original content — remain the exclusive property of TradaBooks Technologies Ltd and its licensors.",
      "You may not copy, reproduce, modify, distribute or reverse-engineer any part of the Services without our prior written consent.",
    ] },
    { h: "8. Fees and payment", p: [
      "8.1 Certain Services require payment. You agree to pay all charges displayed in the app when subscribing.",
      "8.2 All fees are payable in Nigerian Naira (NGN) unless stated otherwise.",
      "8.3 Payments are non-refundable except where required by law, or in cases of proven service failure or duplicate billing, at our discretion.",
      "8.4 You are responsible for applicable taxes and any third-party fees charged by your payment processor, network provider or bank.",
    ] },
    { h: "9. Disclaimer of warranties", p: [
      "The Services are provided on an “AS IS” and “AS AVAILABLE” basis. TradaBooks makes no warranties, express or implied, about uninterrupted or error-free operation, suitability for your specific purpose, or the accuracy or reliability of any output from the platform. Use of the Services is at your sole risk.",
    ] },
    { h: "10. Limitation of liability", p: [
      "To the fullest extent permitted by law, TradaBooks, its directors, employees and agents are not liable for any indirect, incidental, special or consequential damages, or for loss of profits, data, goodwill or revenue arising from your use of, or inability to use, the Services.",
      "TradaBooks's total liability shall not exceed the total amount you paid to TradaBooks in the six (6) months before the claim.",
    ] },
    { h: "11. Indemnification", p: [
      "You agree to defend, indemnify and hold harmless TradaBooks, its officers and affiliates against any claims, losses, damages or expenses arising from your use of the Services, your breach of these Terms, or any claim that your Content infringes third-party rights. This clause survives termination of your account.",
    ] },
    { h: "12. Termination", p: [
      "12.1 We may suspend or terminate your account without prior notice if you breach these Terms or engage in unlawful activity.",
      "12.2 You may terminate your account at any time by discontinuing use of the Services.",
      "12.3 You may request a data export within 30 days after termination. After that period your data is permanently deleted.",
      "12.4 We may deactivate inactive accounts after 180 days of non-use, following reasonable notice.",
    ] },
    { h: "13. Governing law and disputes", p: [
      "13.1 These Terms are governed by the laws of the Federal Republic of Nigeria.",
      "13.2 Parties shall first try to resolve disputes amicably; if unresolved, disputes go to mediation and then arbitration in Lagos, Nigeria under the Arbitration and Mediation Act, 2023. Where arbitration does not apply, the courts of Lagos State have exclusive jurisdiction.",
    ] },
    { h: "14. Miscellaneous", p: [
      "14.1 Severability — if any provision is held invalid, the rest remain in full force.",
      "14.2 Entire agreement — these Terms are the whole agreement between you and TradaBooks about the Services and supersede any prior understanding.",
      "14.3 No waiver — failure to enforce a right is not a waiver of it.",
      "14.4 Changes — we may modify these Terms at any time. Material changes will be communicated by email or in-app notice, and continued use means acceptance.",
    ] },
    { h: "15. Contact", p: [
      `Questions about these Terms: ${LEGAL_EMAIL}`,
      "TradaBooks Technologies Ltd, Lagos, Nigeria.",
    ] },
  ],
};

export const PRIVACY: LegalDoc = {
  title: "Privacy policy",
  updated: "Last updated 12 October 2025",
  web: PRIVACY_URL,
  intro:
    "TradaBooks is committed to protecting your privacy and the security of your personal information. This policy explains how we collect, use, disclose and safeguard your data when you use our app and related services. By using the Services you agree to this policy.",
  sections: [
    { h: "2. Information we collect", p: [
      "2.1 Personal information — account data (name, email, phone, profile picture); business data (shop name, address, photos, notes); financial data (sales, expenses, profit and loss, customer debt); customer data (names, contact details, purchase history you enter); representative data (roles, contact details, activity logs).",
      "2.2 Automatically collected — IP address, device ID, operating system, browser type and version; online/offline status and access timestamps; the features you use and general usage analytics.",
      "2.3 Other — non-personal, aggregated or anonymised data used to analyse trends and improve the experience.",
    ] },
    { h: "3. Legal basis for processing", p: [
      "Performance of a contract: to provide and maintain the Services you subscribed to.",
      "Legitimate interest: platform security, product development, internal analytics and administration.",
      "Consent: for specific purposes such as marketing, where you have explicitly agreed.",
      "Legal obligation: to comply with applicable laws, regulations and government requests.",
    ] },
    { h: "4. How we use your information", p: [
      "To provide, maintain and improve the Services.",
      "To authenticate users and enable role-based access (Trader, Admin, Rep).",
      "To process transactions and send related information such as invoices or receipts.",
      "To send administrative messages, alerts and reminders — for example unpaid invoices or low stock.",
      "To generate anonymised, aggregated data for business analytics.",
      "To tell you about new features, updates or offers, with your consent.",
      "To comply with legal obligations and protect our rights.",
    ] },
    { h: "5. Data sharing and disclosure", p: [
      "Within your business: data entered by a Trader may be visible to authorised Reps and Admins, based on the role permissions in your account.",
      "With service providers: trusted third parties such as Firebase (cloud hosting) and Twilio (communication) support our operations under contract, and may only process your data on our instructions.",
      "For legal reasons: to comply with the law, legal process or government requests, or to protect against fraud or misuse.",
      "Business transfer: if TradaBooks is part of a merger, acquisition or sale of assets, user data may transfer as part of that transaction.",
    ] },
    { h: "6. International data transfers", p: [
      "Your data may be transferred to and processed in countries outside Nigeria, including places that may not offer the same level of protection. We put appropriate safeguards in place in line with the NDPR and GDPR, such as Standard Contractual Clauses.",
    ] },
    { h: "7. Data retention", p: [
      "We keep personal information only as long as needed for the purposes in this policy or as required by law.",
      "When you delete your account we delete or anonymise your personal data within 30 days, unless retention is required by law, dispute resolution or contract enforcement.",
    ] },
    { h: "8. Your data rights", p: [
      "Access and portability: request a copy of your personal data in a portable format.",
      "Rectification: correct or update inaccurate or incomplete information.",
      "Erasure: request deletion of your personal data.",
      "Restriction or objection: ask us to limit or stop specific processing.",
      "Withdraw consent: at any time, for processing based on consent.",
      `To exercise these rights write to ${LEGAL_EMAIL} or use the account and data deletion page. You may also complain to the Nigeria Data Protection Commission (NDPC).`,
    ] },
    { h: "9. Data security", p: [
      "We use appropriate technical and organisational measures including encryption, access controls, secure storage and periodic security reviews. No method of transmission over the internet is completely secure, so absolute security cannot be guaranteed.",
    ] },
    { h: "10. Children's privacy", p: [
      "The Services are not directed at anyone under 18. We do not knowingly collect personal information from minors, and will promptly delete it if we learn a child has provided it.",
    ] },
    { h: "11. Changes to this policy", p: [
      "We may update this policy from time to time. For significant changes we will notify you by email, in-app alert, or by updating the “Last updated” date.",
    ] },
    { h: "12. Contact us", p: [
      `Questions, concerns or requests about this policy: ${LEGAL_EMAIL}`,
      "You may also contact our Data Protection Officer at the same address for privacy matters.",
    ] },
  ],
};

export const DELETION: LegalDoc = {
  title: "Account & data deletion",
  updated: "TradaBooks Technologies Ltd · Lagos, Nigeria",
  web: DELETION_URL,
  intro:
    "You can ask for your account and the data attached to it to be deleted, either from inside the app or by contacting support.",
  sections: [
    { h: "Delete your account in the app", p: [
      "If you can sign in, open the app and go to Settings, then choose Delete account. You will be asked to confirm your password, give a reason, and verify the request with a code sent to your email.",
    ] },
    { h: "Request deletion by email", p: [
      `If you cannot get into the app, email ${LEGAL_EMAIL} with the email address connected to your TradaBooks account so we can verify and process the request. Add your registered phone number and a reason if you wish.`,
    ] },
    { h: "What happens next", p: [
      "Once the request is verified we delete or anonymise the personal data attached to the account within 30 days, unless we are required to keep specific records for legal, security, dispute resolution or compliance reasons.",
    ] },
  ],
};
