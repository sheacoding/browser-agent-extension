# Privacy Policy

**Browser Agent Extension**

Last Updated: December 2024

---

## Overview

Browser Agent Extension is committed to protecting your privacy. This extension operates entirely locally on your device and does not collect, store, or transmit any personal information.

---

## Data Collection

**We do NOT collect any data.**

This extension:

- ❌ Does NOT collect personal information
- ❌ Does NOT collect browsing history
- ❌ Does NOT collect website content
- ❌ Does NOT collect cookies or credentials
- ❌ Does NOT collect usage analytics
- ❌ Does NOT use tracking or telemetry

---

## No Server / No Upload

This extension has **NO backend server**.

- All operations are performed locally on your device
- No data is uploaded to any external server
- No cloud services are used
- No third-party analytics or tracking services are integrated

---

## How It Works

Browser Agent Extension connects only to a **local MCP server** running on your own machine:

- Connection: `localhost` (127.0.0.1) only
- Port: 3026 (configurable)
- Protocol: WebSocket

All browser automation commands are:
1. Received from your local MCP server
2. Executed locally in your browser
3. Results returned to your local MCP server

**No data ever leaves your computer.**

---

## Permissions Usage

The extension requires certain permissions to function. Here's how each is used:

| Permission | Purpose |
|------------|---------|
| `debugger` | Chrome DevTools Protocol for browser automation |
| `tabs` | Manage and switch between browser tabs |
| `activeTab` | Interact with the current active tab |
| `sidePanel` | Display extension UI and connection status |
| `host_permissions` | Enable automation on user-selected websites |

All permissions are used solely for local browser automation. No data from these permissions is collected or transmitted externally.

---

## Third-Party Services

This extension does **NOT** integrate with any third-party services:

- No analytics (Google Analytics, Mixpanel, etc.)
- No advertising networks
- No crash reporting services
- No external APIs

---

## Data Security

Since no data is collected or transmitted, there is no data to secure externally. All operations occur within your local environment:

- WebSocket communication is restricted to localhost
- No internet-facing endpoints
- No data persistence beyond your browser session

---

## Children's Privacy

This extension does not collect any information from anyone, including children under 13 years of age.

---

## Changes to This Policy

If we make changes to this privacy policy, we will update the "Last Updated" date at the top of this document.

---

## Contact

If you have questions about this privacy policy, please open an issue on our GitHub repository.

---

## Summary

**Browser Agent Extension is a privacy-first tool.** It runs entirely on your local machine, connects only to localhost, and collects absolutely no user data. Your privacy is guaranteed by design.
