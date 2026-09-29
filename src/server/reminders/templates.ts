import type { Email } from "@/server/notify/email";

/**
 * Testi delle email. Tono di coordinamento, non da datore di lavoro: i collaboratori sono
 * partite IVA (nota del 16 set). Testo semplice + HTML minimale, niente immagini.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function html(title: string, paragraphs: string[], cta: { label: string; url: string }, footer: string) {
  return `<!doctype html><html lang="it"><body style="margin:0;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#11151c">
<div style="max-width:520px;margin:0 auto;padding:24px">
<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5a6372;margin:0 0 8px">OCRA</p>
<h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${p}</p>`).join("\n")}
<p style="margin:20px 0"><a href="${esc(cta.url)}" style="background:#11151c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:bold;display:inline-block">${esc(cta.label)}</a></p>
<p style="font-size:12px;color:#5a6372;margin:24px 0 0">${esc(footer)}</p>
</div></body></html>`;
}

export type TaskMail = {
  taskTitle: string;
  projectName: string;
  companyName: string;
  dueLabel: string;
  overdue: boolean;
  url: string;
};

export function reminderEmail(to: { email: string; name: string }, t: TaskMail, level: 1 | 2): Email {
  const first = to.name.split(" ")[0];
  const when = t.overdue ? `era in scadenza ${t.dueLabel}` : `scade oggi (${t.dueLabel})`;
  const subject = level === 1 ? `Promemoria: ${t.taskTitle}` : `Secondo promemoria: ${t.taskTitle}`;
  const intro =
    level === 1
      ? `Ciao ${first}, un promemoria sul task «${t.taskTitle}» del progetto ${t.projectName}: ${when}.`
      : `Ciao ${first}, il task «${t.taskTitle}» (${t.projectName}) risulta ancora aperto: ${when}.`;
  const how =
    "Quando l'hai consegnato, chiudilo su OCRA con il link al file o una nota. Se c'è un impedimento, usa «Non posso» e scrivi il motivo: arriva al project manager e i promemoria si fermano.";
  return {
    to: to.email,
    subject,
    text: `${intro}\n\n${how}\n\nApri il task: ${t.url}\n\n— ${t.companyName}`,
    html: html(subject, [esc(intro), esc(how)], { label: "Apri il task", url: t.url }, `${t.companyName} · messaggio automatico di OCRA`),
  };
}

export function toManagerEmail(
  to: { email: string; name: string },
  items: Array<TaskMail & { assigneeName: string; note?: string | null }>,
  kind: "AL_PM" | "NON_POSSO" | "AL_CEO",
  url: string,
): Email {
  const first = to.name.split(" ")[0];
  const subject =
    kind === "NON_POSSO"
      ? `${items[0]?.assigneeName} non può completare «${items[0]?.taskTitle}»`
      : kind === "AL_CEO"
        ? `Da decidere: ${items.length === 1 ? `«${items[0]?.taskTitle}»` : `${items.length} task`}`
        : `${items.length === 1 ? "1 task scaduto" : `${items.length} task scaduti`} da gestire`;
  const intro =
    kind === "NON_POSSO"
      ? `Ciao ${first}, è stato segnalato un impedimento. I promemoria automatici su questo task sono fermi.`
      : kind === "AL_CEO"
        ? `Ciao ${first}, il project manager ti passa questi task per una decisione (bloccare, spostare la scadenza o riassegnare).`
        : `Ciao ${first}, questi task hanno già ricevuto due promemoria e sono ancora aperti.`;
  const lines = items.map(
    (i) => `• ${i.taskTitle} — ${i.assigneeName} · ${i.projectName} · ${i.overdue ? "scaduto" : "scade"} ${i.dueLabel}${i.note ? `\n  Motivo: ${i.note}` : ""}`,
  );
  return {
    to: to.email,
    subject,
    text: `${intro}\n\n${lines.join("\n")}\n\nRichiami: ${url}`,
    html: html(
      subject,
      [
        esc(intro),
        items
          .map(
            (i) =>
              `<strong>${esc(i.taskTitle)}</strong><br><span style="color:#5a6372">${esc(i.assigneeName)} · ${esc(i.projectName)} · ${i.overdue ? "scaduto" : "scade"} ${esc(i.dueLabel)}</span>${i.note ? `<br>Motivo: <em>${esc(i.note)}</em>` : ""}`,
          )
          .join("<br><br>"),
      ],
      { label: "Apri i richiami", url },
      "Messaggio automatico di OCRA",
    ),
  };
}

export function nudgeEmail(to: { email: string; name: string }, t: TaskMail, from: string, message: string | null): Email {
  const first = to.name.split(" ")[0];
  const subject = `${from} ti scrive su «${t.taskTitle}»`;
  const intro = `Ciao ${first}, ${from} ti chiede un aggiornamento sul task «${t.taskTitle}» (${t.projectName}, scadenza ${t.dueLabel}).`;
  return {
    to: to.email,
    subject,
    text: `${intro}${message ? `\n\n«${message}»` : ""}\n\nApri il task: ${t.url}`,
    html: html(subject, [esc(intro), ...(message ? [`«${esc(message)}»`] : [])], { label: "Apri il task", url: t.url }, t.companyName),
  };
}
