/**
 * PartnerFloorTablesPage — Areas + Tables CRUD.
 *
 * Route: /partner/food/reservations/floor
 *
 * Layout:
 *   • Area cards (Main Hall, Terrace, …) — each with add/edit/delete + inline
 *     tables grid inside.
 *   • Each table: code, seats, active toggle, edit / delete.
 *   • A visual "Basic Layout" preview per area — tables laid out as chips
 *     colour-coded by seat count. This is the safe first step towards a
 *     future drag-and-drop floor plan.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Pencil, Trash2, Save, X, LayoutGrid, AlertTriangle, Users } from "lucide-react";
import { partnerApi, useFoodPartner } from "../../../contexts/FoodPartnerContext";

const GREEN = "#00A651";

const T = {
  fr: {
    title: "Espaces et tables",
    subtitle: "Créez vos zones (salle principale, terrasse…) puis ajoutez les tables et leur capacité.",
    add_area: "Ajouter un espace",
    area_name_placeholder: "Nom de l'espace (ex. Salle principale)",
    save: "Enregistrer",
    cancel: "Annuler",
    delete: "Supprimer",
    edit: "Modifier",
    active: "Actif",
    inactive: "Inactif",
    add_table: "Ajouter une table",
    table_code: "Code",
    table_seats: "Places",
    empty_area: "Aucune table pour l'instant.",
    empty_layout: "Ajoutez un espace pour commencer.",
    confirm_delete_area: "Supprimer cet espace et toutes ses tables ?",
    confirm_delete_table: "Supprimer cette table ?",
    seat_singular: "place",
    seat_plural: "places",
  },
  en: {
    title: "Floor & Tables",
    subtitle: "Create your areas (Main Hall, Terrace…) then add tables and their capacity.",
    add_area: "Add area",
    area_name_placeholder: "Area name (e.g. Main Hall)",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    active: "Active",
    inactive: "Inactive",
    add_table: "Add table",
    table_code: "Code",
    table_seats: "Seats",
    empty_area: "No tables yet.",
    empty_layout: "Add an area to begin.",
    confirm_delete_area: "Delete this area and all its tables?",
    confirm_delete_table: "Delete this table?",
    seat_singular: "seat",
    seat_plural: "seats",
  },
};

const useLangDict = () => {
  const [lang] = useState(() => (localStorage.getItem("i18nextLng") || "fr").toLowerCase().startsWith("fr") ? "fr" : "en");
  return { lang, t: T[lang] };
};

export const PartnerFloorTablesPage = () => {
  const { restaurant } = useFoodPartner() || {};
  const { lang, t } = useLangDict();
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [newArea, setNewArea] = useState({ open: false, name: "" });
  const [savingArea, setSavingArea] = useState(false);

  const load = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoading(true); setErr("");
    try {
      const { data } = await partnerApi.get(`/food/manage/${restaurant.id}/reservation-areas`);
      setAreas(data.areas || []);
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || "Error");
    } finally { setLoading(false); }
  }, [restaurant?.id]);

  useEffect(() => { load(); }, [load]);

  const addArea = async () => {
    if (!newArea.name.trim()) return;
    setSavingArea(true); setErr("");
    try {
      await partnerApi.post(`/food/manage/${restaurant.id}/reservation-areas`, { name: newArea.name.trim() });
      setNewArea({ open: false, name: "" });
      await load();
    } catch (e) {
      setErr(e.response?.data?.detail || e.message);
    } finally { setSavingArea(false); }
  };

  const renameArea = async (aid, name) => {
    try {
      await partnerApi.patch(`/food/manage/${restaurant.id}/reservation-areas/${aid}`, { name });
      await load();
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
  };
  const toggleArea = async (aid, is_active) => {
    try {
      await partnerApi.patch(`/food/manage/${restaurant.id}/reservation-areas/${aid}`, { is_active });
      await load();
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
  };
  const removeArea = async (aid) => {
    if (!window.confirm(t.confirm_delete_area)) return;
    try {
      await partnerApi.delete(`/food/manage/${restaurant.id}/reservation-areas/${aid}`);
      await load();
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
  };

  const addTable = async (aid, payload) => {
    try {
      await partnerApi.post(`/food/manage/${restaurant.id}/reservation-tables`, { area_id: aid, ...payload });
      await load();
    } catch (e) {
      setErr(e.response?.data?.detail || e.message);
      throw e;
    }
  };
  const patchTable = async (tid, payload) => {
    try {
      await partnerApi.patch(`/food/manage/${restaurant.id}/reservation-tables/${tid}`, payload);
      await load();
    } catch (e) {
      setErr(e.response?.data?.detail || e.message);
      throw e;
    }
  };
  const removeTable = async (tid) => {
    if (!window.confirm(t.confirm_delete_table)) return;
    try {
      await partnerApi.delete(`/food/manage/${restaurant.id}/reservation-tables/${tid}`);
      await load();
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
  };

  if (!restaurant) return null;

  return (
    <div className="space-y-6" data-testid="partner-floor-tables-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold inline-flex items-center gap-2"><LayoutGrid size={22} /> {t.title}</h1>
          <p className="text-sm text-muted-foreground max-w-xl">{t.subtitle}</p>
        </div>
        {!newArea.open && (
          <button onClick={() => setNewArea({ open: true, name: "" })}
                  className="h-9 px-4 rounded-full text-black font-semibold text-sm inline-flex items-center gap-2"
                  style={{ backgroundColor: GREEN }}
                  data-testid="partner-add-area-btn">
            <Plus size={14} /> {t.add_area}
          </button>
        )}
      </div>

      {newArea.open && (
        <div className="rounded-2xl border border-border bg-card p-4 flex flex-wrap gap-2 items-center" data-testid="partner-add-area-form">
          <input type="text" value={newArea.name} autoFocus
                 onChange={(e) => setNewArea({ ...newArea, name: e.target.value })}
                 placeholder={t.area_name_placeholder}
                 className="flex-1 min-w-[220px] h-10 rounded-lg border border-border bg-secondary/40 px-3 text-sm"
                 data-testid="partner-new-area-input" />
          <button onClick={addArea} disabled={savingArea || !newArea.name.trim()}
                  className="h-10 px-4 rounded-lg text-black font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-50"
                  style={{ backgroundColor: GREEN }}
                  data-testid="partner-new-area-save">
            {savingArea && <Loader2 size={12} className="animate-spin" />} <Save size={12} /> {t.save}
          </button>
          <button onClick={() => setNewArea({ open: false, name: "" })}
                  className="h-10 px-3 rounded-lg text-xs bg-secondary hover:bg-secondary/80"
                  data-testid="partner-new-area-cancel">{t.cancel}</button>
        </div>
      )}

      {err && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600 inline-flex items-center gap-1"><AlertTriangle size={12} /> {String(err)}</div>}

      {loading ? (
        <div className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> …</div>
      ) : areas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground" data-testid="partner-floor-empty">
          {t.empty_layout}
        </div>
      ) : (
        <div className="space-y-4">
          {areas.map((area) => (
            <AreaCard key={area.id} area={area} t={t}
                      onRename={(n) => renameArea(area.id, n)}
                      onToggle={(v) => toggleArea(area.id, v)}
                      onRemove={() => removeArea(area.id)}
                      onAddTable={(p) => addTable(area.id, p)}
                      onPatchTable={(tid, p) => patchTable(tid, p)}
                      onRemoveTable={(tid) => removeTable(tid)} />
          ))}
        </div>
      )}
    </div>
  );
};

const seatChipColor = (seats) => {
  if (seats <= 2) return { bg: "#3b82f61a", fg: "#3b82f6" };
  if (seats <= 4) return { bg: `${GREEN}22`,  fg: GREEN };
  if (seats <= 6) return { bg: "#f59e0b1a", fg: "#f59e0b" };
  return { bg: "#a855f71a", fg: "#a855f7" };
};

const AreaCard = ({ area, t, onRename, onToggle, onRemove, onAddTable, onPatchTable, onRemoveTable }) => {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(area.name);
  const [addingTable, setAddingTable] = useState(false);
  const [newTable, setNewTable] = useState({ code: "", seats: 2 });
  const [savingTable, setSavingTable] = useState(false);
  const [editingTable, setEditingTable] = useState(null); // tid

  useEffect(() => { setNameDraft(area.name); }, [area.name]);

  const saveName = async () => {
    if (nameDraft.trim() && nameDraft.trim() !== area.name) await onRename(nameDraft.trim());
    setEditingName(false);
  };

  const submitTable = async () => {
    if (!newTable.code.trim() || !Number(newTable.seats)) return;
    setSavingTable(true);
    try {
      await onAddTable({ code: newTable.code.trim(), seats: Number(newTable.seats) });
      setNewTable({ code: "", seats: 2 });
      setAddingTable(false);
    } catch {} finally { setSavingTable(false); }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4" data-testid={`partner-area-card-${area.id}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {editingName ? (
          <>
            <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} autoFocus
                   className="h-8 rounded-lg border border-border bg-secondary/40 px-2 text-sm font-semibold"
                   data-testid={`partner-area-rename-input-${area.id}`} />
            <button onClick={saveName} className="text-xs h-8 px-2 rounded-lg" style={{ backgroundColor: `${GREEN}22`, color: GREEN }} data-testid={`partner-area-rename-save-${area.id}`}><Save size={12} /></button>
            <button onClick={() => { setEditingName(false); setNameDraft(area.name); }} className="text-xs h-8 px-2 rounded-lg bg-secondary" data-testid={`partner-area-rename-cancel-${area.id}`}><X size={12} /></button>
          </>
        ) : (
          <>
            <div className="text-base font-semibold" data-testid={`partner-area-name-${area.id}`}>{area.name}</div>
            <button onClick={() => setEditingName(true)} className="text-xs h-7 px-2 rounded-lg bg-secondary hover:bg-secondary/80 inline-flex items-center gap-1" data-testid={`partner-area-edit-${area.id}`}><Pencil size={10} /> {t.edit}</button>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => onToggle(!area.is_active)}
                  className={`text-[10px] h-7 px-2 rounded-full font-semibold ${area.is_active ? "text-black" : "text-muted-foreground"}`}
                  style={area.is_active ? { backgroundColor: GREEN } : { backgroundColor: "#a1a1aa22" }}
                  data-testid={`partner-area-toggle-${area.id}`}>
            {area.is_active ? t.active : t.inactive}
          </button>
          <button onClick={onRemove} className="text-xs h-7 px-2 rounded-lg bg-red-500/10 text-red-500 inline-flex items-center gap-1" data-testid={`partner-area-delete-${area.id}`}><Trash2 size={10} /> {t.delete}</button>
        </div>
      </div>

      {/* Basic visual preview */}
      <div className="mt-4 rounded-xl bg-secondary/40 p-3 min-h-[70px] flex flex-wrap gap-2" data-testid={`partner-area-preview-${area.id}`}>
        {(area.tables || []).length === 0 ? (
          <div className="text-xs text-muted-foreground italic self-center px-2">{t.empty_area}</div>
        ) : area.tables.map((tbl) => {
          const c = seatChipColor(tbl.seats);
          return (
            <div key={tbl.id}
                 className={`rounded-xl px-3 py-2 min-w-[76px] text-center border ${tbl.is_active ? "border-transparent" : "border-red-500/30 opacity-50"}`}
                 style={{ backgroundColor: c.bg, color: c.fg }}
                 data-testid={`partner-area-preview-tbl-${tbl.id}`}>
              <div className="text-[11px] font-mono font-semibold">{tbl.code}</div>
              <div className="text-[10px] inline-flex items-center gap-1"><Users size={9} /> {tbl.seats}</div>
            </div>
          );
        })}
      </div>

      {/* Tables management */}
      <div className="mt-3 space-y-2">
        {(area.tables || []).map((tbl) => (
          <TableRow key={tbl.id} tbl={tbl} t={t}
                    editing={editingTable === tbl.id}
                    onEdit={() => setEditingTable(tbl.id)}
                    onCancel={() => setEditingTable(null)}
                    onSave={async (patch) => { await onPatchTable(tbl.id, patch); setEditingTable(null); }}
                    onRemove={() => onRemoveTable(tbl.id)} />
        ))}
      </div>

      {addingTable ? (
        <div className="mt-3 rounded-lg bg-secondary/60 p-3 flex flex-wrap items-end gap-2" data-testid={`partner-add-table-form-${area.id}`}>
          <div className="min-w-[110px]">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t.table_code}</div>
            <input value={newTable.code} onChange={(e) => setNewTable({ ...newTable, code: e.target.value })}
                   className="h-9 w-full rounded-lg border border-border bg-secondary/40 px-2 text-sm"
                   placeholder="T01"
                   data-testid={`partner-new-table-code-${area.id}`} />
          </div>
          <div className="w-24">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t.table_seats}</div>
            <input type="number" min={1} max={40} value={newTable.seats}
                   onChange={(e) => setNewTable({ ...newTable, seats: e.target.value })}
                   className="h-9 w-full rounded-lg border border-border bg-secondary/40 px-2 text-sm"
                   data-testid={`partner-new-table-seats-${area.id}`} />
          </div>
          <button onClick={submitTable} disabled={savingTable}
                  className="h-9 px-3 rounded-lg text-black font-semibold text-xs inline-flex items-center gap-1 disabled:opacity-50"
                  style={{ backgroundColor: GREEN }}
                  data-testid={`partner-new-table-save-${area.id}`}>
            {savingTable && <Loader2 size={11} className="animate-spin" />} <Save size={11} /> {t.save}
          </button>
          <button onClick={() => { setAddingTable(false); setNewTable({ code: "", seats: 2 }); }}
                  className="h-9 px-3 rounded-lg text-xs bg-secondary"
                  data-testid={`partner-new-table-cancel-${area.id}`}>{t.cancel}</button>
        </div>
      ) : (
        <button onClick={() => setAddingTable(true)}
                className="mt-3 text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                data-testid={`partner-add-table-btn-${area.id}`}>
          <Plus size={11} /> {t.add_table}
        </button>
      )}
    </div>
  );
};

