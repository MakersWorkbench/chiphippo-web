/*
 * Copyright 2026 Jason Figge
 *
 * This file is part of Chip Hippo.
 *
 * Chip Hippo is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * Chip Hippo is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Chip Hippo. If not, see <https://www.gnu.org/licenses/>.
 */

export const EMBED_PROTOCOL_VERSION = 1;

export const DEFAULT_PARENT_ORIGINS = Object.freeze([
  "https://themakersworkbench.com",
  "https://www.themakersworkbench.com",
  "https://staging.themakersworkbench.com",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);

const TYPES = new Set([
  "chiphippo.reset",
  "chiphippo.load-lesson",
  "chiphippo.open-full",
]);

export function allowedParentOrigin(
  origin,
  allowlist = DEFAULT_PARENT_ORIGINS,
) {
  return allowlist.includes(String(origin));
}

export function validParentMessage(event, parentWindow, allowlist) {
  const message = event?.data;
  return Boolean(
    event?.source === parentWindow &&
    allowedParentOrigin(event?.origin, allowlist) &&
    message &&
    typeof message === "object" &&
    message.protocol === "chiphippo" &&
    message.version === EMBED_PROTOCOL_VERSION &&
    TYPES.has(message.type),
  );
}

export function protocolMessage(type, detail = {}) {
  return {
    protocol: "chiphippo",
    version: EMBED_PROTOCOL_VERSION,
    type,
    ...detail,
  };
}
