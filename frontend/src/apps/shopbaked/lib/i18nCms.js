// Locale-aware picker for CMS-driven bilingual fields.
// Convention: bilingual objects store the English value at `key` and the
// French override at `key_fr`. When language is FR we prefer `key_fr`,
// falling back to the base `key`. Passing `null`/undefined objects is safe.
export const pickBilingual = (obj, key, lang) => {
  if (!obj) return undefined;
  if (lang === "fr") {
    const fr = obj[`${key}_fr`];
    if (fr !== undefined && fr !== null && fr !== "") return fr;
  }
  return obj[key];
};

// Convenience: locale-aware catalogue-row name picker.
// Rows come back from `/api/shop/catalogue` with `name_fr` + `name_en`.
export const pickCatalogueName = (row, lang) => {
  if (!row) return "";
  if (lang === "fr") return row.name_fr || row.name_en || row.slug;
  return row.name_en || row.name_fr || row.slug;
};

// Locale-aware product-title picker. SHOP product rows expose an English
// canonical `title` and an optional `title_fr` (added in migration 0047).
// French customers see the French value when set; otherwise the English
// title is rendered.
export const pickProductTitle = (product, lang) => {
  if (!product) return "";
  if (lang === "fr" && product.title_fr) return product.title_fr;
  return product.title || product.title_fr || "";
};

// Same rule for the product description.
export const pickProductDescription = (product, lang) => {
  if (!product) return "";
  if (lang === "fr" && product.description_fr) return product.description_fr;
  return product.description || product.description_fr || "";
};
