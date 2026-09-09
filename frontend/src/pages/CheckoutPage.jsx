import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth, useApp, useCart } from "../contexts/BakedContexts";
import { formatMoney, t } from "../lib/i18n";
import { useLocalePath } from "../i18n/routes";
import { checkOrderEligibility } from "../lib/checkout";
import { getCartTheme } from "../lib/cartTheme";
import { Button } from "../components/ui/button";
import { MapPin, Clock, CreditCard, Wallet, Smartphone, PlusCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PhoneLoginDialog } from "../components/auth/PhoneLoginDialog";

export const CheckoutPage = () => {
  const { customer } = useAuth();
  const { country, uiLocale, language, activeAddress, openAddressSelector } = useApp();
  const { cart, reload: reloadCart } = useCart();
  const navigate = useNavigate();
  const path = useLocalePath();
  const [loginOpen, setLoginOpen] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [slots, setSlots] = useState([]);
  const [methods, setMethods] = useState([]);
  const [addressId, setAddressId] = useState(null);
  const [slotId, setSlotId] = useState(null);
  const [method, setMethod] = useState("cod");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);

  const loadAddresses = async (preferAddressId) => {
    const { data } = await api.get("/customers/me/addresses");
    setAddresses(data);
    let selectedId = preferAddressId;
    if (!selectedId && activeAddress && data.length) {
      const match = data.find((a) => (
        (activeAddress.id && a.id === activeAddress.id) ||
        (activeAddress.place_id && a.place_id === activeAddress.place_id) ||
        (activeAddress.formatted_address && a.formatted_address === activeAddress.formatted_address)
      ));
      if (match) selectedId = match.id;
    }
    if (!selectedId && data.length) selectedId = data.find(a => a.is_default)?.id || data[0].id;
    setAddressId(selectedId);
    return data;
  };

  useEffect(() => {
    if (!customer) { setLoginOpen(true); return; }
    (async () => {
      const [_, sl, mt] = await Promise.all([
        loadAddresses(),
        api.get(`/mart/delivery-slots?country=${country.code}`),
        api.get(`/mart/payment-methods?country=${country.code}`),
      ]);
      void _;
      setSlots(sl.data);
      setMethods(mt.data);
      if (sl.data.length) setSlotId(sl.data[0].id);
    })();
  }, [customer, country.code, activeAddress]);

  const items = cart.items || [];
  const hasShop = (cart.shop?.item_count ?? 0) > 0 || items.some((i) => i.module === "shop");
  const hasMart = (cart.mart?.item_count ?? 0) > 0 || items.some((i) => i.module !== "shop");
  // QA — Fixing_Prompt v14 §5: checkout branding follows cart composition
  // (MART_ONLY / SHOP_ONLY / MIXED). Falls back to MART green when empty.
  const theme = getCartTheme(cart);
  const martSubtotal = cart.mart?.subtotal ?? items.filter((i) => i.module !== "shop").reduce((s, i) => s + (i.line_total || (i.product?.price || 0) * i.quantity), 0);
  const shopSubtotal = cart.shop?.subtotal ?? items.filter((i) => i.module === "shop").reduce((s, i) => s + (i.line_total || 0), 0);
  const elig = checkOrderEligibility(martSubtotal, country);
  const { delivery_fee: deliveryFee, min_order: minOrder, shortfall, eligible: martEligible } = elig;
  const minOrderOk = hasMart ? martEligible : true;
  const total = (hasMart ? elig.total : 0) + shopSubtotal;
  const subtotal = martSubtotal + shopSubtotal;

  const saveAddress = async (candidate) => {
    // Called by AddressSelector's onPick — persist the picked place, refresh
    // the list, and auto-select. This guarantees checkout ONLY uses
    // Google-verified addresses with lat/lng coordinates.
    const payload = {
      label: "Home",
      line1: candidate.line1 || candidate.formatted_address,
      city: candidate.city || "",
      region: candidate.region,
      country: (candidate.country || country.code).toUpperCase(),
      postal_code: candidate.postal_code,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      place_id: candidate.place_id,
      formatted_address: candidate.formatted_address,
      instructions: candidate.instructions || "",
      is_default: addresses.length === 0,
    };
    try {
      // If the pick already has an id (came from saved list), just select it.
      if (candidate.id || candidate._saved_id) {
        await loadAddresses(candidate.id || candidate._saved_id);
      } else {
        const { data } = await api.post("/customers/me/addresses", payload);
        await loadAddresses(data.id);
      }
      toast.success(language === "en" ? "Address added" : "Adresse ajoutée");
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : (language === "en" ? "Couldn't save address" : "Impossible d'enregistrer"));
    }
  };

  const openPicker = () => openAddressSelector({
    onPick: saveAddress,
    title: language === "en" ? "Add delivery address" : "Ajouter une adresse",
  });

  const placeOrder = async () => {
    if (hasMart && !addressId) { toast.error(language === "en" ? "Please choose an address" : "Veuillez choisir une adresse"); return; }
    if (hasMart && !slotId) { toast.error(language === "en" ? "Please choose a delivery time" : "Veuillez choisir une créneau"); return; }
    if (!minOrderOk) { toast.error(`Minimum order is ${formatMoney(country.min_order, country.currency, country.currency_symbol)}`); return; }
    setBusy(true);
    try {
      const slot = slots.find(s => s.id === slotId);
      // Unified checkout: place MART order first (if any), then SHOP order
      // (if any). Backend keeps both fulfilment paths isolated. If MART fails
      // we abort and leave SHOP cart intact; if SHOP fails after MART success
      // we still route to the MART receipt and surface the SHOP error toast.
      let martOrder = null;
      if (hasMart) {
        const { data } = await api.post("/orders", {
          address_id: addressId,
          delivery_slot_id: slotId,
          delivery_slot_label: slot?.label || "",
          payment_method: method,
          instructions,
        });
        martOrder = data;
      }
      let shopOrder = null;
      if (hasShop) {
        try {
          const chosen = addresses.find((a) => a.id === addressId);
          const { data } = await api.post("/shop/checkout", {
            payment_method: method === "cod" ? "cash_on_delivery" : method,
            delivery_address: chosen ? {
              line1: chosen.line1, city: chosen.city, region: chosen.region,
              country: chosen.country, postal_code: chosen.postal_code,
              latitude: chosen.latitude, longitude: chosen.longitude,
              formatted_address: chosen.formatted_address,
            } : null,
            instructions,
          });
          shopOrder = data;
        } catch (shopErr) {
          const d = shopErr?.response?.data?.detail;
          const msg = typeof d === "string" ? d : (d?.message || "SHOP order failed — items kept in cart");
          toast.error(msg, { duration: 6000 });
        }
      }
      await reloadCart();
      toast.success(language === "en" ? "Order placed!" : "Commande passée !");
      // SHOP orders carry a delivery PIN. Toast the SMS status so the
      // customer knows whether to check their SMS inbox or the order page.
      if (shopOrder?.delivery_pin_sms?.delivered) {
        toast.success(language === "en"
          ? `Delivery PIN sent to ${shopOrder.delivery_pin_sms.phone}`
          : `Code de livraison envoyé au ${shopOrder.delivery_pin_sms.phone}`,
          { duration: 5000 });
      } else if (shopOrder?.delivery_pin) {
        toast(language === "en"
          ? "Delivery PIN is on your order page"
          : "Le code de livraison est sur votre page de commande",
          { duration: 5000 });
      }
      if (martOrder) navigate(path("order", { id: martOrder.id }));
      else if (shopOrder) navigate(`/shop/order/${shopOrder.id}`);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      // "Coming soon" from allocation engine — detail is an object with gaps
      if (detail && typeof detail === "object" && detail.code === "not_available_in_area") {
        const names = (detail.gaps || []).map(g => g.name).filter(Boolean).join(", ");
        toast.error(`${detail.message}${names ? ` (${names})` : ""}`, { duration: 6000 });
      } else {
        toast.error(typeof detail === "string" ? detail : "Order failed");
      }
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
                  <div className="text-xs text-muted-foreground">{a.formatted_address || `${a.line1}${a.line2 ? `, ${a.line2}` : ""}${a.city ? `, ${a.city}` : ""}`}</div>
                  {a.latitude != null && a.longitude != null && (
                    <div className="text-[10px] font-mono text-muted-foreground/70 mt-0.5" data-testid={`checkout-address-pin-${a.id}`}>
                      📍 {Number(a.latitude).toFixed(5)}, {Number(a.longitude).toFixed(5)}
                    </div>
                  )}
                  {a.instructions && <div className="text-[11px] text-muted-foreground mt-0.5">📝 {a.instructions}</div>}
                </div>
              </label>
            ))}
            <button data-testid="checkout-add-address-btn" onClick={openPicker}
                    className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 mt-1">
              <PlusCircle size={16} /> {language === "en" ? "Add new address" : "Ajouter une adresse"}
            </button>
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
            {items.map((it) => {
              const isShop = it.module === "shop";
              const label = isShop ? (it.title || it.product?.title) : it.product?.name;
              const curr = it.currency || it.product?.currency || country.currency;
              return (
                <div key={it.id} className="flex justify-between">
                  <span className="truncate pr-2">
                    <span className="text-[9px] uppercase tracking-widest font-semibold px-1 py-0.5 rounded mr-1"
                          style={{
                            background: isShop ? "rgba(251,191,36,.15)" : "rgba(119,188,31,.15)",
                            color: isShop ? "#F59E0B" : "#77BC1F",
                          }}>{isShop ? "SHOP" : "MART"}</span>
                    {it.quantity} × {label}
                  </span>
                  <span>{formatMoney(it.line_total, curr, country.currency_symbol)}</span>
                </div>
              );
            })}
          </div>
          <div className="h-px bg-border" />
          {hasMart && (
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">MART subtotal</span><span>{formatMoney(martSubtotal, country.currency, country.currency_symbol)}</span></div>
          )}
          {hasShop && (
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">SHOP subtotal</span><span>{formatMoney(shopSubtotal, country.currency, country.currency_symbol)}</span></div>
          )}
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t(uiLocale, "cart.subtotal")}</span><span>{formatMoney(subtotal, country.currency, country.currency_symbol)}</span></div>
          {hasMart && (
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">{language === "en" ? "Delivery (MART)" : "Livraison (MART)"}</span><span>{deliveryFee === 0 ? "FREE" : formatMoney(deliveryFee, country.currency, country.currency_symbol)}</span></div>
          )}
          {hasShop && (
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">{language === "en" ? "Shipping (SHOP)" : "Expédition (SHOP)"}</span><span className="text-[11px] text-muted-foreground">{language === "en" ? "By seller" : "Par vendeur"}</span></div>
          )}
          <div className="h-px bg-border" />
          <div className="flex justify-between font-bold"><span>{language === "en" ? "Total" : "Total"}</span><span>{formatMoney(total, country.currency, country.currency_symbol)}</span></div>
          {!minOrderOk && (<div data-testid="checkout-min-order-warning" className="text-[11px] p-2 rounded-lg bg-yellow-500/10 text-yellow-500">{language === "en" ? `Add ${formatMoney(shortfall, country.currency, country.currency_symbol)} more to reach the ${formatMoney(minOrder, country.currency, country.currency_symbol)} minimum` : `Ajoutez ${formatMoney(shortfall, country.currency, country.currency_symbol)} pour atteindre le minimum de ${formatMoney(minOrder, country.currency, country.currency_symbol)}`}</div>)}
          <Button data-testid="checkout-place-order-btn" onClick={placeOrder} disabled={busy || !minOrderOk} className="w-full h-12 baked-btn font-semibold" style={{ backgroundColor: theme.accent, color: theme.text_on }}>
            {busy ? (language === "en" ? "Placing…" : "En cours…") : (language === "en" ? "Place order" : "Passer la commande")}
          </Button>
        </div>
      </aside>
    </div>
  );
};
