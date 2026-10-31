import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { initialState } from "./core.mjs";
import { backupSchema } from "./schemas.mjs";

export class Store {
  constructor(filename) {
    if (filename !== ":memory:")
      mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)",
    );
    const row = this.db.prepare("SELECT payload FROM state WHERE id=1").get();
    this.state = row
      ? backupSchema.parse(JSON.parse(row.payload))
      : initialState();
  }
  update(change) {
    const next = structuredClone(this.state);
    change(next);
    this.db
      .prepare(
        "INSERT INTO state(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      )
      .run(JSON.stringify(next));
    this.state = next;
    return next;
  }
  replace(next) {
    return this.update((state) => Object.assign(state, next));
  }
  close() {
    this.db.close();
  }
}
