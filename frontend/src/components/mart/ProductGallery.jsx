/**
 * ProductGallery — multi-image gallery with desktop side-by-side zoom lens
 * and mobile fullscreen swipe lightbox (Fixing_Prompt.docx v4, 2026-02-28).
 *
 * ── Data contract ─────────────────────────────────────────────────────────
 * Accepts `image` (primary/legacy) + `images` (list<string>) — falls back to
 * `[image]` when `images` is empty so pre-cascade products keep working.
 *
 * ── Desktop zoom ──────────────────────────────────────────────────────────
 * Follows the mouse and renders a side pane (~classic Amazon). Skipped on
 * screens < 1024px so touch users get the lightbox instead.
 */
import React, { useMemo, useRef, useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

const ZOOM_FACTOR = 2.3;

export const ProductGallery = ({ image, images = [], name = "" }) => {
  const gallery = useMemo(() => {
    const list = Array.isArray(images) && images.length > 0 ? images : [image].filter(Boolean);
    // De-dupe while preserving order (primary first).
    return Array.from(new Set(list));
  }, [image, images]);

  const [idx, setIdx] = useState(0);
  const [showZoom, setShowZoom] = useState(false);
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 });
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const imgRef = useRef(null);

  // Reset if the product changes and the previous idx no longer exists.
  useEffect(() => { if (idx >= gallery.length) setIdx(0); }, [gallery.length, idx]);

  const current = gallery[idx] || image;

  const handleMove = (e) => {
    const r = imgRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top)  / r.height;
    setPos({
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="product-gallery">
      {/* Main image + zoom pane */}
      <div className="relative">
        <div
          ref={imgRef}
          className="baked-card bg-card border border-border overflow-hidden aspect-square cursor-crosshair select-none"
          onMouseEnter={() => setShowZoom(true)}
          onMouseLeave={() => setShowZoom(false)}
          onMouseMove={handleMove}
          onClick={() => setLightboxOpen(true)}
          data-testid="product-gallery-main"
          role="button"
          tabIndex={0}
          aria-label={`Open ${name} image viewer`}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setLightboxOpen(true); }}
        >
          <img src={current} alt={name} className="w-full h-full object-cover pointer-events-none" />
          {/* Cursor spotlight — hint that hover-zoom is available (desktop only) */}
          {showZoom && (
            <div
              aria-hidden
              className="hidden lg:block absolute w-24 h-24 rounded-full pointer-events-none border-2 border-white/70 mix-blend-overlay"
              style={{
                left: `calc(${pos.x * 100}% - 48px)`,
                top:  `calc(${pos.y * 100}% - 48px)`,
                boxShadow: "0 0 0 9999px rgba(0,0,0,.15)",
              }}
            />
          )}
        </div>

        {/* Side-by-side zoom pane — desktop ≥ 1024px only */}
        {showZoom && (
          <div
            className="hidden lg:block absolute top-0 left-full ml-4 w-[440px] h-full rounded-2xl border border-border bg-card overflow-hidden pointer-events-none z-30"
            data-testid="product-gallery-zoom-pane"
            aria-hidden
          >
            <div
              className="w-full h-full"
              style={{
                backgroundImage:    `url(${current})`,
                backgroundRepeat:   "no-repeat",
                backgroundSize:     `${ZOOM_FACTOR * 100}% ${ZOOM_FACTOR * 100}%`,
                backgroundPosition: `${pos.x * 100}% ${pos.y * 100}%`,
              }}
            />
          </div>
        )}
      </div>

      {/* Thumbnail strip — horizontal scroll when overflows */}
      {gallery.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" data-testid="product-gallery-thumbs">
          {gallery.map((src, i) => (
            <button
              key={src + i}
              onClick={() => setIdx(i)}
              data-testid={`product-gallery-thumb-${i}`}
              aria-label={`Show image ${i + 1}`}
              aria-current={i === idx}
              className="shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all"
              style={{
                borderColor: i === idx ? "var(--primary, #77BC1F)" : "hsl(var(--border))",
                opacity:     i === idx ? 1 : 0.75,
              }}
            >
              <img src={src} alt={`${name} view ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen lightbox — universal (mobile primary path, desktop click-through) */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex flex-col"
          onClick={() => setLightboxOpen(false)}
          data-testid="product-lightbox"
          role="dialog"
          aria-modal="true"
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightboxOpen(false); }}
            className="absolute top-4 right-4 z-10 w-11 h-11 rounded-full grid place-items-center bg-white/10 text-white"
            data-testid="product-lightbox-close"
            aria-label="Close viewer"
          >
            <X size={20} />
          </button>
          <div className="flex-1 flex items-center justify-center px-4 relative" onClick={(e) => e.stopPropagation()}>
            <img src={current} alt={name} className="max-w-full max-h-[85vh] object-contain" />
            {gallery.length > 1 && (
              <>
                <button
                  onClick={() => setIdx((idx - 1 + gallery.length) % gallery.length)}
                  className="absolute left-2 md:left-6 w-11 h-11 rounded-full grid place-items-center bg-white/10 text-white"
                  data-testid="product-lightbox-prev"
                  aria-label="Previous image"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setIdx((idx + 1) % gallery.length)}
                  className="absolute right-2 md:right-6 w-11 h-11 rounded-full grid place-items-center bg-white/10 text-white"
                  data-testid="product-lightbox-next"
                  aria-label="Next image"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="flex gap-2 justify-center pb-6 pt-3" onClick={(e) => e.stopPropagation()}>
              {gallery.map((src, i) => (
                <button
                  key={src + i}
                  onClick={() => setIdx(i)}
                  className="w-2 h-2 rounded-full"
                  aria-label={`Jump to image ${i + 1}`}
                  style={{ background: i === idx ? "white" : "rgba(255,255,255,.35)" }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductGallery;