const TableRow = ({ tbl, t, editing, onEdit, onCancel, onSave, onRemove }) => {
  const [code, setCode] = useState(tbl.code);
  const [seats, setSeats] = useState(tbl.seats);
  useEffect(() => { setCode(tbl.code); setSeats(tbl.seats); }, [tbl.code, tbl.seats]);

  if (!editing) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2" data-testid={`partner-table-row-${tbl.id}`}>
        <div className="font-mono text-xs w-16">{tbl.code}</div>
        <div className="text-xs inline-flex items-center gap-1 text-muted-foreground"><Users size={11} /> {tbl.seats}</div>
        <button onClick={() => onSave({ is_active: !tbl.is_active })}
                className={`ml-auto text-[10px] h-7 px-2 rounded-full font-semibold ${tbl.is_active ? "text-black" : "text-muted-foreground"}`}
                style={tbl.is_active ? { backgroundColor: GREEN } : { backgroundColor: "#a1a1aa22" }}
                data-testid={`partner-table-toggle-${tbl.id}`}>
          {tbl.is_active ? t.active : t.inactive}
        </button>
        <button onClick={onEdit} className="text-xs h-7 px-2 rounded-lg bg-secondary hover:bg-secondary/80 inline-flex items-center gap-1" data-testid={`partner-table-edit-${tbl.id}`}><Pencil size={10} /> {t.edit}</button>
        <button onClick={onRemove} className="text-xs h-7 px-2 rounded-lg bg-red-500/10 text-red-500 inline-flex items-center gap-1" data-testid={`partner-table-delete-${tbl.id}`}><Trash2 size={10} /></button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 bg-secondary/40" data-testid={`partner-table-edit-form-${tbl.id}`}>
      <input value={code} onChange={(e) => setCode(e.target.value)}
             className="font-mono text-xs w-20 h-8 rounded-lg border border-border bg-secondary/40 px-2"
             data-testid={`partner-table-edit-code-${tbl.id}`} />
      <input type="number" min={1} max={40} value={seats} onChange={(e) => setSeats(e.target.value)}
             className="text-xs w-20 h-8 rounded-lg border border-border bg-secondary/40 px-2"
             data-testid={`partner-table-edit-seats-${tbl.id}`} />
      <button onClick={() => onSave({ code: code.trim(), seats: Number(seats) })}
              className="ml-auto text-xs h-8 px-2 rounded-lg" style={{ backgroundColor: `${GREEN}22`, color: GREEN }}
              data-testid={`partner-table-edit-save-${tbl.id}`}><Save size={11} /></button>
      <button onClick={onCancel} className="text-xs h-8 px-2 rounded-lg bg-secondary"
              data-testid={`partner-table-edit-cancel-${tbl.id}`}><X size={11} /></button>
    </div>
  );
};

export default PartnerFloorTablesPage;
