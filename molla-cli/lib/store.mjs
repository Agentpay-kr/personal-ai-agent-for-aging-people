import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { seed } from '../runtime/domain.mjs';
import { migrate } from '../runtime/ontology.mjs';

export class Store {
 constructor(path){
  this.path=resolve(path);mkdirSync(dirname(this.path),{recursive:true,mode:0o700});
  // Memories, contacts and session hashes live here: create the DB and its WAL/SHM owner-only.
  const umask=process.umask(0o077);
  try{
   this.db=new DatabaseSync(this.path);this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS cli_meta(id INTEGER PRIMARY KEY,runtime_id TEXT NOT NULL); CREATE TABLE IF NOT EXISTS cli_sessions(token_hash TEXT PRIMARY KEY,actor TEXT NOT NULL,expires_at INTEGER NOT NULL);');
  }finally{process.umask(umask);}
  for(const f of [this.path,`${this.path}-wal`,`${this.path}-shm`])if(existsSync(f))chmodSync(f,0o600);
  this.db.exec('BEGIN IMMEDIATE');try{
   if(!this.db.prepare('SELECT id FROM state WHERE id=1').get())this.db.prepare('INSERT INTO state VALUES(1,?)').run(JSON.stringify(seed()));
   if(!this.db.prepare('SELECT id FROM cli_meta WHERE id=1').get())this.db.prepare('INSERT INTO cli_meta VALUES(1,?)').run(randomUUID());
   this.runtimeId=this.db.prepare('SELECT runtime_id FROM cli_meta WHERE id=1').get().runtime_id;this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 read(){return migrate(JSON.parse(this.db.prepare('SELECT data FROM state WHERE id=1').get().data));}
 transaction(fn){
  this.db.exec('BEGIN IMMEDIATE');try{const state=this.read();const result=fn(state);if(result?.then)throw new Error('Transactions must be synchronous');this.db.prepare('UPDATE state SET data=? WHERE id=1').run(JSON.stringify(state));this.db.exec('COMMIT');return structuredClone(result??{ok:true});}catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 close(){this.db.close();}
}
