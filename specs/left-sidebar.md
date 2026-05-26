# Left Sidebar Spec

## Status

Draft

## Goal

Make the left sidebar the stable home for workspace navigation and global
configuration. The chat header should stay focused on the active conversation
and agent controls, while persistent app-level actions live in the sidebar.

## Sidebar Structure

The left sidebar has three functional regions:

1. **Top identity and primary navigation**
   - Shows Tau identity or current workspace identity.
   - Provides primary navigation entries such as sessions and projects.
   - May include search or refresh controls that directly affect the sidebar
     content.

2. **Scrollable content**
   - Shows session lists, project lists, search results, and related navigation
     content.
   - Keeps long lists scrollable without moving the top identity area or bottom
     utility area.

3. **Bottom utility area**
   - Fixed at the lower-left of the app when the sidebar is visible.
   - Contains app-level utilities, starting with Settings.
   - May later contain account, usage, or other persistent utility entries.

## Settings Placement

The Settings entry belongs in the sidebar bottom utility area.

Rules:

- Settings should appear in the lower-left, similar to the Codex App reference.
- Settings should remain reachable while the sidebar is open, regardless of
  whether the user is viewing sessions or projects.
- The chat header should not duplicate the Settings button.
- On narrow screens, Settings remains part of the sidebar drawer rather than
  becoming a permanent top-right header button.

## Theme Controls

Theme selection belongs inside Settings.

Rules:

- Do not show a standalone Light/Dark/System theme toggle in the main header.
- Do not show a standalone theme toggle in the sidebar top area.
- Settings may include Appearance controls for System, Light, and Dark.
- Theme changes should feel like configuration, not a frequent workspace action.

## Header Relationship

The chat header should focus on active conversation controls.

Appropriate header controls include:

- Sidebar open/close.
- Active session title and connection status.
- Model selection.
- Thinking level.
- Context usage and compaction affordances.
- Command/action menu.

Inappropriate header controls:

- Settings as a persistent top-right icon.
- Standalone theme switching.
- Sidebar navigation actions that only affect session/project lists.

## Layout Modes

In two-column mode:

- The sidebar, chat workspace, and workspace status float may be visible.
- Settings remains in the sidebar bottom utility area.

In three-column mode:

- The right detail sidebar opens and the workspace status float is hidden.
- Settings remains in the left sidebar bottom utility area when the left sidebar
  is visible.
- If the left sidebar collapses due to limited width, Settings is available when
  the sidebar drawer is reopened.

## Visual Direction

- Keep the bottom utility area visually quiet but easy to find.
- Use a familiar settings icon with a text label when there is room.
- Avoid competing with the active session list.
- Keep utility entries aligned with the rest of the sidebar navigation language.

## Non-Goals

- Do not redesign session grouping or project launching as part of this change.
- Do not add new settings categories beyond the existing configuration needs.
- Do not move model or thinking controls into the sidebar.
- Do not make theme switching a first-class header action.
