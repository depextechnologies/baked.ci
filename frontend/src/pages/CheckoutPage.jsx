import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth, useApp, useCart } from "../contexts/BakedContexts";
import { formatMoney, t } from "../lib/i18n";
import { Button } from "../components/ui/button";
import { MapPin, Clock, CreditCard, Wallet, Smartphone, PlusCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PhoneLoginDialog } from "../components/auth/PhoneLoginDialog";

export const CheckoutPage = () => {
  const { customer } = useAuth();
  const { country, uiLocale, language } = useApp();
  const { cart, reload: reloadCart } = useCart();
  const navigate = useNavigate();
  const [loginOpen, setLoginOpen] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [slots, setSlots] = useState([]);
  const [methods, setMethods] = useState([]);
  const [addressId, setAddressId] = useState(null);
  const [slotId, setSlotId] = useState(null);
  const [method, setMethod] = useState("cod");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [showNewAddr, setShowNewAddr] = useState(false);
  const [newAddr, setNewAddr] = useState({ label: "Home", line1: "", city: country.code === "CI" ? "Abidjan" : "London", instructions: "" });

  useEffect(() => {
    if (!customer) { setLoginOpen(true); return; }
    (async () => {
      const [ad, sl, mt] = await Promise.all([
        api.get("/customers/me/addresses"),
        api.get(`/mart/delivery-slots?country=${country.code}`),
        api.get(`/mart/payment-methods?country=${country.code}`),
      ]);
      setAddresses(ad.data);
      setSlots(sl.data);
      setMethods(mt.data);
      if (ad.data.length) setAddressId(ad.data.find(a => a.is_default)?.id || ad.data[0].id);
      if (sl.data.length) setSlotId(sl.data[0].id);
    })();
  }, [customer, country.code]);

  const items = cart.items || [];
  const subtotal = cart.subtotal || 0;
  const deliveryFee = subtotal >= country.free_delivery_over ? 0 : country.delivery_fee;
  const total = subtotal + deliveryFee;
  const minOrderOk = subtotal >= country.min_order;

  const saveAddress = async () => {
    if (!newAddr.line1.trim()) { toast.error(language === "en" ? "Enter an address" : "Entrez une adresse"); return; }
    const { data } = await api.post("/customers/me/addresses", { ...newAddr, country: country.code, is_default: addresses.length === 0 });
    setAddresses((prev) => [...prev, data]);
    setAddressId(data.id);
    setShowNewAddr(false);
    setNewAddr({ label: "Home", line1: "", city: country.code === "CI" ? "Abidjan" : "London", instructions: "" });
  };

  const placeOrder = async () => {
    if (!addressId) { toast.error(language === "en" ? "Please choose an address" : "Veuillez choisir une adresse"); return; }
    if (!slotId) { toast.error(language === "en" ? "Please choose a delivery time" : "Veuillez choisir une créneau"); return; }
    if (!minOrderOk) { toast.error(`Minimum order is ${formatMoney(country.min_order, country.currency, country.currency_symbol)}`); return; }
    setBusy(true);
    try {
      const slot = slots.find(s => s.id === slotId);
      const { data } = await api.post("/orders", {
        address_id: addressId,
        delivery_slot_id: slotId,
        delivery_slot_label: slot?.label || "",
        payment_method: method,
        instructions,
      });
      await reloadCart();
      toast.success(language === "en" ? "Order placed!" : "Commande passée !");
      navigate(`/orders/${data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Order failed");
    } finally { setBusy(false); }
  };

  if (!customer) {
    return (
      <>
        <div className="baked-container my-16 text-center">
          <h2 className="text-2xl font-bold">{language === "en" ? "Sign in to check out" : "Connectez-vous pour valider"}</h2>
          <p className="text-sm text-muted-foreground mt-2">{language === "en" ? "You'll need an account to complete your order." : "Vous avez besoin d'un compte pour finaliser."}</p>
          <Button onClick={() => setLoginOpen(true)} className="mt-4 baked-btn h-11 px-6 font-semibold" style={{ backgroundColor: "#FF4C52", color: "white" }}>{language === "en" ? "Login" : "Se connecter"}</Button>
        </div>
        <PhoneLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </>
    );
  }

  if (items.length === 0) {
    return <div className="baked-container my-16 text-center text-muted-foreground">{language === "en" ? "Your cart is empty." : "Votre panier est vide."}</div>;
  }

  const iconFor = (code) => code === "stripe" ? CreditCard : code === "mobile_money" ? Smartphone : Wallet;

  return (
    <div className="baked-container my-8 grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        {/* Address */}
        <section className="baked-card bg-card border border-border p-5">
          <div className="flex items-center gap-2 mb-4"><MapPin size={18} style={{ color: "#77BC1F" }} /><h3 className="font-semibold">{language === "en" ? "Delivery address" : "Adresse de livraison"}</h3></div>
          <div className="grid gap-2">
            {addresses.map((a) => (
              <label key={a.id} data-testid={`checkout-address-${a.id}`} className={`flex items-start gap-3 p-3 baked-btn cursor-pointer border ${addressId === a.id ? "border-[#77BC1F]" : "border-border"} hover:bg-secondary motion-fast`}>
                <input type="radio" name="addr" checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="mt-1 accent-[#77BC1F]" />
                <div className="flex-1">
                  <div className="text-sm font-semibold">{a.label}</div>
                  <div className="text-xs text-muted-foreground">{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}</div>
                  {a.instructions && <div className="text-[11px] text-muted-foreground mt-0.5">📝 {a.instructions}</div>}
                </div>
              </label>
            ))}
            {showNewAddr ? (
              <div className="baked-card border border-border p-3 space-y-2">
                <input value={newAddr.label} onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })} placeholder={language === "en" ? "Label (Home, Office…)" : "Étiquette"} className="baked-input w-full bg-secondary px-3 py-2 text-sm outline-none" />
                <input data-testid="checkout-new-address-line1" value={newAddr.line1} onChange={(e) => setNewAddr({ ...newAddr, line1: e.target.value })} placeholder={language === "en" ? "Street address" : "Adresse"} className="baked-input w-full bg-secondary px-3 py-2 text-sm outline-none" />
                <input value={newAddr.city} onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })} placeholder={language === "en" ? "City" : "Ville"} className="baked-input w-full bg-secondary px-3 py-2 text-sm outline-none" />
                <div className="flex gap-2">
                  <Button data-testid="checkout-save-address" onClick={saveAddress} size="sm" className="baked-btn font-semibold text-black" style={{ backgroundColor: "#77BC1F" }}>{language === "en" ? "Save address" : "Enregistrer"}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowNewAddr(false)}>{language === "en" ? "Cancel" : "Annuler"}</Button>
                </div>
              </div>
            ) : (
              <button data-testid="checkout-add-address-btn" onClick={() => setShowNewAddr(true)} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 mt-1"><PlusCircle size={16} /> {language === "en" ? "Add new address" : "Ajouter une adresse"}</button>
            )}
          </div>
        </section>

        {/* Delivery slot */}
        <section className="baked-card bg-card border border-border p-5">
          <div className="flex items-center gap-2 mb-4"><Clock size={18} style={{ color: "#77BC1F" }} /><h3 className="font-semibold">{language === "en" ? "Delivery time" : "Créneau de livraison"}</h3></div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {slots.slice(0, 12).map((s) => (
              <button key={s.id} data-testid={`checkout-slot-${s.id}`} onClick={() => setSlotId(s.id)} className={`p-3 baked-btn text-left border motion-fast ${slotId === s.id ? "border-[#77BC1F] bg-secondary" : "border-border hover:bg-secondary/60"}`}>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">{s.kind === "asap" ? (language === "en" ? "Now" : "Maintenant") : (language === "en" ? "Scheduled" : "Planifié")}</div>
                <div className="text-sm font-semibold">{s.label}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Payment */}
        <section className="baked-card bg-card border border-border p-5">
          <div className="flex items-center gap-2 mb-4"><CreditCard size={18} style={{ color: "#77BC1F" }} /><h3 className="font-semibold">{language === "en" ? "Payment" : "Paiement"}</h3></div>
          <div className="grid gap-2">
            {methods.map((m) => {
              const Icon = iconFor(m.code);
              return (
                <label key={m.code} data-testid={`checkout-method-${m.code}`} className={`flex items-center gap-3 p-3 baked-btn border ${method === m.code ? "border-[#77BC1F]" : "border-border"} ${m.enabled ? "cursor-pointer" : "opacity-50"} hover:bg-secondary motion-fast`}>
                  <input type="radio" name="pm" disabled={!m.enabled} checked={method === m.code} onChange={() => setMethod(m.code)} className="accent-[#77BC1F]" />
                  <Icon size={18} className="text-muted-foreground" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{language === "en" ? m.label : (m.label_fr || m.label)}</div>
                    <div className="text-[11px] text-muted-foreground">{m.description}{!m.enabled ? " · coming soon" : ""}</div>
                  </div>
                </label>
              );
            })}
          </div>
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={language === "en" ? "Delivery instructions (optional)" : "Instructions de livraison (optionnel)"} className="baked-input mt-4 w-full bg-secondary px-3 py-2 text-sm outline-none min-h-[64px]" />
        </section>
      </div>

      {/* Summary */}
      <aside>
        <div className="baked-card bg-card border border-border p-5 sticky top-24 space-y-3">
          <div className="text-sm font-semibold">{language === "en" ? "Order summary" : "Résumé de la commande"}</div>
          <div className="text-xs text-muted-foreground space-y-1">
            {items.map((it) => (<div key={it.id} className="flex justify-between"><span className="truncate pr-2">{it.quantity} × {it.product.name}</span><span>{formatMoney(it.line_total, it.product.currency, it.product.currency_symbol)}</span></div>))}
          </div>
          <div className="h-px bg-border" />
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t(uiLocale, "cart.subtotal")}</span><span>{formatMoney(subtotal, country.currency, country.currency_symbol)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">{language === "en" ? "Delivery" : "Livraison"}</span><span>{deliveryFee === 0 ? "FREE" : formatMoney(deliveryFee, country.currency, country.currency_symbol)}</span></div>
          <div className="h-px bg-border" />
          <div className="flex justify-between font-bold"><span>{language === "en" ? "Total" : "Total"}</span><span>{formatMoney(total, country.currency, country.currency_symbol)}</span></div>
          {!minOrderOk && (<div className="text-[11px] p-2 rounded-lg bg-yellow-500/10 text-yellow-500">{language === "en" ? "Below minimum order" : "En dessous du minimum"}</div>)}
          <Button data-testid="checkout-place-order-btn" onClick={placeOrder} disabled={busy || !minOrderOk} className="w-full h-12 baked-btn font-semibold text-black" style={{ backgroundColor: "#77BC1F" }}>
            {busy ? (language === "en" ? "Placing…" : "En cours…") : (language === "en" ? "Place order" : "Passer la commande")}
          </Button>
        </div>
      </aside>
    </div>
  );
};
