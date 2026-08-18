/**
 * Module selector — the safe landing page for legacy generic URLs.
 *
 * When users hit `/partner-portal/login` or `/partner/staff-login` we no
 * longer silently guess a module. Instead they see one card per active
 * BAKĒD module and pick where they want to sign in.
 *
 * Live modules link straight to their login. Placeholder modules link to
 * their branded "coming soon" page (which is still refresh-safe).
 */
import React from "react";
import { Link } from "react-router-dom";
import { BakedLogo } from "../../components/layout/BakedLogo";
import { MODULE_ORDER, PARTNER_MODULES } from "./moduleRegistry";

const MODULE_TAGLINES = {
  martbaked: "Dark stores, inventory & fulfilment",
  sendbaked: "Logistics, fleets & live dispatch",
  shopbaked: "Storefronts, categories & catalogues",
  foodbaked: "Restaurants, menus & prep queues",
  autobaked: "Auto marketplaces & test drives",
  immobaked: "Real-estate listings & viewings",
};

const ModuleSelectorPage = ({ intent = "owner", title, subtitle }) => {
  const isStaff = intent === "staff";
  const heading = title || (isStaff ? "Staff sign in" : "Partner sign in");
  const desc =
    subtitle ||
    (isStaff
      ? "Pick your BAKĒD module to continue to the staff login."
      : "Pick your BAKĒD module to continue to the owner login.");

  const hrefFor = (slug) => (isStaff
    ? `/partner/${slug}/staff-login`
    : `/partner-portal/${slug}/login`);

  return (
    <div className="partner-hub" data-theme="dark"
      style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}
      data-testid={isStaff ? "staff-module-selector" : "portal-module-selector"}
    >
      <div className="max-w-3xl w-full px-6 py-12">
        <div className="flex flex-col items-center mb-10">
          <BakedLogo size="md" />
          <span className="text-[10px] uppercase tracking-widest mt-3 px-2.5 py-1 rounded-full"
            style={{ color: "var(--ph-accent-warm)", border: "1px solid var(--ph-border-strong)", background: "var(--ph-glass)" }}>
            {isStaff ? "Staff Portal" : "Partner Portal"}
          </span>
        </div>

        <div className="rounded-3xl p-8" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
          <h1 className="ph-h2" style={{ color: "var(--ph-fg)" }}>{heading}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--ph-fg-muted)" }}>{desc}</p>

          <div className="grid sm:grid-cols-2 gap-3 mt-6">
            {MODULE_ORDER.map((slug) => {
              const m = PARTNER_MODULES[slug];
              return (
                <Link
                  key={slug}
                  to={hrefFor(slug)}
                  data-testid={`module-selector-${slug}`}
                  className="group rounded-2xl p-5 flex items-center gap-4 transition-all"
                  style={{
                    background: "var(--ph-bg-elevated)",
                    border: "1px solid var(--ph-border)",
                    textDecoration: "none",
                  }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${m.color}22`, color: m.color, fontWeight: 800, fontSize: 18 }}>
                    {m.label.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-base font-semibold" style={{ color: "var(--ph-fg)" }}>{m.label}</div>
                      {!m.isLive && (
                        <span className="text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded"
                          style={{ background: "var(--ph-glass)", color: "var(--ph-fg-subtle)" }}>
                          Soon
                        </span>
                      )}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--ph-fg-muted)" }}>
                      {MODULE_TAGLINES[slug] || ""}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {!isStaff && (
            <div className="mt-6 pt-6" style={{ borderTop: "1px solid var(--ph-border)" }}>
              <div className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
                Staff member? <Link to="/partner/staff-login" className="underline"
                  style={{ color: "var(--ph-accent-warm)" }} data-testid="portal-selector-to-staff">
                  Staff sign in →
                </Link>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs mt-8" style={{ color: "var(--ph-fg-subtle)" }}>
          Not a partner yet? <Link to="/partner/apply" className="underline"
            style={{ color: "var(--ph-accent-warm)" }}>Apply here</Link>
        </p>
      </div>
    </div>
  );
};

export default ModuleSelectorPage;
export { ModuleSelectorPage };
