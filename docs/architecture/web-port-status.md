# Web port status

Updated October 17, 2026.

## Implemented in this checkout

- Browser boot through the shared renderer and simulator.
- IndexedDB settings, recovery, project, custom-chip, and ROM storage.
- Native File System Access API save/open with upload/download fallback.
- Portable v5 `.chiphippo` files with content-addressed ROM images.
- Lesson embeds, local reset/autosave, Open full workbench, and the validated
  versioned parent/iframe protocol.
- Curated project retrieval at `/p/:id` and `/embed/project/:id`, sourced from
  allowlisted `.chiphippo` files uploaded by an authorized Drupal editor.
- A read-only lab server with no project-write API, plus security headers,
  exact iframe ancestor policy, and server-side non-execution of project data.
- Browser tabs for the guide and standard pin assignments, plus
  `BroadcastChannel` transport for memory, chip-designer, and CPU-monitor
  auxiliary interfaces.
- Fingerprinted production entry assets, CI build/service tests, ARM
  systemd/Nginx templates, backup/rollback notes, and GPL source guidance.
- Drupal 10.3/11 text-filter package with responsive, origin-validated lesson
  and Media Library project embeds.

## Requires external access or decisions

- Acceptance-test the Drupal module on a real site;
  connect its token output to the existing CKEditor 5 button/dialog. An
  optional editor-only Save to Drupal action should use the authenticated
  Drupal parent and Media permission, never a password stored in lab code.
- Choose the final subdomain spelling, add DNS, provision TLS, and deploy to the
  server. The templates currently use
  `breadboardlab.example.com`.
- Publish a tagged source release and change the in-app Source link to that
  exact tag for the first public deployment.
- Run the real article acceptance matrix across a production Drupal site, Safari,
  Firefox, mobile/touch hardware, and iframe storage/privacy modes.
- Configure Drupal/Nginx to serve public `.chiphippo` Media files with CORS
  access limited to the lab origin.

These are deployment/integration gates, not missing simulator code. They need
the Drupal repository, hosting, DNS account, and final policy choices.
