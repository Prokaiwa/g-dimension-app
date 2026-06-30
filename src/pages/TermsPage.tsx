// Route: /terms — public Terms of Service.
// NOTE: a strong, plain-English starting template tailored to G-Dimension (a
// user-generated car build journal). Have a lawyer review for your jurisdiction
// before launch — especially the liability cap and governing-law clause. Edit
// facts in src/lib/legalMeta.ts.
import { LegalLayout, LegalSection, LegalP, LegalList } from '../components/LegalLayout'
import { LEGAL } from '../lib/legalMeta'

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updated={LEGAL.effectiveDate}>
      <LegalP>
        These Terms of Service (“Terms”) govern your use of {LEGAL.site} and the {LEGAL.appName} app (the
        “Service”), operated by {LEGAL.operator} (“{LEGAL.appName},” “we,” “us”). By creating an account or using
        the Service, you agree to these Terms. If you do not agree, do not use the Service.
      </LegalP>

      <LegalSection heading="1. Eligibility">
        <LegalP>
          You must be at least {LEGAL.minAge} years old (or the minimum age of digital consent where you live) to
          use the Service. By using it, you confirm that you meet this requirement and that the information you
          provide is accurate.
        </LegalP>
      </LegalSection>

      <LegalSection heading="2. Your account">
        <LegalP>
          You are responsible for your account, including keeping your login credentials secure and for all
          activity that happens under your account. Notify us promptly at {LEGAL.contactEmail} if you suspect any
          unauthorized use. You may use “Sign in with Google” where offered, subject to Google’s terms.
        </LegalP>
      </LegalSection>

      <LegalSection heading="3. Your content">
        <LegalP>
          You own the content you create — your vehicles, photos, logs, stories, and other build data (“Your
          Content”). You keep all ownership rights.
        </LegalP>
        <LegalP>
          To run the Service, you grant us a limited, non-exclusive, worldwide, royalty-free license to host,
          store, reproduce, and display Your Content solely to operate and provide the Service to you — including
          showing the portions you choose to make public. This license ends when you delete Your Content or your
          account, except for content already shared publicly and cached by others or search engines, and for
          backups retained for a limited period.
        </LegalP>
        <LegalP>
          You are responsible for Your Content and confirm you have the rights to post it, including any photos,
          logos, or information about other people or vehicles.
        </LegalP>
      </LegalSection>

      <LegalSection heading="4. Acceptable use">
        <LegalP>You agree not to:</LegalP>
        <LegalList items={[
          'Break the law or infringe anyone’s intellectual property or privacy rights.',
          'Upload another person’s private information (for example their VIN, plates, or documents) without permission.',
          'Post content that is harmful, harassing, deceptive, or malicious.',
          'Attempt to disrupt, overload, reverse-engineer, or gain unauthorized access to the Service or its data.',
          'Scrape, harvest, or bulk-collect data from the Service, including from public profiles.',
          'Use the Service to build a competing product from our data, or resell access to it.',
        ]} />
      </LegalSection>

      <LegalSection heading="5. Our intellectual property">
        <LegalP>
          The Service itself — the {LEGAL.appName} name, branding, design, and software — belongs to us and our
          licensors and is protected by intellectual property laws. These Terms do not grant you any right to our
          branding or software beyond using the Service as intended.
        </LegalP>
      </LegalSection>

      <LegalSection heading="6. Third-party services">
        <LegalP>
          The Service relies on third parties such as Supabase, Vercel, and Google. Your use of features they
          power is also subject to their terms, and we are not responsible for those services. Links to external
          sites are provided for convenience and are not endorsements.
        </LegalP>
      </LegalSection>

      <LegalSection heading="7. The Service is provided “as is”">
        <LegalP>
          {LEGAL.appName} is a personal record-keeping and journaling tool for vehicle builds. It is not
          professional automotive, mechanical, financial, or legal advice, and should not be relied on as such.
        </LegalP>
        <LegalP>
          The Service is provided “as is” and “as available,” without warranties of any kind, whether express or
          implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not
          warrant that the Service will be uninterrupted, error-free, or that data will never be lost. You are
          responsible for keeping your own copies of anything important.
        </LegalP>
      </LegalSection>

      <LegalSection heading="8. Limitation of liability">
        <LegalP>
          To the fullest extent permitted by law, {LEGAL.operator} will not be liable for any indirect,
          incidental, special, consequential, or punitive damages, or for any loss of data, profits, or goodwill,
          arising from your use of (or inability to use) the Service. Our total liability for any claim relating
          to the Service will not exceed the greater of the amount you paid us in the 12 months before the claim,
          or USD $50. Some jurisdictions do not allow certain limitations, so some of these may not apply to you.
        </LegalP>
      </LegalSection>

      <LegalSection heading="9. Indemnification">
        <LegalP>
          You agree to indemnify and hold harmless {LEGAL.operator} from any claims, damages, or expenses
          (including reasonable legal fees) arising from Your Content, your use of the Service, or your violation
          of these Terms or the rights of others.
        </LegalP>
      </LegalSection>

      <LegalSection heading="10. Suspension &amp; termination">
        <LegalP>
          You may stop using the Service and delete your account at any time. We may suspend or terminate access
          if you violate these Terms or to protect the Service or its users. Sections that by their nature should
          survive termination (such as ownership, disclaimers, liability limits, and indemnification) will
          continue to apply.
        </LegalP>
      </LegalSection>

      <LegalSection heading="11. Changes">
        <LegalP>
          We may modify the Service or these Terms over time. We will update the “Last updated” date above and,
          for significant changes, may notify you in the app. Continued use after changes take effect means you
          accept the updated Terms.
        </LegalP>
      </LegalSection>

      <LegalSection heading="12. Governing law">
        <LegalP>
          These Terms are governed by the laws of {LEGAL.governingLaw}, without regard to its conflict-of-laws
          rules. Any disputes will be resolved in the courts located there, unless applicable law requires
          otherwise.
        </LegalP>
      </LegalSection>

      <LegalSection heading="13. Contact">
        <LegalP>
          Questions about these Terms? Email us at {LEGAL.contactEmail}.
        </LegalP>
      </LegalSection>
    </LegalLayout>
  )
}
