'use client';

import React, { useMemo } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Zero-dependency markdown renderer.
 * Handles: headings, bold, italic, inline code, code blocks,
 * unordered/ordered lists, blockquotes, horizontal rules, links, tables.
 */
export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const html = useMemo(() => renderMarkdown(content), [content]);
  return (
    <div
      className={`markdown-content ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInline(text: string): string {
  let result = escapeHtml(text);
  // Inline code (must be before bold/italic to avoid conflicts)
  result = result.replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-xs font-mono">$1</code>');
  // Bold + italic
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
  // Italic
  result = result.replace(/\*(.+?)\*/g, '<em class="italic">$1</em>');
  // Strikethrough
  result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // Links
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-emerald-600 underline hover:text-emerald-700">$1</a>');
  return result;
}

function renderMarkdown(content: string): string {
  const lines = content.split('\n');
  const output: string[] = [];
  let inCodeBlock = false;
  let inTable = false;
  let tableRows: string[] = [];
  let inUl = false;
  let inOl = false;
  let inBlockquote = false;

  const closeUl = () => { if (inUl) { output.push('</ul>'); inUl = false; } };
  const closeOl = () => { if (inOl) { output.push('</ol>'); inOl = false; } };
  const closeList = () => { closeUl(); closeOl(); };
  const closeBq = () => { if (inBlockquote) { output.push('</blockquote>'); inBlockquote = false; } };
  const flushTable = () => {
    if (inTable && tableRows.length > 0) {
      output.push('<div class="my-2 overflow-x-auto"><table class="w-full text-xs border-collapse">');
      tableRows.forEach((row, i) => {
        const tag = i === 0 ? 'th' : 'td';
        const cls = i === 0
          ? ` class="px-2 py-1 text-left font-semibold border-b border-border"`
          : ` class="px-2 py-1 border-b border-border/50"`;
        const cells = row.split('|').map(c => c.trim()).filter(Boolean);
        output.push(`<tr>${cells.map(c => `<${tag}${cls}>${renderInline(c)}</${tag}>`).join('')}</tr>`);
      });
      output.push('</table></div>');
      tableRows = [];
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        output.push('</code></pre>');
        inCodeBlock = false;
      } else {
        closeList(); closeBq(); flushTable();
        const lang = line.trimStart().slice(3).trim();
        output.push(`<pre class="my-2 overflow-x-auto rounded-md bg-muted p-2"><code class="text-xs${lang ? ` language-${escapeHtml(lang)}` : ''}">`);
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      output.push(escapeHtml(line));
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      closeList(); closeBq(); flushTable();
      continue;
    }

    // Table detection: line contains | and previous or next line contains |
    const isTableSeparator = /^\|?\s*[-:]+[-|:\s]+\s*\|?$/.test(line.trim());
    const isTableRow = line.includes('|') && !line.trimStart().startsWith('-');
    if (isTableRow || (isTableSeparator && inTable)) {
      if (isTableSeparator) continue; // skip separator row
      closeList(); closeBq();
      inTable = true;
      tableRows.push(line.trim().replace(/^\|/, '').replace(/\|$/, ''));
      continue;
    } else if (inTable && !isTableRow) {
      flushTable();
    }

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
      closeList(); closeBq();
      output.push('<hr class="my-2 border-border"/>');
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      closeList(); closeBq();
      const level = headingMatch[1].length;
      const text = renderInline(headingMatch[2]);
      const sizeClass = level === 1 ? 'text-lg font-bold mb-2 mt-3 first:mt-0'
        : level === 2 ? 'text-base font-bold mb-2 mt-3 first:mt-0'
        : 'text-sm font-bold mb-1 mt-2 first:mt-0';
      output.push(`<h${level} class="${sizeClass}">${text}</h${level}>`);
      continue;
    }

    // Blockquote
    if (line.trimStart().startsWith('>')) {
      closeList();
      if (!inBlockquote) {
        inBlockquote = true;
        output.push('<blockquote class="border-l-2 border-muted-foreground/30 pl-3 my-2 text-muted-foreground">');
      }
      output.push(`<p class="mb-1 last:mb-0 leading-relaxed">${renderInline(line.trimStart().slice(1).trim())}</p>`);
      continue;
    } else if (inBlockquote) {
      closeBq();
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)([-*+])\s+(.+)/);
    if (ulMatch) {
      closeOl();
      if (!inUl) {
        inUl = true;
        output.push('<ul class="list-disc pl-5 mb-2 space-y-0.5">');
      }
      output.push(`<li class="leading-relaxed">${renderInline(ulMatch[3])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)(\d+[.)])\s+(.+)/);
    if (olMatch) {
      closeUl();
      if (!inOl) {
        inOl = true;
        output.push('<ol class="list-decimal pl-5 mb-2 space-y-0.5">');
      }
      output.push(`<li class="leading-relaxed">${renderInline(olMatch[3])}</li>`);
      continue;
    }

    // Regular paragraph
    closeList();
    flushTable();
    output.push(`<p class="mb-2 last:mb-0 leading-relaxed">${renderInline(line)}</p>`);
  }

  // Close any remaining open blocks
  closeList();
  closeBq();
  flushTable();
  if (inCodeBlock) output.push('</code></pre>');

  return output.join('\n');
}
