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

const DB_NAME = "chiphippo-web";
const DB_VERSION = 1;
const STORE = "key-value";

/** A small promise wrapper around Chip Hippo's browser IndexedDB database. */
export class BrowserStorage {
  #indexedDB;
  #name;
  #opening = null;

  constructor(indexedDB = globalThis.indexedDB, name = DB_NAME) {
    if (!indexedDB) throw new Error("IndexedDB is unavailable");
    this.#indexedDB = indexedDB;
    this.#name = name;
  }

  #open() {
    if (this.#opening) return this.#opening;
    this.#opening = new Promise((resolve, reject) => {
      const request = this.#indexedDB.open(this.#name, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed")); // prettier-ignore
      request.onblocked = () =>
        reject(new Error("IndexedDB upgrade is blocked"));
    });
    return this.#opening;
  }

  async #request(mode, action) {
    const db = await this.#open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed")); // prettier-ignore
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted")); // prettier-ignore
    });
  }

  get(key) {
    return this.#request("readonly", (store) => store.get(key));
  }

  set(key, value) {
    return this.#request("readwrite", (store) => store.put(value, key));
  }

  delete(key) {
    return this.#request("readwrite", (store) => store.delete(key));
  }
}
