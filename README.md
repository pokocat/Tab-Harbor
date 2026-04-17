# TabHarbor

TabHarbor is a Chrome extension for people who keep too many tabs open but do not want to lose context by closing everything too aggressively.

Other languages:

- [简体中文](./README.zh-CN.md)
- [繁體中文](./README.zh-TW.md)
- [日本語](./README.ja.md)

## Design Philosophy

TabHarbor is built around a simple idea: tab management should reduce cognitive load, not add another organizational chore.

- Context first: a tab is often part of a temporary working context, not a long-term bookmark.
- Reversible cleanup: users should feel safe archiving, deduplicating, and closing tabs because recovery is easy.
- Fast clarity: the interface should help users understand what is open right now with minimal friction.
- Gentle structure: grouping, filtering, and suggestions should guide users without forcing a rigid workflow.
- Local by default: session data stays in browser storage, and the extension operates with a minimal permission model.

## Core Features

- Current-window overview in the popup for quick review and fast tab actions.
- Duplicate detection and one-click cleanup to remove repeated pages safely.
- Session archiving and restore so users can pause a context without losing it.
- Dashboard for high-density tab management across windows and domains.
- Search across open tabs and archived sessions.
- Root-domain grouping and sorting options for clearer scanning.
- Configurable sound feedback.
- Built-in multilingual UI with browser-language auto detection and manual override in the dashboard.

## Interface Model

TabHarbor uses a two-level workflow:

- Popup: quick triage, current-window cleanup, duplicate removal, and fast search.
- Dashboard: deeper review, bulk actions, session management, filtering, grouping, and sorting.

This split keeps frequent actions lightweight while still supporting heavier cleanup when tab volume gets large.

## Data and Privacy

- Sessions and preferences are stored locally with `chrome.storage.local`.
- Tab management actions use only the permissions needed to inspect and manage tabs.
- No remote sync or analytics are required for the core experience.

## Release Materials

An English Chrome Web Store publishing copy pack is available here:

- [Chrome Web Store Copy](./docs/chrome-web-store-copy.en.md)
