---
name: Scrum Poker Planning
description: A plainspoken, structured worksheet for team estimation.
colors:
  sky-outline: lightblue
  mint-selection: lightgreen
  black: black
  white: white
  native-button-text: ButtonText
  native-button-face: ButtonFace
typography:
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
    fontSize: 18px
  supporting:
    fontSize: 12px
  title:
    fontSize: 24px
    fontWeight: 600
  estimate-pressed:
    fontSize: 24px
    fontWeight: 700
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
    fontSize: 18px
    fontWeight: 600
  button-label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
    fontSize: 14px
    fontWeight: 700
    lineHeight: 18px
rounded:
  control: 3px
  tile: 6px
spacing:
  field: 12px
  inset: 18px
  group: 24px
components:
  button:
    typography: '{typography.button-label}'
    rounded: '{rounded.control}'
    padding: 18px 44px
  navigation-action:
    backgroundColor: '{colors.native-button-face}'
    textColor: '{colors.native-button-text}'
    typography: '{typography.button-label}'
    rounded: '{rounded.control}'
    padding: 18px 44px
  input:
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '{spacing.field}'
  textarea:
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '{spacing.field}'
    width: 100%
  identity-tile:
    typography: '{typography.title}'
    rounded: '{rounded.tile}'
    padding: 18px 24px
    width: 100px
    height: 100px
  estimate-tile-selected:
    backgroundColor: '{colors.white}'
    textColor: '{colors.black}'
    typography: '{typography.estimate-pressed}'
    rounded: '{rounded.tile}'
    padding: 18px 24px
    width: 20px
    height: 20px
  estimate-tile:
    backgroundColor: '{colors.white}'
    textColor: '{colors.black}'
    typography: '{typography.title}'
    rounded: '{rounded.tile}'
    padding: 18px 24px
    width: 20px
    height: 20px
  panel:
    padding: 24px 16px
    width: 100%
  panel-wide:
    padding: '{spacing.group}'
    width: 100%
---
# Design System: Scrum Poker Planning

## Overview
**Creative North Star: "The Estimation Worksheet"**

Plainspoken and structured. Fields, outlined groups, and numbered estimate tiles organize the work without an ornamental layer.

Border-defined panels, lightly lifted actions. The worksheet's character comes from explicit labels, simple grouping, and compact corner rounding; no visual anti-references are established.

**Key Characteristics:**
- Plainspoken and structured.
- Border-defined panels, lightly lifted actions.
- Numbered estimate tiles with a selected-state outline.

## Colors
The authored palette supplies outlines and selection rather than a full surface-and-text theme. CSS color keywords remain canonical.

### Primary
- **Sky Outline:** identity and unselected estimate borders; not an action-button fill (`src/App/components/Rectangle/index.js:5,22`).
### Secondary
- **Mint Selection:** selected estimate-tile border; not a general success palette (`src/App/components/Rectangle/index.js:22`).
### Neutral
- **Black:** field strokes, shared focus outlines, and estimate text / pressed-state inset stroke (`src/App/components/TextField/InputGroup.js:11`; `tokens.js:26–28`; `Rectangle/index.js:24,30`).
- **White:** authored estimate-button background (`src/App/components/Rectangle/index.js:23`).
- **Native Button Text / Native Button Face:** CSS system colors explicitly used by the home navigation action, including its outset border (`src/App/pages/Home/index.js:8–14`). Their rendered colors depend on the browser and environment; ordinary action-button fill and border remain browser defaults.

## Typography
**Body Font:** the system sans-serif stack in frontmatter (`src/index.css:4–6`). Buttons, estimate buttons, and fields now explicitly inherit their surrounding font family (`src/App/components/Button/index.js:36`; `Rectangle/index.js:25`; `TextField/InputGroup.js:9`).

Body (18px) and supporting (12px) sizes come from paragraphs; tile titles use (24px, 600); labels and fields use (18px, 600). Legends use the body size with no authored weight. Action labels use (14px, 700, 18px line-height). Pressed estimates change to weight (700). No consistent scale ratio or authored display role is established; native page headings are not a display token.

Evidence: `src/App/components/P/index.js:4–6`, `Label/index.js:5–8`, `Legend/index.js:4–6`, `Rectangle/index.js:16–17,30`, `TextField/InputGroup.js:14–15`, and `Button/index.js:31–39` (component paths share `src/App/components/`).

## Layout
Repeated field, inset, and group spacing are captured in frontmatter. The main page container is full-width, centered, border-box, and capped at (1800px). Padding is (24px 16px) by default, (48px 32px) from (720px), and (74px 48px 48px) from (1200px). Content permits long-word wrapping.

Planning bodies use auto-fit grids with `minmax(min(100%, 320px), 1fr)` and group gaps; facilitator columns align at the bottom, developer columns at the top. The facilitator's final panel spans all columns between (720px) and (1199px). Setup fields use the same grid pattern with a (480px) minimum. Estimate choices wrap inside a centered (300px) container capped at (100%).

