/**
 * Partner Portal — Team (Slice B).
 * Owner + manager can list, invite, edit and remove teammates.
 * Packer / cashier don't see this route (sidebar hides the entry).
 */
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Mail, X, Copy, ShieldCheck, ShieldAlert } from "lucide-react";
import { partnerApi, usePartner } from "./PartnerPortalApp";

const fieldStyle = { background: "var(--ph-card)", color: "var(--ph-fg)", border: "1px solid var(--ph-border-strong)" };
const FIELD = "px-3 h-10 rounded-lg w-full text-sm";
const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (Array.isArray(d)) return d.map(x => x?.msg).filter(Boolean).join(" · ");
  if (typeof d === "object" && d?.message) return d.message;
  return d || e?.message || "Something went wrong";
};

const ROLE_META = {
  owner:   { color: "#ffbf3c", label: "Owner" },
  manager: { color: "#7edcff", label: "Manager" },
  packer:  { color: "#7ee6b0", label: "Packer" },
  cashier: { color: "#ff9090", label: "Cashier" },
};

const InviteModal = ({ open, onClose, onDone }) => {
  const [email, setEmail] = useState("");
  const [name,  setName]  = useState("");
  const [role,  setRole]  = useState("packer");
  const [busy,  setBusy]  = useState(false);
  const [copyableUrl, setCopyableUrl] = useState(null);
  const [emailSent, setEmailSent] = useState(false);

  const submit = async () => {
    if (!email || !name) return toast.error("Email and name are required");
    setBusy(true);
    try {
      const { data } = await partnerApi.post("/partner/staff/invite", { email, name, role });
      setCopyableUrl(data.invite_url);
      setEmailSent(!!data.email_sent);
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const reset = () => { setEmail(""); setName(""); setRole("packer"); setCopyableUrl(null); setEmailSent(false); };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,.75)" }} data-testid="staff-invite-modal">
      <div className="w-full max-w-md rounded-2xl overflow-hidden"
           style={{ background: "var(--ph-bg-elevated)", border: "1px solid var(--ph-border-strong)" }}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--ph-border)" }}>
          <div>
            <div className="ph-eyebrow">Team</div>
            <h2 className="ph-h3 mt-1" style={{ color: "var(--ph-fg)" }}>Invite a teammate</h2>
          </div>
          <button onClick={() => { reset(); onClose(); }}
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ color: "var(--ph-fg-muted)", border: "1px solid var(--ph-border)" }}
                  data-testid="staff-invite-close">
            <X size={18} />
          </button>
        </div>

        {!copyableUrl ? (
          <div className="p-5 space-y-4">
            <label className="block text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
              Their email
              <input value={email} onChange={e => setEmail(e.target.value)} type="email"
                     className={FIELD + " mt-1"} style={fieldStyle}
                     placeholder="teammate@example.com" data-testid="invite-email" />
            </label>
            <label className="block text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
              Their full name
              <input value={name} onChange={e => setName(e.target.value)}
                     className={FIELD + " mt-1"} style={fieldStyle}
                     placeholder="Full Name" data-testid="invite-name" />
            </label>
            <div>
              <div className="text-xs mb-2" style={{ color: "var(--ph-fg-subtle)" }}>Role</div>
              <div className="grid grid-cols-3 gap-2">
                {["manager","packer","cashier"].map(r => {
                  const on = role === r;
                  return (
                    <button key={r} onClick={() => setRole(r)} data-testid={`invite-role-${r}`}
                            className="h-10 rounded-lg text-xs capitalize"
                            style={{
                              background: on ? "var(--ph-warm-soft)" : "var(--ph-card)",
                              color:      on ? "var(--ph-accent-warm)" : "var(--ph-fg-muted)",
                              border:     "1px solid " + (on ? "var(--ph-accent-warm)" : "var(--ph-border-strong)"),
                            }}>{r}</button>
                  );
                })}
              </div>
              <p className="text-[11px] mt-2" style={{ color: "var(--ph-fg-subtle)" }}>
                {role === "manager" && "Full access except staff & wallet withdraw settings."}
                {role === "packer" && "Can view/pack orders and adjust stock counts during picking."}
                {role === "cashier" && "Can view orders & wallet, initiate top-ups; cannot change order status."}
              </p>
            </div>
            <button onClick={submit} disabled={busy}
                    className="w-full h-11 rounded-lg text-sm font-medium"
                    style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }}
                    data-testid="invite-submit">
              {busy ? "Sending…" : "Send invite"}
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4" data-testid="invite-success">
            <div className="flex items-start gap-2 p-3 rounded-lg"
                 style={{ background: emailSent ? "rgba(120,255,120,.10)" : "var(--ph-warm-soft)",
                          color:      emailSent ? "#8ce68a" : "var(--ph-accent-warm)" }}>
              {emailSent
                ? <ShieldCheck size={16} className="mt-0.5 flex-shrink-0" />
                : <ShieldAlert size={16} className="mt-0.5 flex-shrink-0" />}
              <div className="text-xs">
                {emailSent
                  ? "Invitation email sent successfully."
                  : "SMTP not configured — copy the link below and share it with your teammate over WhatsApp / SMS."}
              </div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--ph-fg-subtle)" }}>Invitation link</div>
              <div className="flex items-center gap-2 p-2 rounded-lg"
                   style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border-strong)" }}>
                <code className="text-[11px] flex-1 break-all" style={{ color: "var(--ph-fg)" }}>{copyableUrl}</code>
                <button onClick={() => { navigator.clipboard.writeText(copyableUrl); toast.success("Copied"); }}
                        className="text-xs px-2 h-8 rounded"
                        style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}
                        data-testid="invite-copy">
                  <Copy size={12} className="inline mr-1" /> Copy
                </button>
              </div>
            </div>
            <button onClick={() => { reset(); }} className="w-full h-10 rounded-lg text-sm"
                    style={{ color: "var(--ph-fg-muted)", border: "1px solid var(--ph-border-strong)" }}
                    data-testid="invite-another">
              Invite another
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const TeamPage = () => {
  const { role: myRole } = usePartner();
  const canManage = myRole === "owner";
  const [rows, setRows] = useState([]);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = async () => {
    const { data } = await partnerApi.get("/partner/staff");
    setRows(data.items);
  };
  useEffect(() => { load(); }, []);

  const setActive = async (r, on) => {
    try {
      await partnerApi.patch(`/partner/staff/${r.id}`, { is_active: on });
      toast.success(on ? "Reactivated" : "Deactivated");
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async (r) => {
    if (!window.confirm(`Remove ${r.name} from your team?`)) return;
    try {
      await partnerApi.delete(`/partner/staff/${r.id}`);
      toast.success("Teammate removed");
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div data-testid="portal-team-page">
      <div className="ph-eyebrow">Team</div>
      <div className="flex items-center justify-between mt-2">
        <h1 className="ph-h1" style={{ color: "var(--ph-fg)" }}>Your team</h1>
        <button onClick={() => setInviteOpen(true)} className="ph-btn ph-btn-warm"
                style={{ height: 44, padding: "0 22px" }} data-testid="team-invite-btn">
          <Users size={16} className="inline mr-1" /> Invite teammate
        </button>
      </div>
      <p className="ph-body mt-3 max-w-2xl">
        Give teammates scoped access so pickers, cashiers and managers can log in with their own accounts.
      </p>

      <div className="mt-8 rounded-2xl overflow-hidden"
           style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
        {rows.map(r => {
          const meta = ROLE_META[r.role] || ROLE_META.packer;
          return (
            <div key={r.id} data-testid={`team-row-${r.email}`}
                 className="flex items-center gap-3 p-4"
                 style={{ borderBottom: "1px solid var(--ph-border)", opacity: r.is_active ? 1 : 0.5 }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold"
                   style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>
                {(r.name || "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm" style={{ color: "var(--ph-fg)" }}>{r.name}</div>
                <div className="text-xs flex items-center gap-2 mt-0.5" style={{ color: "var(--ph-fg-subtle)" }}>
                  <Mail size={11} /> {r.email}
                  {r.invite_pending && (
                    <span data-testid={`team-pending-${r.email}`}
                          className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded"
                          style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>
                      Invite pending
                    </span>
                  )}
                  {!r.is_active && (
                    <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(255,90,90,.15)", color: "#ff9090" }}>
                      Deactivated
                    </span>
                  )}
                </div>
              </div>
              <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded"
                    style={{ background: "rgba(255,255,255,.04)", color: meta.color }}>
                {meta.label}
              </span>
              {canManage && !r.is_owner_row && (
                <>
                  <button onClick={() => setActive(r, !r.is_active)} className="px-2 h-8 rounded text-xs"
                          style={{ color: "var(--ph-fg-muted)", border: "1px solid var(--ph-border-strong)" }}
                          data-testid={`team-toggle-${r.email}`}>
                    {r.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                  <button onClick={() => remove(r)} className="px-2 h-8 rounded text-xs text-rose-400"
                          style={{ border: "1px solid var(--ph-border-strong)" }}
                          data-testid={`team-delete-${r.email}`}>
                    Remove
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} onDone={() => { load(); }} />
    </div>
  );
};


/* ===================== Accept Invite public page ========================= */

export const AcceptInvitePage = () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const { refresh } = usePartner();

  const submit = async (e) => {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    if (pw !== pw2) return toast.error("Passwords do not match");
    setBusy(true);
    try {
      const { data } = await partnerApi.post("/partner/staff/accept-invite", { token, password: pw });
      localStorage.setItem("baked_partner_token", data.access_token);
      toast.success(`Welcome to ${data.partner.business_name}!`);
      await refresh();
      window.location.href = "/partner-portal";
    } catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="partner-hub" data-theme="dark"
         style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}
         data-testid="portal-accept-invite-page">
      <div className="max-w-md w-full px-6 py-10">
        <div className="rounded-3xl p-8"
             style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
          <div className="ph-eyebrow">Team invitation</div>
          <h1 className="ph-h2 mt-1" style={{ color: "var(--ph-fg)" }}>Set your password</h1>
          <p className="text-sm mt-2" style={{ color: "var(--ph-fg-muted)" }}>
            Create a password to activate your MARTbakēd teammate account.
          </p>
          {!token && (
            <p className="text-sm mt-4 p-3 rounded-lg"
               style={{ background: "rgba(255,90,90,.10)", color: "#ff9090" }}>
              This invitation link is invalid or has expired.
            </p>
          )}
          {token && (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <label className="block text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
                Password (min. 8 characters)
                <input type="password" required autoFocus value={pw} onChange={e => setPw(e.target.value)}
                       className={FIELD + " mt-1"} style={fieldStyle} data-testid="accept-pw" />
              </label>
              <label className="block text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
                Confirm password
                <input type="password" required value={pw2} onChange={e => setPw2(e.target.value)}
                       className={FIELD + " mt-1"} style={fieldStyle} data-testid="accept-pw2" />
              </label>
              <button type="submit" disabled={busy}
                      className="ph-btn ph-btn-warm w-full justify-center"
                      data-testid="accept-submit">
                {busy ? "Activating…" : "Activate & sign in"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
