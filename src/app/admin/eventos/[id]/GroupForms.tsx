"use client";

import { useActionState, useTransition } from "react";
import { ActionForm, SubmitButton } from "@/components/client";
import { createGroups, moveToGroup, setGroupLead, updateGroup } from "./groupActions";

export function CreateGroups({ eventId, defaultTime, first }: { eventId: string; defaultTime: string; first: boolean }) {
  const [msg, action] = useActionState(createGroups.bind(null, eventId), null);
  return (
    <ActionForm action={action} className="flex flex-wrap items-end gap-2">
      <label className="text-sm">
        <span className="label">{first ? "Dividir en" : "Añadir"}</span>
        <span className="flex items-center gap-1">
          <input name="count" type="number" min={1} max={30} defaultValue={first ? 2 : 1} className="input w-20" required /> grupos
        </span>
      </label>
      <label className="text-sm">
        <span className="label">Hora de entrada</span>
        <input name="callTime" type="time" defaultValue={defaultTime} className="input w-32" />
      </label>
      <SubmitButton className="btn">+ Crear grupos</SubmitButton>
      {msg && <p className="w-full text-sm text-red-700">{msg}</p>}
    </ActionForm>
  );
}

export function EditGroup({ group, eventStart }: { group: { id: string; name: string; callTime: string | null; need: number }; eventStart: string }) {
  const [msg, action] = useActionState(updateGroup.bind(null, group.id), null);
  return (
    <ActionForm action={action} className="flex flex-wrap items-end gap-2">
      <label className="text-sm">
        <span className="label">Nombre</span>
        <input name="name" defaultValue={group.name} className="input w-36" required />
      </label>
      <label className="text-sm">
        <span className="label">Entrada</span>
        <input name="callTime" type="time" defaultValue={group.callTime ?? eventStart} className="input w-28" />
      </label>
      <label className="text-sm">
        <span className="label">Camareros</span>
        <input name="need" type="number" min={0} defaultValue={group.need} className="input w-20" />
      </label>
      <SubmitButton className="btn btn-sm">Guardar</SubmitButton>
      {msg && <span className={`text-xs ${msg === "Guardado." ? "text-emerald-700" : "text-red-700"}`}>{msg}</span>}
    </ActionForm>
  );
}

/** Desplegable para cambiar de grupo a una persona (se guarda al elegir). */
export function MoveSelect({ assignmentId, groupId, groups }: { assignmentId: string; groupId: string | null; groups: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Grupo"
      className="input w-32 py-1 text-xs"
      defaultValue={groupId ?? ""}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value || null;
        start(() => moveToGroup(assignmentId, v));
      }}
    >
      <option value="">Sin grupo</option>
      {groups.map((g) => (
        <option key={g.id} value={g.id}>{g.name}</option>
      ))}
    </select>
  );
}

/** Quién dirige el grupo (maître o camarero responsable del evento). */
export function LeadSelect({ groupId, current, leads }: { groupId: string; current: string | null; leads: { id: string; label: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <label className="block text-sm">
      <span className="label">Maître o responsable del grupo</span>
      <select
        className="input"
        defaultValue={current ?? ""}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          start(() => setGroupLead(groupId, v));
        }}
      >
        <option value="">— Sin asignar (lo lleva el general) —</option>
        {leads.map((l) => (
          <option key={l.id} value={l.id}>{l.label}</option>
        ))}
      </select>
    </label>
  );
}
