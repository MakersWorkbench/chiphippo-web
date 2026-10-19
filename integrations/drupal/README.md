# Drupal integration: `chiphippo_embed`

A Drupal 10.3 / 11 module that connects a Drupal site to a self-hosted
**Chip Hippo Web** copy. It is optional and has no ties to any particular site:
you point it at your own Chip Hippo Web address.

- A **Chip Hippo Circuit** CKEditor 5 button inserts a live, editable circuit
  into any article.
- A text filter turns the editor placeholder into a sandboxed iframe at render time.
- A **Chip Hippo Project** media type stores `.chiphippo` circuit files, so an
  article embeds one specific circuit (or a blank workbench, or a built-in lesson).
- **Save to site**: the lab's File toolbar can push the open circuit straight
  into the Media Library through `POST /api/chiphippo/save-project`.

## Install

1. Copy this folder to `web/modules/custom/chiphippo_embed` and enable it
   (`drush en chiphippo_embed`). The compiled editor plugin
   (`js/build/chiphippoEmbed.js`) is committed; to change it, edit the sources
   under `js/ckeditor5_plugins/` and run `npm install && npm run build`.
2. Open **Configuration > Content authoring > Chip Hippo Embed settings**
   (`/admin/config/content/chiphippo`):
   - **Simulator base URL**: where your Chip Hippo Web copy is hosted, for
     example `https://circuits.example.com`.
   - **Allowed origins (CORS)**: the same address, so the lab may call the save endpoint.
   - **Generate new token**: copy it immediately; only its hash is stored.
3. In **Text formats and editors**, enable the **Chip Hippo embed** filter and
   drag the **Chip Hippo Circuit** button into the toolbar of the formats that
   should offer it.

## Configure the Chip Hippo Web side

Build and run Chip Hippo Web with your site listed (see `deploy/README.md`):

```sh
CHIPHIPPO_SITE_ORIGINS=https://www.example.com npm run web:build   # in src/
CHIPHIPPO_SITE_ORIGINS=https://www.example.com node server/chiphippo-server.mjs
```

That one list says which sites may embed the lab in an iframe, supply project
files to it, and receive saved circuits. With it unset, the lab is a standalone
workbench and the Save to site button is hidden.

## Use

- **Save**: in the lab (`/app/`) click **Save to site**. The first time it asks
  for the site address (use the exact host the site serves from; a redirect from
  a bare domain to `www` breaks cross-origin requests) and the token. They are
  kept in that browser only.
- **Embed**: in the editor click **Chip Hippo Circuit**, choose a saved project
  (or a lesson id, or leave blank for an empty workbench), and insert it.

## Security notes

- The save endpoint needs the bearer token and an allowed origin; CORS never
  falls back to `*`. Use HTTPS so the token is not sent in clear text.
- Project files are served through `/chiphippo-project/{media}/file` with
  `Access-Control-Allow-Origin: *`, because the lab fetches them from another
  origin. Access follows the media item's own view permission. Never put
  anything secret in a circuit.
- Saved projects are owned by user 1. The iframe uses a restricted `sandbox`.
