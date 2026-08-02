/**
 * BAKĒD Privacy Policy — /privacy
 *
 * Real, self-contained legal page rendered inside the customer shell.
 * Required by Google OAuth verification (Google fetches this URL to
 * confirm a privacy policy exists on the app's own domain).
 *
 * Content is tailored to BAKĒD's actual data flows:
 *   - Google OAuth (email, name, picture)
 *   - Phone + OTP
 *   - Delivery addresses & orders
 *   - Live driver location (EXPRESSbakēd)
 */
import React from "react";

const SECTIONS = [
  {
    id: "who-we-are",
    title: "1. Who we are",
    body: (
      <>
        <p>
          BAKĒD Platform (&ldquo;BAKĒD&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;)
          operates the BAKĒD app and website at{" "}
          <a href="https://baked.ci" className="text-primary underline">baked.ci</a>
          {" "}across Côte d&apos;Ivoire. Contact us at{" "}
          <a href="mailto:privacy@baked.ci" className="text-primary underline">privacy@baked.ci</a>.
        </p>
      </>
    ),
  },
  {
    id: "data-we-collect",
    title: "2. Data we collect",
    body: (
      <ul className="list-disc pl-6 space-y-2">
        <li><b>Account data</b> — name, email address, profile picture (via Google Sign-In) and/or phone number (via OTP).</li>
        <li><b>Delivery data</b> — saved addresses, order history, delivery preferences.</li>
        <li><b>Payment data</b> — handled by our regulated payment partners; BAKĒD does not store full card numbers.</li>
        <li><b>Device & usage</b> — IP address, browser, device, pages visited, and interactions with the app (for security and analytics).</li>
        <li><b>Location</b> — precise location only when you enable it for delivery tracking or address selection; never in the background.</li>
      </ul>
    ),
  },
  {
    id: "why-we-collect",
    title: "3. Why we use your data",
    body: (
      <ul className="list-disc pl-6 space-y-2">
        <li>To create and secure your BAKĒD account.</li>
        <li>To process your orders, deliveries and payments.</li>
        <li>To share your contact and address with the vendor and driver fulfilling your order (only what they need).</li>
        <li>To detect fraud, abuse and keep the platform safe.</li>
        <li>To improve BAKĒD, personalise recommendations, and — with your consent — send you offers.</li>
        <li>To comply with legal obligations in Côte d&apos;Ivoire.</li>
      </ul>
    ),
  },
  {
    id: "google-sign-in",
    title: "4. Sign in with Google",
    body: (
      <>
        <p>
          When you sign in with Google, we receive your name, primary email
          address and public profile picture from Google. We use this
          information only to create or match your BAKĒD account. We do not
          request access to your Gmail, Google Drive, calendar or any other
          Google service. You may revoke BAKĒD&apos;s access at any time from
          your Google account&apos;s{" "}
          <a
            href="https://myaccount.google.com/permissions"
            className="text-primary underline"
            target="_blank" rel="noopener noreferrer"
          >
            Third-party access
          </a> page.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "5. Who we share data with",
    body: (
      <ul className="list-disc pl-6 space-y-2">
        <li><b>Vendors and drivers</b> executing your order — receive only your first name, delivery address and order details.</li>
        <li><b>Payment processors</b> to complete transactions.</li>
        <li><b>Cloud infrastructure providers</b> (hosting, databases, notifications) under strict data processing agreements.</li>
        <li><b>Authorities</b> only when required by a valid legal request in Côte d&apos;Ivoire.</li>
        <li>We <b>never sell</b> your personal data.</li>
      </ul>
    ),
  },
  {
    id: "retention",
    title: "6. Retention",
    body: (
      <p>
        We keep your data only for as long as your account is active or as
        needed to provide our services. Orders and invoices are retained for
        the period required by Ivorian tax and commercial law (currently 10
        years). You may delete your account at any time; residual copies are
        purged from backups within 90 days.
      </p>
    ),
  },
  {
    id: "your-rights",
    title: "7. Your rights",
    body: (
      <p>
        You may access, correct, export or delete your personal data at any
        time from your BAKĒD profile, or by writing to{" "}
        <a href="mailto:privacy@baked.ci" className="text-primary underline">
          privacy@baked.ci
        </a>. We respond within 30 days.
      </p>
    ),
  },
  {
    id: "security",
    title: "8. Security",
    body: (
      <p>
        BAKĒD uses TLS in transit, encryption at rest, hashed passwords, JWT
        session tokens and least-privilege access controls. No system is
        perfectly secure; we ask you to keep your credentials private and
        report suspicious activity to{" "}
        <a href="mailto:security@baked.ci" className="text-primary underline">
          security@baked.ci
        </a>.
      </p>
    ),
  },
  {
    id: "children",
    title: "9. Children",
    body: (
      <p>
        BAKĒD is not directed at children under 16. If you believe a child
        has provided us data, contact us and we will delete it.
      </p>
    ),
  },
  {
    id: "changes",
    title: "10. Changes to this policy",
    body: (
      <p>
        We may update this policy from time to time. Material changes will be
        announced in the app and via email at least 14 days before they take
        effect.
      </p>
    ),
  },
  {
    id: "contact",
    title: "11. Contact",
    body: (
      <p>
        BAKĒD Platform · Côte d&apos;Ivoire ·{" "}
        <a href="mailto:privacy@baked.ci" className="text-primary underline">
          privacy@baked.ci
        </a>
      </p>
    ),
  },
];

export const PrivacyPolicy = () => (
  <main className="max-w-3xl mx-auto px-6 py-16" data-testid="privacy-policy-page">
    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
      Legal · Privacy
    </p>
    <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
      Privacy Policy
    </h1>
    <p className="text-sm text-muted-foreground mt-2">
      Effective: 1 February 2026 · Last updated: 1 February 2026
    </p>

    <p className="mt-8 text-base text-muted-foreground leading-relaxed">
      This policy explains what data BAKĒD collects when you use our app or
      services, why we collect it, how we protect it, and the rights you have
      over it. We believe privacy is a right, not a feature.
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

export default PrivacyPolicy;
