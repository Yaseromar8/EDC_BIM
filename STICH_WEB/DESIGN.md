# Design System Document

## 1. Overview & Creative North Star: "The Technical Architect"
This design system is built for the precision and scale of modern engineering. Our Creative North Star is **"The Technical Architect"**—an aesthetic that balances industrial-grade stability with high-speed digital innovation. 

We move beyond standard templates by embracing **intentional asymmetry** and **editorial depth**. This system is not a flat collection of boxes; it is a sophisticated environment of layered surfaces. By utilizing high-contrast typography scales and overlapping elements, we create a visual rhythm that feels both authoritative and agile. The goal is to make complex data feel effortless through a "Glass-on-Carbon" interface style.

---

## 2. Colors: Tonal Depth & Kinetic Energy
The color palette is rooted in deep charcoal and bright neutrals, punctuated by a vibrant, high-energy red.

### Palette Strategy
- **Primary (`#b50000` to `#e40001`):** Use for high-impact CTAs and kinetic energy. It represents action and urgency.
- **Deep Neutrals (`#1C1C1C` / `#2D2D2D`):** Our foundation. These are not "blacks" but deep charcoals that provide a softer, more premium contrast than pure black.
- **Surface Tiers:** Use the `surface-container` tokens to build hierarchy.

### The "No-Line" Rule
Standard 1px borders are strictly prohibited for defining sections. Structure must be achieved through **background color shifts**. For example, a `surface-container-low` hero section should transition directly into a `surface` main content area. This creates a seamless, architectural flow rather than a "boxed-in" feel.

### Signature Textures & Glass
To elevate the UI beyond a standard flat look:
- **Glassmorphism:** Use for floating navigation or overlays. Combine `surface` colors at 70-80% opacity with a `20px` backdrop-blur.
- **Linear Gradients:** Apply a subtle gradient from `primary` to `primary_container` on large CTAs to provide a three-dimensional, "lit from within" quality.

---

## 3. Typography: Precision Editorial
We use **Inter** (as a modern proxy for PP Neue Montreal) to maintain a tech-forward, clean aesthetic.

- **Display & Headline:** Use `display-lg` and `headline-lg` with tight tracking (-2%) to create an impactful editorial feel. Headlines should feel "heavy" and authoritative.
- **Body & Label:** Use `body-md` for legibility. For technical metadata, use `label-md` in all caps with slight letter spacing to mimic architectural blueprints.
- **Hierarchy:** Leverage the massive scale difference between `display-lg` (3.5rem) and `body-md` (0.875rem) to create clear entry points for the eye.

---

## 4. Elevation & Depth: The Layering Principle
We reject traditional drop shadows in favor of **Tonal Layering** and **Ambient Light**.

- **Stacking Surfaces:** Instead of a shadow, place a `surface-container-highest` card on a `surface-container-low` background. The natural delta in lightness creates "Soft Lift."
- **Ambient Shadows:** For floating elements (like modals), use extra-diffused shadows. 
  *   *Example:* `box-shadow: 0 20px 40px rgba(27, 28, 28, 0.06);` (using a tinted version of `on-surface`).
- **The "Ghost Border":** If a container requires definition against a similar background, use `outline-variant` at **15% opacity**. Never use 100% opaque borders.
- **Visual Overlap:** Break the grid by allowing images or cards to partially overlap two different background sections. This creates depth and makes the layout feel "built" rather than "templated."

---

## 5. Components

### Buttons
- **Primary:** High-gloss `primary` background, white text, `0.5rem` (DEFAULT) corner radius. Use a subtle hover shift to `primary_container`.
- **Secondary (Ghost):** `outline-variant` (15% opacity) border with `on_surface` text.
- **Tertiary:** Text-only with a trailing "vibrant red" arrow icon to signal momentum.

### Cards & Lists
- **Forbid Dividers:** Do not use horizontal lines to separate list items. Use `8` (2rem) of vertical spacing or a `surface-container-lowest` background for the item itself.
- **Container Styling:** Cards should use the `lg` (1rem) roundedness scale to feel modern and approachable.

### Input Fields
- **State Styling:** Use `surface_container_high` for the field background. On focus, the border should not just "light up" but transition to the `primary` red with a 2px stroke for high visibility.

### Signature Component: The "Data Glass" Card
A specialized card for high-level metrics. Use a background of `surface_container_lowest` at 80% opacity, a 40px backdrop blur, and no border. This "frosted" effect over a charcoal background is the signature look of this design system.

---

## 6. Do's and Don'ts

### Do
- **Do use asymmetrical layouts.** Align text to the left while keeping imagery offset to create a dynamic visual path.
- **Do use generous white space.** Use the `20` (5rem) and `24` (6rem) spacing tokens between major sections to let the "Architectural" feel breathe.
- **Do prioritize readability.** Ensure `on_surface` text on `surface` backgrounds meets WCAG AA standards.

### Don't
- **Don't use pure black (#000000).** Use the charcoal `on_background` (#1b1c1c) to maintain tonal sophistication.
- **Don't use standard "Drop Shadows."** If it looks like a default Photoshop shadow, it's too heavy. It should feel like ambient light.
- **Don't clutter.** If a section feels "busy," remove the borders first, then increase the spacing tokens.