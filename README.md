# asar-fs
A rudimentary fs and module monkeypatch to support loading files and modules from an atom/asar archive.

## Installation
```npm i asar-fs```

## Usage

Example:
```javascript
  const AsarFs = require('asar-fs');
  let asarFs = new AsarFs(__dirname + '/app.asar').patch();
```

### constructor(archive)
This initializes the asar-fs instance, and will bind to the specified archive.

### patch()
This will monkeypatch built-in modules for asar reading capabilities.  Modules can be ```require```d from the archive, as well as fs readFile and readFileSync access.

### unpatch()
This will remove any installed monkeypatches, restoring all modules back to their original state.

---

[asar]: https://github.com/atom/asar
[grunt-asar]: https://github.com/bwin/grunt-asar