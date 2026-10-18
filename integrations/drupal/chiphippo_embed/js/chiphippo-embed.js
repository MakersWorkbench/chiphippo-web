/**
 * @file
 * Keeps Chip Hippo iframes responsive and validates their messages.
 */

(function (Drupal, once) {
  "use strict";

  const simulatorOrigin = "https://breadboardlab.themakersworkbench.com";

  Drupal.behaviors.chipHippoEmbed = {
    attach(context) {
      once("chiphippo-embed", "[data-chiphippo-embed]", context).forEach(
        (container) => {
          const frame = container.querySelector("iframe");
          if (!frame) return;
          window.addEventListener("message", (event) => {
            if (
              event.origin !== simulatorOrigin ||
              event.source !== frame.contentWindow ||
              event.data?.protocol !== "chiphippo" ||
              event.data?.version !== 1
            ) {
              return;
            }
            if (event.data.type === "chiphippo.height") {
              const height = Math.max(
                512,
                Math.min(1400, Number(event.data.height) || 0),
              );
              frame.style.height = `${height}px`;
            }
          });
        },
      );
    },
  };
})(Drupal, once);
