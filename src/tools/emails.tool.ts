/**
 * MCP tools: list_emails, get_email, search_emails
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type ImapService from '../services/imap.service.js';
import type { EmailMeta } from '../types/index.js';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatEmailMeta(email: EmailMeta): string {
  const flags = [
    email.seen ? '' : '🔵',
    email.flagged ? '⭐' : '',
    email.answered ? '↩️' : '',
    email.hasAttachments ? '📎' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const from = email.from.name ? `${email.from.name} <${email.from.address}>` : email.from.address;
  const labelStr = email.labels.length > 0 ? `\n  🏷️ ${email.labels.join(', ')}` : '';

  return `[${email.id}] ${flags} ${email.subject}\n  From: ${from} | ${email.date}${labelStr}${email.preview ? `\n  ${email.preview}` : ''}`;
}

export default function registerEmailsTools(server: McpServer, imapService: ImapService): void {
  // ---------------------------------------------------------------------------
  // list_emails
  // ---------------------------------------------------------------------------
  server.tool(
    'list_emails',
    'List emails in a mailbox with optional filters. Returns paginated results with metadata. Use get_email with the returned ID to read full content.',
    {
      account: z.string().describe('Account name from list_accounts'),
      mailbox: z.string().default('INBOX').describe('Mailbox path (default: INBOX)'),
      page: z.number().int().min(1).default(1).describe('Page number'),
      pageSize: z.number().int().min(1).max(100).default(20).describe('Results per page'),
      since: z.string().optional().describe('Show emails after this date (ISO 8601)'),
      before: z.string().optional().describe('Show emails before this date (ISO 8601)'),
      from: z.string().optional().describe('Filter by sender address or name'),
      subject: z.string().optional().describe('Filter by subject keyword'),
      seen: z.boolean().optional().describe('Filter: true=read, false=unread'),
      flagged: z.boolean().optional().describe('Filter: true=flagged, false=unflagged'),
    },
    { readOnlyHint: true, destructiveHint: false },
    async (params) => {
      try {
        const result = await imapService.listEmails(params.account, params);

        if (result.items.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'No emails found matching the criteria.',
              },
            ],
          };
        }

        const header = `📬 ${result.total} emails (page ${result.page}/${Math.ceil(result.total / result.pageSize)})${result.hasMore ? ' — more pages available' : ''}\n`;
        const emails = result.items.map(formatEmailMeta).join('\n\n');

        return {
          content: [{ type: 'text' as const, text: `${header}\n${emails}` }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Failed to list emails: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // ---------------------------------------------------------------------------
  // get_email
  // ---------------------------------------------------------------------------
  server.tool(
    'get_email',
    'Get the full content of a specific email by ID. Use list_emails first to find email IDs.',
    {
      account: z.string().describe('Account name from list_accounts'),
      emailId: z.string().describe('Email ID from list_emails'),
      mailbox: z.string().default('INBOX').describe('Mailbox path (default: INBOX)'),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ account, emailId, mailbox }) => {
      try {
        const email = await imapService.getEmail(account, emailId, mailbox);

        const parts: string[] = [
          `📧 ${email.subject}`,
          `From: ${email.from.name ? `${email.from.name} <${email.from.address}>` : email.from.address}`,
          `To: ${email.to.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(', ')}`,
        ];

        if (email.cc?.length) {
          parts.push(`CC: ${email.cc.map((a) => a.address).join(', ')}`);
        }

        parts.push(`Date: ${email.date}`);
        parts.push(`Message-ID: ${email.messageId}`);

        if (email.inReplyTo) {
          parts.push(`In-Reply-To: ${email.inReplyTo}`);
        }

        if (email.attachments.length > 0) {
          parts.push(
            `📎 Attachments: ${email.attachments.map((a) => `${a.filename} (${a.mimeType}, ${formatSize(a.size)})`).join(', ')}`,
          );
        }

        parts.push('', '--- Body ---', '');
        parts.push(email.bodyText ?? email.bodyHtml ?? '(no content)');

        return {
          content: [{ type: 'text' as const, text: parts.join('\n') }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Failed to get email: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // ---------------------------------------------------------------------------
  // search_emails
  // ---------------------------------------------------------------------------
  server.tool(
    'search_emails',
    'Search emails by keyword across subject, sender, and body. Supports additional filters for recipients, attachments, size, and reply status. Returns paginated results.',
    {
      account: z.string().describe('Account name from list_accounts'),
      query: z.string().describe('Search keyword'),
      mailbox: z.string().default('INBOX').describe('Mailbox path (default: INBOX)'),
      page: z.number().int().min(1).default(1).describe('Page number'),
      pageSize: z.number().int().min(1).max(100).default(20).describe('Results per page'),
      to: z.string().optional().describe('Filter by recipient address'),
      has_attachment: z
        .boolean()
        .optional()
        .describe('Filter: true=has attachments, false=no attachments'),
      larger_than: z.number().optional().describe('Minimum email size in KB'),
      smaller_than: z.number().optional().describe('Maximum email size in KB'),
      answered: z.boolean().optional().describe('Filter: true=replied, false=not replied'),
    },
    { readOnlyHint: true, destructiveHint: false },
    async (params) => {
      try {
        const result = await imapService.searchEmails(params.account, params.query, {
          mailbox: params.mailbox,
          page: params.page,
          pageSize: params.pageSize,
          to: params.to,
          hasAttachment: params.has_attachment,
          largerThan: params.larger_than,
          smallerThan: params.smaller_than,
          answered: params.answered,
        });

        if (result.items.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `No emails found matching "${params.query}".`,
              },
            ],
          };
        }

        const header = `🔍 ${result.total} results for "${params.query}" (page ${result.page}/${Math.ceil(result.total / result.pageSize)})\n`;
        const emails = result.items.map(formatEmailMeta).join('\n\n');

        return {
          content: [{ type: 'text' as const, text: `${header}\n${emails}` }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Failed to search emails: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
