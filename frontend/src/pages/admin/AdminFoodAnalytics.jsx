/**
 * Super-admin route: /admin/modules/food/restaurants/:id/analytics
 * Renders <RestaurantAnalytics/> with adminApi.
 */
import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Sparkles, Loader2 } from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";
import RestaurantAnalytics from "../../components/food/RestaurantAnalytics";

export const AdminFoodAnalytics = () => {
  const { id } = useParams();
  const [rest, setRest] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await adminApi.get(`/admin/food/restaurants`);
        setRest(data.find((r) => r.id === id) || null);
      } catch { /* ignore */ }
    })();
  }, [id]);

  const seed = async () => {
    if (!window.confirm("Générer 90 jours d'ordres démo (efface les orders existants) ?")) return;
    setSeeding(true); setMsg("");
    try {
      const { data } = await adminApi.post(`/admin/food/restaurants/${id}/seed-orders?days=90&daily_avg=25&clear=true`);
      setMsg(`${data.seeded} commandes de démo créées.`);
    } catch (e) { setMsg(e?.response?.data?.detail || e.message); }
    finally { setSeeding(false); }
  };

  return (
    <div className="p-6 space-y-4" data-testid="admin-food-analytics">
      <Link to="/admin/modules/food/restaurants" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ChevronLeft size={12} /> Restaurants</Link>
      <div className="rounded-xl border border-border bg-secondary/40 p-3 flex items-center gap-3">
        <img src={rest?.image || ""} alt="" className="w-12 h-12 rounded-lg object-cover bg-muted" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{rest?.name || id}</div>
          <div className="text-[11px] text-muted-foreground">{rest?.country} · {(rest?.cuisines || []).join(", ")}</div>
        </div>
        <button onClick={seed} disabled={seeding} data-testid="admin-food-seed-orders"
                className="h-9 px-3 rounded-lg bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50">
          {seeding ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Générer données démo · Seed demo
        </button>
      </div>
      {msg && <div className="text-xs text-muted-foreground">{msg}</div>}
      <RestaurantAnalytics restaurantId={id} api={adminApi} testId="admin-restaurant-analytics" />
    </div>
  );
};

export default AdminFoodAnalytics;
