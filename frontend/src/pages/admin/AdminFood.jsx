/**
 * FOODbakēd admin workspaces — full CRUD (Feb 2026).
 *
 * Three self-contained pages mounted under /admin/modules/food:
 *   • AdminFoodRestaurants  → /admin/modules/food/restaurants
 *   • AdminFoodCategories   → /admin/modules/food/categories
 *   • AdminFoodCuisines     → /admin/modules/food/cuisines
 *
 * Every screen supports Add · Edit · Delete + image upload via the reusable
 * <FoodImageUploader/> component, so restaurant partners never have to
 * paste external URLs — all assets live in our object storage.
 *
 * Language: French-first · English-second (labels in the same line).
 */
import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Star, Eye, EyeOff, Award, Plus, Pencil, Trash2, Loader2, X, Utensils, Users, BarChart3 } from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";
import FoodImageUploader from "../../apps/foodbaked/components/FoodImageUploader";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "";
const resolveImg = (u) => (!u ? "" : u.startsWith("http") ? u : `${API_BASE}${u}`);
const errMsg = (e) => e?.response?.data?.detail || e?.message || "Erreur · Error";

const CUISINE_OPTIONS = [
  "burgers", "pizza", "chicken", "indian", "african", "chinese",
  "healthy", "desserts", "beverages", "bakery", "seafood", "fast_food",
  "italian", "continental",
];

// ---------------------------------------------------------------------------
// Shared modal shell
// ---------------------------------------------------------------------------

