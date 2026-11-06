---
name: Scrum Poker
description: A calm, warm-paper workspace for independent estimates and shared decisions.
colors:
  canvas: "#f5f4ee"
  paper: "#fffefa"
  ink: "#202c2a"
  muted: "#65706a"
  line: "#dcded4"
  teal: "#186556"
  teal-hover: "#124d42"
  mint: "#e1eee5"
  mint-ink: "#174b3b"
  phase-ink: "#245843"
  selected-ink: "#f6fff7"
  field-line: "#cdd2c8"
  field-hover: "#82978b"
  placeholder: "#727b73"
  estimate-line: "#cdd4c8"
  focus: "#317d6d"
  selection: "#c4e1d0"
  selection-ink: "#143b30"
  hover: "#eeefe8"
  hover-line: "#a8b4a9"
  subtle-hover: "#e8eae1"
  progress-track: "#e6e9df"
  distribution-track: "#f0f1e9"
  distribution-fill: "#8bb9a0"
  avatar: "#e6e8de"
  avatar-ink: "#455b48"
  waiting: "#8a9388"
  warning: "#f2efdc"
  warning-ink: "#5b5632"
  warning-line: "#dfd9b7"
  error: "#fff0e8"
  error-ink: "#8e3027"
  error-line: "#e8c7b9"
  invalid: "#a83b2f"
  disconnected: "#8b6029"
  estimate-shadow: "#2d4a3566"
  card-back: "#f1f2ea"
  card-face-line: "#e3e6dc"
  card-edge: "#124d42"
typography:
  display:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "clamp(2.3rem, 4vw, 3.65rem)"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.04em"
  room-title:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.4rem)"
    fontWeight: 500
  story-title:
    fontSize: "clamp(1.4rem, 2.2vw, 1.85rem)"
    fontWeight: 500
    lineHeight: 1.4
  heading:
    fontSize: "1.5rem"
    fontWeight: 550
    lineHeight: 1.25
  body:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "14px"
    lineHeight: 1.65
  subheading:
    fontSize: "1rem"
    fontWeight: 650
  brand:
    fontSize: "19px"
    fontWeight: 650
  join-title:
    fontSize: "2.2rem"
  mobile-display:
    fontSize: "2.6rem"
  mobile-heading:
    fontSize: "1.35rem"
  mobile-body:
    fontSize: "15px"
  mobile-estimate:
    fontSize: "25px"
  field:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "14px"
    lineHeight: 1.65
  introduction:
    fontSize: "17px"
  label:
    fontSize: "13px"
    fontWeight: 650
  supporting:
    fontSize: "12px"
  compact:
    fontSize: "11px"
  score-choice:
    fontSize: "18px"
    fontWeight: 550
  estimate:
    fontSize: "27px"
    fontWeight: 500
rounded:
  distribution: "3px"
  tag: "4px"
  identity: "5px"
  control: "6px"
  estimate: "8px"
  paper: "12px"
spacing:
  tight: "8px"
  field: "12px"
  small: "16px"
  group: "24px"
  section: "30px"
  large: "48px"
components:
  button-primary:
    backgroundColor: "{colors.teal}"
    textColor: "white"
    rounded: "{rounded.control}"
    padding: "11px 17px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "11px 17px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
  estimate-selected:
    backgroundColor: "{colors.teal}"
    textColor: "{colors.selected-ink}"
    rounded: "{rounded.estimate}"
    typography: "{typography.estimate}"
  paper:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.paper}"
---

# Design System: Scrum Poker

## Overview

**Creative North Star: "Room for perspective"**

A practical estimation worksheet, not a dashboard or marketing surface. Warm paper and dark green-black ink make long team conversations feel unhurried. Clear form labels, an ordered story list, tactile estimate cards, and a quiet participant roster keep the actual task in view.

**Key Characteristics:**
- Calm surfaces with fine borders, generous work-area padding, and compact supporting information.
- Restrained teal signals action, selection, agreement, and connection.
- The selected estimate lifts into a solid ink-colored card; everyone else’s vote stays visually concealed until reveal.

## Colors

### Primary
Teal is the primary action and selected-state color. Mint groups active story and phase information. Teal hover deepens instead of adding decorative effects. The revealed distribution uses desaturated green bars with visible numeric labels.

### Neutral
Canvas separates the page from paper working surfaces. Ink carries headings and functional content; muted text carries explanations and metadata. Fine gray-green strokes define fields and worksheet divisions.

### Status
Warm ochre notices communicate interrupted connections and confirmations. Terracotta error surfaces identify failed actions and recovery. Status never depends on color alone: text and icons state the condition.

**The private-card rule.** Before reveal, the roster shows only whether a participant has voted. Own-vote selection belongs only in the personal estimate controls.

## Typography

DM Sans Variable is self-hosted through Fontsource and used throughout this Operate surface. A single workhorse type family keeps the forms, story text, and numeric deck coherent. The introduction is the only large display statement; the room title is smaller so the active story stays primary.

The type hierarchy uses 500-weight headings, 650-weight labels, 14px body/supporting text, and 11–13px metadata. Cards use 27px tabular numerals, falling to 25px on mobile. Heading text is balanced; long story titles and participant names can wrap. Desktop introduction text is 17px, reduced to 15px on mobile. Home display becomes 2.6rem on mobile. There is no uppercase eyebrow or monospace decoration.

