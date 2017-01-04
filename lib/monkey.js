/* eslint no-underscore-dangle: 0 */

const path = require('path');
const asar = require('asar');
const disk = require('asar/lib/disk.js');
const Module = require('module');

let _archFs;
const _original = {};

function getFileFromArchive(request, options) {
  let relFile = path.relative(_archFs.src, request);
  // If it's not archive prefixed, strip a single parent directory...
  if (/^\.\.\//.test(relFile)) {
    relFile = relFile.substr(3);
  }
  // If it's still got a parent directory, or starts with /, it's not in our archive...
  if (!/^\.\.\/|^\//.test(relFile)) {
    let f;
    try {
      const node = _archFs.searchNodeFromDirectory(relFile);
      if (node && node.size) {
        let encoding;
        if (options && typeof options === 'string') {
          encoding = options;
        }

        f = asar.extractFile(_archFs.src, relFile);
        if (encoding) { f = f.toString(encoding); }
      }
    }
    catch (err) {}
    return f;
  }
  return undefined;
}

function maybeCallback(cb) {
  return typeof cb === 'function' ? cb : () => {};
}

// check if the directory is a package.json dir
const packageMainCache = {};

function readPackage(pkgFile) {
  if (Object.prototype.hasOwnProperty.call(packageMainCache, pkgFile)) {
    return packageMainCache[pkgFile];
  }

  const jsonPath = pkgFile;
  const json = asar.extractFile(_archFs.src, pkgFile);

  if (json === undefined) {
    return false;
  }

  let pkg;
  try {
    pkg = packageMainCache[pkgFile] = JSON.parse(json).main;
  }
  catch (err) {
    err.path = jsonPath;
    err.message = `Error parsing ${jsonPath}: ${err.message}`;
    throw err;
  }
  return pkg;
}

const monkey = {
  fs: {
    readFileSync: (request, options) => {
      const f = getFileFromArchive(request, options);
      if (f) {
        return f;
      }
      return _original.fs.readFileSync(request, options);
    },

    readFile: (request, options, callback_) => {
      const callback = (err, data) => {
        const cb = maybeCallback(callback_);
        if (!err) { return cb(err, data); }

        // errno: -2 is ENOENT - If file doesn't exist in the real fs, then we make an archive check
        if (err && err.errno === -2 && err.syscall === 'open') {
          const f = getFileFromArchive(request, options);
          if (f) { return cb(null, f); }
        }
        return cb(err, data);
      };

      return _original.fs.readFile(request, options, callback);
    },
  },

  module: {
    _findPath: (request, paths) => {
      let ret = _original.module._findPath(request, paths);
      if (ret) { return ret; }

      const exts = Object.keys(Module._extensions);
      const basePath = path.resolve(_archFs.src, '..');

      ret = paths.reduce((acc, testPath) => {
        if (!acc) {
          const relPath = path.relative(basePath, testPath);
          if (!/^\./.test(relPath)) {
            let node = relPath.length ? _archFs.searchNodeFromDirectory(relPath) : _archFs.header;

            if (node && node.files) {
              const filename = path.join(relPath, request);
              node = _archFs.searchNodeFromDirectory(filename);
              if (node) {
                if (node.size) {
                  return filename;
                }
                else if (node.files) {
                  // It's a directory, try to load it as a package
                  const pkgFile = path.join(filename, 'package.json');
                  node = _archFs.searchNodeFromDirectory(pkgFile);
                  if (node && node.size) {
                    // It's a package directory, parse the package out and find the main script...
                    let mainFile = readPackage(pkgFile);
                    if (mainFile) {
                      mainFile = path.join(filename, mainFile);
                      node = _archFs.searchNodeFromDirectory(mainFile);
                      if (node && node.size) {
                        return mainFile;
                      }
                    }
                  }
                  const extFile = path.join(filename, 'index.js');
                  node = _archFs.searchNodeFromDirectory(extFile);
                  if (node && node.size) { return extFile; }
                }
              }
              else {
                // It just wasn't found, try appending extensions to the pathspec
                for (let i = 0; i < exts.length; i += 1) {
                  const extFile = filename + exts[i];
                  node = _archFs.searchNodeFromDirectory(extFile);
                  if (node && node.size) {
                    return extFile;
                  }
                }
              }
            }
          }
        }
        return acc;
      }, ret);

      if (ret) {
        ret = path.join(_archFs.src, ret);
        const cacheKey = JSON.stringify({ request, paths });
        Module._pathCache[cacheKey] = ret;
      }

      return ret;
    },
  },
};

class AsarFs {
  constructor(archive) {
    _archFs = disk.readFilesystemSync(archive);
    this.archive = _archFs.src;
  }

  patch() {
    // It's monkey-patch time!
    const modules = Object.keys(monkey);
    modules.forEach((moduleName) => {
      /* eslint-disable global-require, import/no-dynamic-require */
      const module = require(moduleName);
      /* eslint-enable global-require, import/no-dynamic-require */

      const methods = Object.keys(monkey[moduleName]);
      _original[moduleName] = {};
      methods.forEach((methodName) => {
        _original[moduleName][methodName] = module[methodName];
        module[methodName] = monkey[moduleName][methodName].bind(module);
      });
    });
    return this;
  }

  unpatch() {
    // It's monkey-unpatch time!
    const modules = Object.keys(monkey);
    modules.forEach((moduleName) => {
      /* eslint-disable global-require, import/no-dynamic-require */
      const module = require(moduleName);
      /* eslint-enable global-require, import/no-dynamic-require */

      const methods = Object.keys(monkey[moduleName]);
      methods.forEach((methodName) => {
        module[methodName] = _original[moduleName][methodName];
        delete _original[moduleName][methodName];
      });
      delete _original[moduleName];
    });
    return this;
  }
}

module.exports = AsarFs;
