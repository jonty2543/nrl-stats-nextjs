import type { ReactNode } from "react";

interface MarkdownContentProps {
  content: string;
}

type MarkdownBlock =
  | { type: "text"; content: string }
  | { type: "code"; language: string | null; content: string };

function parseBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const fencePattern = /```([a-zA-Z0-9_-]+)?\r?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(content)) !== null) {
    const textBefore = content.slice(lastIndex, match.index);
    blocks.push(
      ...textBefore
        .split(/\r?\n\s*\r?\n/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => ({ type: "text" as const, content: block }))
    );

    blocks.push({
      type: "code",
      language: match[1]?.trim() || null,
      content: match[2].replace(/\s+$/, ""),
    });

    lastIndex = fencePattern.lastIndex;
  }

  blocks.push(
    ...content
      .slice(lastIndex)
      .split(/\r?\n\s*\r?\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => ({ type: "text" as const, content: block }))
  );

  return blocks;
}

function safeHref(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("/") || /^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

function renderInline(value: string, keyPrefix: string): ReactNode[] {
  const parts = value.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g);

  return parts.map((part, index) => {
    if (!part) return null;

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const href = safeHref(linkMatch[2]);
      if (!href) return linkMatch[1];
      return (
        <a
          key={`${keyPrefix}-link-${index}`}
          href={href}
          target={href.startsWith("http") ? "_blank" : undefined}
          rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
          className="font-semibold text-nrl-accent underline decoration-nrl-accent/30 underline-offset-4 transition-colors hover:text-nrl-accent/80"
        >
          {linkMatch[1]}
        </a>
      );
    }

    if (/^`[^`]+`$/.test(part)) {
      return (
        <code
          key={`${keyPrefix}-code-${index}`}
          className="rounded border border-nrl-border bg-nrl-panel-2 px-1.5 py-0.5 font-mono text-[0.9em] text-nrl-text"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={`${keyPrefix}-strong-${index}`}>{part.slice(2, -2)}</strong>;
    }

    if (/^\*[^*]+\*$/.test(part)) {
      return <em key={`${keyPrefix}-em-${index}`}>{part.slice(1, -1)}</em>;
    }

    return part;
  });
}

function renderTextLines(value: string, keyPrefix: string) {
  return value.split(/\r?\n/).map((line, index, lines) => (
    <span key={`${keyPrefix}-line-${index}`}>
      {renderInline(line, `${keyPrefix}-line-${index}`)}
      {index < lines.length - 1 ? <br /> : null}
    </span>
  ));
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  const blocks = parseBlocks(content);

  return (
    <div className="space-y-5 text-sm leading-7 text-nrl-text/88 sm:text-base">
      {blocks.map((block, index) => {
        if (block.type === "code") {
          const visibleLanguage = block.language && block.language.toLowerCase() !== "text" ? block.language : null;
          return (
            <div key={`block-${index}`} className="overflow-hidden rounded-lg border border-nrl-border bg-[#0d1224]">
              {visibleLanguage ? (
                <div className="border-b border-nrl-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-nrl-muted">
                  {visibleLanguage}
                </div>
              ) : null}
              <pre className="overflow-x-auto p-3 text-xs leading-6 text-nrl-text sm:text-sm">
                <code>{block.content}</code>
              </pre>
            </div>
          );
        }

        const textBlock = block.content;
        const headingMatch = textBlock.match(/^(#{1,3})\s+(.+)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const text = renderInline(headingMatch[2], `heading-${index}`);
          if (level === 1) {
            return <h2 key={`block-${index}`} className="pt-2 text-2xl font-bold text-nrl-text">{text}</h2>;
          }
          if (level === 2) {
            return <h3 key={`block-${index}`} className="pt-2 text-xl font-bold text-nrl-text">{text}</h3>;
          }
          return <h4 key={`block-${index}`} className="pt-1 text-lg font-bold text-nrl-text">{text}</h4>;
        }

        const lines = textBlock.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const bulletItems = lines.map((line) => line.match(/^[-*]\s+(.+)$/)?.[1]);
        if (bulletItems.length > 0 && bulletItems.every(Boolean)) {
          return (
            <ul key={`block-${index}`} className="list-disc space-y-2 pl-5">
              {bulletItems.map((item, itemIndex) => (
                <li key={`block-${index}-item-${itemIndex}`}>
                  {renderInline(item ?? "", `block-${index}-item-${itemIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        const numberedItems = lines.map((line) => line.match(/^\d+\.\s+(.+)$/)?.[1]);
        if (numberedItems.length > 0 && numberedItems.every(Boolean)) {
          return (
            <ol key={`block-${index}`} className="list-decimal space-y-2 pl-5">
              {numberedItems.map((item, itemIndex) => (
                <li key={`block-${index}-item-${itemIndex}`}>
                  {renderInline(item ?? "", `block-${index}-item-${itemIndex}`)}
                </li>
              ))}
            </ol>
          );
        }

        return <p key={`block-${index}`}>{renderTextLines(textBlock, `block-${index}`)}</p>;
      })}
    </div>
  );
}
