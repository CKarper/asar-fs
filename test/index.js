'use strict';

const AsarFs = require('..');
let asarFs = new AsarFs(__dirname + '/nexe.asar').patch();

var fs = require('fs');

var test = require('./test');
var async = require('async');
var moment = require('moment');

//var props = require('./props/index.json');

console.log(new moment().toString());

test.nike();

fs.readFile('props/index.json', 'utf8', function (err, data) {
  if (err) { return console.error(err); }

  let props = JSON.parse(data);
  console.dir(props, { colors: true, depth: 10 });
});

fs.readFile('scrimp.txt', 'utf8', function (err, data) {
  if (err) { return console.error(err); }

  console.log(data);
});

//console.log(props.property);
