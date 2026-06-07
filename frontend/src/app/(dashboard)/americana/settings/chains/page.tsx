"use client";
import { Fragment, useEffect, useState } from "react";
import { useApiGet } from "@/hooks/useApi";
import api from "@/lib/api";
import { Plus, Edit2, Check, X, ChevronRight, ChevronDown } from "lucide-react";

interface Chain {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  active: boolean;
  _count?: { stores: number };
}

interface Branch {
  id: string;
  chainId: string;
  name: string;
  area: string | null;
  managerName: string | null;
  managerPhone: string | null;
  active: boolean;
}

function BranchesEditor({ chainId }: { chainId: string }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Branch>>({});
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await api.get(`/api/americana/stores?chainId=${chainId}`);
    setBranches(res.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [chainId]);

  const save = async (id: string | null) => {
    if (id) {
      await api.put(`/api/americana/stores/${id}`, draft);
    } else {
      await api.post("/api/americana/stores", { ...draft, chainId });
    }
    setEditing(null);
    setCreating(false);
    setDraft({});
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Soft-delete this branch?")) return;
    await api.delete(`/api/americana/stores/${id}`);
    load();
  };

  return (
    <div className="bg-gray-50/60 border-t border-gray-100 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-secondary">Branches</h3>
        <button
          onClick={() => { setCreating(true); setDraft({ active: true }); }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-200 text-xs rounded-md hover:bg-gray-50"
        >
          <Plus size={12} /> Add branch
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-100 overflow-x-auto">
        <table className="w-full text-xs min-w-[800px]">
          <thead className="bg-gray-50 text-[11px] uppercase text-secondary">
            <tr>
              <th className="text-left p-2.5">Name</th>
              <th className="text-left p-2.5">Area</th>
              <th className="text-left p-2.5">Manager</th>
              <th className="text-left p-2.5">Manager phone</th>
              <th className="text-left p-2.5">Active</th>
              <th className="text-right p-2.5 w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {creating && (
              <tr className="bg-blue-50/40 border-b border-gray-50">
                <td className="p-2"><input autoFocus value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full px-2 py-1 border border-gray-200 rounded-md text-xs" placeholder="KFC Hawally" /></td>
                <td className="p-2"><input value={draft.area ?? ""} onChange={(e) => setDraft({ ...draft, area: e.target.value })} className="w-full px-2 py-1 border border-gray-200 rounded-md text-xs" placeholder="Hawally" /></td>
                <td className="p-2"><input value={draft.managerName ?? ""} onChange={(e) => setDraft({ ...draft, managerName: e.target.value })} className="w-full px-2 py-1 border border-gray-200 rounded-md text-xs" /></td>
                <td className="p-2"><input value={draft.managerPhone ?? ""} onChange={(e) => setDraft({ ...draft, managerPhone: e.target.value })} className="w-full px-2 py-1 border border-gray-200 rounded-md text-xs" /></td>
                <td className="p-2"><input type="checkbox" checked={!!draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /></td>
                <td className="p-2 text-right">
                  <button onClick={() => save(null)} className="p-1 rounded hover:bg-gray-50"><Check size={12} /></button>
                  <button onClick={() => { setCreating(false); setDraft({}); }} className="p-1 rounded hover:bg-gray-50"><X size={12} /></button>
                </td>
              </tr>
            )}
            {loading ? (
              <tr><td colSpan={6} className="p-4 text-center text-secondary">Loading…</td></tr>
            ) : branches.length === 0 && !creating ? (
              <tr><td colSpan={6} className="p-4 text-center text-secondary">No branches yet.</td></tr>
            ) : branches.map((b) => {
              const isEditing = editing === b.id;
              return (
                <tr key={b.id} className="border-b border-gray-50 last:border-b-0">
                  <td className="p-2 font-medium">
                    {isEditing ? (
                      <input value={draft.name ?? b.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full px-2 py-1 border border-gray-200 rounded-md text-xs" />
                    ) : b.name}
                  </td>
                  <td className="p-2">
                    {isEditing ? (
                      <input value={draft.area ?? b.area ?? ""} onChange={(e) => setDraft({ ...draft, area: e.target.value })} className="w-full px-2 py-1 border border-gray-200 rounded-md text-xs" />
                    ) : b.area ?? "—"}
                  </td>
                  <td className="p-2">
                    {isEditing ? (
                      <input value={draft.managerName ?? b.managerName ?? ""} onChange={(e) => setDraft({ ...draft, managerName: e.target.value })} className="w-full px-2 py-1 border border-gray-200 rounded-md text-xs" />
                    ) : b.managerName ?? "—"}
                  </td>
                  <td className="p-2">
                    {isEditing ? (
                      <input value={draft.managerPhone ?? b.managerPhone ?? ""} onChange={(e) => setDraft({ ...draft, managerPhone: e.target.value })} className="w-full px-2 py-1 border border-gray-200 rounded-md text-xs" />
                    ) : b.managerPhone ?? "—"}
                  </td>
                  <td className="p-2">
                    {isEditing ? (
                      <input type="checkbox" checked={draft.active ?? b.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                    ) : (
                      <span className={b.active ? "text-green-600" : "text-gray-400"}>{b.active ? "Yes" : "No"}</span>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    {isEditing ? (
                      <>
                        <button onClick={() => save(b.id)} className="p-1 rounded hover:bg-gray-50"><Check size={12} /></button>
                        <button onClick={() => { setEditing(null); setDraft({}); }} className="p-1 rounded hover:bg-gray-50"><X size={12} /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditing(b.id); setDraft(b); }} className="p-1 rounded hover:bg-gray-50"><Edit2 size={12} /></button>
                        <button onClick={() => del(b.id)} className="p-1 text-red-600 rounded hover:bg-red-50"><X size={12} /></button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AmericanaChainsPage() {
  const { data, loading, refetch } = useApiGet<Chain[]>("/api/americana/chains");
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Chain>>({});
  const [creating, setCreating] = useState(false);

  const save = async (id: string | null) => {
    if (id) await api.put(`/api/americana/chains/${id}`, draft);
    else await api.post("/api/americana/chains", draft);
    setEditing(null);
    setCreating(false);
    setDraft({});
    refetch();
  };

  const del = async (id: string) => {
    if (!confirm("Soft-delete this chain?")) return;
    await api.delete(`/api/americana/chains/${id}`);
    refetch();
  };

  const toggleExpand = (id: string) => {
    setExpanded(expanded === id ? null : id);
  };

  return (
    <div className="space-y-6 w-full max-w-none">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Americana chains</h1>
        <button
          onClick={() => { setCreating(true); setDraft({ active: true }); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary-hover"
        >
          <Plus size={14} /> Add chain
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-secondary">
            <tr>
              <th className="w-8 p-3" />
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Slug</th>
              <th className="text-right p-3">Branches</th>
              <th className="text-left p-3">Active</th>
              <th className="text-right p-3 w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {creating && (
              <tr className="border-b border-gray-50 bg-blue-50/40">
                <td className="p-3" />
                <td className="p-3">
                  <input autoFocus value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="w-full px-2 py-1 border border-gray-200 rounded-md text-sm" placeholder="KFC" />
                </td>
                <td className="p-3 text-secondary">auto</td>
                <td className="p-3" />
                <td className="p-3">
                  <input type="checkbox" checked={!!draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => save(null)} className="p-1 rounded hover:bg-gray-50"><Check size={14} /></button>
                  <button onClick={() => { setCreating(false); setDraft({}); }} className="p-1 rounded hover:bg-gray-50"><X size={14} /></button>
                </td>
              </tr>
            )}
            {loading ? (
              <tr><td colSpan={6} className="p-6 text-center text-secondary">Loading…</td></tr>
            ) : (data ?? []).length === 0 && !creating ? (
              <tr><td colSpan={6} className="p-6 text-center text-secondary">No chains yet.</td></tr>
            ) : (data ?? []).map((c) => {
              const isEditing = editing === c.id;
              const isExpanded = expanded === c.id;
              return (
                <Fragment key={c.id}>
                  <tr className="border-b border-gray-50">
                    <td className="p-3">
                      <button onClick={() => toggleExpand(c.id)} className="p-0.5 rounded hover:bg-gray-50 text-secondary">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                    <td className="p-3 font-medium">
                      {isEditing ? (
                        <input value={draft.name ?? c.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-200 rounded-md text-sm" />
                      ) : c.name}
                    </td>
                    <td className="p-3 text-xs text-secondary font-mono">
                      {isEditing ? (
                        <input value={draft.slug ?? c.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-200 rounded-md text-xs font-mono" />
                      ) : c.slug}
                    </td>
                    <td className="p-3 text-right font-mono">{c._count?.stores ?? 0}</td>
                    <td className="p-3">
                      {isEditing ? (
                        <input type="checkbox" checked={draft.active ?? c.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                      ) : (
                        <span className={c.active ? "text-green-600" : "text-gray-400"}>{c.active ? "Yes" : "No"}</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {isEditing ? (
                        <>
                          <button onClick={() => save(c.id)} className="p-1 rounded hover:bg-gray-50"><Check size={14} /></button>
                          <button onClick={() => { setEditing(null); setDraft({}); }} className="p-1 rounded hover:bg-gray-50"><X size={14} /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditing(c.id); setDraft(c); setExpanded(c.id); }} className="p-1 rounded hover:bg-gray-50"><Edit2 size={14} /></button>
                          <button onClick={() => del(c.id)} className="p-1 text-red-600 rounded hover:bg-red-50"><X size={14} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <BranchesEditor chainId={c.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
