# TabHarbor Chrome Web Store Copy Pack

This document contains the English copy and release materials needed to publish TabHarbor on the Chrome Web Store.

## Product Name

TabHarbor

## One-Line Positioning

Archive, deduplicate, and recover tabs without losing context.

## Short Description

Use this in the Chrome Web Store short description field.

Option A:

Archive, deduplicate, search, and restore tabs without losing your working context.

Option B:

Clean up tab overload with session archiving, duplicate removal, and fast recovery.

Option C:

Manage too many tabs safely with quick cleanup, session restore, and high-density review tools.

## Detailed Description

Recommended full description:

TabHarbor helps you clean up tab overload without losing track of what matters.

Instead of forcing you to close everything or manually sort dozens of tabs, TabHarbor gives you fast ways to understand what is open, remove duplicates, archive a working session, and restore it later when you need it again.

TabHarbor is designed for people who research heavily, switch between multiple tasks, or keep tabs open as temporary memory. It focuses on practical recovery and lightweight organization rather than rigid workflow rules.

### What you can do with TabHarbor

- Review the current window quickly from the popup
- Search open tabs and archived sessions
- Detect and clean duplicate tabs
- Archive a set of tabs into a restorable session
- Restore archived sessions into the current window or a new one
- Group tabs by window or root domain in the dashboard
- Sort tabs by recent activity, title, or domain
- Toggle sound feedback and choose the UI language

### Why TabHarbor feels different

- Context first: tabs are treated as working context, not just clutter
- Reversible cleanup: archive and restore flows make cleanup safer
- Fast clarity: popup for quick actions, dashboard for deeper management
- Local by default: sessions and settings stay in local browser storage
- Minimal permissions: only the permissions needed for core tab management

## Single Purpose Description

TabHarbor helps users manage too many browser tabs by reviewing, deduplicating, archiving, searching, and restoring them.

## Permissions Justification

### `tabs`

Used to read open tab metadata, detect duplicates, group tabs, focus a tab, close selected tabs, and restore saved tab sessions.

### `storage`

Used to save archived sessions and user preferences, including language, grouping defaults, stale thresholds, and sound settings.

## Privacy Disclosure Copy

Use this wording when filling privacy-related sections or FAQ text:

- TabHarbor stores archived sessions and preferences locally in the browser.
- TabHarbor does not require an account.
- TabHarbor does not rely on remote sync for core functionality.
- TabHarbor does not need analytics or tracking to manage tabs.
- TabHarbor only uses the browser permissions required to inspect and manage tabs and save local settings.

## Support Links

Support email:

- `mailto:pokocat@163.com`

Issue tracker:

- [GitHub Issues](https://github.com/pokocat/Tab-Harbor/issues)

## Suggested Store Assets Copy

### Promo headline ideas

- Tame tab overload without losing context
- Finally close tabs safely
- Clean up your browser, keep your working memory

### Screenshot caption ideas

1. Review your current window at a glance
2. Find and close duplicate tabs quickly
3. Archive a session and restore it later
4. Group tabs by domain or window in a dense dashboard
5. Search open tabs and archived sessions in seconds

## Suggested Release Notes Template

Version `x.y.z`

- Improved popup density and current-window review
- Added multilingual UI support with browser-language auto detection
- Added language selection in the dashboard
- Improved duplicate cleanup and session recovery workflows
- Refined tab grouping, sorting, and search behavior

## Pre-Publish Checklist

- Confirm `manifest.json` version matches the intended release
- Build the extension and test the packaged `dist/`
- Verify popup, dashboard, and language switching
- Verify archive, restore, duplicate cleanup, and search flows
- Confirm icons render correctly at small sizes
- Confirm support email and GitHub Issues links are correct
- Prepare screenshots that match the final UI
