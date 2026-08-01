# Standalone Brushing Guide Prototype

This is a completely independent mini web app for testing brushing-step flow and dual-view swapping behavior.

## What It Demonstrates

- Two stacked panes (top and bottom)
- Front view of the mouth and inside close-up view
- Automatic pane inversion logic:
  - Top teeth steps: top pane = front view, bottom pane = inside view
  - Bottom teeth steps: top pane = inside view, bottom pane = front view
- Step sequence with top/bottom, left/right, inside/outside

## Run Locally

Option 1 (quickest): open `index.html` directly in your browser.

Option 2 (recommended for sharing/testing): run a simple static server from this folder.

Example with Node (no project dependency required):

```bash
npx serve .
```

Then open the local URL shown in the terminal.

## Tweak Points

- Edit sequence in `app.js` at `brushingSequence`
- Edit colors and spacing in `styles.css`
- Edit structure labels in `index.html`
