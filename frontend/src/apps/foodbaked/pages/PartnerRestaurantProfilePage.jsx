/**
 * PartnerRestaurantProfilePage — partner-managed restaurant identity,
 * gallery, and menu documents.
 * Route: /partner/food/profile.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { partnerApi, useFoodPartner } from "../../../contexts/FoodPartnerContext";
import FoodImageUploader from "../components/FoodImageUploader";
import { Loader2, Save, Trash2, Star, Image as ImgIcon, AlertTriangle, FileText, Upload, ExternalLink } from "lucide-react";

const GREEN = "#00A651";
const HIGHLIGHTS = [
  ["outdoor_seating","Terrasse extérieure · Outdoor seating"], ["family_friendly","Familles · Family friendly"],
  ["air_conditioned","Climatisé · A/C"], ["wifi","Wi-Fi"], ["parking","Parking"],
  ["wheelchair_accessible","Accessible PMR · Wheelchair"], ["live_music","Musique live"],
  ["private_dining","Salle privée"], ["rooftop","Rooftop"], ["bar_available","Bar"],
  ["halal","Halal"], ["vegetarian","Végétarien"], ["vegan","Végan"],
  ["delivery","Livraison"], ["takeaway","À emporter"], ["table_reservation","Réservation"],
];
const DAY_KEYS = ["mon","tue","wed","thu","fri","sat","sun"];
const DAY_FR   = { mon:"Lundi",tue:"Mardi",wed:"Mercredi",thu:"Jeudi",fri:"Vendredi",sat:"Samedi",sun:"Dimanche" };

const Field = ({ label, children }) => (
  <label className="block space-y-1"><div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>{children}</label>
);

export const PartnerRestaurantProfilePage = () => {
  const { restaurant, refresh } = useFoodPartner() || {};
  const [profile, setProfile] = useState(null);
  const [photos, setPhotos]   = useState([]);
  const [menuDocs, setMenuDocs] = useState([]);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState("");
  const [uploadingCat, setUploadingCat] = useState("food");
  const [docBusy, setDocBusy] = useState(false);
  const [newDocLabel, setNewDocLabel] = useState("");
  const docInputRef = useRef(null);

  const load = useCallback(async () => {
    if (!restaurant?.id) return;
    try {
      // The microsite endpoint already returns the shape we need.
      const { data } = await partnerApi.get(`/food/restaurants/${restaurant.id}/microsite`);
      setProfile(data.restaurant);
      const p = await partnerApi.get(`/food/manage/${restaurant.id}/photos`);
      setPhotos(p.data.photos || []);
      const md = await partnerApi.get(`/food/manage/${restaurant.id}/menu-docs`);
      setMenuDocs(md.data.menu_docs || []);
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
  }, [restaurant?.id]);
  useEffect(() => { load(); }, [load]);

  const patch = async (fields) => {
    setSaving(true); setErr("");
    try {
      await partnerApi.patch(`/food/manage/${restaurant.id}/profile`, fields);
      await load(); await refresh?.();
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
    finally { setSaving(false); }
  };

  const addPhoto = async (url) => {
    if (!url) return;
    try {
      const { data } = await partnerApi.post(`/food/manage/${restaurant.id}/photos`, { url, category: uploadingCat });
      setPhotos((s) => [...s, data]);
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
  };

  const setCover = async (id) => {
    try {
      await partnerApi.patch(`/food/manage/${restaurant.id}/photos/${id}`, { is_cover: true });
      await load();
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
  };

  const del = async (id) => {
    if (!window.confirm("Supprimer cette photo ?")) return;
    try {
      await partnerApi.delete(`/food/manage/${restaurant.id}/photos/${id}`);
      setPhotos((s) => s.filter((p) => p.id !== id));
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
  };

  // -----------------------------------------------------------------
  // Menu documents (PDF or image). Upload → store URL → POST record.
  // -----------------------------------------------------------------

  const uploadDoc = async (file) => {
    if (!file) return;
    setDocBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data: up } = await partnerApi.post(`/food/manage/${restaurant.id}/uploads/doc`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const labelFr = (newDocLabel || file.name || "Menu").slice(0, 120);
      const { data: doc } = await partnerApi.post(`/food/manage/${restaurant.id}/menu-docs`, {
        label_fr: labelFr,
        label_en: labelFr,
        url: up.file_url,
      });
      setMenuDocs((s) => [...s, doc]);
      setNewDocLabel("");
      if (docInputRef.current) docInputRef.current.value = "";
    } catch (e) {
      setErr(e.response?.data?.detail || e.message);
    } finally { setDocBusy(false); }
  };

  const renameDoc = async (id, label_fr) => {
    if (!label_fr) return;
    try {
      const { data } = await partnerApi.patch(`/food/manage/${restaurant.id}/menu-docs/${id}`, { label_fr, label_en: label_fr });
      setMenuDocs((s) => s.map((d) => (d.id === id ? data : d)));
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
  };

  const delDoc = async (id) => {
    if (!window.confirm("Supprimer ce document ? · Delete this document?")) return;
    try {
      await partnerApi.delete(`/food/manage/${restaurant.id}/menu-docs/${id}`);
      setMenuDocs((s) => s.filter((d) => d.id !== id));
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
  };

  const toggleHL = (code) => {
    const cur = new Set(profile.highlights || []);
    if (cur.has(code)) cur.delete(code); else cur.add(code);
    patch({ highlights: Array.from(cur) });
  };

  if (!profile) return <div className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Chargement…</div>;

  const setHour = (k, i, side, value) => {
    const hours = { ...(profile.opening_hours || {}) };
    const day = [...(hours[k] || [])];
    day[i] = side === "start" ? [value, day[i][1]] : [day[i][0], value];
    hours[k] = day;
    patch({ opening_hours: hours });
  };
  const addHour = (k) => { const h = { ...(profile.opening_hours || {}) }; h[k] = [...(h[k] || []), ["12:00","22:00"]]; patch({ opening_hours: h }); };
  const closeDay = (k) => { const h = { ...(profile.opening_hours || {}) }; h[k] = []; patch({ opening_hours: h }); };

  return (
    <div className="space-y-6" data-testid="partner-restaurant-profile">
      <div>
        <h1 className="text-2xl font-bold">Profil restaurant <span className="text-muted-foreground text-lg font-medium">· Restaurant profile</span></h1>
        <p className="text-sm text-muted-foreground">Ces informations apparaissent sur votre page publique. · Shown on your public restaurant page.</p>
      </div>
      {err && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600 inline-flex items-center gap-1"><AlertTriangle size={12} /> {err}</div>}

      {/* Profile */}
      <div className="rounded-2xl border border-border bg-card p-4 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Field label="Description · About">
            <textarea defaultValue={profile.description || ""} rows={4} onBlur={(e) => e.target.value !== profile.description && patch({ description: e.target.value })}
                      className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"
                      data-testid="profile-description" />
          </Field>
        </div>
        <Field label="Gamme de prix · Price range">
          <select defaultValue={profile.price_range || "$$"} onChange={(e) => patch({ price_range: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm" data-testid="profile-price">
            {["$","$$","$$$","$$$$"].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field label="Adresse · Address">
          <input defaultValue={profile.address || ""} onBlur={(e) => e.target.value !== profile.address && patch({ address: e.target.value })}
                 className="h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm" data-testid="profile-address" />
        </Field>
        <Field label="Latitude">
          <input type="number" step="0.000001" defaultValue={profile.latitude || ""} onBlur={(e) => e.target.value && patch({ latitude: parseFloat(e.target.value) })}
                 className="h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm" data-testid="profile-lat" />
        </Field>
        <Field label="Longitude">
          <input type="number" step="0.000001" defaultValue={profile.longitude || ""} onBlur={(e) => e.target.value && patch({ longitude: parseFloat(e.target.value) })}
                 className="h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm" data-testid="profile-lng" />
        </Field>
        <Field label="Téléphone · Phone">
          <input defaultValue={profile.contact_phone || ""} onBlur={(e) => patch({ contact_phone: e.target.value })}
                 className="h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm" data-testid="profile-phone" />
        </Field>
        <Field label="Email">
          <input type="email" defaultValue={profile.contact_email || ""} onBlur={(e) => patch({ contact_email: e.target.value })}
                 className="h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm" data-testid="profile-email" />
        </Field>
      </div>

      {/* Highlights */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-sm font-semibold mb-2">Points forts · Highlights</div>
        <div className="flex flex-wrap gap-2">
          {HIGHLIGHTS.map(([code, label]) => {
            const on = (profile.highlights || []).includes(code);
            return (
              <button key={code} onClick={() => toggleHL(code)} disabled={saving}
                      className={`h-8 px-3 rounded-full text-[11px] font-semibold border ${on ? "text-white border-transparent" : "border-border text-muted-foreground hover:text-foreground"}`}
                      style={on ? { backgroundColor: GREEN } : undefined}
                      data-testid={`profile-highlight-${code}`}>{label}</button>
            );
          })}
        </div>
      </div>

      {/* Opening hours */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-sm font-semibold mb-2">Horaires · Opening hours</div>
        {DAY_KEYS.map((k) => {
          const ranges = profile.opening_hours?.[k] || [];
          return (
            <div key={k} className="flex flex-wrap items-center gap-2 py-1" data-testid={`profile-day-${k}`}>
              <div className="w-28 text-sm font-medium">{DAY_FR[k]}</div>
              {ranges.length === 0 ? (
                <>
                  <span className="text-xs text-muted-foreground flex-1">Fermé · Closed</span>
                  <button onClick={() => addHour(k)} className="h-8 px-3 rounded-lg text-xs bg-secondary hover:bg-secondary/80">Ouvrir · Open</button>
                </>
              ) : (
                <>
                  {ranges.map((r, i) => (
                    <div key={i} className="inline-flex items-center gap-1">
                      <input type="time" defaultValue={r[0]} onBlur={(e) => setHour(k, i, "start", e.target.value)} className="h-8 rounded border border-border bg-secondary/40 px-2 text-xs" />
                      <span className="text-xs">→</span>
                      <input type="time" defaultValue={r[1]} onBlur={(e) => setHour(k, i, "end", e.target.value)} className="h-8 rounded border border-border bg-secondary/40 px-2 text-xs" />
                    </div>
                  ))}
                  <button onClick={() => addHour(k)} className="h-7 px-2 rounded-lg text-[11px] bg-secondary hover:bg-secondary/80">+ Ajouter</button>
                  <button onClick={() => closeDay(k)} className="h-7 px-2 rounded-lg text-[11px] bg-red-500/10 text-red-500 ml-auto">Fermer</button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Gallery */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid="partner-gallery">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-sm font-semibold">Galerie · Gallery</div>
            <div className="text-xs text-muted-foreground">Uploader dans une catégorie — les images apparaissent sur votre page publique. · Upload into a category to feed the microsite.</div>
          </div>
          <select value={uploadingCat} onChange={(e) => setUploadingCat(e.target.value)}
                  className="h-9 rounded-lg border border-border bg-secondary/40 px-2 text-xs" data-testid="gallery-category-select">
            {["food","ambience","interior","exterior","menu"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="max-w-xs">
          <FoodImageUploader
            value=""
            onChange={addPhoto}
            kind={`gallery_${uploadingCat}`}
            label="Ajouter une photo · Add photo"
            testId="gallery-uploader"
          />
        </div>
        {photos.length === 0 ? (
          <div className="text-sm text-muted-foreground italic inline-flex items-center gap-1"><ImgIcon size={12} /> Aucune photo · No photos yet.</div>
        ) : (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            {photos.map((p) => (
              <div key={p.id} className="relative group rounded-xl overflow-hidden border border-border bg-secondary" data-testid={`gallery-photo-${p.id}`}>
                <img src={p.url} alt="" className="w-full aspect-square object-cover" />
                <div className="absolute inset-x-0 bottom-0 p-2 bg-black/60 text-white text-[10px] flex items-center gap-1">
                  <span className="uppercase tracking-wider">{p.category}</span>
                  {p.is_cover && <span className="ml-auto inline-flex items-center gap-1" style={{ color: GREEN }}><Star size={10} /> Cover</span>}
                </div>
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!p.is_cover && (
                    <button onClick={() => setCover(p.id)} className="w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90" data-testid={`gallery-cover-${p.id}`} title="Marquer comme couverture"><Star size={12} /></button>
                  )}
                  <button onClick={() => del(p.id)} className="w-7 h-7 rounded-full bg-red-500/80 text-white flex items-center justify-center hover:bg-red-500" data-testid={`gallery-delete-${p.id}`}><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Menu documents — PDFs or images shown on the customer Menu tab */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid="partner-menu-docs">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-sm font-semibold inline-flex items-center gap-2"><FileText size={14} /> Documents de menu · Menu documents</div>
            <div className="text-xs text-muted-foreground">Téléversez un PDF ou une image (carte été, brunch, bar…) — visible sur l'onglet Menu du restaurant. · Upload a PDF or image visible on the restaurant Menu tab.</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={newDocLabel} onChange={(e) => setNewDocLabel(e.target.value)}
                 placeholder="Libellé · Label (ex : Carte été)"
                 className="h-9 rounded-lg border border-border bg-secondary/40 px-3 text-xs w-64"
                 data-testid="menudoc-label-input" />
          <label className={`h-9 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer text-black ${docBusy ? "opacity-60 pointer-events-none" : ""}`}
                 style={{ backgroundColor: GREEN }} data-testid="menudoc-upload-btn">
            {docBusy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Téléverser · Upload
            <input ref={docInputRef} type="file" accept="application/pdf,image/*" className="hidden"
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(f); }}
                   data-testid="menudoc-file-input" />
          </label>
          <span className="text-[10px] text-muted-foreground">PDF ou image · 15 Mo max</span>
        </div>
        {menuDocs.length === 0 ? (
          <div className="text-sm text-muted-foreground italic inline-flex items-center gap-1"><FileText size={12} /> Aucun document pour l'instant · No documents yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {menuDocs.map((d) => (
              <div key={d.id} className="py-2 flex items-center gap-3" data-testid={`menudoc-${d.id}`}>
                <FileText size={14} className="text-muted-foreground shrink-0" />
                <input defaultValue={d.label_fr} onBlur={(e) => e.target.value !== d.label_fr && renameDoc(d.id, e.target.value)}
                       className="h-8 flex-1 min-w-0 rounded border border-border bg-secondary/40 px-2 text-xs"
                       data-testid={`menudoc-rename-${d.id}`} />
                <a href={d.url} target="_blank" rel="noreferrer"
                   className="h-8 px-3 rounded-lg text-[11px] bg-secondary hover:bg-secondary/80 inline-flex items-center gap-1"
                   data-testid={`menudoc-open-${d.id}`}>
                  <ExternalLink size={11} /> Ouvrir
                </a>
                <button onClick={() => delDoc(d.id)}
                        className="h-8 w-8 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500/20"
                        data-testid={`menudoc-delete-${d.id}`}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PartnerRestaurantProfilePage;
