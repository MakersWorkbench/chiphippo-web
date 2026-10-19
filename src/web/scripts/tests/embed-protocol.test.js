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

import assert from "node:assert/strict";
import test from "node:test";
import {
  EMBED_PROTOCOL_VERSION,
  protocolMessage,
  validParentMessage,
} from "../embed-protocol.js";

test("embed protocol emits a small versioned envelope", () => {
  assert.deepEqual(protocolMessage("chiphippo.loaded", { lessonId: "nand" }), {
    protocol: "chiphippo",
    version: EMBED_PROTOCOL_VERSION,
    type: "chiphippo.loaded",
    lessonId: "nand",
  });
});

test("embed protocol accepts commands only from its parent and allowlist", () => {
  const parent = {};
  const message = {
    source: parent,
    origin: "http://127.0.0.1:4173",
    data: protocolMessage("chiphippo.reset"),
  };
  assert.equal(validParentMessage(message, parent), true);
  assert.equal(
    validParentMessage({ ...message, origin: "https://example.com" }, parent),
    false,
  );
  assert.equal(validParentMessage({ ...message, source: {} }, parent), false);
  assert.equal(
    validParentMessage(
      {
        ...message,
        data: { ...message.data, version: EMBED_PROTOCOL_VERSION + 1 },
      },
      parent,
    ),
    false,
  );
  assert.equal(
    validParentMessage(
      { ...message, data: protocolMessage("chiphippo.delete-everything") },
      parent,
    ),
    false,
  );
});
