// Route: /privacy — public Privacy Policy.
// NOTE: a strong, plain-English starting template tailored to how G-Dimension
// actually works (Supabase + Vercel + Google sign-in + analytics, client-side
// background removal). Have a lawyer review for your jurisdiction before launch,
// especially the GDPR/CCPA specifics. Edit facts in src/lib/legalMeta.ts.
import { LegalLayout, LegalSection, LegalP, LegalList } from '../components/LegalLayout'
import { LEGAL } from '../lib/legalMeta'

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated={LEGAL.effectiveDate}>
      <LegalP>
        This Privacy Policy explains how {LEGAL.operator} (“{LEGAL.appName},” “we,” “us”) collects, uses, and
        protects your information when you use {LEGAL.site} and the {LEGAL.appName} app (the “Service”).
        By using the Service you agree to this policy.
      </LegalP>

      <LegalSection heading="1. Information you give us">
        <LegalList items={[
          <><strong>Account details.</strong> When you sign up with email, we store your email address and a securely hashed password (we never see your plain password). If you sign in with Google, we receive your name, email address, and profile picture from Google.</>,
          <><strong>Profile.</strong> Your chosen username, display name, optional avatar, optional city/country, and your unit preferences.</>,
          <><strong>Your build data.</strong> Everything you choose to record: vehicles, modifications, maintenance and detailing logs, timeline entries, photos, install guides, reminders, and notes.</>,
          <><strong>Sensitive vehicle records.</strong> If you enter them, items like VIN, license plate, purchase price, receipts, documents, and contacts. These are stored privately and are never shown on your public profile.</>,
          <><strong>Files you upload.</strong> Photos and documents you add. Note: car-photo background removal runs entirely on your own device — that image is processed locally and is not sent to any third-party service for processing.</>,
        ]} />
      </LegalSection>

      <LegalSection heading="2. Information collected automatically">
        <LegalList items={[
          <><strong>Usage &amp; device data.</strong> Basic technical information such as browser type, device, approximate region, pages viewed, and actions taken, collected through analytics and standard server logs.</>,
          <><strong>Cookies &amp; local storage.</strong> We use your browser’s storage to keep you signed in and to remember preferences (such as your active car and sound setting). Analytics may set cookies to measure usage — see Section 6.</>,
        ]} />
      </LegalSection>

      <LegalSection heading="3. How we use your information">
        <LegalList items={[
          'Provide, operate, and maintain the Service and your account.',
          'Store and display your build exactly as you organize it.',
          'Show the parts of your profile you choose to make public.',
          'Understand how the app is used so we can improve it.',
          'Communicate with you about your account, security, or important changes.',
          'Detect, prevent, and address abuse, fraud, or technical problems.',
        ]} />
      </LegalSection>

      <LegalSection heading="4. What is public vs. private">
        <LegalP>
          Your account is private by default. You decide what to share. When you mark a car public, its public
          profile may show your chosen identity, specs, build sheet (brand and category only — never costs),
          timeline, and Featured page, depending on the per-section toggles you set.
        </LegalP>
        <LegalP>
          The following are <strong>always private</strong> and never shown publicly: receipts, documents,
          contacts, VIN, license plate, and purchase price. Anything you make public can be viewed by anyone
          with the link, and may be cached or indexed by search engines.
        </LegalP>
      </LegalSection>

      <LegalSection heading="5. How your information is stored and shared">
        <LegalP>
          We do not sell your personal information. We share data only with the service providers that make the
          app work, who process it on our behalf under their own privacy terms:
        </LegalP>
        <LegalList items={[
          <><strong>Supabase</strong> — authentication, database, and file storage.</>,
          <><strong>Vercel</strong> — application hosting and delivery.</>,
          <><strong>Google</strong> — “Sign in with Google” (optional), analytics, and web fonts.</>,
        ]} />
        <LegalP>
          We may also disclose information if required by law, to enforce our Terms, or to protect the rights,
          safety, and property of our users or the public. Your data is stored on infrastructure located in the
          United States; by using the Service you consent to this transfer and processing.
        </LegalP>
      </LegalSection>

      <LegalSection heading="6. Analytics &amp; cookies">
        <LegalP>
          To understand aggregate usage (such as which screens are visited and general performance) we use
          privacy-conscious analytics — currently Vercel Analytics, which does not use tracking cookies — and we
          may also use Google Analytics. These tools collect device and usage data in aggregate. Where cookies
          are used, you can limit them through your browser settings or the provider’s opt-out tools. We do not
          run third-party advertising trackers, and we do not use this data to identify you personally.
        </LegalP>
      </LegalSection>

      <LegalSection heading="7. Data retention &amp; deletion">
        <LegalP>
          We keep your information for as long as your account is active. Some items you remove are soft-deleted
          or archived for a short window so they can be restored, then permanently deleted. You can request
          deletion of your account and associated data at any time by contacting us at {LEGAL.contactEmail}.
        </LegalP>
      </LegalSection>

      <LegalSection heading="8. Your rights">
        <LegalP>
          Depending on where you live (for example under GDPR or the CCPA), you may have the right to access,
          correct, export, or delete your personal information, and to object to or restrict certain processing.
          To exercise any of these rights, email us at {LEGAL.contactEmail} and we will respond as required by
          applicable law.
        </LegalP>
      </LegalSection>

      <LegalSection heading="9. Security">
        <LegalP>
          We protect your data with encryption in transit, hashed passwords, and database access rules that keep
          each account’s private data isolated. No method of transmission or storage is 100% secure, so we cannot
          guarantee absolute security, but we work to protect your information and to address issues promptly.
        </LegalP>
      </LegalSection>

      <LegalSection heading="10. Children">
        <LegalP>
          The Service is not directed to children under {LEGAL.minAge}, and we do not knowingly collect personal
          information from them. If you believe a child has provided us information, contact us and we will delete
          it.
        </LegalP>
      </LegalSection>

      <LegalSection heading="11. Changes to this policy">
        <LegalP>
          We may update this policy from time to time. We will revise the “Last updated” date above and, for
          significant changes, may notify you in the app. Continued use of the Service after changes take effect
          means you accept the updated policy.
        </LegalP>
      </LegalSection>

      <LegalSection heading="12. Contact">
        <LegalP>
          Questions about this policy or your data? Email us at {LEGAL.contactEmail}.
        </LegalP>
      </LegalSection>
    </LegalLayout>
  )
}