## Layout

The shell is centered at a maximum width of 1440px with 48px desktop side padding, 30px through 1150px, and 20px through 760px. The header is a quiet single line with a ruled baseline; the footer anchors the work without extra navigation.

Home uses an introduction beside a working setup form, then stacks at 760px. Room uses a 250px story rail, flexible estimation workspace, and 230px roster separated by 24px gaps. Through 1150px the roster moves below the workspace. At 760px the active task comes first, followed by the team and complete story list. No horizontally scrolling table is required.

Estimate cards use five columns, reduced to four at 380px. The Reveal label drops “estimates” on narrow screens and keeps the vote count; the header tagline hides below 520px. Controls are at least 46px tall; estimate cards are 84–92px tall. Fields stack vertically. Long content wraps rather than forcing a wider viewport.

## Elevation & Depth

Paper working surfaces are flat, outlined regions. Only the creation form and estimate cards have ambient depth: setup uses `0 12px 32px -20px #45574740`; estimates use `0 6px 8px -6px #2d4a3566`. Each card sits on a second sheet (`card-back`, offset 4px) and carries an inset hairline face frame. Hover lifts a card 3px (`0 9px 10px -7px #2d4a3566`); the chosen card rises 6px onto a `card-edge` teal sheet with `0 14px 14px -9px #18655680`. These shadows suggest a touchable choice, not floating application windows.

## Shapes

Paper surfaces use 12px corners. Controls use 6px, estimate cards 8px, state tags 4px, and distribution tracks 3px. Avatars are circular initials, never stock portraits. Border strokes stay at 1px, except estimate cards at 1.5px. The brand is a small outlined card with a slight rotation and a consistent Lucide stroke icon. The favicon carries that identity into a teal tile: two overlapping mint/paper estimate cards, with a hand-drawn numeric five. Same-origin SVG is the primary browser icon; a multi-size ICO and 180px touch icon provide fallbacks.

## Components

- **Actions:** solid teal for the next primary task, paper for secondary actions, transparent muted text for reset/cancel. Disabled controls remain recognizable and noninteractive. Reveal and reset use inline confirmations, not modals.
- **Fields:** persistent visible labels, paper fills, gray-green strokes, clear placeholders, and adjacent practical help. Native required validation and bounded lengths support the server constraints.
- **Estimate deck:** a `radiogroup` of native buttons with `role="radio"` and `aria-checked`, one Tab stop (roving tabindex), an explicit selected check and large tabular numerals. Arrow keys, Home and End move focus only; Space or Enter picks, and a number or `?` key picks directly. Cards read as physical stock: 1.5px border, stacked back sheet, inset face frame, 6px selected lift. A legend beneath explains `?` (unsure or needs discussion) and `½`. Selection is authoritative server state, not optimistic local state. While a request is in flight cards stay focusable (`aria-disabled`).
- **Story progress:** ordered list with a mint active row, numeric finalized scores, titles clamped to two lines (full title in the `title` attribute and the workspace), and a labeled progressbar. When the session is complete the list is replaced by the completion list in the workspace (the rail keeps only progress, hidden on mobile).
- **Roster:** initials, name, a Facilitator label (participants carry none), Away presence, and concealed/revealed vote state as real text (visually hidden beside the icon). Away participants remain visible.
- **Distribution:** labeled, noninteractive bars appear only after reveal and grow in with a short stagger. A guidance note appears when the highest and lowest numeric votes are two or more deck steps apart; it never blocks saving.
- **Finalize choices:** the agreed score is a radio group of the distinct numeric values that were voted (deck order), an “Other” disclosure for the remaining numeric values, and a Save button. Never an automatically chosen average.
- **Undo confirmation:** after Save the facilitator sees an inline mint “Saved <score> for <story>” line with an Undo button in a polite status region. It disappears after about 10 seconds or once the next round has a vote or reveal. Focus moves to the story heading.
- **Feedback:** one visually hidden polite status region announces connection, clipboard and vote changes; visible notices carry no live role of their own. Also: live status, clear errors, reconnect recovery, truthful clipboard success, a visible manual-copy fallback, and storage warnings. Offline actions disable until the authenticated stream reconnects.
- **Focus and motion:** 3px teal keyboard focus rings with 4px offset, tinted selection/caret/scrollbars, short card state transitions, and reduced-motion overrides. Content is never hidden behind an entrance animation.

## Do's and Don'ts

### Do:
- **Do** keep the active story, private choice, and next facilitator action visually adjacent.
- **Do** use visible text alongside every connection, voting, and error state.
- **Do** preserve native forms, buttons, labels, selects, ordered lists, and keyboard focus.
- **Do** let long content wrap and keep the active task first on mobile.

### Don't:
- **Don't** reveal another participant’s number before the server phase is revealed.
- **Don't** select an agreed estimate automatically or silently retry a stale transition.
- **Don't** use marketing claims, decorative metrics, gradients, icon tiles, or ornamental dashboard chrome.
- **Don't** show a successful copy message until the clipboard write resolves.

The responsive rules are sourced from `src/index.css`. Browser workflow review is a separate verification step; the README includes an actual review capture with synthetic room data. `.impeccable/design.json` is a separate tooling artifact and is not the source of these tokens.
