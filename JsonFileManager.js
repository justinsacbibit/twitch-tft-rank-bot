// @flow
const fs = require('mz/fs');
const AsyncLock = require('async-lock');


const lock = new AsyncLock();

class JsonFileManager/*: <T: Object> */ {
  /*:: path: string; */
  /*:: defaultValue: T; */

  constructor(name /*: string */, defaultValue /*: T */) {
    this.path = `./${name}.json`;
    this.defaultValue = defaultValue;
  }

  async load()/*: Promise<T> */ {
    return await lock.acquire(this.path, async () => {
      try {
        const body = await fs.readFile(this.path);
        return JSON.parse(body);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw new Error(`Could not read file at ${this.path}: ${err.toString()}`);
        }
      }

      try {
        await fs.writeFile(this.path, JSON.stringify(this.defaultValue));
        console.log('Wrote', this.defaultValue, 'to', this.path);
      } catch (err) {
        throw new Error(`Could not write default value to ${this.path}: ${err.toString()}`)
      }

      return this.defaultValue;
    });
  }

  async save(value /*: T */) {
    return await lock.acquire(this.path, async () => {
      try {
        return await fs.writeFile(this.path, JSON.stringify(value));
      } catch (err) {
        throw new Error(`Could not save to ${this.path}: ${err.toString()}`)
      }
    });
  }
}
exports.JsonFileManager = JsonFileManager;