// Terms and privacy text, written once and read by both legal screens.
export type LegalDoc = { title: string; updated: string; intro: string; sections: { h: string; p: string[] }[] };

export const SUPPORT_EMAIL = "support@tredi.app";
export const SUPPORT_PHONE = "+234 800 000 0000";
export const SUPPORT_WHATSAPP = "+234 800 000 0000";

export const TERMS: LegalDoc = {
  title: "Terms & conditions",
  updated: "Last updated 1 June 2026",
  intro:
    "These terms cover your use of Tredi, a bookkeeping app for shops and small businesses. By creating an account you agree to them. Plain language, no small print.",
  sections: [
    { h: "1. Your account", p: [
      "You must give a real name, phone number and email so we can reach you about your books.",
      "You are responsible for everyone you invite into your business — staff actions on your account are treated as yours.",
      "Keep your password and app lock PIN private. Tell us at once if you think someone else has got in.",
    ] },
    { h: "2. Your records belong to you", p: [
      "Every invoice, sale, customer and item you enter stays yours. We store and process it so the app can work for you.",
      "You can export your records at any time, and you can ask us to delete your business — see the privacy policy.",
      "We never sell your business records, and we never share them with another business.",
    ] },
    { h: "3. Plans, trial and payment", p: [
      "New businesses get a 14-day trial with full access. No card is needed to start.",
      "When a trial or plan ends your books do not disappear: reading stays open and only saving stops until you pick a plan.",
      "Plan prices are shown in the app before you choose. Fees already paid for a period are not refundable once that period has started, except where Nigerian consumer law says otherwise.",
      "We may change prices with at least 30 days' notice inside the app.",
    ] },
    { h: "4. Using the app fairly", p: [
      "Do not use Tredi for fraud, money laundering, or to record trade that is against Nigerian law.",
      "Do not attempt to break into other businesses' data, overload our servers, or copy the app.",
      "We may suspend writing on an account we reasonably believe is being used for crime, and we will tell you why.",
    ] },
    { h: "5. What the app is, and is not", p: [
      "Tredi is a bookkeeping tool. It is not an accountant, a tax adviser or a bank.",
      "Figures such as profit, VAT and stock value are worked out from what you enter. Check them before filing anything with FIRS or your state revenue service.",
      "You remain responsible for your tax returns and statutory filings.",
    ] },
    { h: "6. Availability", p: [
      "We work to keep Tredi available day and night, but we cannot promise it will never be down.",
      "Records you save while offline are kept on your phone and sync when the network returns.",
      "We are not liable for lost profit caused by downtime, network failure or your own device.",
    ] },
    { h: "7. Ending the agreement", p: [
      "You can stop using Tredi at any time and ask us to close your business account.",
      "We may close an account that stays unpaid and unused for more than 12 months, after telling you by email and in the app.",
      "Where a business is scheduled for deletion we hold the data for 30 days first, so a mistake can be undone.",
    ] },
    { h: "8. Changes to these terms", p: [
      "If we change anything that affects you we will show a notice in the app before it takes effect.",
      "Continuing to use Tredi after that notice means you accept the new terms.",
    ] },
    { h: "9. Law and disputes", p: [
      "These terms are governed by the laws of the Federal Republic of Nigeria.",
      "Let us try to settle anything first: write to " + SUPPORT_EMAIL + " and we will reply within one working day.",
    ] },
  ],
};

export const PRIVACY: LegalDoc = {
  title: "Privacy policy",
  updated: "Last updated 1 June 2026",
  intro:
    "This policy explains what we collect, why we collect it, and the control you have. It follows the Nigeria Data Protection Act 2023.",
  sections: [
    { h: "1. What we collect", p: [
      "Account details: your name, business name, phone number, email, and the shops and roles you set up.",
      "Business records: the invoices, sales, payments, expenses, customers, suppliers, items and photos you enter.",
      "Device and usage data: app version, device type, and basic logs we use to find faults.",
      "We do not collect your bank login details, and the app never asks for your card PIN.",
    ] },
    { h: "2. Why we use it", p: [
      "To run the app: saving your records, printing invoices, and working out your figures.",
      "To keep your account safe: app lock, device checks and fraud signals.",
      "To support you: when you write to us we read the message, your business name and the screen you were on.",
      "To bill you for your plan and tell you when it is about to end.",
    ] },
    { h: "3. Who can see your records", p: [
      "Only you and the users you invite, each limited to the shops you posted them to.",
      "Our support staff only enter your account with your permission, read-only, time-boxed, and every screen they open is written into your own activity log.",
      "We use trusted processors for hosting, storage and email. They act on our instructions and cannot use your records for anything else.",
      "We will disclose records if a Nigerian court or a lawful regulatory order requires it, and will tell you unless the law forbids it.",
    ] },
    { h: "4. Where your records are stored", p: [
      "Records are held on encrypted cloud servers, backed up nightly, with 30 days of restore points.",
      "Photos and documents you upload are stored in our managed object storage, reachable only by your business.",
      "Data may be processed outside Nigeria by our hosting providers under contract terms that match the Nigeria Data Protection Act.",
    ] },
    { h: "5. How long we keep it", p: [
      "While your account is open, and for 30 days after you ask us to delete the business — a grace period in case of mistakes.",
      "Accounting records may be kept longer where Nigerian tax law requires it.",
      "Audit logs are append-only and retained for seven years.",
    ] },
    { h: "6. Your rights", p: [
      "Ask for a copy of your records, in a format you can open elsewhere.",
      "Correct anything that is wrong, or ask us to delete your business entirely.",
      "Object to any processing you did not agree to, and complain to the Nigeria Data Protection Commission.",
      "Write to " + SUPPORT_EMAIL + " and we will answer within one working day.",
    ] },
    { h: "7. Children", p: ["Tredi is for business use and is not meant for anyone under 18."] },
    { h: "8. Changes", p: [
      "If this policy changes we will post a notice in the app before the change takes effect, and keep the previous version available on request.",
    ] },
  ],
};
