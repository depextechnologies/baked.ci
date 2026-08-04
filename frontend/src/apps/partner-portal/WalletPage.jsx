/**
 * Partner — Wallet page (Slice 7).
 * Balance card, top-up + withdraw actions, transaction ledger.
 * Payments are MOCKED until the Stripe playbook slice.
 */
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wallet as WalletIcon, ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import { partnerApi } from "./PartnerPortalApp";

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  return Array.isArray(d) ? d.map(x => x?.msg).filter(Boolean).join(" · ") : (d || e?.message || "Something went wrong");
};

const money = (n, cur = "XOF") => `${Number(n).toLocaleString()} ${cur === "XOF" ? "CFA" : cur}`;

const TX_ICON = {
  credit_order:      { icon: ArrowDownRight, color: "#7ee6b0", label: "Order revenue" },
  credit_topup:      { icon: ArrowDownRight, color: "#7edcff", label: "Top-up" },
  credit_adjustment: { icon: ArrowDownRight, color: "#7edcff", label: "Adjustment" },
  debit_commission:  { icon: ArrowUpRight,   color: "#ffbf3c", label: "Commission" },
  debit_payout:      { icon: ArrowUpRight,   color: "#ff9090", label: "Payout" },
  debit_adjustment:  { icon: ArrowUpRight,   color: "#ff9090", label: "Adjustment" },
};

/* -------------------------- Top-up / Withdraw modal ----------------------- */

