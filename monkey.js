'use strict';

const path = require('path');

const asar = require('asar');

const archive = path.resolve(process.cwd(), 'nexe.asar');
let archFs = asar.disk.readFilesystemSync(archive);

let original = {};

let monkey = {
  fs: {
    readFileSync: function readFileSync(request, options) {
      let f = getFileFromArchive(request, options);
      if (f) {
        return f;
      }
      return original.fs.readFileSync(request, options);
    },
    readFile: function readFile(request, options, callback_) {
      let callback = function (err, data) {
        let cb = maybeCallback(callback_);
        if (!err) { return cb(err, data); }
        //errno: -2 is ENOENT - If file doesn't exist in the real fs, then we make an archive check
        if (err && err.errno === -2 && err.syscall === 'open') {
          let f = getFileFromArchive(request, options);
          if (f) { return cb(null, f); }
        }
        return cb(err, data);
      }

      return original.fs.readFile(request, options, callback);
    }
  },
  module: {
    _findPath: function _findPath(request, paths) {

      var ret = original.module._findPath(request, paths);
      if (ret) { return ret; }

      var exts = Object.keys(this._extensions);
      let basePath = path.resolve(archFs.src, '..');

      ret = paths.reduce(function (acc, testPath) {
        if (!acc) {
          let relPath = path.relative(basePath, testPath);
          if (!/^\./.test(relPath)) {
            let node = relPath.length ? archFs.searchNodeFromDirectory(relPath) : archFs.header;
            if (node && node.files) {

              var filename = path.join(relPath, request);
              node = archFs.searchNodeFromDirectory(filename);
              if (node) {
                if (node.size) {
                  return filename;
                }
                else if (node.files) {
                  // It's a directory, try to load it as a package
                  let pkgFile = path.join(filename, 'package.json');
                  node = archFs.searchNodeFromDirectory(pkgFile);
                  if (node && node.size) {
                    // It's a package directory, parse the package out and find the main script...
                    let mainFile = readPackage(pkgFile);
                    if (mainFile) {
                      mainFile = path.join(filename, mainFile);
                      node = archFs.searchNodeFromDirectory(mainFile);
                      if (node && node.size) {
                        return mainFile;
                      }
                    }
                  }
                  let extFile = path.join(filename, 'index.js');
                  node = archFs.searchNodeFromDirectory(extFile);
                  if (node && node.size) { return extFile; }
                }
              }
              else {
                // It just wasn't found, try appending extensions to the pathspec
                for (let i = 0; i < exts.length; i++) {
                  let extFile = filename + exts[i];
                  node = archFs.searchNodeFromDirectory(extFile);
                  if (node && node.size) { return extFile; }
                }
              }

            }
          }
        }
        return acc;
      }, ret);

      if (ret) {
        ret = path.join(archive, ret);
        let cacheKey = JSON.stringify({request: request, paths: paths});
        this._pathCache[cacheKey] = ret;
      }

      return ret;
    }
  }
}

// It's monkey-patch time!
var modules = Object.keys(monkey);
for (let i = 0; i < modules.length; i++) {
  let moduleName = modules[i];
  original[moduleName] = {};
  let module = require(moduleName);
  let methods = Object.keys(monkey[moduleName]);
  for (let j = 0; j < methods.length; j++) {
    let methodName = methods[j];
    original[moduleName][methodName] = module[methodName];
    module[methodName] = monkey[moduleName][methodName].bind(module);
  }
}

function getFileFromArchive(request, options) {
  var relFile = path.relative(archFs.src, request);
  // If it's not archive prefixed, strip a single parent directory...
  if (/^\.\.\//.test(relFile)) {
    relFile = relFile.substr(3);
  }
  // If it's still got a parent directory, or starts with /, it's not in our archive...
  if (!/^\.\.\/|^\//.test(relFile)) {
    let f;
    let node = archFs.searchNodeFromDirectory(relFile);
    if (node && node.size) {
      let encoding;
      if (options && typeof options === 'string') {
        encoding = options;
      }

      f = asar.extractFile(archive, relFile);
      if (encoding) { f = f.toString(encoding); }
    }
    return f;
  }
}

// check if the directory is a package.json dir
const packageMainCache = {};

function readPackage(pkgFile) {
  if (Object.hasOwnProperty(packageMainCache, pkgFile)) {
    return packageMainCache[pkgFile];
  }

  var jsonPath = pkgFile;
  var json = asar.extractFile(archive, pkgFile);

  if (json === undefined) {
    return false;
  }

  try {
    var pkg = packageMainCache[pkgFile] = JSON.parse(json).main;
  } catch (e) {
    e.path = jsonPath;
    e.message = 'Error parsing ' + jsonPath + ': ' + e.message;
    throw e;
  }
  return pkg;
}

// Hacked right out of lib/fs.js
function maybeCallback(cb) {
  return typeof cb === 'function' ? cb : rethrow();
}

function rethrow() {
  // Only enable in debug mode. A backtrace uses ~1000 bytes of heap space and
  // is fairly slow to generate.
  if (DEBUG) {
    var backtrace = new Error();
    return function(err) {
      if (err) {
        backtrace.stack = err.name + ': ' + err.message +
                          backtrace.stack.substr(backtrace.name.length);
        throw backtrace;
      }
    };
  }
}