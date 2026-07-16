import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useApp } from "../contexts/BakedContexts";
import { ProductCard } from "../components/mart/ProductCard";

export const ProductListPage = () => {
  const [sp, setSp] = useSearchParams();
  const { country } = useApp();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const search = sp.get("search") || "";
  const sort = sp.get("sort") || "popularity";

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ country: country.code, sort, limit: "60" });
    if (search) params.set("search", search);
    api.get(`/mart/products?${params}`).then(r => setProducts(r.data)).finally(() => setLoading(false));
  }, [search, sort, country.code]);

  return (
    <div className="baked-container my-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">{search ? `Search: "${search}"` : "All products"}</h1>
          <div className="text-sm text-muted-foreground">{products.length} results</div>
        </div>
        <select value={sort} onChange={(e) => { sp.set("sort", e.target.value); setSp(sp); }} className="baked-input bg-secondary px-3 py-2 text-sm outline-none">
          <option value="popularity">Popularity</option>
          <option value="price_asc">Price: Low → High</option>
          <option value="price_desc">Price: High → Low</option>
          <option value="newest">Newest</option>
        </select>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {products.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  );
};
