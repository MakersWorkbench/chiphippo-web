# Drupal integration

`chiphippo_embed` is a Drupal 10.3/11 text-filter module and responsive iframe
behavior. Install it under `web/modules/custom/chiphippo_embed`, enable it, then
enable **Chip Hippo embed** in the desired text format after the HTML filter.

Editors can insert either form:

```text
[chiphippo type=lesson id=74ls00-intro title="NAND gate lab"]
[chiphippo type=project id=counter source="/sites/default/files/chiphippo/counter.chiphippo" title="Reader-editable counter"]
```

Only Drupal users with Media Library upload access publish projects: export a
`.chiphippo` file from the lab, upload it to Drupal Media Library, and insert a
project token with that managed file's public `/sites/default/files/...` path.
Readers can edit the loaded copy, but the lab has no API that can write it back
to Drupal or the lab server. They use **Save As** to export their own local
copy and **Open** to import it on a later visit.

The filter constructs the simulator URL, escapes the title, constrains IDs,
and only accepts `.chiphippo` sources beneath `/sites/default/files/`. If
TMWB's existing CKEditor 5 module already provides a media dialog, make it
resolve the selected Media entity's file URL into this token and retain this
filter as the rendering/security boundary.

Drupal must send
`Access-Control-Allow-Origin: https://breadboardlab.themakersworkbench.com`
when serving `.chiphippo` Media files. Do not enable credentials; the published
asset is a public, read-only article dependency.

## Optional editor-only Save to Drupal

Do not put a shared admin password or Drupal credential in lab JavaScript. For
a later one-click workflow, add the button only when the lab is opened inside
an authenticated Drupal editor. The lab hands the exported project to its
verified parent frame; the Drupal-side plugin performs the Media upload on the
same Drupal origin with the current user's Media permission and CSRF
protection. Public article embeds receive no editor capability and therefore
never show or expose this function. This preserves Drupal as the sole
authorization boundary and keeps the lab service read-only.

Change the simulator origin in both the PHP filter and JavaScript if the final
subdomain differs. Keep it synchronized with the server's `frame-ancestors`
header.
