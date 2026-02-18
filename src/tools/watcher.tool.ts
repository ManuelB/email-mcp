/**
 * Watcher tools — inspect and configure the IMAP IDLE watcher at runtime.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type WatcherService from '../services/watcher.service.js';

export default function registerWatcherTools(
  server: McpServer,
  watcherService: WatcherService,
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
}
