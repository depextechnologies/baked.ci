/**
 * Super-admin route: /admin/modules/food/restaurants/:id/menu
 * Renders the reusable <MenuManager/> component signed with the admin token.
 */
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronLeft, Loader2 } from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";
import MenuManager from "../../components/food/MenuManager";

export const AdminFoodMenuManager = () => {
  const { id } = useParams();
  const [rest, setRest] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data } = await adminApi.get(`/admin/food/restaurants`);
        if (!cancel) setRest(data.find((r) => r.id === id) || null);
      } finally { if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [id]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground inline-flex items-center gap-2" data-testid="admin-food-menu-loading"><Loader2 size={14} className="animate-spin" /> Chargement…</div>;

  return (
    <div className="p-6 space-y-4" data-testid="admin-food-menu">
      <Link to="/admin/modules/food/restaurants" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ChevronLeft size={12} /> Retour · Back to restaurants</Link>
      <div className="rounded-xl border border-border bg-secondary/40 p-3 flex items-center gap-3">
        <img src={rest?.image || ""} alt="" className="w-12 h-12 rounded-lg object-cover bg-muted" />
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{rest?.name || id}</div>
          <div className="text-[11px] text-muted-foreground">{rest?.country} · {(rest?.cuisines || []).join(", ")}</div>
        </div>
      </div>
      <MenuManager restaurantId={id} api={adminApi} testId="admin-menu-manager" />
    </div>
  );
};

export default AdminFoodMenuManager;
