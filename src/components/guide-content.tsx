import { Fragment, type CSSProperties, type ReactNode } from "react";
import {
  COLORS,
  inlineToText,
  plainToText,
  type ColorName,
  type GuideBlock,
  type InlineContent,
  type StyledText,
  type TableCell,
  type TextAlignment,
} from "@/lib/guide-content";
import { slugify } from "@/lib/slug";
import { MermaidDiagram } from "@/components/mermaid-diagram";

// Server-rendered guide body. Walks the validated block tree and emits
// semantic HTML styled by the .prose-guide rules in globals.css. React escapes
// every string and parseGuideContent already whitelisted every URL, so there
// is no HTML sanitizer and no dangerouslySetInnerHTML here (diagrams are the
// exception: MermaidDiagram renders Mermaid's own SVG, client-side).
//
// Editor headings render 1:1 (Heading 1 → <h1>), as decided in the plan.

type Ctx = { headingIds: Map<string, number> };

type ColorProps = {
  textColor?: ColorName;
  backgroundColor?: ColorName;
  textAlignment?: TextAlignment;
};

function styleFor(props: ColorProps): CSSProperties | undefined {
  const style: CSSProperties = {};
  if (props.textColor && props.textColor !== "default") {
    style.color = COLORS[props.textColor].text;
  }
  if (props.backgroundColor && props.backgroundColor !== "default") {
    style.backgroundColor = COLORS[props.backgroundColor].background;
  }
  if (props.textAlignment && props.textAlignment !== "left") {
    style.textAlign = props.textAlignment;
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

/** Stable, deduped anchor id so in-page links to headings keep working. */
function headingId(ctx: Ctx, text: string): string {
  const base = slugify(text) || "section";
  const seen = ctx.headingIds.get(base) ?? 0;
  ctx.headingIds.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen + 1}`;
}

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

// ---------------------------------------------------------------------------
// Inline content
// ---------------------------------------------------------------------------

function renderText(t: StyledText, key: number): ReactNode {
  const parts = t.text.split("\n");
  let node: ReactNode =
    parts.length === 1
      ? t.text
      : parts.flatMap((p, i) => (i === 0 ? [p] : [<br key={i} />, p]));
  const s = t.styles;
  if (s.code) node = <code>{node}</code>;
  if (s.italic) node = <em>{node}</em>;
  if (s.bold) node = <strong>{node}</strong>;
  if (s.underline) node = <u>{node}</u>;
  if (s.strike) node = <s>{node}</s>;
  const style = styleFor({
    textColor: s.textColor,
    backgroundColor: s.backgroundColor,
  });
  if (style) node = <span style={style}>{node}</span>;
  return <Fragment key={key}>{node}</Fragment>;
}

function renderInline(content: InlineContent[]): ReactNode {
  return content.map((c, i) =>
    c.type === "link" ? (
      <a
        key={i}
        href={c.href}
        {...(isExternal(c.href)
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
      >
        {c.content.map(renderText)}
      </a>
    ) : (
      renderText(c, i)
    ),
  );
}

/** An empty paragraph is the author's spacing; keep it visible. */
function renderParagraphContent(content: InlineContent[]): ReactNode {
  return inlineToText(content).length === 0 ? "\u00a0" : renderInline(content);
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

type ListItem = GuideBlock & {
  type: "bulletListItem" | "numberedListItem" | "checkListItem";
};

function isListItem(b: GuideBlock): b is ListItem {
  return (
    b.type === "bulletListItem" ||
    b.type === "numberedListItem" ||
    b.type === "checkListItem"
  );
}

/** Children of a non-list block render indented beneath it. */
function renderNested(block: GuideBlock, ctx: Ctx): ReactNode {
  if (block.children.length === 0) return null;
  return <div className="prose-nested">{renderBlocks(block.children, ctx)}</div>;
}

function renderList(items: ListItem[], ctx: Ctx): ReactNode {
  const first = items[0]!;
  const lis = items.map((item) => (
    <li key={item.id} style={styleFor(item.props)}>
      {item.type === "checkListItem" ? (
        <>
          <input type="checkbox" disabled checked={item.props.checked} />
          <span className={item.props.checked ? "checked" : undefined}>
            {renderInline(item.content)}
          </span>
        </>
      ) : (
        renderInline(item.content)
      )}
      {/* A list item's children render inside its <li>: nested lists. */}
      {item.children.length > 0 && renderBlocks(item.children, ctx)}
    </li>
  ));
  if (first.type === "numberedListItem") {
    const start = first.props.start;
    return (
      <ol key={first.id} start={start !== undefined && start !== 1 ? start : undefined}>
        {lis}
      </ol>
    );
  }
  return (
    <ul key={first.id} className={first.type === "checkListItem" ? "checklist" : undefined}>
      {lis}
    </ul>
  );
}

function renderTableCell(
  cell: TableCell,
  header: boolean,
  key: number,
): ReactNode {
  const Tag = header ? "th" : "td";
  return (
    <Tag
      key={key}
      colSpan={cell.props.colspan > 1 ? cell.props.colspan : undefined}
      rowSpan={cell.props.rowspan > 1 ? cell.props.rowspan : undefined}
      style={styleFor(cell.props)}
    >
      {renderInline(cell.content)}
    </Tag>
  );
}

function renderTable(block: GuideBlock & { type: "table" }): ReactNode {
  const { rows, headerRows = 0, headerCols = 0 } = block.content;
  const head = rows.slice(0, headerRows);
  const body = rows.slice(headerRows);
  const row = (r: { cells: TableCell[] }, i: number, inHead: boolean) => (
    <tr key={i}>
      {r.cells.map((cell, c) => renderTableCell(cell, inHead || c < headerCols, c))}
    </tr>
  );
  return (
    <table key={block.id} style={styleFor(block.props)}>
      {head.length > 0 && <thead>{head.map((r, i) => row(r, i, true))}</thead>}
      <tbody>{body.map((r, i) => row(r, i, false))}</tbody>
    </table>
  );
}

function renderMedia(
  block: GuideBlock & { type: "image" | "video" | "audio" },
): ReactNode {
  const { url, caption, name, showPreview, textAlignment } = block.props;
  // No url: the author never finished the upload/embed. Nothing to show.
  if (!url) return null;
  const width =
    "previewWidth" in block.props && block.props.previewWidth
      ? { width: block.props.previewWidth }
      : undefined;
  const align: CSSProperties | undefined =
    textAlignment === "center"
      ? { alignItems: "center" }
      : textAlignment === "right"
        ? { alignItems: "flex-end" }
        : undefined;

  let media: ReactNode;
  if (!showPreview) {
    media = (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {name || url}
      </a>
    );
  } else if (block.type === "image") {
    // Remote Blob URLs of unknown dimensions; next/image would need sizes.
    // eslint-disable-next-line @next/next/no-img-element
    media = <img src={url} alt={caption || name} style={width} />;
  } else if (block.type === "video") {
    media = <video controls preload="metadata" src={url} style={width} />;
  } else {
    media = <audio controls preload="metadata" src={url} />;
  }
  return (
    <figure key={block.id} className={`media-${block.type}`} style={align}>
      {media}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

function renderBlock(block: GuideBlock, ctx: Ctx): ReactNode {
  switch (block.type) {
    case "paragraph":
      return (
        <Fragment key={block.id}>
          <p style={styleFor(block.props)}>{renderParagraphContent(block.content)}</p>
          {renderNested(block, ctx)}
        </Fragment>
      );
    case "heading": {
      const Tag = `h${block.props.level}` as "h1" | "h2" | "h3";
      const heading = (
        <Tag id={headingId(ctx, inlineToText(block.content))} style={styleFor(block.props)}>
          {renderInline(block.content)}
        </Tag>
      );
      if (block.props.isToggleable) {
        return (
          <details key={block.id} className="toggle">
            <summary>{heading}</summary>
            {renderNested(block, ctx)}
          </details>
        );
      }
      return (
        <Fragment key={block.id}>
          {heading}
          {renderNested(block, ctx)}
        </Fragment>
      );
    }
    case "quote":
      return (
        <Fragment key={block.id}>
          <blockquote style={styleFor(block.props)}>{renderInline(block.content)}</blockquote>
          {renderNested(block, ctx)}
        </Fragment>
      );
    case "toggleListItem":
      return (
        <details key={block.id} className="toggle">
          <summary style={styleFor(block.props)}>{renderInline(block.content)}</summary>
          {renderNested(block, ctx)}
        </details>
      );
    case "codeBlock": {
      const lang = block.props.language;
      return (
        <Fragment key={block.id}>
          <pre>
            <code className={lang && lang !== "text" ? `language-${lang}` : undefined}>
              {plainToText(block.content)}
            </code>
          </pre>
          {renderNested(block, ctx)}
        </Fragment>
      );
    }
    case "diagram": {
      const source = plainToText(block.content).trim();
      return (
        <Fragment key={block.id}>
          {source && <MermaidDiagram source={source} />}
          {renderNested(block, ctx)}
        </Fragment>
      );
    }
    case "table":
      return (
        <Fragment key={block.id}>
          {renderTable(block)}
          {renderNested(block, ctx)}
        </Fragment>
      );
    case "divider":
      return (
        <Fragment key={block.id}>
          <hr />
          {renderNested(block, ctx)}
        </Fragment>
      );
    case "image":
    case "video":
    case "audio":
      return (
        <Fragment key={block.id}>
          {renderMedia(block)}
          {renderNested(block, ctx)}
        </Fragment>
      );
    case "bulletListItem":
    case "numberedListItem":
    case "checkListItem":
      // Grouped by renderBlocks; a lone item still renders as a one-item list.
      return renderList([block], ctx);
  }
}

/** Consecutive list items of one kind become a single <ul>/<ol>. */
function renderBlocks(blocks: GuideBlock[], ctx: Ctx): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i]!;
    if (isListItem(block)) {
      let j = i + 1;
      while (j < blocks.length && blocks[j]!.type === block.type) j++;
      out.push(renderList(blocks.slice(i, j) as ListItem[], ctx));
      i = j;
      continue;
    }
    out.push(renderBlock(block, ctx));
    i++;
  }
  return out;
}

/** BlockNote keeps a trailing empty paragraph; it isn't content. */
function trimTrailingEmpty(blocks: GuideBlock[]): GuideBlock[] {
  let end = blocks.length;
  while (end > 0) {
    const b = blocks[end - 1]!;
    if (b.type === "paragraph" && b.children.length === 0 && inlineToText(b.content).trim() === "") {
      end--;
    } else {
      break;
    }
  }
  return blocks.slice(0, end);
}

export function GuideContent({ blocks }: { blocks: GuideBlock[] }) {
  const ctx: Ctx = { headingIds: new Map() };
  return <>{renderBlocks(trimTrailingEmpty(blocks), ctx)}</>;
}
