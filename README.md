# email-mcp

[![License: LGPL v3](https://img.shields.io/badge/License-LGPL_v3-blue.svg?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-brightgreen?style=flat-square)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-1.26-purple?style=flat-square)](https://modelcontextprotocol.io/)
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

A full-featured [Model Context Protocol](https://modelcontextprotocol.io/) server that gives AI assistants complete email capabilities — read, search, compose, organize, and schedule emails across multiple accounts.

Built for real-world email workflows: multi-account IMAP/SMTP with OAuth2 support, email threading, calendar extraction, template system, scheduled sending, and safety-first design with audit logging, rate limiting, and read-only mode.

## Table of Contents

- [Security](#security)
- [Background](#background)
- [Features](#features)
- [Install](#install)
- [Usage](#usage)
- [Configuration](#configuration)
- [API](#api)
  - [Tools](#tools)
  - [Resources](#resources)
  - [Prompts](#prompts)
- [Providers](#providers)
- [Contributing](#contributing)
- [License](#license)

## Security

If you discover a security vulnerability, please use [GitHub Security Advisories](https://github.com/codefuturist/email-mcp/security/advisories/new) to report it responsibly. Do not open a public issue.

See [SECURITY.md](SECURITY.md) for the full security policy.

### Safety by Design

- **Audit logging** — All write operations are logged to an append-only JSON Lines file with automatic redaction of sensitive fields (passwords, email bodies, attachments)
- **Rate limiting** — Token-bucket rate limiter prevents runaway sends (default: 10 per minute per account)
- **Read-only mode** — When enabled, write tools are not registered at all — they are completely absent from the tool list, not just disabled

## Background

email-mcp was built to bridge the gap between AI assistants and email. Existing email integrations tend to be limited to basic send/receive. This server exposes the full depth of email functionality through MCP — threading, search, bulk operations, calendar extraction, templates, scheduling, and more — while keeping safety guardrails in place.

It follows the [MCP specification](https://spec.modelcontextprotocol.io/) and works with any MCP-compatible client (Claude Desktop, VS Code with GitHub Copilot, and others).

## Features

- **Multi-account** — Manage multiple email accounts from a single server
- **Full IMAP** — List, search, read, thread, download attachments, extract contacts
- **Full SMTP** — Send, reply, forward with proper threading headers
- **OAuth2** — Built-in support for Google and Microsoft, plus custom providers
- **Provider auto-detection** — Automatic server/port configuration for 8 major providers
- **Email scheduling** — Queue emails for future delivery with OS-level periodic checks
- **Templates** — TOML-based email templates with `{{variable}}` substitution
- **Calendar extraction** — Parse ICS/iCalendar events from emails
- **Bulk operations** — Batch mark, move, or delete up to 100 emails at once
- **Folder management** — Create, rename, and delete mailbox folders
- **Draft management** — Save and send drafts
- **Analytics** — Email volume stats, top senders, daily trends
- **Interactive setup** — CLI wizard for account configuration
- **XDG-compliant** — Config, data, and state follow the XDG Base Directory spec

## Install

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) (recommended) or npm

### From Source

```sh
git clone https://github.com/codefuturist/email-mcp.git
cd email-mcp
pnpm install
pnpm build
```

### Quick Setup

Run the interactive setup wizard to configure your first account:

```sh
node dist/main.js setup
```

Or test connections for an existing config:

```sh
node dist/main.js test
```

## Usage

### As an MCP Server (stdio)

```sh
node dist/main.js
```

This starts the server over stdio — the standard transport for MCP clients.

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "email": {
      "command": "node",
      "args": ["/path/to/email-mcp/dist/main.js"]
    }
  }
}
```

### VS Code (GitHub Copilot)

Add to your VS Code MCP settings (`.vscode/mcp.json`):

```json
{
  "servers": {
    "email": {
      "command": "node",
      "args": ["/path/to/email-mcp/dist/main.js"]
    }
  }
}
```

### Environment Variables (Quick Start)

For a single account without a config file:

```sh
export MCP_EMAIL_ADDRESS="user@gmail.com"
export MCP_EMAIL_PASSWORD="app-password"
export MCP_EMAIL_IMAP_HOST="imap.gmail.com"
export MCP_EMAIL_SMTP_HOST="smtp.gmail.com"
```

### CLI Commands

| Command | Description |
|---------|-------------|
| `stdio` (default) | Run as MCP server over stdio |
| `setup` | Interactive account setup wizard |
| `test [account]` | Test IMAP/SMTP connections |
| `config show` | Show current config (passwords masked) |
| `config path` | Print config file path |
| `config init` | Create a template config file |
| `scheduler check` | Send overdue scheduled emails |
| `scheduler list` | List scheduled emails |
| `scheduler install` | Install OS periodic check (launchd/crontab) |
| `scheduler uninstall` | Remove OS periodic check |
| `scheduler status` | Show scheduler installation status |
| `--version`, `-v` | Print version |
| `--help`, `-h` | Show help |

## Configuration

**Location:** `~/.config/email-mcp/config.toml` (respects `$XDG_CONFIG_HOME`)

```toml
[settings]
rate_limit = 10        # Max sends per minute per account
read_only = false      # When true, all write tools are hidden

[[accounts]]
name = "personal"
email = "user@gmail.com"
full_name = "Your Name"
password = "app-password"

[accounts.imap]
host = "imap.gmail.com"
port = 993
tls = true

[accounts.smtp]
host = "smtp.gmail.com"
port = 465
tls = true
```

### OAuth2

```toml
[[accounts]]
name = "work"
email = "user@company.com"

[accounts.oauth2]
provider = "google"       # "google" | "microsoft" | "custom"
client_id = "..."
client_secret = "..."
refresh_token = "..."

[accounts.imap]
host = "imap.gmail.com"
port = 993
tls = true

[accounts.smtp]
host = "smtp.gmail.com"
port = 465
tls = true
```

### Data Paths

| Path | Purpose |
|------|------ |
| `~/.config/email-mcp/config.toml` | Configuration |
| `~/.config/email-mcp/templates/` | Email templates (TOML) |
| `~/.local/share/email-mcp/audit.log` | Audit log |
| `~/.local/state/email-mcp/scheduled/` | Scheduled email queue |

## API

### Tools

email-mcp registers **28 tools** — 12 read-only tools that are always available, and 16 write tools that are hidden when `read_only` mode is enabled.

#### Read Tools

| Tool | Description |
|------|-------------|
| `list_accounts` | List all configured email accounts |
| `list_mailboxes` | List mailbox folders with unread counts |
| `list_emails` | List emails with filters and pagination |
| `get_email` | Get full email content by ID |
| `search_emails` | Search across subject, sender, and body |
| `download_attachment` | Download attachment (base64, ≤5 MB) |
| `extract_contacts` | Extract contacts from recent headers |
| `get_thread` | Reconstruct email conversation thread |
| `list_templates` | List available email templates |
| `extract_calendar` | Extract ICS calendar events |
| `get_email_stats` | Inbox analytics and daily trends |
| `check_health` | Connection health and quota check |

#### Write Tools

| Tool | Description |
|------|-------------|
| `send_email` | Send a new email (text or HTML) |
| `reply_email` | Reply with proper threading headers |
| `forward_email` | Forward with optional message |
| `move_email` | Move to a different folder |
| `delete_email` | Delete (trash or permanent) |
| `mark_email` | Mark read/unread, flag/unflag |
| `bulk_action` | Batch operation on up to 100 emails |
| `save_draft` | Save a draft |
| `send_draft` | Send and remove a draft |
| `create_mailbox` | Create a folder (supports nesting) |
| `rename_mailbox` | Rename a folder |
| `delete_mailbox` | Delete a folder and all contents |
| `apply_template` | Apply template with variable substitution |
| `schedule_email` | Schedule email for future delivery |
| `list_scheduled` | List scheduled emails by status |
| `cancel_scheduled` | Cancel a scheduled email |

### Resources

| URI | Description |
|-----|-------------|
| `email://accounts` | All configured accounts |
| `email://{account}/mailboxes` | Mailbox tree with message counts |
| `email://{account}/unread` | Unread count summary by folder |
| `email://templates/{name}` | Email template content |
| `email://{account}/stats` | Daily inbox statistics snapshot |
| `email://scheduled` | Pending scheduled emails |

### Prompts

| Prompt | Description |
|--------|-------------|
| `triage_inbox` | Categorize unread emails by urgency |
| `summarize_thread` | Summarize a conversation with decisions and action items |
| `compose_reply` | Draft a reply with tone control (formal/friendly/brief) |
| `draft_from_context` | Compose using past email context |
| `extract_action_items` | Extract tasks, deadlines, and commitments |
| `summarize_meetings` | Overview of calendar invites by timeframe |
| `cleanup_inbox` | AI-guided inbox organization (dry-run or execute) |

## Providers

Server and port settings are auto-detected for these providers based on your email address:

| Provider | Domains | Auth |
|----------|---------|------|
| **Gmail** | `gmail.com`, `googlemail.com` | App Password or OAuth2 |
| **Outlook** | `outlook.com`, `hotmail.com`, `live.com` | Password or OAuth2 |
| **Yahoo** | `yahoo.com`, `ymail.com` | App Password |
| **iCloud** | `icloud.com`, `me.com`, `mac.com` | App-Specific Password |
| **Fastmail** | `fastmail.com`, `fastmail.fm` | Password |
| **ProtonMail** | `proton.me`, `protonmail.com` | Bridge required |
| **Zoho** | `zoho.com`, `zohomail.com` | Password |
| **GMX** | `gmx.com`, `gmx.de`, `gmx.net` | Password |

For other providers, configure IMAP/SMTP settings manually or use the `setup` wizard.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, project structure, and guidelines.

PRs accepted.

## License

[LGPL-3.0-or-later](LICENSE) © Colin
