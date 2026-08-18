/**
 * Module coming soon — branded refresh-safe placeholder for modules whose
 * full Partner Portal hasn't shipped yet (SHOPbakēd, FOODbakēd, AUTObakēd,
 * IMMObakēd, SENDbakēd). Reachable via `/partner-portal/{slug}/*` and
 * `/partner/{slug}/staff-login`.
 */
import React from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bell, Sparkles } from "lucide-react";
import { BakedLogo } from "../../components/layout/BakedLogo";
import { moduleForSlug } from "./moduleRegistry";

export const ModuleComingSoonPage = ({ intent = "owner" }) => {
  const { moduleSlug } = useParams();
  const meta = moduleForSlug(moduleSlug);
  const isStaff = intent === "staff";

  return (
    <div className="partner-hub" data-theme="dark"
      style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}
      data-testid={`module-coming-soon-${moduleSlug || "unknown"}`}
    >
      <div className="max-w-md w-full px-6 py-10">
        <div className="flex flex-col items-center mb-8">
          <BakedLogo size="md" />
          <span className="text-[10px] uppercase tracking-widest mt-3 px-2.5 py-1 rounded-full"
            style={{ color: meta?.color || "var(--ph-accent-warm)",
                     border: "1px solid var(--ph-border-strong)", background: "var(--ph-glass)" }}>
            {meta?.label || "Unknown module"}
          </span>
        </div>

        <div className="rounded-3xl p-8 text-center" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
          <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4"
            style={{ background: `${meta?.color || "#FCC44C"}22`, color: meta?.color || "#FCC44C" }}>
            <Sparkles size={26} />
          </div>
          <h1 className="ph-h2" style={{ color: "var(--ph-fg)" }}>
            {meta?.label || "This module"} is opening soon
          </h1>
          <p className="text-sm mt-2" style={{ color: "var(--ph-fg-muted)" }}>
            {isStaff
              ? `Staff logins for ${meta?.label || "this module"} will go live shortly. Your permissions and accounts continue to be managed centrally.`
              : `Partner accounts for ${meta?.label || "this module"} will open shortly. We're finalising onboarding and pricing.`}
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <Link to="/partner-portal/martbaked/login"
              className="ph-btn ph-btn-warm justify-center"
              data-testid="module-comingsoon-to-mart"
              style={{ textDecoration: "none" }}>
              Continue to MARTbakēd →
            </Link>
            <Link to={isStaff ? "/partner/staff-login" : "/partner-portal/login"}
              className="text-xs"
              style={{ color: "var(--ph-accent-warm)", textDecoration: "underline" }}
              data-testid="module-comingsoon-back">
              <ArrowLeft size={11} className="inline mr-1" /> Pick a different module
            </Link>
          </div>
        </div>

        <p className="text-center text-xs mt-8 inline-flex items-center gap-1 w-full justify-center"
          style={{ color: "var(--ph-fg-subtle)" }}>
          <Bell size={11} /> We&apos;ll notify approved partners the moment this module opens.
        </p>
      </div>
    </div>
  );
};

export default ModuleComingSoonPage;
