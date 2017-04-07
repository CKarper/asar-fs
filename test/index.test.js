import fs from 'fs';
import path from 'path';
import test from 'ava';

import AsarFs from '../dist';

const asarFs = new AsarFs(path.join(__dirname, '_test.asar'));

test.before(() => {
  asarFs.patch();
});

test.after(() => {
  asarFs.unpatch();
});

test('construction', (t) => {
  t.is(typeof asarFs, 'object');
});

test.cb('monkey patched readFile - archived file', (t) => {
  fs.readFile(path.join(__dirname, 'props/index.json'), 'utf8', (err, data) => {
    if (err) {
      t.fail();
      t.end();
      return;
    }

    const props = JSON.parse(data);

    t.is(props.property, 'value');
    t.end();
  });
});

test.cb('monkey patched readFile - plain file', (t) => {
  fs.readFile(path.join(__dirname, 'fixture/asar/props/index.json'), 'utf8', (err, data) => {
    if (err) {
      t.fail();
      t.end();
      return;
    }

    const props = JSON.parse(data);

    t.is(props.property, 'value');
    t.end();
  });
});

test.cb('monkey patched readFile - nonexistent file', (t) => {
  fs.readFile(path.join(__dirname, 'failure/index.json'), 'utf8', (err) => {
    if (err) {
      t.pass();
      t.end();
      return;
    }

    t.fail();
    t.end();
  });
});

test('monkey patched readFile - nonexistent file, no callback', (t) => {
  fs.readFile(path.join(__dirname, 'failure/index.json'), 'utf8');
  t.pass();
});

test('monkey patched readFileSync - archived file', (t) => {
  const data = fs.readFileSync(path.join(__dirname, 'props/index.json'), 'utf8');
  const props = JSON.parse(data);

  t.is(props.property, 'value');
});

test('monkey patched readFileSync - plain file', (t) => {
  const data = fs.readFileSync(path.join(__dirname, 'fixture/asar/props/index.json'), 'utf8');
  const props = JSON.parse(data);

  t.is(props.property, 'value');
});

test('monkey patched readFileSync - nonexistent file', (t) => {
  t.plan(2);
  try {
    fs.readFileSync(path.join(__dirname, 'failure/index.json'), 'utf8');
  }
  catch (err) {
    t.is(err instanceof Error, true);
    t.is(err.code, 'ENOENT');
  }
});

test('monkey patched require - specified file', (t) => {
  // eslint-disable-next-line global-require, import/no-unresolved, import/no-dynamic-require
  const nike = require('./nike.js');

  t.is(typeof nike.nike, 'function');
  t.is(nike.nike(), 'Just do it!');
});

test('monkey patched require - inferred extension [.js]', (t) => {
  // eslint-disable-next-line global-require, import/no-unresolved, import/no-dynamic-require
  const nike = require('./nike');

  t.is(typeof nike.nike, 'function');
  t.is(nike.nike(), 'Just do it!');
});

test('monkey patched require - inferred extension [.json]', (t) => {
  // eslint-disable-next-line global-require, import/no-unresolved, import/no-dynamic-require
  const props = require('./props/index');

  t.is(props.property, 'value');
});

test('monkey patched require - package folder', (t) => {
  // eslint-disable-next-line global-require, import/no-unresolved, import/no-dynamic-require
  const lib = require('./package');

  t.is(typeof lib.boolMethod, 'function');
  t.is(lib.boolMethod(), true);
});

test('monkey patched require - broken package folder', (t) => {
  t.plan(1);
  try {
    // eslint-disable-next-line global-require, import/no-unresolved, import/no-dynamic-require
    require('./broken');
  }
  catch (err) {
    t.is(err instanceof Error, true);
  }
});

test('monkey patched require - indexed folder [index.js]', (t) => {
  // eslint-disable-next-line global-require, import/no-unresolved, import/no-dynamic-require
  const lib = require('./lib');

  t.is(typeof lib.intMethod, 'function');
  t.is(lib.intMethod(), 42);
});
