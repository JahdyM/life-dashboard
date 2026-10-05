function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Starting a focused task review is deterministic. Handling it locally keeps
 * the first question available even when a free AI provider is busy.
 */
export function requestsTodayTaskReview(value: string) {
  const text = normalize(value);
  const mentionsTask = /\b(task|tasks|tarefa|tarefas)\b/.test(text);
  const mentionsToday = /\b(hoje|today)\b/.test(text);
  const mentionsReview = /\b(revis|calibr|ajust|corrig|organ|tag|tags|categoria|categorias)\w*/.test(text);
  return mentionsTask && mentionsToday && mentionsReview;
}
