"use client";

import { useEffect } from "react";

/** Marca el candidato como visto en cuanto se abre (así baja el número del menú). */
export function MarkSeen({ action }: { action: () => Promise<void> }) {
  useEffect(() => {
    action().catch(() => {});
  }, [action]);
  return null;
}
