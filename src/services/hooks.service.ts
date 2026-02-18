/**
 * AI Hooks Service — intelligent email triage via MCP sampling.
 *
 * Listens for new email events on the event bus and:
 * - Batches arrivals within a configurable delay window
 * - Requests AI triage via `sampling/createMessage` if supported
 * - Auto-applies labels and flags based on AI response
 * - Falls back to logging if sampling is unavailable
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { mcpLog } from '../logging.js';
import type { EmailMeta, HooksConfig } from '../types/index.js';
import type { NewEmailEvent } from './event-bus.js';
import eventBus from './event-bus.js';
import type ImapService from './imap.service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TriageResult {
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  labels?: string[];
  flag?: boolean;
  action?: string;
}

interface BatchEmail {
  account: string;
  mailbox: string;
  meta: EmailMeta;
}

// ---------------------------------------------------------------------------
// HooksService
// ---------------------------------------------------------------------------

export default class HooksService {
  private config: HooksConfig;

  private imapService: ImapService;

  private lowLevelServer: Server | null = null;

  private samplingSupported = false;

  private pendingEmails: BatchEmail[] = [];

  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  private rateCounter = 0;

  private rateResetTimer: ReturnType<typeof setInterval> | null = null;

  private static readonly MAX_SAMPLING_PER_MIN = 10;

  constructor(config: HooksConfig, imapService: ImapService) {
    this.config = config;
    this.imapService = imapService;
  }

  /**
   * Start listening for email events.
   * Call after MCP server is connected so we can access the low-level server.
   */
  start(lowLevelServer: Server, clientCapabilities: { sampling?: boolean }): void {
    this.lowLevelServer = lowLevelServer;
    this.samplingSupported = clientCapabilities.sampling === true;

    if (this.config.onNewEmail === 'none') return;

    eventBus.on('email:new', (event: NewEmailEvent) => {
      this.onNewEmail(event);
    });

    // Rate limit reset every 60s
    this.rateResetTimer = setInterval(() => {
      this.rateCounter = 0;
    }, 60_000);

    mcpLog(
      'info',
      'hooks',
      `Hooks active: mode=${this.config.onNewEmail}, sampling=${this.samplingSupported ? 'yes' : 'no'}`,
    ).catch(() => {});
  }

  stop(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    this.pendingEmails = [];
    if (this.rateResetTimer) {
      clearInterval(this.rateResetTimer);
      this.rateResetTimer = null;
    }
    eventBus.removeAllListeners('email:new');
  }

  // -------------------------------------------------------------------------
  // Event handling + batching
  // -------------------------------------------------------------------------

  private onNewEmail(event: NewEmailEvent): void {
    const items = event.emails.map((meta) => ({
      account: event.account,
      mailbox: event.mailbox,
      meta,
    }));
    this.pendingEmails.push(...items);

    this.batchTimer ??= setTimeout(() => {
      this.flushBatch().catch(() => {});
    }, this.config.batchDelay * 1000);
  }

  private async flushBatch(): Promise<void> {
    this.batchTimer = null;
    const batch = [...this.pendingEmails];
    this.pendingEmails = [];
    if (batch.length === 0) return;

    await this.sendResourceUpdates(batch);

    if (this.config.onNewEmail === 'triage' && this.samplingSupported) {
      await this.triageBatch(batch);
    } else {
      await HooksService.notifyBatch(batch);
    }
  }

  // -------------------------------------------------------------------------
  // Resource subscription notifications
  // -------------------------------------------------------------------------

  private async sendResourceUpdates(emails: BatchEmail[]): Promise<void> {
    if (!this.lowLevelServer) return;

    const accounts = [...new Set(emails.map((e) => e.account))];
    const srv = this.lowLevelServer;

    const ops = accounts.flatMap((account) => [
      srv.sendResourceUpdated({ uri: `email://${account}/unread` }).catch(() => {}),
      srv.sendResourceUpdated({ uri: `email://${account}/mailboxes` }).catch(() => {}),
    ]);
    await Promise.allSettled(ops);
  }

  // -------------------------------------------------------------------------
  // Notify mode (log-only)
  // -------------------------------------------------------------------------

  private static async notifyBatch(emails: BatchEmail[]): Promise<void> {
    const ops = emails.map(async (e) => {
      const msg = `📬 New email in ${e.account}/${e.mailbox}: "${e.meta.subject}" from ${e.meta.from.address}`;
      return mcpLog('info', 'hooks', msg);
    });
    await Promise.allSettled(ops);
  }

  // -------------------------------------------------------------------------
  // Triage mode (AI sampling)
  // -------------------------------------------------------------------------

  private async triageBatch(emails: BatchEmail[]): Promise<void> {
    if (this.rateCounter >= HooksService.MAX_SAMPLING_PER_MIN) {
      await mcpLog('warning', 'hooks', 'Sampling rate limit reached — falling back to notify');
      await HooksService.notifyBatch(emails);
      return;
    }

    this.rateCounter += 1;

    const emailSummaries = emails.map((e, i) => HooksService.formatEmailSummary(e, i)).join('\n\n');

    const prompt = HooksService.buildTriagePrompt(emails.length, emailSummaries);

    try {
      const srv = this.lowLevelServer;
      if (!srv) throw new Error('Server not available');

      const result = await srv.createMessage({
        messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
        maxTokens: 1000,
        modelPreferences: {
          hints: [{ name: 'fast' }],
          speedPriority: 0.8,
          intelligencePriority: 0.5,
        },
      });

      const text = result.model && result.content?.type === 'text' ? result.content.text : '';

      const triageResults = HooksService.parseTriageResponse(text, emails.length);
      await this.applyTriageResults(emails, triageResults);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await mcpLog('warning', 'hooks', `Sampling failed: ${errMsg} — falling back to notify`);
      await HooksService.notifyBatch(emails);
    }
  }

  private static formatEmailSummary(e: BatchEmail, index: number): string {
    const flagIcons = [
      e.meta.flagged ? '⭐' : '',
      e.meta.seen ? '👁️' : '🆕',
      e.meta.hasAttachments ? '📎' : '',
    ].join('');
    return (
      `[${index + 1}] From: ${e.meta.from.name ?? e.meta.from.address}\n` +
      `    Subject: ${e.meta.subject}\n` +
      `    Date: ${e.meta.date}\n` +
      `    Flags: ${flagIcons}`
    );
  }

  private static buildTriagePrompt(count: number, summaries: string): string {
    return (
      `You are an email triage assistant. Analyze these ${count} new email(s) and respond with a JSON array ` +
      `(one object per email, in order). Each object should have:\n` +
      `- "priority": "urgent" | "high" | "normal" | "low"\n` +
      `- "labels": string[] (suggested labels, e.g. ["Meeting", "Finance"])\n` +
      `- "flag": boolean (true if urgent/important)\n` +
      `- "action": string (brief description of suggested action)\n\n` +
      `Emails:\n${summaries}\n\n` +
      `Respond ONLY with the JSON array, no markdown or extra text.`
    );
  }

  // -------------------------------------------------------------------------
  // Triage application
  // -------------------------------------------------------------------------

  private async applyTriageResults(emails: BatchEmail[], results: TriageResult[]): Promise<void> {
    const ops = emails.map(async (email, i) => this.applySingleTriage(email, results[i] ?? {}));
    await Promise.allSettled(ops);
  }

  private async applySingleTriage(email: BatchEmail, triage: TriageResult): Promise<void> {
    // Auto-label
    if (this.config.autoLabel && triage.labels?.length) {
      const labelOps = triage.labels.map(async (label) => {
        try {
          await this.imapService.addLabel(email.account, email.mailbox, email.meta.id, label);
        } catch {
          await mcpLog(
            'warning',
            'hooks',
            `Could not add label "${label}" to email ${email.meta.id}`,
          );
        }
      });
      await Promise.allSettled(labelOps);
    }

    // Auto-flag
    if (this.config.autoFlag && triage.flag) {
      try {
        await this.imapService.setFlags(email.account, email.mailbox, email.meta.id, 'flag');
      } catch {
        await mcpLog('warning', 'hooks', `Could not flag email ${email.meta.id}`);
      }
    }

    const labelStr = triage.labels?.length ? ` → labels: ${triage.labels.join(', ')}` : '';
    const flagStr = triage.flag ? ' ⭐' : '';
    await mcpLog(
      'info',
      'hooks',
      `📬 [${triage.priority ?? 'normal'}] "${email.meta.subject}" from ${email.meta.from.address}${flagStr}${labelStr}`,
    );
    if (triage.action) {
      await mcpLog('info', 'hooks', `   Action: ${triage.action}`);
    }
  }

  // -------------------------------------------------------------------------
  // Response parsing
  // -------------------------------------------------------------------------

  private static parseTriageResponse(text: string, expectedCount: number): TriageResult[] {
    try {
      const cleaned = text.replace(/```(?:json)?\n?/g, '').trim();
      const parsed = JSON.parse(cleaned) as unknown;

      if (Array.isArray(parsed)) {
        return parsed.slice(0, expectedCount).map(HooksService.sanitizeTriageResult);
      }
      if (typeof parsed === 'object' && parsed !== null) {
        return [HooksService.sanitizeTriageResult(parsed)];
      }
    } catch {
      // Parse failure — return empty results
    }
    return Array.from({ length: expectedCount }, () => ({}));
  }

  private static sanitizeTriageResult(raw: unknown): TriageResult {
    if (typeof raw !== 'object' || raw === null) return {};
    const obj = raw as Record<string, unknown>;
    return {
      priority: ['urgent', 'high', 'normal', 'low'].includes(obj.priority as string)
        ? (obj.priority as TriageResult['priority'])
        : undefined,
      labels: Array.isArray(obj.labels)
        ? obj.labels.filter((l): l is string => typeof l === 'string').slice(0, 5)
        : undefined,
      flag: typeof obj.flag === 'boolean' ? obj.flag : undefined,
      action: typeof obj.action === 'string' ? obj.action.slice(0, 200) : undefined,
    };
  }
}
