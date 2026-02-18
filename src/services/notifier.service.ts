/**
 * NotifierService — multi-channel notification dispatcher.
 *
 * Routes email alerts to the appropriate channels based on urgency:
 * - Desktop notifications (native OS commands — zero npm deps)
 * - Sound alerts (via OS notification sound)
 * - MCP log level escalation (urgent→alert, high→warning, …)
 * - Webhook dispatch (HTTP POST to Slack/Discord/ntfy.sh/etc.)
 *
 * All channels are opt-in and disabled by default.
 */

import { exec } from 'node:child_process';
import { mcpLog } from '../logging.js';

import type { AlertsConfig } from '../types/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UrgencyLevel = 'urgent' | 'high' | 'normal' | 'low';

export interface AlertPayload {
  account: string;
  sender: { name?: string; address: string };
  subject: string;
  priority: UrgencyLevel;
  labels?: string[];
  ruleName?: string;
}

// ---------------------------------------------------------------------------
// Priority ordering for threshold comparison
// ---------------------------------------------------------------------------

const URGENCY_ORDER: Record<UrgencyLevel, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

const MCP_LOG_LEVEL_MAP: Record<UrgencyLevel, 'alert' | 'warning' | 'info' | 'debug'> = {
  urgent: 'alert',
  high: 'warning',
  normal: 'info',
  low: 'debug',
};

// ---------------------------------------------------------------------------
// Text sanitization — prevent command injection in OS notifications
// ---------------------------------------------------------------------------

function sanitizeForShell(text: string): string {
  return text
    .replace(/[\\"'`$]/g, '')
    .replace(/[\n\r\t]/g, ' ')
    .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '')
    .slice(0, 200);
}

// ---------------------------------------------------------------------------
// NotifierService
// ---------------------------------------------------------------------------

export default class NotifierService {
  private config: AlertsConfig;

  private desktopCount = 0;

  private desktopResetTimer: ReturnType<typeof setInterval> | null = null;

  private static readonly MAX_DESKTOP_PER_MIN = 5;

  constructor(config: AlertsConfig) {
    this.config = config;

    // Reset desktop rate counter every 60s
    this.desktopResetTimer = setInterval(() => {
      this.desktopCount = 0;
    }, 60_000);
  }

  stop(): void {
    if (this.desktopResetTimer) {
      clearInterval(this.desktopResetTimer);
      this.desktopResetTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Main dispatch — routes alert to channels based on urgency + config
  // -------------------------------------------------------------------------

  async alert(payload: AlertPayload, forceDesktop = false): Promise<void> {
    const meetsThreshold =
      URGENCY_ORDER[payload.priority] >= URGENCY_ORDER[this.config.urgencyThreshold];

    // 1. MCP log — always, with appropriate level
    const logLevel = MCP_LOG_LEVEL_MAP[payload.priority];
    const icon = payload.priority === 'urgent' ? '🚨' : '📧';
    const logMsg = `${icon} [${payload.priority.toUpperCase()}] ${payload.sender.name ?? payload.sender.address}: "${payload.subject}"${
      payload.labels?.length ? ` [${payload.labels.join(', ')}]` : ''
    }${payload.ruleName ? ` (rule: ${payload.ruleName})` : ''}`;
    await mcpLog(logLevel, 'notifier', logMsg);

    // 2. Desktop notification — if enabled + meets threshold (or forced by rule)
    if (this.config.desktop && (meetsThreshold || forceDesktop)) {
      await this.sendDesktopNotification(payload);
    }

    // 3. Webhook — if configured + meets webhook event filter
    if (this.config.webhookUrl && this.config.webhookEvents.includes(payload.priority)) {
      this.sendWebhook(payload).catch(() => {});
    }
  }

  // -------------------------------------------------------------------------
  // Desktop notification — native OS commands, zero npm deps
  // -------------------------------------------------------------------------

  private async sendDesktopNotification(payload: AlertPayload): Promise<void> {
    if (this.desktopCount >= NotifierService.MAX_DESKTOP_PER_MIN) return;
    this.desktopCount += 1;

    const title = sanitizeForShell(
      `📧 Email MCP — ${payload.priority === 'urgent' ? 'Urgent' : 'Important'}`,
    );
    const senderDisplay = sanitizeForShell(
      payload.sender.name ?? payload.sender.address,
    );
    const subject = sanitizeForShell(payload.subject);
    const body = `From: ${senderDisplay}\n${subject}`;
    const playSound = this.config.sound && payload.priority === 'urgent';

    const { platform } = process;

    try {
      if (platform === 'darwin') {
        await NotifierService.execDarwin(title, body, playSound);
      } else if (platform === 'linux') {
        await NotifierService.execLinux(title, body, playSound);
      } else if (platform === 'win32') {
        await NotifierService.execWindows(title, body);
      }
    } catch {
      // Desktop notification failure is non-fatal — silently degrade to MCP log only
    }
  }

  private static async execDarwin(title: string, body: string, sound: boolean): Promise<void> {
    const soundClause = sound ? ' sound name "Glass"' : '';
    const script = `display notification "${body}" with title "${title}"${soundClause}`;
    await NotifierService.execCommand(`osascript -e '${script}'`);
  }

  private static async execLinux(title: string, body: string, sound: boolean): Promise<void> {
    const urgency = sound ? 'critical' : 'normal';
    const cmds = [`notify-send -u ${urgency} "${title}" "${body}"`];
    if (sound) {
      cmds.push(
        'paplay /usr/share/sounds/freedesktop/stereo/message-new-instant.oga 2>/dev/null || true',
      );
    }
    await NotifierService.execCommand(cmds.join(' && '));
  }

  private static async execWindows(title: string, body: string): Promise<void> {
    const ps = `[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); ` +
      `$n = New-Object System.Windows.Forms.NotifyIcon; ` +
      `$n.Icon = [System.Drawing.SystemIcons]::Information; ` +
      `$n.Visible = $true; ` +
      `$n.ShowBalloonTip(5000, '${title}', '${body}', 'Info')`;
    await NotifierService.execCommand(`powershell -Command "${ps}"`);
  }

  private static async execCommand(cmd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(cmd, { timeout: 5000 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // -------------------------------------------------------------------------
  // Webhook dispatch — HTTP POST with JSON payload
  // -------------------------------------------------------------------------

  private async sendWebhook(payload: AlertPayload): Promise<void> {
    if (!this.config.webhookUrl) return;

    const body = JSON.stringify({
      event: `email.${payload.priority}`,
      account: payload.account,
      sender: payload.sender,
      subject: payload.subject,
      priority: payload.priority,
      labels: payload.labels ?? [],
      rule: payload.ruleName ?? null,
      timestamp: new Date().toISOString(),
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 5000);

    try {
      const resp = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
      if (!resp.ok) {
        await mcpLog('warning', 'notifier', `Webhook returned ${resp.status}`);
      }
    } catch {
      await mcpLog('debug', 'notifier', 'Webhook dispatch failed (non-fatal)');
    } finally {
      clearTimeout(timeout);
    }
  }
}
