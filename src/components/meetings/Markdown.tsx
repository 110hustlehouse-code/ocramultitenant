import { Fragment } from "react";

/**
 * Markdown minimo per i verbali (titoli, elenchi, grassetto). Niente HTML grezzo:
 * il testo arriva dall'AI e viene sempre reso come testo.
 */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

export function Markdown({ source }: { source: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={blocks.length} className="list-disc space-y-1 pl-5">
          {list.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of source.split("\n")) {
    const line = raw.trimEnd();
    const item = line.match(/^\s*[-*]\s+(.*)$/) ?? line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (item) {
      list.push(item[1]!);
      continue;
    }
    flush();
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push(
        <h3 key={blocks.length} className="label pt-2">
          {heading[2]}
        </h3>,
      );
    } else if (line.trim()) {
      blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  flush();
  return <div className="space-y-2 text-sm leading-relaxed">{blocks}</div>;
}
