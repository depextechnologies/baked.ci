/**
 * Partner Portal — dedicated Staff Login screen.
 *
 * P0 URL restructure (Fixing_Prompt.docx §6+§7):
 *   Route: /partner/:moduleSlug/staff-login
 *   • The module slug in the URL is UX-only. Actual authorization stays
 *     server-side (JWT/permissions).
 *   • After a successful login, we compute the user's *real* module from
 *     the JWT-issued session and route them to that module's portal so
 *     switching URLs manually cannot bypass permissions.
 *
 * Legacy `/partner/staff-login` now resolves to the module selector page.
 */
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Store, User, Lock, ArrowLeft, ShieldCheck } from "lucide-react";
import { partnerApi } from "./PartnerPortalApp";
import { moduleForSlug, slugForBackendModule } from "./moduleRegistry";
import { BakedLogo } from "@/components/layout/BakedLogo";

const fieldStyle = { background: "var(--ph-card)", color: "var(--ph-fg)", border: "1px solid var(--ph-border-strong)" };
const FIELD = "px-3 h-11 rounded-lg w-full text-sm";

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "object" && d?.message) return d.message;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return "Invalid credentials";
  return e?.message || "Invalid credentials";
};

export const StaffLoginPage = () => {
  const { moduleSlug } = useParams();
  const meta = moduleForSlug(moduleSlug) || moduleForSlug("martbaked");
  const [storeId,    setStoreId]    = useState("");
  const [identifier, setIdentifier] = useState("");
  const [pw,         setPw]         = useState("");
  const [busy,       setBusy]       = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const prev = document.title;
    document.title = `${meta.label} · Staff Login`;
    return () => { document.title = prev; };
  }, [meta.label]);

  const submit = async (e) => {
    e.preventDefault();
    if (!storeId.trim()) return toast.error("Enter your Store ID");
    if (!identifier.trim() || !pw)  return toast.error("Enter your Employee ID or email and password");
    setBusy(true);
    try {
      const { data } = await partnerApi.post("/partner/auth/staff-login", {
        store_id: storeId.trim().toUpperCase(),
        identifier: identifier.includes("@") ? identifier.trim().toLowerCase() : identifier.trim().toUpperCase(),
        password: pw,
      });
      localStorage.setItem("baked_partner_token", data.access_token);
      if (data.store) {
        localStorage.setItem("baked_partner_store", JSON.stringify(data.store));
      }
      toast.success(`Welcome ${data.staff.name}`);
      // Authorization is server-side. Always take the staff member to
      // *their* module (from the JWT payload / /me endpoint), not to the
      // module they typed in the URL. This closes the URL-swap loophole.
      const realSlug = slugForBackendModule(data.partner?.module || data.staff?.module || "mart");
      window.location.href = `/partner-portal/${realSlug}`;
    } catch (err) {
      toast.error(errMsg(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="partner-hub" data-theme="dark"
         style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}
         data-testid="staff-login-page">
      <div className="max-w-md w-full px-6 py-10">
        <Link to="/partner" className="inline-flex items-center gap-1 text-xs mb-6"
              style={{ color: "var(--ph-fg-subtle)" }} data-testid="staff-login-back">
          <ArrowLeft size={12} /> Back to Partner Hub
        </Link>

        <div className="flex flex-col items-center mb-6">
          <BakedLogo size="sm" />
          <span
            className="text-[10px] uppercase tracking-widest mt-3 px-2.5 py-1 rounded-full"
            style={{ color: meta.color, border: "1px solid var(--ph-border-strong)", background: "var(--ph-glass)" }}
            data-testid={`staff-login-brand-${moduleSlug || "martbaked"}`}
          >
            {meta.label} · Staff
          </span>
        </div>

        <div className="rounded-3xl p-8"
             style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                 style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>
              <ShieldCheck size={18} />
            </div>
            <div>
              <div className="ph-eyebrow">Staff login</div>
              <div className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
                For pickers, cashiers, and managers on shift
              </div>
            </div>
          </div>
          <h1 className="ph-h2 mt-4" style={{ color: "var(--ph-fg)" }}>
            Sign in to your store
          </h1>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
              Store ID
              <div className="relative mt-1">
                <Store size={14} style={{ color: "var(--ph-fg-subtle)",
                                          position: "absolute", left: 12, top: 15 }} />
                <input
                  autoFocus required
                  value={storeId} onChange={e => setStoreId(e.target.value)}
                  className={FIELD + " pl-9 uppercase tracking-wider"}
                  style={fieldStyle}
                  placeholder="MRT-ABJ-001" autoComplete="off"
                  data-testid="staff-login-store-id" />
              </div>
              <p className="text-[10px] mt-1" style={{ color: "var(--ph-fg-subtle)" }}>
                Your manager gave you this — usually printed near the packing station.
              </p>
            </label>

            <label className="block text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
              Employee ID or email
              <div className="relative mt-1">
                <User size={14} style={{ color: "var(--ph-fg-subtle)",
                                         position: "absolute", left: 12, top: 15 }} />
                <input
                  type="text" required
                  value={identifier} onChange={e => setIdentifier(e.target.value)}
                  className={FIELD + " pl-9"} style={fieldStyle}
                  placeholder="EMP-ABJ-001 or you@yourstore.example"
                  autoComplete="username"
                  data-testid="staff-login-email" />
              </div>
            </label>

            <label className="block text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
              Password
              <div className="relative mt-1">
                <Lock size={14} style={{ color: "var(--ph-fg-subtle)",
                                         position: "absolute", left: 12, top: 15 }} />
                <input
                  type="password" required
                  value={pw} onChange={e => setPw(e.target.value)}
                  className={FIELD + " pl-9"} style={fieldStyle}
                  placeholder="********" autoComplete="current-password"
                  data-testid="staff-login-password" />
              </div>
            </label>

            <button type="submit" disabled={busy}
                    className="ph-btn ph-btn-warm w-full justify-center"
                    data-testid="staff-login-submit">
              {busy ? "Signing in…" : "Sign in to store"}
            </button>
          </form>

          <div className="mt-6 pt-6 text-xs text-center"
               style={{ color: "var(--ph-fg-subtle)", borderTop: "1px solid var(--ph-border)" }}>
            Are you the store owner?{" "}
            <Link to={`/partner-portal/${moduleSlug || "martbaked"}/login`}
                  style={{ color: "var(--ph-accent-warm)", textDecoration: "underline" }}
                  data-testid="staff-login-to-owner">
              Owner login →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
