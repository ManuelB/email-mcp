/**
 * Shared TypeScript types for the Email MCP Server.
 */

// ---------------------------------------------------------------------------
// Address
// ---------------------------------------------------------------------------

export interface EmailAddress {
  name?: string;
  address: string;
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export interface Account {
  name: string;
  email: string;
  fullName?: string;
}

export interface ImapConfig {
  host: string;
  port: number;
  tls: boolean;
  starttls: boolean;
  verifySsl: boolean;
}

export interface SmtpConfig {
  host: string;
  port: number;
  tls: boolean;
  starttls: boolean;
  verifySsl: boolean;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export interface OAuth2Config {
  provider: 'google' | 'microsoft' | 'custom';
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
  tokenExpiry?: number;
  // Custom provider endpoints (only when provider = "custom")
  tokenUrl?: string;
  authUrl?: string;
  scopes?: string[];
}

export interface AccountConfig {
  name: string;
  email: string;
  fullName?: string;
  username: string;
  password?: string;
  oauth2?: OAuth2Config;
  imap: ImapConfig;
  smtp: SmtpConfig;
}

export interface AppConfig {
  settings: {
    rateLimit: number;
    readOnly: boolean;
  };
  accounts: AccountConfig[];
}

// ---------------------------------------------------------------------------
// Mailbox
// ---------------------------------------------------------------------------

export interface Mailbox {
  name: string;
  path: string;
  specialUse?: string;
  totalMessages: number;
  unseenMessages: number;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export interface EmailMeta {
  id: string;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  date: string;
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  hasAttachments: boolean;
  labels: string[];
  preview?: string;
}

export interface AttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
}

export interface Email extends EmailMeta {
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  bodyText?: string;
  bodyHtml?: string;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  attachments: AttachmentMeta[];
  headers: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface SendResult {
  messageId: string;
  status: 'sent' | 'failed';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Bulk Operations
// ---------------------------------------------------------------------------

export interface BulkResult {
  total: number;
  succeeded: number;
  failed: number;
  errors?: string[];
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export interface Contact {
  name?: string;
  email: string;
  frequency: number;
  lastSeen: string;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditEntry {
  ts: string;
  tool: string;
  account: string;
  params: Record<string, unknown>;
  result: 'ok' | 'error';
  error?: string;
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export interface ThreadResult {
  threadId: string;
  messages: Email[];
  participants: EmailAddress[];
  messageCount: number;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface EmailTemplate {
  name: string;
  description?: string;
  subject: string;
  body: string;
  variables: string[];
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  name: string;
  domains: string[];
  imap: ImapConfig;
  smtp: SmtpConfig;
  notes?: string;
  oauth2?: {
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
  };
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  uid: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  organizer?: EmailAddress;
  attendees: EmailAddress[];
  status: 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED';
  method?: string;
  recurrence?: string;
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface SenderStat {
  email: string;
  name?: string;
  count: number;
}

export interface DailyVolume {
  date: string;
  count: number;
}

export interface EmailStats {
  period: 'day' | 'week' | 'month';
  dateRange: { from: string; to: string };
  totalReceived: number;
  unreadCount: number;
  flaggedCount: number;
  topSenders: SenderStat[];
  dailyVolume: DailyVolume[];
  hasAttachmentsCount: number;
  avgPerDay: number;
}

export interface QuotaInfo {
  usedMb: number;
  totalMb: number;
  percentage: number;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export type LabelStrategyType = 'protonmail' | 'gmail' | 'keyword' | 'unsupported';

export interface LabelInfo {
  name: string;
  path?: string;
  strategy: LabelStrategyType;
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export interface ScheduledEmail {
  id: string;
  account: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  html: boolean;
  sendAt: string;
  createdAt: string;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  attempts: number;
  lastError?: string;
  draftMessageId?: string;
  draftMailbox?: string;
  inReplyTo?: string;
  references?: string[];
  sentAt?: string;
  sentMessageId?: string;
}
