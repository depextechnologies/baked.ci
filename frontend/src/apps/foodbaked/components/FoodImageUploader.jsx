/**
 * FoodImageUploader — reusable image upload widget for every FOODbakēd
 * asset (restaurant logo/cover/gallery, category & cuisine icons, menu-item
 * images, promo banners).
 *
 * Behaviour:
 *   • Drop / click to pick a file (png, jpg, webp, gif, svg — max 8 MB).
 *   • Client-side pre-flight: type + size check + on-canvas downscale for
 *     large photos (>1600px longest side → 1600px, JPEG q=0.85).
 *   • POST to /api/admin/food/uploads with ?kind=<kind>. Returns
 *     { file_url, size, content_type }.
 *   • Renders live preview, "Remplacer" / Replace and "Supprimer" / Delete
 *     controls, and passes the file_url back via onChange(url|null).
 *
 * i18n: labels are French-first / English-second in the same string, so the
 * component works standalone without pulling the i18n bundle in.
 *
 * Usage:
 *   <FoodImageUploader value={form.image} onChange={v => setForm({...form, image: v})} kind="restaurant_cover" />
 */
import React, { useCallback, useRef, useState } from "react";
import { Upload, Image as ImageIcon, X, RefreshCw, Loader2 } from "lucide-react";
import { adminApi } from "../../../contexts/AdminContext";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/svg+xml"];
const API_BASE = process.env.REACT_APP_BACKEND_URL || "";

const resolveUrl = (u) => {
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("data:")) return u;
  return `${API_BASE}${u.startsWith("/") ? u : `/${u}`}`;
};

// Downscale over-sized raster images on the client before upload.
async function optimize(file) {
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;
  return new Promise((resolve) => {
    const img = new window.Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        const max = 1600;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        if (scale === 1 && file.size < 1_200_000) { resolve(file); return; }
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        c.toBlob((b) => {
          if (!b) { resolve(file); return; }
          const out = new File([b], (file.name || "image").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
          resolve(out.size < file.size ? out : file);
        }, "image/jpeg", 0.85);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

export const FoodImageUploader = ({
  value,
  onChange,
  kind = "misc",
  label = "Image",
  className = "",
  aspect = "aspect-video",
  testId = "food-image-uploader",
}) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const upload = useCallback(async (file) => {
    setErr("");
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setErr("Format non supporté · Unsupported format (png · jpg · webp · gif · svg)");
      return;
    }
    if (file.size > MAX_BYTES) {
      setErr("Fichier trop volumineux · File too large (max 8 MB)");
      return;
    }
    setBusy(true);
    try {
      const optimised = await optimize(file);
      const fd = new FormData();
      fd.append("file", optimised);
      const { data } = await adminApi.post(`/admin/food/uploads?kind=${encodeURIComponent(kind)}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange?.(data.file_url);
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || "Échec du téléversement · Upload failed");
    } finally {
      setBusy(false);
    }
  }, [kind, onChange]);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (f) upload(f);
    e.target.value = "";
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) upload(f);
  };

  const clear = () => onChange?.(null);

  const preview = resolveUrl(value);

  return (
    <div className={`space-y-2 ${className}`} data-testid={testId}>
      {label && <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative ${aspect} w-full rounded-xl border-2 border-dashed overflow-hidden bg-secondary/40 transition-colors ${
          dragOver ? "border-primary bg-primary/10" : "border-border"
        }`}
      >
        {preview ? (
          <>
            <img
              src={preview}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              data-testid={`${testId}-preview`}
            />
            <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 hover:opacity-100">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                data-testid={`${testId}-replace`}
                className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-white text-black text-xs font-semibold"
              >
                <RefreshCw size={12} /> Remplacer · Replace
              </button>
              <button
                type="button"
                onClick={clear}
                data-testid={`${testId}-remove`}
                className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-red-500 text-white text-xs font-semibold"
              >
                <X size={12} /> Supprimer · Delete
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            data-testid={`${testId}-pick`}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
          >
            {busy ? <Loader2 className="animate-spin" size={22} /> : <Upload size={22} />}
            <div className="text-xs font-semibold">Déposer / Sélectionner · Drop / Choose</div>
            <div className="text-[10px] flex items-center gap-1"><ImageIcon size={10} /> PNG · JPG · WEBP · SVG · ≤ 8 MB</div>
          </button>
        )}
        {busy && preview && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="animate-spin text-white" size={22} />
          </div>
        )}
      </div>
      {err && <div className="text-xs text-red-500" data-testid={`${testId}-error`}>{err}</div>}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        onChange={onFile}
        className="hidden"
        data-testid={`${testId}-input`}
      />
    </div>
  );
};

export default FoodImageUploader;
