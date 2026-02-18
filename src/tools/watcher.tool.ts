/**
 * Watcher & Hooks tools — inspect watcher status, list presets, view hooks config.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HooksConfig } from '../types/index.js';
import { listPresets as listAllPresets } from '../services/presets.js';
import type WatcherService from '../services/watcher.service.js';

export default function registerWatcherTools(
  server: McpServer,
  watcherService: WatcherService,
  hooksConfig?: HooksConfig,
): void {
  // -------------------------------------------------------------------------
  // get_watcher_status — read
  // -------------------------------------------------------------------------

  server.tool(
    'get_watcher_status',
    'Get the status of IMAP IDLE watcher connections and recent activity.',
    {},
    async () => {
      const status = watcherService.getStatus();

      if (status.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Watcher is not active. Enable it in config: [settings.watcher] enabled = true',
            },
          ],
        };
      }

      const lines = status.map((s) => {
        const icon = s.connected ? '🟢 connected' : '🔴 disconnected';
        return `• ${s.account}/${s.folder}: ${icon} (last UID: ${s.lastSeenUid})`;
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: `📡 Watcher Status (${status.length} connection(s)):\n${lines.join('\n')}`,
          },
        ],
      };
    },
  );

  // -------------------------------------------------------------------------
  // list_presets — read
  // -------------------------------------------------------------------------

  server.tool(
    'list_presets',
    'List all available AI triage presets with their descriptions and suggested labels.',
    {},
    async () => {
      const presets = listAllPresets();
      const activePreset = hooksConfig?.preset ?? 'priority-focus';

      const lines = presets.map((p) => {
        const active = p.id === activePreset ? ' ✅ (active)' : '';
        const labels = p.suggestedLabels.length > 0
          ? `\n     Labels: ${p.suggestedLabels.join(', ')}`
          : '';
        return `• ${p.name} [${p.id}]${active}\n     ${p.description}${labels}`;
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: `🎯 Available Hook Presets:\n\n${lines.join('\n\n')}` +
              `\n\nTo change preset, set \`preset = "${activePreset}"\` in [settings.hooks] of your config.toml.`,
          },
        ],
      };
    },
  );

  // -------------------------------------------------------------------------
  // get_hooks_config — read
  // -------------------------------------------------------------------------

  server.tool(
    'get_hooks_config',
    'Get the current AI hooks configuration including preset, rules, and custom instructions.',
    {},
    async () => {
      if (!hooksConfig) {
        return {
          content: [{ type: 'text' as const, text: 'Hooks are not configured.' }],
        };
      }

      const sections: string[] = [
        `⚙️  Hooks Configuration:`,
        `   Mode:     ${hooksConfig.onNewEmail}`,
        `   Preset:   ${hooksConfig.preset}`,
        `   Labels:   ${hooksConfig.autoLabel ? 'auto-apply' : 'disabled'}`,
        `   Flags:    ${hooksConfig.autoFlag ? 'auto-flag' : 'disabled'}`,
        `   Batch:    ${hooksConfig.batchDelay}s delay`,
      ];

      if (hooksConfig.customInstructions) {
        sections.push(`\n📝 Custom Instructions:\n   ${hooksConfig.customInstructions.replace(/\n/g, '\n   ')}`);
      }

      if (hooksConfig.rules.length > 0) {
        sections.push(`\n📋 Static Rules (${hooksConfig.rules.length}):`);
        hooksConfig.rules.forEach((rule) => {
          const matchParts: string[] = [];
          if (rule.match.from) matchParts.push(`from=${rule.match.from}`);
          if (rule.match.to) matchParts.push(`to=${rule.match.to}`);
          if (rule.match.subject) matchParts.push(`subject=${rule.match.subject}`);

          const actionParts: string[] = [];
          if (rule.actions.labels?.length) actionParts.push(`labels=[${rule.actions.labels.join(', ')}]`);
          if (rule.actions.flag) actionParts.push('flag');
          if (rule.actions.markRead) actionParts.push('mark_read');
          if (rule.actions.alert) actionParts.push('🔔 alert');

          sections.push(`   • "${rule.name}": ${matchParts.join(' & ')} → ${actionParts.join(', ')}`);
        });
      } else {
        sections.push('\n📋 Static Rules: none configured');
      }

      // Alerts config
      const { alerts } = hooksConfig;
      sections.push(`\n🔔 Alerts:`);
      sections.push(`   Desktop:   ${alerts.desktop ? '✅ enabled' : '❌ disabled'}`);
      sections.push(`   Sound:     ${alerts.sound ? '✅ enabled' : '❌ disabled'}`);
      sections.push(`   Threshold: ${alerts.urgencyThreshold}`);
      if (alerts.webhookUrl) {
        sections.push(`   Webhook:   ${alerts.webhookUrl}`);
        sections.push(`   Events:    ${alerts.webhookEvents.join(', ')}`);
      } else {
        sections.push(`   Webhook:   not configured`);
      }

      return {
        content: [{ type: 'text' as const, text: sections.join('\n') }],
      };
    },
  );
}
