/**
 * MyReturnsPage — /profile/returns
 *
 * Lists the customer's return/refund requests across FOOD / MART / SHOP with
 * live status badges. Clicking a card opens a detail drawer with the full
 * audit timeline so the customer can track the refund without emailing support.
 */
import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, Loader2, Receipt, AlertTriangle, Clock, Check, Wallet2, CreditCard, X,
} from "lucide-react";
import { useAuth } from "../contexts/BakedContexts";

const API = process.env.REACT_APP_BACKEND_URL || "";

const authHeaders = () => {
  const t = typeof window !== "undefined" ? localStorage.getItem("baked_access_token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const STATUS_META = {
  refunded:                { fr: "Remboursé",                    en: "Refunded",             tone: "#00A651", icon: Check },
  approved:                { fr: "Approuvé",                     en: "Approved",             tone: "#00A651", icon: Check },
  partial_approved:        { fr: "Partiellement approuvé",       en: "Partially approved",   tone: "#F59E0B", icon: Check },
  approved_pending_payout: { fr: "Remb. en cours",               en: "Refund processing",    tone: "#F59E0B", icon: Clock },
  awaiting_partner:        { fr: "En attente du restaurant",     en: "Awaiting partner",     tone: "#3B82F6", icon: Clock },
  awaiting_admin:          { fr: "En attente de BAKĒD",          en: "Awaiting BAKĒD",       tone: "#3B82F6", icon: Clock },
  rejected:                { fr: "Rejeté",                       en: "Rejected",             tone: "#EF4444", icon: X },
  cancelled:               { fr: "Annulé",                       en: "Cancelled",            tone: "#9CA3AF", icon: X },
  partner_disputed:        { fr: "Contesté",                     en: "Disputed",             tone: "#F59E0B", icon: AlertTriangle },
};

const fmt = (v, c) => `${Math.round(Number(v || 0)).toLocaleString()} ${c || ""}`;

const Pill = ({ status, fr }) => {
  const meta = STATUS_META[status] || { fr: status, en: status, tone: "#6B7280", icon: Clock };
  const Ico = meta.icon;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${meta.tone}22`, color: meta.tone }}
          data-testid={`return-status-${status}`}>
      <Ico size={10} /> {fr ? meta.fr : meta.en}
    </span>
  );
};

const DetailDrawer = ({ id, onClose }) => {
  const { i18n } = useTranslation("customer");
  const fr = (i18n.language || "fr").toLowerCase().startsWith("fr");
  const [data, setData] = useState(null);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`${API}/api/returns/${id}`, { headers: authHeaders() });
        setData(data);
      } catch {}
    })();
  }, [id]);

  const cancel = async () => {
    if (!window.confirm(fr ? "Annuler cette demande ?" : "Cancel this request?")) return;
    setCanceling(true);
    try {
      await axios.post(`${API}/api/returns/${id}/cancel`, {}, { headers: authHeaders() });
      onClose(true);
    } finally { setCanceling(false); }
  };

  if (!data) {
    return (
      <div className="fixed inset-0 z-[150] bg-black/60 flex items-center justify-center">
        <Loader2 className="animate-spin text-white" />
      </div>
    );
  }

  const ret = data.return;
  const canCancel = ["awaiting_partner", "awaiting_admin"].includes(ret.status);

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/60"
         data-testid="return-detail-drawer">
      <div className="w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl bg-background border border-border max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-background">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {fr ? "Détails du retour" : "Return details"}
            </div>
            <h3 className="text-base font-bold font-mono">#{ret.number}</h3>
          </div>
          <button onClick={() => onClose(false)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Pill status={ret.status} fr={fr} />
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground uppercase">
                {ret.status === "refunded" ? (fr ? "Remboursé" : "Refunded")
                                            : (fr ? "Demandé" : "Requested")}
              </div>
              <div className="text-lg font-bold">
                {fmt(ret.approved_amount ?? ret.requested_amount, ret.currency)}
              </div>
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {fr ? "Articles" : "Items"}
            </div>
            <div className="space-y-1 rounded-xl border border-border bg-card p-3">
              {data.items.map((it) => (
                <div key={it.id} className="flex items-center justify-between text-xs">
                  <span>{it.qty}× {it.name_snapshot}</span>
                  <span className="font-mono">{fmt(it.line_amount, ret.currency)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Destination */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {ret.refund_destination === "wallet"
              ? <><Wallet2 size={13} /> {fr ? "Portefeuille BAKĒD" : "BAKĒD Wallet"}</>
              : <><CreditCard size={13} /> {fr ? "Moyen initial" : "Original method"}</>}
          </div>

          {/* Timeline */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {fr ? "Historique" : "Timeline"}
            </div>
            <ol className="relative border-l border-border ml-2 space-y-3" data-testid="return-timeline">
              {data.audit.map((a) => (
                <li key={a.id} className="pl-4 relative">
                  <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-[color:var(--green)]"
                        style={{ "--green": "#00A651" }} />
                  <div className="text-xs font-semibold">{a.action.replace(/_/g, " ")}</div>
                  {a.note && <div className="text-[11px] text-muted-foreground">{a.note}</div>}
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {new Date(a.created_at).toLocaleString(fr ? "fr-FR" : "en-GB")}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {canCancel && (
            <button
              onClick={cancel}
              disabled={canceling}
              data-testid="return-cancel"
              className="w-full h-10 rounded-xl text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {canceling ? "…" : (fr ? "Annuler ma demande" : "Cancel this request")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const MyReturnsPage = () => {
  const { i18n } = useTranslation("customer");
  const fr = (i18n.language || "fr").toLowerCase().startsWith("fr");
  const nav = useNavigate();
  const { customer, loading: authLoading, openLogin } = useAuth() || {};
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId]   = useState(null);

  const load = async () => {
    if (!customer) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/returns`, { headers: authHeaders() });
      setRows(data.items || []);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!authLoading && !customer) {
      try { openLogin?.(window.location.pathname); } catch {}
    } else if (customer) {
      load();
    }
  }, [customer, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const empty = !loading && rows.length === 0;

  return (
    <div className="min-h-screen" data-testid="my-returns-page">
      <div className="baked-container pt-5 pb-16">
        <button onClick={() => nav(-1)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
                data-testid="my-returns-back">
          <ArrowLeft size={12} /> {fr ? "Retour" : "Back"}
        </button>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#00A65122", color: "#00A651" }}>
            <Receipt size={22} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">{fr ? "Mes Retours & Remboursements" : "My Returns & Refunds"}</h1>
            <p className="text-xs text-muted-foreground">
              {fr ? "Suivez vos demandes sans contacter le support."
                  : "Track your requests without contacting support."}
            </p>
          </div>
        </div>

        <div className="mt-6">
          {loading && (
            <div className="py-16 flex justify-center"><Loader2 className="animate-spin" /></div>
          )}
          {empty && (
            <div className="rounded-2xl border border-dashed border-border bg-card/40 py-14 text-center px-6"
                 data-testid="my-returns-empty">
              <Receipt size={30} className="mx-auto text-muted-foreground" />
              <div className="mt-3 text-sm font-semibold">
                {fr ? "Aucun retour pour le moment" : "No returns yet"}
              </div>
              <div className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {fr ? "Les retours que vous ouvrez depuis vos commandes apparaîtront ici."
                    : "Returns you open from your orders will appear here."}
              </div>
              <Link to="/profile/activities"
                    className="inline-flex mt-5 h-10 px-4 items-center rounded-xl text-xs font-semibold border border-border hover:bg-secondary">
                {fr ? "Voir mes commandes" : "View my orders"}
              </Link>
            </div>
          )}
          {!loading && rows.length > 0 && (
            <div className="space-y-2.5" data-testid="my-returns-list">
              {rows.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setOpenId(r.id)}
                  data-testid={`my-return-row-${r.id}`}
                  className="w-full text-left rounded-2xl bg-card border border-border p-4 hover:border-[#00A651] motion-fast"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">#{r.number}</span>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                          {r.order_module}bakēd
                        </span>
                      </div>
                      <div className="mt-1 text-sm font-semibold">
                        {fmt(r.approved_amount ?? r.requested_amount, r.currency)}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(r.created_at).toLocaleString(fr ? "fr-FR" : "en-GB",
                          { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <Pill status={r.status} fr={fr} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {openId && <DetailDrawer id={openId} onClose={(reload) => { setOpenId(null); if (reload) load(); }} />}
    </div>
  );
};

export default MyReturnsPage;
