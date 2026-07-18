# Soft Neo-Brutalism Redesign — Design

Date: 2026-07-18

## Concept

"Soft neo-brutalism, flat edition." A near-black canvas with confident blocks of
soft pastel color, thick dark outlines, and big rounded corners. No gradients, no
glows, no 3D, no offset shadows. Depth comes from color blocking alone.

## Palette (dark base only)

- Background: warm near-black `#131316`; surface `#1C1C21`; surface-2 `#26262C`
- Ink (borders + text on pastels): `#0A0A0C`
- Foreground: off-white `#F2F1EE`; muted `#9B9AA3`
- Pastel accents (filled blocks with dark ink text on top):
  - Pink `#F5A8D8` — primary actions, highlights
  - Butter yellow `#F8E47A` — selected/today states, warnings
  - Mint `#A8E6B0` — success, owned/in-library
  - Sky `#A8D8F0` — info, downloading, secondary surfaces
  - Lavender `#C9B8F0` — extra category color (genres, mixes)
  - Soft red `#F0978B` — destructive/error

## Shape & line

- Radius: cards 20px (`--radius: 1rem` base scaled up), buttons/inputs pill or ~14px
- 2px ink borders on cards, buttons, inputs, badges — the flat-brutalist signature
- No shadows anywhere

## Typography

- Outfit (already loaded), add weight 800 for display headings
- Bold, tight headline styling; uppercase micro-labels where appropriate

## Status mapping

- success/owned → mint, requested/pending → yellow, downloading/info → sky,
  error/destructive → soft red, selected chip → yellow

## Components

- Button: pill, 2px ink border; variants primary (pink), secondary (surface),
  outline, ghost, destructive (soft red); hover = flat color shift
- Card: surface or pastel fill, 2px ink border, 20px radius
- Badge: small pill, 2px border, pastel fill per status
- Input/Textarea: dark surface, 2px ink border, flat pink focus outline
- Switch: chunky, bordered, pink when on
- Sidebar: near-black, active link = pastel pill, per-section pastel icon accents

## Pages

- Home: bold section headers, alternating pastel hero tiles
- Discover/Mixes: pastel color-coded tiles
- Album/Artist: artwork hero kept (artwork is content, not chrome); action rows,
  track lists, badges in the new system
- Library/Playlists/Requests/Search: surface cards + pastel status badges,
  filter chips as pastel pills (selected = yellow)
- Admin/Settings: pastel section cards; chunky bordered form inputs
- Player/Preview bar: dark pill, pink progress
- Skeletons: flat surface blocks, rounded, pulse only
