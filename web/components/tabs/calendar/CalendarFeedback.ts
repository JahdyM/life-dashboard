import type { AutoPlanMode, AutoPlanStats } from "./PlanningEngine";

export function formatAutoPlanNotice(mode: AutoPlanMode, stats: AutoPlanStats, dayEndTime: string) {
  const modeLabel =
    mode === "order" ? "Auto reordenar" : mode === "time" ? "Auto horários" : "Auto planejamento";
  const detail: string[] = [];

  if (mode !== "time") detail.push(`${stats.reorderedCount} reordenadas`);
  if (mode !== "order") detail.push(`${stats.scheduledCount} com horário`);
  if (mode !== "order" && stats.unscheduledOverflowCount > 0) {
    detail.push(`${stats.unscheduledOverflowCount} sem horário (após ${dayEndTime})`);
  }
  if (stats.lockedPreservedCount > 0) {
    detail.push(`${stats.lockedPreservedCount} travadas preservadas`);
  }

  return detail.length ? `${modeLabel}: ${detail.join(" · ")}` : `${modeLabel}: sem mudanças necessárias.`;
}

export function formatMoveBlockedByLockNotice() {
  return "Tarefa travada: destrave o cadeado para mover na fila ou entre listas.";
}

export function formatMoveNotice(kind: "toToday" | "toBacklog" | "toTop" | "toEnd") {
  if (kind === "toToday") return "Tarefa movida para hoje (sem horário).";
  if (kind === "toBacklog") return "Tarefa movida para backlog (sem horário).";
  if (kind === "toTop") return "Tarefa movida para o topo da fila do dia.";
  return "Tarefa movida para o fim da fila do dia.";
}
