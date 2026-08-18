/**
 * BAKĒD Terms of Service — /terms
 *
 * Real, self-contained legal page rendered inside the customer shell.
 * Required by Google OAuth verification (Google fetches this URL to
 * confirm terms of service exist on the app's own domain).
 */
import React from "react";

const SECTIONS = [
  {
    id: "acceptance",
    title: "1. Acceptance",
    body: (
      <p>
        By creating a BAKĒD account or by using any part of the BAKĒD app,
        website (baked.ci) or services, you agree to be bound by these Terms
        of Service and by our{" "}
        <a href="/privacy" className="text-primary underline">Privacy Policy</a>.
        If you do not agree, please do not use BAKĒD.
      </p>
    ),
  },
  {
    id: "what-we-offer",
    title: "2. What BAKĒD offers",
    body: (
      <p>
        BAKĒD is a multi-business digital commerce platform connecting
        customers with local grocery stores (MARTbakēd), restaurants
        (FOODbakēd), online retailers (SHOPbakēd), logistics services
        (SENDbakēd), vehicle marketplaces (AUTObakēd) and real-estate
        listings (IMMObakēd). BAKĒD facilitates transactions between you and
        independent merchants, drivers, and partners.
      </p>
    ),
  },
  {
    id: "eligibility",
    title: "3. Eligibility",
    body: (
      <p>
        You must be at least 18 years old (or the age of legal majority in
        your jurisdiction) to create a BAKĒD account. By using BAKĒD you
        confirm you meet this requirement.
      </p>
    ),
  },
  {
    id: "account",
    title: "4. Your account",
    body: (
      <ul className="list-disc pl-6 space-y-2">
        <li>You are responsible for the accuracy of the information you provide.</li>
        <li>You are responsible for all activity on your account — keep your credentials safe.</li>
        <li>Notify us immediately at security@baked.ci if you suspect unauthorised access.</li>
        <li>We may suspend accounts that violate these Terms or applicable law.</li>
      </ul>
    ),
  },
  {
    id: "orders-payments",
    title: "5. Orders, prices and payments",
    body: (
      <ul className="list-disc pl-6 space-y-2">
        <li>Prices, availability and delivery times displayed in the app are estimates provided by merchants and may change.</li>
        <li>Once you place an order, a binding contract of sale is formed between you and the merchant. BAKĒD acts as a facilitator.</li>
        <li>Payment is captured through our regulated payment partners. Refunds, when applicable, follow the merchant&apos;s policy and the timelines of the underlying payment method.</li>
        <li>Applicable taxes and delivery fees are added at checkout.</li>
      </ul>
    ),
  },
  {
    id: "delivery",
    title: "6. Delivery and tracking",
    body: (
      <p>
        Deliveries are performed by BAKĒD drivers or third-party couriers.
        Estimated arrival times are based on traffic and distance and are not
        guaranteed. Live tracking (SENDbakēd) is provided as a convenience.
        You must be available at the delivery address to receive your order,
        or provide clear instructions.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    title: "7. Acceptable use",
    body: (
      <>
        <p className="mb-3">You agree not to:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Use BAKĒD for anything unlawful, harmful, or infringing on others&apos; rights.</li>
          <li>Attempt to access accounts, data or systems that are not yours.</li>
          <li>Interfere with the security, integrity or performance of the platform.</li>
          <li>Scrape, resell or automate the service without our written permission.</li>
          <li>Impersonate any person, driver, merchant or entity.</li>
        </ul>
      </>
    ),
  },
  {
    id: "content",
    title: "8. Content you submit",
    body: (
      <p>
        When you submit reviews, photos or other content to BAKĒD, you grant
        us a worldwide, royalty-free licence to host and display that content
        on the platform. You confirm you own the content or have the right to
        share it.
      </p>
    ),
  },
  {
    id: "ip",
    title: "9. Intellectual property",
    body: (
      <p>
        BAKĒD, the BAKĒD logo, and the platform&apos;s software are our
        property or that of our licensors. No rights are granted to you other
        than the limited licence to use the app as intended by these Terms.
      </p>
    ),
  },
  {
    id: "third-parties",
    title: "10. Third-party services",
    body: (
      <p>
        BAKĒD integrates with third parties (Google Sign-In, payment
        processors, maps and messaging providers). Your use of those services
        is subject to their own terms. We are not responsible for third-party
        content or availability.
      </p>
    ),
  },
  {
    id: "disclaimer",
    title: "11. Disclaimer",
    body: (
      <p>
        BAKĒD is provided &ldquo;as is&rdquo;. To the maximum extent permitted
        by law, we disclaim all warranties (express or implied), including
        merchantability, fitness for a particular purpose and non-infringement.
      </p>
    ),
  },
  {
    id: "liability",
    title: "12. Limitation of liability",
    body: (
      <p>
        To the maximum extent permitted by law, BAKĒD is not liable for
        indirect, incidental, special or consequential damages, or for loss
        of profits, revenue, or data, arising from your use of the platform.
        Our total liability for any claim shall not exceed the fees you paid
        to BAKĒD during the 12 months before the event giving rise to the
        claim.
      </p>
    ),
  },
  {
    id: "termination",
    title: "13. Suspension and termination",
    body: (
      <p>
        You may close your account at any time. We may suspend or terminate
        your access if you breach these Terms, put the platform or other
        users at risk, or where required by law. Provisions that by their
        nature should survive termination will do so.
      </p>
    ),
  },
  {
    id: "changes",
    title: "14. Changes to these Terms",
    body: (
      <p>
        We may update these Terms from time to time. Material changes will be
        announced in the app and via email at least 14 days before they take
        effect. Your continued use of BAKĒD after the changes take effect
        constitutes acceptance.
      </p>
    ),
  },
  {
    id: "governing-law",
    title: "15. Governing law and disputes",
    body: (
      <p>
        These Terms are governed by the laws of the Republic of Côte
        d&apos;Ivoire. Any dispute arising from these Terms or your use of
        BAKĒD will be resolved by the competent courts of Abidjan, unless
        mandatory consumer-protection law provides otherwise.
      </p>
    ),
  },
  {
    id: "contact",
    title: "16. Contact",
    body: (
      <p>
        BAKĒD Platform · Côte d&apos;Ivoire ·{" "}
        <a href="mailto:legal@baked.ci" className="text-primary underline">
          legal@baked.ci
        </a>
      </p>
    ),
  },
];

export const TermsOfService = () => (
  <main className="max-w-3xl mx-auto px-6 py-16" data-testid="terms-of-service-page">
    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
      Legal · Terms of Service
    </p>
    <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
      Terms of Service
    </h1>
    <p className="text-sm text-muted-foreground mt-2">
      Effective: 1 February 2026 · Last updated: 1 February 2026
    </p>

    <p className="mt-8 text-base text-muted-foreground leading-relaxed">
      These Terms govern your access to and use of the BAKĒD app and services.
      Please read them carefully. In summary: use BAKĒD responsibly, treat
      merchants and drivers well, and respect the law.
    </p>

    <nav className="mt-10 p-5 rounded-2xl border border-border bg-muted/40">
      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
        On this page
      </p>
      <ul className="text-sm space-y-1.5">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className="text-foreground hover:text-primary transition-colors">
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>

    <div className="mt-10 space-y-10">
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id}>
          <h2 className="text-lg sm:text-lg font-semibold text-foreground mb-3">
            {s.title}
          </h2>
          <div className="text-base text-muted-foreground leading-relaxed">
            {s.body}
          </div>
        </section>
      ))}
    </div>
  </main>
);

export default TermsOfService;