const AmountModal = ({ open, kind, onClose, onDone }) => {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(kind === "topup" ? "card" : "bank");
  useEffect(() => { if (open) { setAmount(""); setMethod(kind === "topup" ? "card" : "bank"); } }, [open, kind]);

  const submit = async () => {
    const n = Number(amount);
    if (!n || n <= 0) return toast.error("Enter a valid amount");
    try {
      if (kind === "topup") {
        await partnerApi.post("/partner/wallet/topup", { amount: n, method });
        toast.success(`+${money(n)} added (mocked)`);
      } else {
        await partnerApi.post("/partner/wallet/withdraw", { amount: n, destination: method });
        toast.success(`Withdrawal for ${money(n)} requested (mocked)`);
      }
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
  };

  if (!open) return null;
  const isTopup = kind === "topup";
  const methods = isTopup ? ["card", "mobile_money", "bank_transfer"] : ["bank", "mobile_money"];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,.75)" }}
         data-testid={`wallet-${kind}-modal`}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden"
           style={{ background: "var(--ph-bg-elevated)", border: "1px solid var(--ph-border-strong)" }}>
        <div className="p-5" style={{ borderBottom: "1px solid var(--ph-border)" }}>
          <div className="ph-eyebrow">{isTopup ? "Add funds" : "Withdraw funds"}</div>
          <h2 className="ph-h3 mt-1" style={{ color: "var(--ph-fg)" }}>
            {isTopup ? "Top up your wallet" : "Send money to your account"}
          </h2>
        </div>

        <div className="p-5 space-y-4">
          <label className="block text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
            Amount (CFA)
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0"
                   className="w-full mt-1 px-3 h-11 rounded-lg text-sm"
                   style={{ background: "var(--ph-card)", color: "var(--ph-fg)", border: "1px solid var(--ph-border-strong)" }}
                   data-testid={`${kind}-amount-input`} />
          </label>

          <div>
            <div className="text-xs mb-2" style={{ color: "var(--ph-fg-subtle)" }}>
              {isTopup ? "Payment method" : "Destination"}
            </div>
            <div className="flex gap-2">
              {methods.map(m => {
                const on = method === m;
                return (
                  <button key={m} onClick={() => setMethod(m)} data-testid={`${kind}-method-${m}`}
                          className="flex-1 h-10 rounded-lg text-xs capitalize"
                          style={{
                            background: on ? "var(--ph-warm-soft)" : "var(--ph-card)",
                            color:      on ? "var(--ph-accent-warm)" : "var(--ph-fg-muted)",
                            border:     "1px solid " + (on ? "var(--ph-accent-warm)" : "var(--ph-border-strong)"),
                          }}>
                    {m.replace(/_/g, " ")}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg text-xs"
               style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>
            <Info size={14} className="mt-0.5 flex-shrink-0" />
            <span>Payments are currently <b>MOCKED</b> — real Stripe / Mobile Money integration lands in the next slice.</span>
          </div>
        </div>

        <div className="p-4 flex justify-end gap-2" style={{ borderTop: "1px solid var(--ph-border)" }}>
          <button onClick={onClose} className="px-4 h-10 rounded-lg text-sm" style={{ color: "var(--ph-fg-muted)" }}>Cancel</button>
          <button onClick={submit} className="px-4 h-10 rounded-lg text-sm font-medium"
                  style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }}
                  data-testid={`${kind}-submit`}>
            {isTopup ? "Add funds" : "Request withdrawal"}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------- Main page ------------------------------- */

export const WalletPage = () => {
  const [state, setState] = useState({ wallet: null, transactions: [], total: 0 });
  const [modal, setModal] = useState(null); // "topup" | "withdraw" | null

  const load = async () => {
    const { data } = await partnerApi.get("/partner/wallet");
    setState(data);
  };
  useEffect(() => { load(); }, []);

  const w = state.wallet;
  const totalIn  = state.transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = state.transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div data-testid="portal-wallet-page">
      <div className="ph-eyebrow">Wallet</div>
      <h1 className="ph-h1 mt-2" style={{ color: "var(--ph-fg)" }}>Your earnings</h1>

      <div className="mt-8 rounded-2xl p-8"
           style={{ background: "linear-gradient(135deg, var(--ph-accent-warm) 0%, #b47a2c 100%)", color: "#0a0a0f" }}>
        <div className="flex items-center gap-3">
          <WalletIcon size={20} />
          <span className="text-[10px] uppercase tracking-widest">Available balance</span>
        </div>
        <div className="text-5xl font-extrabold mt-4 font-mono" data-testid="wallet-balance">
          {w ? money(w.balance, w.currency) : "—"}
        </div>
        <div className="mt-8 flex gap-3">
          <button onClick={() => setModal("topup")} className="px-5 h-11 rounded-lg text-sm font-medium"
                  style={{ background: "#0a0a0f", color: "var(--ph-accent-warm)" }}
                  data-testid="wallet-topup-btn">
            + Add funds
          </button>
          <button onClick={() => setModal("withdraw")}
                  className="px-5 h-11 rounded-lg text-sm font-medium"
                  style={{ background: "rgba(10,10,15,.15)", color: "#0a0a0f", border: "1px solid rgba(10,10,15,.35)" }}
                  data-testid="wallet-withdraw-btn">
            Withdraw
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl p-4" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
          <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--ph-fg-subtle)" }}>Money in</div>
          <div className="text-xl font-mono mt-1" style={{ color: "#7ee6b0" }}>+{money(totalIn, w?.currency)}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
          <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--ph-fg-subtle)" }}>Money out</div>
          <div className="text-xl font-mono mt-1" style={{ color: "#ff9090" }}>-{money(totalOut, w?.currency)}</div>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="ph-h3 mb-4" style={{ color: "var(--ph-fg)" }}>Transactions</h2>
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
          {state.transactions.length === 0 ? (
            <div className="p-10 text-center">
              <WalletIcon size={28} style={{ color: "var(--ph-fg-subtle)", margin: "0 auto" }} />
              <p className="text-sm mt-3" style={{ color: "var(--ph-fg-muted)" }}>
                No transactions yet. Complete an order or add funds to get started.
              </p>
            </div>
          ) : state.transactions.map(t => {
            const meta = TX_ICON[t.kind] || { icon: ArrowDownRight, color: "var(--ph-fg-muted)", label: t.kind };
            const Icon = meta.icon;
            return (
              <div key={t.id} className="flex items-center gap-3 p-4"
                   style={{ borderBottom: "1px solid var(--ph-border)" }}
                   data-testid={`wallet-tx-${t.id}`}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                     style={{ background: "rgba(255,255,255,.04)", color: meta.color }}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm" style={{ color: "var(--ph-fg)" }}>{meta.label}</div>
                  <div className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
                    {t.description}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm" style={{ color: t.amount >= 0 ? "#7ee6b0" : "#ff9090" }}>
                    {t.amount >= 0 ? "+" : ""}{money(t.amount, t.currency)}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--ph-fg-subtle)" }}>
                    Balance: {money(t.balance_after, t.currency)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AmountModal open={modal === "topup"}    kind="topup"    onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />
      <AmountModal open={modal === "withdraw"} kind="withdraw" onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />
    </div>
  );
};
