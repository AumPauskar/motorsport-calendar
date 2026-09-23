# Pitwall — Motorsport calendar

A responsive, timezone-aware React calendar powered by `data.json`.

## Run locally

```bash
npm install
npm run dev
```

Then visit the local URL printed by Vite. For a production build, use `npm run build`.

## Data format

Add seasons, championships, rounds, and session timestamps to `data.json`. Timestamps should be ISO 8601 strings, ideally in UTC (for example `2026-09-27T11:00:00Z`). The interface builds the year selector, championship sidebar, event count, calendar, and upcoming cards from this file.

Displayed times use the client device's timezone through the browser's `Intl.DateTimeFormat` API. Race cards show the weekend range and main race time; clicking a card opens every session in a detail panel.
