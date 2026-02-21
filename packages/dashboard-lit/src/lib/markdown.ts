import { markdownToHTML } from "@create-markdown/preview";

const CACHE_LIMIT = 120;
const cache = new Map<string, string>();

export function renderMarkdown(markdown: string): string {
  const input = markdown.trim();
  if (!input) {
    return "";
  }

  const cached = cache.get(input);
  if (cached !== undefined) {
    cache.delete(input);
    cache.set(input, cached);
    return cached;
  }

  const html = markdownToHTML(input, {
    sanitize: true,
    linkTarget: "_blank",
  });

  cache.set(input, html);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest) {
      cache.delete(oldest);
    }
  }

  return html;
}
