import Link from "next/link";
import {
  collectDissertationDeadlines,
  formatBrazilianDate,
  formatRelativeDeadline,
  isoDateDiffDays,
} from "@/lib/dissertation";
import { loadDissertationProject } from "@/lib/server/dissertation";

type DeadlineUrgency = "overdue" | "soon" | "near" | "later";

function deadlineUrgency(dateIso: string, todayIso: string): DeadlineUrgency {
  const days = isoDateDiffDays(todayIso, dateIso);
  if (days < 0) return "overdue";
  if (days <= 3) return "soon";
  if (days <= 14) return "near";
  return "later";
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
    const deadlines = collectDissertationDeadlines(project)
      .filter((item) => !item.done)
      .slice(0, 5);

    return (
      <article className="study-widget-card study-widget-card-space" aria-label="Prazos da dissertação">
        <header className="study-widget-head">
          <p className="study-widget-kicker">Dissertação</p>
          <span className="study-widget-tag">{deadlines.length} prazos</span>
        </header>

        {deadlines.length ? (
          <ul className="study-widget-deadline-list">
            {deadlines.map((item) => {
              const urgency = deadlineUrgency(item.date, todayIso);
              return (
                <li key={item.id} className={`study-widget-deadline-item urgency-${urgency}`}>
                  <div className="study-widget-deadline-main">
                    <p className="study-widget-deadline-title">
                      <span aria-hidden="true">{item.frontIcon}</span> {item.title}
                    </p>
                    <p className="study-widget-deadline-meta">{item.frontTitle}</p>
                  </div>
                  <div className="study-widget-deadline-side">
                    <span className={`study-widget-deadline-pill urgency-${urgency}`}>
                      {formatRelativeDeadline(item.date, todayIso)}
                    </span>
                    <small>{formatBrazilianDate(item.date)}</small>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="study-widget-main">
            <h3>Sem prazos ativos</h3>
            <p className="study-widget-meaning">Atualize as etapas na página da dissertação para acompanhar aqui.</p>
          </div>
        )}

        <footer className="study-widget-footer">
          <span>{project.fronts.length} frentes</span>
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
