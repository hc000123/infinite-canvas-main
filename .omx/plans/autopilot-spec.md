# Browser feedback workbench redesign specification

## 1. Workflow shell

- Remove redundant production-control statistics, project/episode summary blocks, stage gates, and duplicated shot information.
- Preserve current project/episode/shot context through top navigation and return links.
- Do not auto-start asset extraction merely by entering its stage; explicit start remains for extraction. Once extraction succeeds, automatically materialize asset cards.
- Move asset extraction and storyboard extraction to their own stages. Storyboard extraction does not require manual approval; edits auto-save.
- Present final-prompt stage as per-shot production packages, not as another storyboard editor.
- Move low-priority run state into a compact translucent lower-right status surface where appropriate.

## 2. Asset workflow and local asset center

- Workflow asset cards and `/assets` share stable asset IDs, prompts, previews, variants, current versions, and history.
- Asset production cards are compact; prompt text is not permanently expanded.
- Each asset can bind to an existing project-local subject/variant.
- Asset center defaults to current project when entered from a project context.
- Every asset subject card has Upload and Generate; character cards also have Match voice.
- Asset subject detail uses an approximately 3:7 control/result split on desktop.
- Image generation is available only through asset subjects; legacy `/image` links redirect safely without starting generation.

## 3. Storyboard workspace

- Keep storyboard and image-generation concepts separate in navigation and routing.
- Display shots as a vertical natural-language scroll, one shot per horizontal row/card, combining summary and editable detail.
- Remove per-shot approval/confirm buttons; edits save directly.
- Keep project, episode, and shot query context when navigating.

## 4. Cache and prompts

- Cache supports per-file selection and selected-only download; video preview shows archived generation prompt/model/provider when available.
- Prompt library is a top-level navigation item and directly combines read-only company prompts with editable personal prompts/folders.
- Company prompts use exactly scene, prop, character, video, and text categories plus custom tags; admin and user views share the same API records.
- Remove duplicate prompt-config entry from the global configuration modal.

## 5. Legacy server asset library removal

- Remove admin navigation/page, public page, API routes, handlers, services, repositories, and migrations for the legacy public asset library.
- Remove the external-library tab from the canvas picker.
- Retain local assets, generic media cache, Volcengine upload/review support, and existing old database data.

## Acceptance

- Focused regression tests for every requirement group pass.
- TypeScript, relevant Go tests, and production build pass.
- Docker app is healthy.
- Browser smoke confirms current-project navigation, streamlined workflow/storyboard, local asset actions, cache controls, prompt taxonomy/library, old-route 404s, and no console errors.