const Modal = ({ open, onClose, title, children, testId }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" data-testid={testId}>
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-card border border-border p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} data-testid={`${testId}-close`} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const Field = ({ label, children, hint }) => (
  <label className="block space-y-1">
    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
    {children}
    {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
  </label>
);

const Input = React.forwardRef(function Input(props, ref) {
  return <input ref={ref} {...props} className={`h-9 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm ${props.className || ""}`} />;
});

// ---------------------------------------------------------------------------
// Restaurants
// ---------------------------------------------------------------------------

const emptyRestaurant = () => ({
  name: "", slug: "", country: "CI", cuisines: [], rating: 4.5, review_count: 0,
  prep_time_min: 20, prep_time_max: 30, delivery_fee: 0, is_open: true,
  featured: false, sort_order: 10, image: "", status: "active",
});

const RestaurantForm = ({ initial, onSave, saving }) => {
  const [f, setF] = useState(initial || emptyRestaurant());
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const toggleCuisine = (c) => set("cuisines", f.cuisines.includes(c) ? f.cuisines.filter((x) => x !== c) : [...f.cuisines, c]);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f); }} className="space-y-4" data-testid="admin-food-restaurant-form">
      <FoodImageUploader
        value={f.image}
        onChange={(v) => set("image", v)}
        kind="restaurant_cover"
        label="Couverture · Cover image"
        testId="admin-food-restaurant-image"
      />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nom · Name">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} required data-testid="rest-form-name" />
        </Field>
        <Field label="Slug (URL)">
          <Input value={f.slug} onChange={(e) => set("slug", e.target.value)} placeholder="auto-généré · auto-generated" data-testid="rest-form-slug" />
        </Field>
        <Field label="Pays · Country">
          <select value={f.country} onChange={(e) => set("country", e.target.value)} className="h-9 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm" data-testid="rest-form-country">
            <option value="CI">Côte d'Ivoire · CI</option>
            <option value="IN">Inde · India · IN</option>
            <option value="LR">Libéria · Liberia · LR</option>
          </select>
        </Field>
        <Field label="Statut · Status">
          <select value={f.status} onChange={(e) => set("status", e.target.value)} className="h-9 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm" data-testid="rest-form-status">
            <option value="active">Actif · Active</option>
            <option value="paused">En pause · Paused</option>
            <option value="draft">Brouillon · Draft</option>
          </select>
        </Field>
        <Field label="Note · Rating (0-5)">
          <Input type="number" step="0.1" min="0" max="5" value={f.rating} onChange={(e) => set("rating", parseFloat(e.target.value || 0))} data-testid="rest-form-rating" />
        </Field>
        <Field label="Avis · Reviews">
          <Input type="number" min="0" value={f.review_count} onChange={(e) => set("review_count", parseInt(e.target.value || 0, 10))} data-testid="rest-form-reviews" />
        </Field>
        <Field label="Prépa min (min)">
          <Input type="number" min="1" value={f.prep_time_min} onChange={(e) => set("prep_time_min", parseInt(e.target.value || 0, 10))} data-testid="rest-form-pmin" />
        </Field>
        <Field label="Prépa max (min)">
          <Input type="number" min="1" value={f.prep_time_max} onChange={(e) => set("prep_time_max", parseInt(e.target.value || 0, 10))} data-testid="rest-form-pmax" />
        </Field>
        <Field label="Frais de livraison · Delivery fee">
          <Input type="number" min="0" value={f.delivery_fee} onChange={(e) => set("delivery_fee", parseInt(e.target.value || 0, 10))} data-testid="rest-form-delivery" />
        </Field>
        <Field label="Ordre d'affichage · Sort order">
          <Input type="number" value={f.sort_order} onChange={(e) => set("sort_order", parseInt(e.target.value || 0, 10))} data-testid="rest-form-sort" />
        </Field>
      </div>

      <Field label="Cuisines · Cuisine tags">
        <div className="flex flex-wrap gap-2" data-testid="rest-form-cuisines">
          {CUISINE_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => toggleCuisine(c)}
              data-testid={`rest-form-cuisine-${c}`}
              className={`h-7 px-3 rounded-full text-[11px] font-semibold border transition-colors ${
                f.cuisines.includes(c) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </Field>

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.is_open} onChange={(e) => set("is_open", e.target.checked)} data-testid="rest-form-isopen" />
          Ouvert · Open now
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.featured} onChange={(e) => set("featured", e.target.checked)} data-testid="rest-form-featured" />
          Mis en avant · Featured
        </label>
      </div>

      <button
        type="submit"
        disabled={saving}
        data-testid="rest-form-save"
        className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        Enregistrer · Save
      </button>
    </form>
  );
};

export const AdminFoodRestaurants = () => {
  const [rows, setRows] = useState([]);
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null); // row | 'new' | null
  const [managingPartners, setManagingPartners] = useState(null); // restaurant | null
  const [saving, setSaving] = useState(false);
  const [highlightRid, setHighlightRid] = useState(null);

  // Honour `?rid=` deep-link (coming from "View restaurant" after approval)
  // and auto-clear the country filter so the row is guaranteed to appear.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rid = new URLSearchParams(window.location.search).get("rid");
    if (rid) {
      setHighlightRid(rid);
      setCountry(""); // show all countries so the newly-approved row surfaces
      setTimeout(() => {
        const el = document.querySelector(`[data-testid="admin-food-restaurant-row-${rid}"]`);
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 400);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { data } = await adminApi.get(`/admin/food/restaurants${country ? `?country=${country}` : ""}`);
      setRows(data);
    } catch (e) {
      setErr(errMsg(e));
    } finally { setLoading(false); }
  }, [country]);

  useEffect(() => { load(); }, [load]);

  const patch = async (rid, fields) => {
    try { await adminApi.patch(`/admin/food/restaurants/${rid}`, fields); await load(); }
    catch (e) { setErr(errMsg(e)); }
  };

  const save = async (payload) => {
    setSaving(true);
    try {
      if (editing === "new") {
        await adminApi.post("/admin/food/restaurants", payload);
      } else {
        const { country: _c, ...rest } = payload;
        void _c;
        await adminApi.patch(`/admin/food/restaurants/${editing.id}`, { ...rest, country: payload.country });
      }
      setEditing(null);
      await load();
    } catch (e) {
      setErr(errMsg(e));
    } finally { setSaving(false); }
  };

  const remove = async (row) => {
    if (!window.confirm(`Supprimer / Delete "${row.name}" ?`)) return;
    try { await adminApi.delete(`/admin/food/restaurants/${row.id}`); await load(); }
    catch (e) { setErr(errMsg(e)); }
  };

  return (
    <div className="space-y-4" data-testid="admin-food-restaurants">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Restaurants FOODbakēd · Restaurants</h1>
          <p className="text-xs text-muted-foreground">Gérer · Manage · Ajouter · Add · Modifier · Edit · Supprimer · Delete</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            data-testid="admin-food-country-filter"
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm"
          >
            <option value="">Tous les pays · All countries</option>
            <option value="CI">Côte d'Ivoire (CI)</option>
            <option value="IN">India (IN)</option>
            <option value="LR">Liberia (LR)</option>
          </select>
          <button
            onClick={() => setEditing("new")}
            data-testid="admin-food-restaurant-add"
            className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1"
          >
            <Plus size={14} /> Ajouter · Add
          </button>
        </div>
      </div>
      {err && <div className="text-xs text-red-500" data-testid="admin-food-error">{err}</div>}

      {loading ? (
        <div className="text-sm text-muted-foreground">Chargement · Loading…</div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2">Restaurant</th>
                <th className="px-3 py-2">Pays</th>
                <th className="px-3 py-2">Cuisines</th>
                <th className="px-3 py-2 text-right">Note</th>
                <th className="px-3 py-2 text-right">Prépa</th>
                <th className="px-3 py-2 text-right">Livraison</th>
                <th className="px-3 py-2 text-center">Mis en avant</th>
                <th className="px-3 py-2 text-center">Ouvert</th>
                <th className="px-3 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}
                    className={`border-t border-border ${highlightRid === r.id ? "bg-green-500/10 ring-1 ring-green-500/40" : ""}`}
                    data-testid={`admin-food-restaurant-row-${r.id}`}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <img src={resolveImg(r.image)} alt="" className="w-8 h-8 rounded-lg object-cover bg-muted" />
                      <div>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-[10px] text-muted-foreground">/{r.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">{r.country}</td>
                  <td className="px-3 py-2 text-muted-foreground">{(r.cuisines || []).join(", ")}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex items-center gap-1"><Star size={12} className="fill-amber-400 text-amber-400" />{Number(r.rating).toFixed(1)}</span>
                    <span className="ml-1 text-[10px] text-muted-foreground">({r.review_count})</span>
                  </td>
                  <td className="px-3 py-2 text-right">{r.prep_time_min}–{r.prep_time_max}m</td>
                  <td className="px-3 py-2 text-right">{r.delivery_fee || "Free"}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => patch(r.id, { featured: !r.featured })}
                      data-testid={`admin-food-toggle-featured-${r.id}`}
                      className={`inline-flex items-center gap-1 h-7 px-2 rounded-full text-[10px] font-semibold ${
                        r.featured ? "bg-amber-500/20 text-amber-500" : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Award size={11} /> {r.featured ? "Featured" : "Off"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => patch(r.id, { is_open: !r.is_open })}
                      data-testid={`admin-food-toggle-open-${r.id}`}
                      className={`inline-flex items-center gap-1 h-7 px-2 rounded-full text-[10px] font-semibold ${
                        r.is_open ? "bg-green-500/20 text-green-500" : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {r.is_open ? <><Eye size={11} /> Open</> : <><EyeOff size={11} /> Closed</>}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="inline-flex gap-1">
                      <Link
                        to={`/admin/modules/food/restaurants/${r.id}/menu`}
                        data-testid={`admin-food-restaurant-menu-${r.id}`}
                        title="Gérer le menu · Manage menu"
                        className="w-7 h-7 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center justify-center"
                      ><Utensils size={12} /></Link>
                      <Link
                        to={`/admin/modules/food/restaurants/${r.id}/analytics`}
                        data-testid={`admin-food-restaurant-analytics-${r.id}`}
                        title="Analytics"
                        className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 inline-flex items-center justify-center"
                      ><BarChart3 size={12} /></Link>
                      <button onClick={() => setManagingPartners(r)} data-testid={`admin-food-restaurant-partners-${r.id}`} title="Comptes partenaires · Partner accounts" className="w-7 h-7 rounded-lg bg-secondary hover:bg-secondary/70 inline-flex items-center justify-center"><Users size={12} /></button>
                      <button onClick={() => setEditing(r)} data-testid={`admin-food-restaurant-edit-${r.id}`} className="w-7 h-7 rounded-lg bg-secondary hover:bg-secondary/70 inline-flex items-center justify-center"><Pencil size={12} /></button>
                      <button onClick={() => remove(r)} data-testid={`admin-food-restaurant-delete-${r.id}`} className="w-7 h-7 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 inline-flex items-center justify-center"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">Aucun restaurant · No restaurants yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Nouveau restaurant · New restaurant" : `Modifier · Edit — ${editing?.name || ""}`}
        testId="admin-food-restaurant-modal"
      >
        {editing && (
          <RestaurantForm
            initial={editing === "new" ? emptyRestaurant() : editing}
            onSave={save}
            saving={saving}
          />
        )}
      </Modal>

      <PartnersModal
        restaurant={managingPartners}
        onClose={() => setManagingPartners(null)}
      />
    </div>
  );
};


// ---------------------------------------------------------------------------
// Partner accounts modal — Restaurant Partner Portal management
// ---------------------------------------------------------------------------

const PartnersModal = ({ restaurant, onClose }) => {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "" });

  const load = useCallback(async () => {
    if (!restaurant) return;
    setLoading(true); setErr("");
    try {
      const { data } = await adminApi.get(`/admin/food/restaurants/${restaurant.id}/partners`);
      setPartners(data);
    } catch (e) { setErr(errMsg(e)); }
    finally { setLoading(false); }
  }, [restaurant]);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      await adminApi.post(`/admin/food/restaurants/${restaurant.id}/partners`, form);
      setForm({ email: "", password: "", name: "" });
      setCreating(false);
      await load();
    } catch (e) { setErr(errMsg(e)); }
  };

  const toggleActive = async (p) => {
    try { await adminApi.patch(`/admin/food/partners/${p.id}`, { is_active: !p.is_active }); await load(); }
    catch (e) { setErr(errMsg(e)); }
  };
  const resetPassword = async (p) => {
    const pw = window.prompt("Nouveau mot de passe · New password (min 8 chars)");
    if (!pw || pw.length < 8) return;
    try { await adminApi.patch(`/admin/food/partners/${p.id}`, { password: pw }); alert("Mot de passe changé · Password updated"); }
    catch (e) { setErr(errMsg(e)); }
  };
  const remove = async (p) => {
    if (!window.confirm(`Supprimer / Delete le compte "${p.email}" ?`)) return;
    try { await adminApi.delete(`/admin/food/partners/${p.id}`); await load(); }
    catch (e) { setErr(errMsg(e)); }
  };

  return (
    <Modal open={!!restaurant} onClose={onClose} title={`Comptes partenaires · Partner accounts — ${restaurant?.name || ""}`} testId="admin-food-partners-modal">
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Créez un ou plusieurs comptes pour permettre au restaurant de gérer son menu depuis <code>/partner/food/login</code>. · Create accounts so the restaurant can manage its own menu.
        </p>
        {err && <div className="text-xs text-red-500">{err}</div>}
        {loading ? <div className="text-xs text-muted-foreground">Chargement…</div> : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-[10px] uppercase tracking-wider">
                <tr><th className="px-3 py-2 text-left">Email · Nom</th><th className="px-3 py-2 text-center">Actif</th><th className="px-3 py-2 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {partners.map((p) => (
                  <tr key={p.id} className="border-t border-border" data-testid={`admin-food-partner-row-${p.id}`}>
                    <td className="px-3 py-2">
                      <div className="text-xs font-medium">{p.email}</div>
                      <div className="text-[10px] text-muted-foreground">{p.name || "—"}</div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => toggleActive(p)} data-testid={`admin-food-partner-toggle-${p.id}`}
                              className={`h-6 px-2 rounded-full text-[10px] font-semibold ${p.is_active ? "bg-green-500/20 text-green-500" : "bg-secondary text-muted-foreground"}`}>
                        {p.is_active ? "Actif" : "Off"}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <button onClick={() => resetPassword(p)} title="Reset password" data-testid={`admin-food-partner-pw-${p.id}`} className="text-[10px] px-2 h-6 rounded bg-secondary hover:bg-secondary/70">🔑</button>
                        <button onClick={() => remove(p)} data-testid={`admin-food-partner-delete-${p.id}`} className="w-6 h-6 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 inline-flex items-center justify-center"><Trash2 size={10} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {partners.length === 0 && (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-xs text-muted-foreground">Aucun compte partenaire · No partner accounts.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {creating ? (
          <form onSubmit={create} className="rounded-lg border border-border p-3 space-y-2" data-testid="admin-food-partner-create-form">
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs space-y-1">
                <span className="text-[10px] uppercase text-muted-foreground">Email</span>
                <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-8 w-full rounded-lg border border-border bg-secondary/40 px-2 text-xs" data-testid="admin-food-partner-email" />
              </label>
              <label className="block text-xs space-y-1">
                <span className="text-[10px] uppercase text-muted-foreground">Nom · Name</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8 w-full rounded-lg border border-border bg-secondary/40 px-2 text-xs" data-testid="admin-food-partner-name" />
              </label>
              <label className="block text-xs space-y-1 col-span-2">
                <span className="text-[10px] uppercase text-muted-foreground">Mot de passe (min 8) · Password</span>
                <input type="text" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="h-8 w-full rounded-lg border border-border bg-secondary/40 px-2 text-xs" data-testid="admin-food-partner-password" />
              </label>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setCreating(false)} className="h-8 px-3 rounded-lg bg-secondary text-xs">Annuler</button>
              <button type="submit" className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold" data-testid="admin-food-partner-create-submit">Créer · Create</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setCreating(true)} data-testid="admin-food-partner-add" className="w-full h-9 rounded-lg bg-primary/10 text-primary text-xs font-semibold inline-flex items-center justify-center gap-1">
            <Plus size={12} /> Ajouter un compte · Add account
          </button>
        )}
      </div>
    </Modal>
  );
};


// ---------------------------------------------------------------------------
// Category / Cuisine CRUD — shared grid + form (same schema)
// ---------------------------------------------------------------------------

const emptyCatOrCuisine = () => ({ code: "", name_fr: "", name_en: "", image: "", sort_order: 10, is_active: true });

const CatCuisineForm = ({ initial, isNew, onSave, saving, kind }) => {
  const [f, setF] = useState(initial || emptyCatOrCuisine());
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f); }} className="space-y-4" data-testid={`admin-food-${kind}-form`}>
      <FoodImageUploader
        value={f.image}
        onChange={(v) => set("image", v)}
        kind={kind}
        label={kind === "category" ? "Icône catégorie · Category icon" : "Image cuisine · Cuisine image"}
        aspect="aspect-square"
        testId={`admin-food-${kind}-image`}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Code (unique)" hint="Ex: burgers · minuscules & tirets · lowercase & hyphens">
          <Input
            value={f.code}
            onChange={(e) => set("code", e.target.value)}
            disabled={!isNew}
            required
            data-testid={`${kind}-form-code`}
          />
        </Field>
        <Field label="Ordre · Sort order">
          <Input type="number" value={f.sort_order} onChange={(e) => set("sort_order", parseInt(e.target.value || 0, 10))} data-testid={`${kind}-form-sort`} />
        </Field>
        <Field label="Nom (FR) · Name (FR)">
          <Input value={f.name_fr} onChange={(e) => set("name_fr", e.target.value)} required data-testid={`${kind}-form-name-fr`} />
        </Field>
        <Field label="Nom (EN) · Name (EN)">
          <Input value={f.name_en} onChange={(e) => set("name_en", e.target.value)} required data-testid={`${kind}-form-name-en`} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.is_active} onChange={(e) => set("is_active", e.target.checked)} data-testid={`${kind}-form-active`} />
        Actif · Active
      </label>
      <button
        type="submit"
        disabled={saving}
        data-testid={`${kind}-form-save`}
        className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        Enregistrer · Save
      </button>
    </form>
  );
};

const CatCuisineWorkspace = ({ title, endpoint, kind, testId }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try { const { data } = await adminApi.get(endpoint); setRows(data); }
    catch (e) { setErr(errMsg(e)); }
    finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => { load(); }, [load]);

  const save = async (payload) => {
    setSaving(true);
    try {
      if (editing === "new") {
        await adminApi.post(endpoint, payload);
      } else {
        const { code, ...rest } = payload;
        void code;
        await adminApi.patch(`${endpoint}/${editing.code}`, rest);
      }
      setEditing(null);
      await load();
    } catch (e) { setErr(errMsg(e)); }
    finally { setSaving(false); }
  };

  const remove = async (row) => {
    if (!window.confirm(`Supprimer / Delete "${row.name_fr}" ?`)) return;
    try { await adminApi.delete(`${endpoint}/${row.code}`); await load(); }
    catch (e) { setErr(errMsg(e)); }
  };

  const toggleActive = async (row) => {
    try { await adminApi.patch(`${endpoint}/${row.code}`, { is_active: !row.is_active }); await load(); }
    catch (e) { setErr(errMsg(e)); }
  };

  return (
    <div className="space-y-4" data-testid={testId}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-xs text-muted-foreground">French-first · English-second · Ordre d'affichage contrôlé côté admin</p>
        </div>
        <button
          onClick={() => setEditing("new")}
          data-testid={`${testId}-add`}
          className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1"
        >
          <Plus size={14} /> Ajouter · Add
        </button>
      </div>
      {err && <div className="text-xs text-red-500" data-testid={`${testId}-error`}>{err}</div>}

      {loading ? (
        <div className="text-sm text-muted-foreground">Chargement · Loading…</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <div key={c.code} className="rounded-xl border border-border bg-card p-3 flex items-center gap-3" data-testid={`${testId}-row-${c.code}`}>
              <img src={resolveImg(c.image)} alt="" className="w-14 h-14 rounded-lg object-cover bg-muted" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{c.name_fr}</div>
                <div className="text-[11px] text-muted-foreground truncate">EN: {c.name_en}</div>
                <div className="text-[10px] text-muted-foreground">code · {c.code} · ordre {c.sort_order}</div>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => toggleActive(c)}
                  data-testid={`${testId}-toggle-${c.code}`}
                  className={`h-6 px-2 rounded-full text-[10px] font-semibold ${c.is_active ? "bg-green-500/20 text-green-500" : "bg-secondary text-muted-foreground"}`}
                >
                  {c.is_active ? "Actif" : "Off"}
                </button>
                <div className="flex gap-1">
                  <button onClick={() => setEditing(c)} data-testid={`${testId}-edit-${c.code}`} className="w-7 h-7 rounded-lg bg-secondary hover:bg-secondary/70 inline-flex items-center justify-center"><Pencil size={12} /></button>
                  <button onClick={() => remove(c)} data-testid={`${testId}-delete-${c.code}`} className="w-7 h-7 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 inline-flex items-center justify-center"><Trash2 size={12} /></button>
                </div>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="col-span-full text-center py-10 text-sm text-muted-foreground">Aucun élément · Nothing yet.</div>
          )}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Nouveau · New" : `Modifier · Edit — ${editing?.name_fr || ""}`}
        testId={`${testId}-modal`}
      >
        {editing && (
          <CatCuisineForm
            initial={editing === "new" ? emptyCatOrCuisine() : editing}
            isNew={editing === "new"}
            onSave={save}
            saving={saving}
            kind={kind}
          />
        )}
      </Modal>
    </div>
  );
};

export const AdminFoodCategories = () => (
  <CatCuisineWorkspace
    title="Catégories FOOD · Categories"
    endpoint="/admin/food/categories"
    kind="category"
    testId="admin-food-categories"
  />
);

export const AdminFoodCuisines = () => (
  <CatCuisineWorkspace
    title="Cuisines FOOD · Cuisines"
    endpoint="/admin/food/cuisines"
    kind="cuisine"
    testId="admin-food-cuisines"
  />
);
