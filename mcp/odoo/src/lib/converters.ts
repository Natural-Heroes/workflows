/**
 * HTML ↔ Markdown conversion utilities.
 *
 * Used by Knowledge tools to convert between Odoo's HTML storage
 * format and LLM-friendly Markdown.
 */

import TurndownService from 'turndown';
import { marked } from 'marked';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

/**
 * Convert HTML to Markdown (for reading Odoo content).
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return '';
  return turndownService.turndown(html);
}

/**
 * Convert Markdown to HTML (for writing to Odoo).
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  return marked(markdown) as string;
}
