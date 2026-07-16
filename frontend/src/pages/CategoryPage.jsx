import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useApp } from "../contexts/BakedContexts";
import { ProductCard } from "../components/mart/ProductCard";
import { CATEGORY } from "../constants/testIds";

export const CategoriesIndexPage = () => {
  const { country, language } = useApp();
  const [cats, setCats] = useState([]);
  const navigate = useNavigate();
  useEffect(() => { api.get(`/mart/categories?country=${country.code}`).then(r => setCats(r.data)); }, [country.code]);
  return (
    <div className="baked-container my-8">
      <h1 className="text-3xl font-bold mb-6">{language === "en" ? "All Categories" : "Toutes les catégories"}</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {cats.map((c) => {
          const displayName = language === "en" ? (c.name_en || c.name) : (c.name_fr || c.name);
          return (
          <button key={c.slug} data-testid={CATEGORY.card(c.slug)} onClick={() => navigate(`/categories/${c.slug}`)} className="baked-card bg-card border border-border overflow-hidden group motion-normal hover:border-[#77BC1F]/60">
            <div className="aspect-square bg-secondary/40"><img src={c.image} alt={displayName} className="w-full h-full object-cover motion-normal group-hover:scale-105" /></div>
            <div className="p-3 text-sm font-semibold text-center">{displayName}</div>
          </button>
          );
        })}
      </div>
    </div>
  );
};

export const CategoryDetailPage = () => {
  const { slug } = useParams();
  const { country, language } = useApp();
  const [products, setProducts] = useState([]);
  const [cat, setCat] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const cats = (await api.get(`/mart/categories?country=${country.code}`)).data;
      setCat(cats.find(c => c.slug === slug));
      const { data } = await api.get(`/mart/products?country=${country.code}&category=${slug}&limit=60`);
      setProducts(data);
    })();
  }, [slug, country.code]);

  const displayName = cat ? (language === "en" ? (cat.name_en || cat.name) : (cat.name_fr || cat.name)) : slug;
  const { ProductCard: _PC } = { ProductCard };
  return (
    <div className="baked-container my-8">
      <button onClick={() => navigate(-1)} className="text-xs text-muted-foreground mb-4 hover:text-foreground">{language === "en" ? "← Back" : "← Retour"}</button>
      <div className="flex items-center gap-4 mb-6">
        {cat?.image && <img src={cat.image} alt="" className="w-16 h-16 rounded-2xl object-cover" />}
        <div>
          <h1 className="text-3xl font-bold">{displayName}</h1>
          <div className="text-sm text-muted-foreground">{products.length} {language === "en" ? "products" : "produits"}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {products.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </div>
  );
};