Fields stack with a field-sized gap below (1200px), then become centered rows. Input width props such as (600px) are capped at (100%); through (1199px) inputs fill their container and reset margins. Panels are full-width with no fixed height; at (720px) they gain minimum height (500px) and group padding. The story table retains height (500px), reduced to (360px) through (719px), with wrapping cells and pagination controls at least (44px) tall. The facilitator header changes from a column to a row at (900px), with paragraphs capped at (65ch).

Evidence: `src/App/components/PageLayout/index.js:3–17`, `FieldSet/index.js:4–21`, `Table/index.js:6–26`, `TextField/Wrapper.js:4–14`, `TextField/InputGroup.js:5–34`; `src/App/pages/AddStoryList/TextFieldWrapper.js:4–9`; both planning `BodyWrapper.js` and `DayList.js` files; `src/App/pages/ViewPlanningAsScrumMaster/Header.js:4–18`. These are source-extracted rules, not browser-verified viewport results.

## Elevation & Depth
Border-defined panels, lightly lifted actions. Action buttons carry the ambient shadow (`0 2px 4px 0 rgba(0, 0, 0, 0.15)`); active and disabled buttons remove it. Pressed estimates carry a structural inset stroke (`inset 0 0 0 1px black`), not ambient elevation. Panel styling specifies no shadow (`src/App/components/Button/index.js:44,52–60`; `Rectangle/index.js:30`; `FieldSet/index.js:4–21`).

**The Lightly Lifted Action Rule.** Use the observed button shadow for action depth, not as an invented panel-elevation scale.

## Shapes
Controls and tiles use the two rounded steps in frontmatter. Identity tiles have a border (2px solid Sky Outline); estimate buttons have a border (1px solid Sky Outline or Mint Selection). Fields have a border (1px solid Black). Identity tiles retain content-box dimensions; estimate buttons explicitly use content-box sizing, so their (20px) width and height exclude padding and border. Fields and panels use border-box sizing (`src/App/components/Rectangle/index.js:4–34`; `TextField/InputGroup.js:5–18`; `FieldSet/index.js:5`).

## Components
- **Button:** plainspoken native action, defaulting to `type="button"`; forms explicitly use submit buttons. Label, rounding, and padding are in frontmatter; width is capped at (100%) and long text wraps. Fill and border remain browser-controlled. Transition (`all 0.2s`); active removes transition and shadow; disabled uses the default cursor. Hover adds no visual change. Optional loading rotates (360deg, 0.75s linear infinite); no authored spinner stroke is established (`src/App/components/Button/index.js:4–25,28–63`; `src/App/pages/AddStoryList/index.js:76,100`).
- **Inputs / textarea:** structured, font-inheriting fields with explicit Black strokes and associated labels. Textarea fills its container, has minimum height (300px), group spacing below, and vertical resizing. Invalid fields use `aria-invalid`, described error text, and an alert; no custom error color or disabled skin is authored (`src/App/components/TextField/InputGroup.js:5–35`; `TextField/index.js:19–28`).
- **Focus:** shared buttons, estimate buttons, and fields use an authored Black outline (2px) with offset (3px) on `:focus`, including keyboard focus. This is not limited to `:focus-visible` (`src/App/components/tokens.js:26–28`).
- **Identity / estimate tiles:** centered column flex content with group spacing below. Identity remains a noninteractive div. Estimates are native buttons with `aria-pressed`; selected borders are Mint, pressed text becomes bold with a Black inset stroke, and disabled estimates use opacity (0.6) with the default cursor (`src/App/components/Rectangle/index.js:4–34`; `src/App/pages/ViewPlanningAsDeveloper/index.js:139–145`). There is no authored estimate hover change.
- **Panels:** native fieldsets with column flex layout, centered justification, responsive padding, and a legend capped to container width. Native fieldset appearance is not a palette token (`src/App/components/FieldSet/index.js:4–21`; `Legend/index.js:4–6`).
- **Story table:** React Table with responsive height and local wrapping/pagination overrides; library CSS is not promoted into local tokens (`src/App/components/Table/index.js:2–26`).
- **Navigation:** the home action is a single native anchor styled from the shared button, with explicit CSS system colors and a (2px outset ButtonFace) border; it is not a link wrapping a button (`src/App/pages/Home/index.js:8–14,21–23`).

## Do's and Don'ts
### Do:
- **Do** keep the component philosophy plainspoken and structured.
- **Do** use Sky Outline for identity framing and Mint Selection for selected estimate framing.
- **Do** preserve the distinction between authored component styling and browser/library defaults.
- **Do** retain the shared Black focus outline and native button, link, label, fieldset, and form semantics.
- **Do** use the authored responsive containers and grids rather than restoring fixed panel dimensions.
### Don't:
- **Don't** infer a button-fill or surface palette from native browser appearance.
- **Don't** invent visual anti-references or hover color changes absent from the source.
- **Don't** substitute ambient elevation for the pressed estimate's inset selection stroke.

**Not canonized:** native system-stack page display headings remain a craft-floor defect, not an authored display role; the optional loading pseudo-element still has no visible spinner stroke. Neither is repaired here. Former focus suppression, invalid unselected-border interpolation, nested link/button markup, and fixed panel dimensions are no longer present in the sampled interactive primitives. Source extraction does not establish rendered contrast, focus clipping, or responsive fit; those remain unverified without browser evidence.
