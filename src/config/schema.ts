/**
 * Zod schemas for configuration validation.
 */

import { z } from 'zod';

export const ImapConfigSchema = z.object({
  host: z.string().min(1, 'IMAP host is required'),
  port: z.number().int().min(1).max(65535).default(993),
  tls: z.boolean().default(true),
  starttls: z.boolean().default(false),
  verify_ssl: z.boolean().default(true),
});

export const SmtpConfigSchema = z.object({
  host: z.string().min(1, 'SMTP host is required'),
  port: z.number().int().min(1).max(65535).default(465),
  tls: z.boolean().default(true),
  starttls: z.boolean().default(false),
  verify_ssl: z.boolean().default(true),
  pool: z
    .object({
      enabled: z.boolean().default(true),
      max_connections: z.number().int().min(1).default(1),
      max_messages: z.number().int().min(1).default(100),
    })
    .default({
      enabled: true,
      max_connections: 1,
      max_messages: 100,
    }),
});

export const OAuth2ConfigSchema = z.object({
  provider: z.enum(['google', 'microsoft', 'custom']),
  client_id: z.string().min(1, 'OAuth2 client_id is required'),
  client_secret: z.string().min(1, 'OAuth2 client_secret is required'),
  refresh_token: z.string().min(1, 'OAuth2 refresh_token is required'),
  // Custom provider endpoints (only when provider = "custom")
  token_url: z.string().url().optional(),
  auth_url: z.string().url().optional(),
  scopes: z.array(z.string()).optional(),
});

export const AccountConfigSchema = z
  .object({
    name: z.string().min(1, 'Account name is required'),
    email: z.string().email('Invalid email address'),
    full_name: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    oauth2: OAuth2ConfigSchema.optional(),
    imap: ImapConfigSchema,
    smtp: SmtpConfigSchema,
  })
  .refine((data) => data.password ?? data.oauth2, {
    message: 'Either password or oauth2 config is required',
  });

export const WatcherConfigSchema = z.object({
  enabled: z.boolean().default(false),
  folders: z.array(z.string()).default(['INBOX']),
  idle_timeout: z.number().int().min(60).max(1740).default(1740),
});

export const HooksConfigSchema = z.object({
  on_new_email: z.enum(['triage', 'notify', 'none']).default('notify'),
  auto_label: z.boolean().default(false),
  auto_flag: z.boolean().default(false),
  batch_delay: z.number().int().min(1).max(60).default(5),
});

export const SettingsSchema = z.object({
  rate_limit: z.number().int().min(1).default(10),
  read_only: z.boolean().default(false),
  watcher: WatcherConfigSchema.default({
    enabled: false,
    folders: ['INBOX'],
    idle_timeout: 1740,
  }),
  hooks: HooksConfigSchema.default({
    on_new_email: 'notify',
    auto_label: false,
    auto_flag: false,
    batch_delay: 5,
  }),
});

export const AppConfigFileSchema = z.object({
  settings: SettingsSchema.default({
    rate_limit: 10,
    read_only: false,
    watcher: {
      enabled: false,
      folders: ['INBOX'],
      idle_timeout: 1740,
    },
    hooks: {
      on_new_email: 'notify',
      auto_label: false,
      auto_flag: false,
      batch_delay: 5,
    },
  }),
  accounts: z.array(AccountConfigSchema).min(1, 'At least one account is required'),
});

export type RawAccountConfig = z.infer<typeof AccountConfigSchema>;
export type RawAppConfig = z.infer<typeof AppConfigFileSchema>;
