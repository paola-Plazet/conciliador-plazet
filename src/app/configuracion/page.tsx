"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { PageHeader, Card } from "@/components/ui";
import { formatCOP } from "@/lib/money";

interface RefRow {
  reference: string;
  count: number;
  total: number;
  storeCode: string | null;
  storeName: string | null;
}
interface Store {
  code: string;
  name: string;
}
interface Holiday {
  id: number;
  date: string;
  name: string;
}

export default function ConfiguracionPage() {
  const [refs, setRefs] = useState<RefRow[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [newHoliday, setNewHoliday] = useState({ date: "", name: "" });

  async function loadAll() {
    const [r, s, h] = await Promise.all([
      fetch("/api/config/references").then((x) => x.json()),
      fetch("/api/config/stores").then((x) => x.json()),
      fetch("/api/config/holidays").then((x) => x.json()),
    ]);
    setRefs(r.references ?? []);
    setStores((s.stores ?? []).map((x: Store) => ({ code: x.code, name: x.name })));
    setHolidays(h.holidays ?? []);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function assignRef(reference: string, storeCode: string) {
    await fetch("/api/config/references", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference, storeCode: storeCode || null }),
    });
    loadAll();
  }

  async function addHoliday() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newHoliday.date)) return;
    await fetch("/api/config/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newHoliday),
    });
    setNewHoliday({ date: "", name: "" });
    loadAll();
  }

  async function removeHoliday(date: string) {
    await fetch("/api/config/holidays", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    });
    loadAll();
  }

  return (
    <>
      <PageHeader
        title="Configuración"
        subtitle="Asigna las referencias del banco a cada tienda y administra los festivos"
      />
      <div className="grid gap-6 p-8 lg:grid-cols-2">
        <Card>
          <h3 className="font-semibold text-plazet-900">
            Referencias de efectivo → tienda
          </h3>
          <p className="mb-3 text-sm text-gray-500">
            Cada tienda consigna con una referencia fija. Asígnalas según el monto
            que reconozcas. Las no asignadas no se concilian por tienda.
          </p>
          {refs.length === 0 ? (
            <p className="text-sm text-gray-400">
              Carga un extracto del banco para ver las referencias.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-plazet-100 text-left text-gray-500">
                  <th className="py-2">Referencia</th>
                  <th className="py-2 text-right">Total</th>
                  <th className="py-2 text-center">Consig.</th>
                  <th className="py-2">Tienda</th>
                </tr>
              </thead>
              <tbody>
                {refs.map((r) => (
                  <tr key={r.reference} className="border-b border-plazet-50">
                    <td className="py-2 font-mono text-xs">{r.reference}</td>
                    <td className="py-2 text-right tabular-nums">
                      {r.total ? formatCOP(r.total) : "—"}
                    </td>
                    <td className="py-2 text-center text-gray-500">{r.count || "—"}</td>
                    <td className="py-2">
                      <select
                        value={r.storeCode ?? ""}
                        onChange={(e) => assignRef(r.reference, e.target.value)}
                        className="w-full rounded-lg border border-plazet-200 bg-white px-2 py-1"
                      >
                        <option value="">— Sin asignar —</option>
                        {stores.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-xs text-amber-600">
            Tras cambiar asignaciones, vuelve a procesar los archivos para
            recalcular el efectivo.
          </p>
        </Card>

        <Card>
          <h3 className="font-semibold text-plazet-900">Festivos</h3>
          <p className="mb-3 text-sm text-gray-500">
            Se usan para la regla de días hábiles. Ya vienen los festivos de
            Colombia 2025–2027; puedes agregar o quitar.
          </p>
          <div className="mb-3 flex gap-2">
            <input
              type="date"
              value={newHoliday.date}
              onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
              className="rounded-lg border border-plazet-200 px-3 py-1.5 text-sm"
            />
            <input
              placeholder="Nombre"
              value={newHoliday.name}
              onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
              className="flex-1 rounded-lg border border-plazet-200 px-3 py-1.5 text-sm"
            />
            <button
              onClick={addHoliday}
              className="flex items-center gap-1 rounded-lg bg-plazet-600 px-3 py-1.5 text-sm text-white hover:bg-plazet-700"
            >
              <Plus size={15} /> Agregar
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {holidays.map((h) => (
                  <tr key={h.id} className="border-b border-plazet-50">
                    <td className="py-1.5 font-mono text-xs">{h.date}</td>
                    <td className="py-1.5">{h.name}</td>
                    <td className="py-1.5 text-right">
                      <button
                        onClick={() => removeHoliday(h.date)}
                        className="text-rose-400 hover:text-rose-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
