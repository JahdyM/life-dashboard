import Link from "next/link";
import {
  formatBrazilianDate,
  isDissertationFrontComplete,
  isoDateDiffDays,
} from "@/lib/dissertation";
import { loadDissertationProject } from "@/lib/server/dissertation";

type DeadlineUrgency = "overdue" | "soon" | "near" | "later" | "none";

function deadlineUrgency(dateIso: string | null, todayIso: string): DeadlineUrgency {
  if (!dateIso) return "none";
  const days = isoDateDiffDays(todayIso, dateIso);
  if (days < 0) return "overdue";
  if (days <= 3) return "soon";
  if (days <= 14) return "near";
  return "later";
}

function formatDayCounter(dateIso: string | null, todayIso: string) {
  if (!dateIso) {
    return {
      badge: "Sem prazo",
      copy: "Defina uma data para acompanhar aqui.",
    };
  }

  const days = isoDateDiffDays(todayIso, dateIso);
  if (days === 0) {
    return {
      badge: "D-0",
      copy: "Vence hoje.",
    };
  }
  if (days > 0) {
    return {
      badge: `D-${days}`,
      copy: `Faltam ${days} dia${days === 1 ? "" : "s"}.`,
    };
  }

  const overdue = Math.abs(days);
  return {
    badge: `D+${overdue}`,
    copy: `${overdue} dia${overdue === 1 ? "" : "s"} de atraso.`,
  };
}

export default async function DissertationDeadlinesWidget({
  userEmail,
  todayIso,
}: {
  userEmail: string;
  todayIso: string;
}) {
  try {
    const project = await loadDissertationProject(userEmail);
    const activeFronts = project.fronts.filter((front) => !isDissertationFrontComplete(front));
    const fronts = [...activeFronts].sort((left, right) => {
      if (!left.targetDate && !right.targetDate) return left.order - right.order;
      if (!left.targetDate) return 1;
      if (!right.targetDate) return -1;
      if (left.targetDate !== right.targetDate) return left.targetDate.localeCompare(right.targetDate);
      return left.order - right.order;
    });

    return (
      <article className="study-widget-card study-widget-card-space" aria-label="Prazos da dissertação">
        <header className="study-widget-head">
          <p className="study-widget-kicker">Dissertação</p>
          <span className="study-widget-tag">{fronts.length} atividades</span>
        </header>

        {fronts.length ? (
          <div className="study-widget-activity-grid">
            {fronts.map((front) => {
              const urgency = deadlineUrgency(front.targetDate, todayIso);
              const counter = formatDayCounter(front.targetDate, todayIso);
              return (
                <article key={front.id} className={`study-widget-activity-card urgency-${urgency}`}>
                  <div className="study-widget-activity-main">
                    <p className="study-widget-activity-title">
                      <span aria-hidden="true">{front.icon}</span> {front.title}
                    </p>
                    <p className="study-widget-activity-copy">{counter.copy}</p>
                  </div>
                  <div className="study-widget-activity-side">
                    <span className={`study-widget-deadline-pill urgency-${urgency}`}>
                      {counter.badge}
                    </span>
                    <small>{formatBrazilianDate(front.targetDate)}</small>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="study-widget-main">
            <h3>Tudo concluído</h3>
            <p className="study-widget-meaning">As frentes ativas não têm prazos pendentes.</p>
          </div>
        )}

        <footer className="study-widget-footer">
          <span>
            {activeFronts.length} frente{activeFronts.length === 1 ? "" : "s"} ativa{activeFronts.length === 1 ? "" : "s"}
          </span>
          <Link href="/dissertation" prefetch={false} className="page-link inline muted">
            Abrir
          </Link>
        </footer>
      </article>
    );
  } catch {
    return (
      <article className="study-widget-card study-widget-card-space" aria-label="Prazos da dissertação">
        <header className="study-widget-head">
          <p className="study-widget-kicker">Dissertação</p>
          <span className="study-widget-tag">Indisponível</span>
        </header>
        <div className="study-widget-main">
          <h3>Não foi possível carregar</h3>
          <p className="study-widget-meaning">Tente abrir a página de dissertação novamente.</p>
        </div>
        <footer className="study-widget-footer">
          <span>Erro temporário</span>
          <Link href="/dissertation" prefetch={false} className="page-link inline muted">
            Abrir
          </Link>
        </footer>
      </article>
    );
  }
}
