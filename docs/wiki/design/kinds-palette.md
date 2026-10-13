# Default kind colours

Status: proposed; owner reviews in the kinds walkthrough.

_Written 2026-10-12 by the Lead Designer. These are the eleven rows the client
seeds into `kinds` on first sign-in (`architecture.md`, data model), in this
`sort_order`. `color_light` and `color_dark` are the chip **background**
colours; the chip text colour is derived at render time by the rule in
`tokens.md` ("Chip text rule"). The owner may change any of them in the
walkthrough; this file is the default, not a constraint._

## The principle behind the two themes

- **Light theme: deep, saturated chips with white text.** On a white grid, a
  filled saturated chip is what makes the calendar colour-forward; pale tints
  wash out. One exception, Entertainment, is a bright amber that needs dark
  text — a deep amber reads as brown and collides with Appointments.
- **Dark theme: soft, light chips with dark text.** On `#121417` a deep
  saturated chip disappears; a pastel of the same hue reads clearly and keeps
  the grid from glowing. Every dark-theme chip therefore uses
  `--color-chip-text-dark`.
- Every chip meets **≥ 4.5:1** text contrast and **≥ 3:1** against its
  theme's surface (`--color-surface`), so the chip's edge is visible without a
  border.

## The eleven

Contrast ratios are WCAG 2.x relative-luminance ratios computed with the
standard formula (sRGB channel linearised, `L = 0.2126R + 0.7152G + 0.0722B`,
ratio `(L1 + 0.05)/(L2 + 0.05)`). Text colours: white is `#FFFFFF`
(`--color-chip-text-light`, L = 1.0); dark is `#1B1B1F`
(`--color-chip-text-dark`, L = 0.0112). Surfaces: light `#FFFFFF`, dark
`#121417` (L = 0.0060).

| # | Kind | Hue | Light chip `color_light` | L | Text (light) | Ratio | vs surface | Dark chip `color_dark` | L | Text (dark) | Ratio | vs surface |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Movies | purple 280° | `#7E3FB8` | 0.1145 | white | 6.38 | 6.38 | `#CFA8F0` | 0.4756 | dark | 8.59 | 9.24 |
| 2 | Entertainment | amber 41° | `#BD8200` | 0.2678 | dark | 5.20 | 3.30 | `#F5CC6A` | 0.6364 | dark | 11.22 | 12.06 |
| 3 | Flights | cyan 189° | `#0B6E80` | 0.1278 | white | 5.91 | 5.91 | `#7AD4E4` | 0.5683 | dark | 10.11 | 10.86 |
| 4 | Hotel stays | indigo 245° | `#5147C9` | 0.1047 | white | 6.79 | 6.79 | `#B3AEF7` | 0.4657 | dark | 8.43 | 9.06 |
| 5 | Other travel | teal 172° | `#0D7265` | 0.1306 | white | 5.81 | 5.81 | `#74D3C2` | 0.5420 | dark | 9.68 | 10.40 |
| 6 | Restaurant reservations | orange 18° | `#BF4A17` | 0.1604 | white | 4.99 | 4.99 | `#F5A47C` | 0.4742 | dark | 8.57 | 9.21 |
| 7 | Birthdays | pink 336° | `#C2185B` | 0.1288 | white | 5.87 | 5.87 | `#F39BBE` | 0.4622 | dark | 8.37 | 9.00 |
| 8 | Gym | green 123° | `#2E7D32` | 0.1548 | white | 5.13 | 5.13 | `#9BD69B` | 0.5743 | dark | 10.21 | 10.97 |
| 9 | Work / meetings | blue 223° | `#2A5BD7` | 0.1288 | white | 5.87 | 5.87 | `#A3C0FA` | 0.5239 | dark | 9.38 | 10.08 |
| 10 | Appointments | brown 25° | `#7D5234` | 0.1064 | white | 6.71 | 6.71 | `#D8B297` | 0.4867 | dark | 8.78 | 9.43 |
| 11 | Social / personal | olive 72° | `#5E7114` | 0.1424 | white | 5.46 | 5.46 | `#C9D66B` | 0.6157 | dark | 10.89 | 11.70 |

Worked example, row 6 light: chip `#BF4A17` → R = 0.5209, G = 0.0685,
B = 0.0103 linearised; L = 0.2126·0.5209 + 0.7152·0.0685 + 0.0722·0.0103 =
0.1604. White text: (1.0 + 0.05)/(0.1604 + 0.05) = **4.99**. Dark text would
be (0.1604 + 0.05)/(0.0112 + 0.05) = 3.44, so the render-time rule picks white.

The lowest ratio in the set is 4.99 (Restaurant, light); everything else is
above 5.1. The lowest chip-vs-surface ratio is 3.30 (Entertainment, light).

## Neutral chip (deleted kind)

An event whose kind has `deleted_at` set renders with
`--color-chip-neutral` (`#6E6E73` light, white text, 5.07:1; `#B9B9C0` dark,
dark text, 8.80:1) **and** a 1px dashed border in the chip's text colour, and
its initial slot shows `?`. The dashed border and `?` are the non-colour
carriers of "this kind no longer exists"; a user with a grey-looking kind of
their own is never confused with it. Its legend entry reads "Kind removed" and
is listed last.

## How distinguishability was checked

**Hue spacing.** The eleven hues in wheel order: 18° restaurant, 25°
appointments, 41° entertainment, 72° social, 123° gym, 172° other travel,
189° flights, 223° work, 245° hotel, 280° movies, 336° birthdays. The three
tight pairs — restaurant/appointments (7°), other travel/flights (17°),
work/hotel (22°) — are separated on a second axis: appointments is a low-
saturation brown against restaurant's saturated orange; flights is lighter and
cyan against other travel's deeper teal; hotel is violet-leaning indigo
against work's true blue. In the dark theme the pastels keep the same hue
order and the same second-axis differences.

**Deuteranopia (red–green weak, the common case).** Simulated mentally on the
red–green axis collapse: the pairs that converge are restaurant/appointments/
entertainment (all become brownish-yellow of differing lightness),
gym/social (both yellowish), and birthdays/movies (both bluish-purple).
Lightness still separates each pair by ≥ 0.03 in relative luminance, which is
not enough to rely on. So colour is **never the only carrier**: every chip
shows the kind's **initial letter** in its 16px icon slot — M, E, F, H, T,
R, B, G, W, A, S — and the full kind name is in the chip's accessible name
and in the event sheet. Two kinds the owner names with the same initial get
the first two letters in the legend and the chip (the kind editor warns about
this; `components.md`).

**Grey.** No default is grey, so the neutral deleted-kind chip is unambiguous
on colour alone, and the dashed border makes it so without colour.

## When the owner recolours

The kind editor accepts any hex. It shows the live contrast of the derived
text colour against the chosen chip in **both** themes, and against both
surfaces, and refuses to save below 4.5:1 for text (it offers the nearest
passing lightness). It warns, but does not refuse, below 3:1 against the
surface and when the new colour is within 15° of hue of another kind at
similar lightness. See `components.md`, Kind editor.
