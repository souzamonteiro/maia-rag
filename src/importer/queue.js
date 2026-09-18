import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';

export class ImportQueue {
  constructor(file) {
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS imports (
        id TEXT PRIMARY KEY, source TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0, error TEXT, result TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS worker (id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT, expires INTEGER);
    `);
  }
  add(source) {
    const json = JSON.stringify(source);
    const id = createHash('sha256').update(json).digest('hex');
    return this.db.prepare('INSERT OR IGNORE INTO imports(id,source) VALUES (?,?)').run(id, json).changes;
  }
  acquire() {
    const owner = randomUUID();
    this.db.transaction(() => {
      const current = this.db.prepare('SELECT * FROM worker WHERE id=1').get();
      if (current && current.expires > Date.now()) throw new Error('Another import worker is active.');
      this.db.prepare('INSERT OR REPLACE INTO worker VALUES (1,?,?)').run(owner, Date.now() + 60000);
      this.db.prepare("UPDATE imports SET status='pending' WHERE status='running'").run();
    }).immediate();
    this.owner = owner;
  }
  heartbeat() {
    const result = this.db.prepare('UPDATE worker SET expires=? WHERE id=1 AND owner=?').run(Date.now() + 60000, this.owner);
    if (!result.changes) throw new Error('Import worker lost its lease.');
  }
  next() {
    this.heartbeat();
    return this.db.transaction(() => {
      const job = this.db.prepare("SELECT * FROM imports WHERE status='pending' ORDER BY rowid LIMIT 1").get();
      if (!job) return null;
      this.db.prepare("UPDATE imports SET status='running', attempts=attempts+1, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(job.id);
      return { ...job, source: JSON.parse(job.source) };
    })();
  }
  finish(id, result) {
    this.heartbeat();
    this.db.prepare("UPDATE imports SET status='done', result=?, error=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(JSON.stringify(result), id);
  }
  fail(id, error) {
    this.heartbeat();
    this.db.prepare("UPDATE imports SET status='failed', error=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(String(error.message).slice(0, 1000), id);
  }
  retryFailed() {
    return this.db.prepare("UPDATE imports SET status='pending' WHERE status='failed'").run().changes;
  }
  status() {
    return this.db.prepare('SELECT status, count(*) AS count FROM imports GROUP BY status').all();
  }
  failures() {
    return this.db.prepare("SELECT id,error,attempts FROM imports WHERE status='failed'").all();
  }
  close() {
    if (this.owner) this.db.prepare('DELETE FROM worker WHERE owner=?').run(this.owner);
    this.db.close();
  }
}
