"use strict";

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

function _toConsumableArray(arr) { return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _nonIterableSpread(); }

function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance"); }

function _iterableToArray(iter) { if (Symbol.iterator in Object(iter) || Object.prototype.toString.call(iter) === "[object Arguments]") return Array.from(iter); }

function _arrayWithoutHoles(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = new Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

var equal = require("deep-equal");

var json0 = require("ot-json0/lib/json0");
/**
 * Convert a number of string patches to OT operations.
 * @param  {JsonMLPath} path Base path for patches to apply to.
 * @param  {string} oldValue Old value.
 * @param  {string} newValue New value.
 * @return {Ops}             List of resulting operations.
 */


function patchesToOps(path, oldValue, newValue, diffMatchPatch, diffMatchPatchInstance) {
  var ops = [];
  var patches = diffMatchPatchInstance.patch_make(oldValue, newValue);
  Object.keys(patches).forEach(function (i) {
    var patch = patches[i],
        offset = patch.start1;
    patch.diffs.forEach(function (_ref) {
      var _ref2 = _slicedToArray(_ref, 2),
          type = _ref2[0],
          value = _ref2[1];

      switch (type) {
        case diffMatchPatch.DIFF_DELETE:
          ops.push({
            sd: value,
            p: [].concat(_toConsumableArray(path), [offset])
          });
          break;

        case diffMatchPatch.DIFF_INSERT:
          ops.push({
            si: value,
            p: [].concat(_toConsumableArray(path), [offset])
          });
        // falls through intentionally

        case diffMatchPatch.DIFF_EQUAL:
          offset += value.length;
          break;

        default:
          throw Error("Unsupported operation type: ".concat(type));
      }
    });
  });
  return ops;
}

var diffMatchPatchInstance;

var optimize = function optimize(ops) {
  /*
  Optimization loop where we attempt to find operations that needlessly inserts and deletes identical objects right
  after each other, and then consolidate them.
   */
  for (var i = 0, l = ops.length - 1; i < l; ++i) {
    var a = ops[i],
        b = ops[i + 1]; // The ops must have same path.

    if (!equal(a.p.slice(0, -1), b.p.slice(0, -1))) {
      continue;
    } // The indices must be successive.


    if (a.p[a.p.length - 1] + 1 !== b.p[b.p.length - 1]) {
      continue;
    } // The first operatin must be an insertion and the second a deletion.


    if (a.li && b.ld && equal(a.li, b.ld)) {
      delete a.li;
      delete b.ld; // The first operatin must be a deletion and the second an insertion.
    } else if (b.li && a.ld && equal(b.li, a.ld)) {
      delete b.li;
      delete a.ld;
    }
  }

  ops = ops.filter(function (op) {
    return Object.keys(op).length > 1;
  });
  return ops;
};

var diff = function diff(input, output) {
  var path = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : [];
  var diffMatchPatch = arguments.length > 3 ? arguments[3] : undefined;
  // If the last element of the path is a string, that means we're looking at a key, rather than
  // a number index. Objects use keys, so the target for our insertion/deletion is an object.
  var isObject = typeof path[path.length - 1] === "string"; // If input and output are equal, no operations are needed.

  if (equal(input, output)) {
    return [];
  } // If there is no output, we need to delete the current data (input).


  if (typeof output === "undefined") {
    var op = {
      p: path
    };
    op[isObject ? "od" : "ld"] = input;
    return [op];
  } // If there is no input, we need to add the new data (output).


  if (typeof input === "undefined") {
    var op = {
      p: path
    };
    op[isObject ? "oi" : "li"] = output;
    return [op];
  } // If diffMatchPatch was provided, handle string mutation.


  if (diffMatchPatch && typeof input === "string" && typeof output === "string") {
    // Instantiate the instance of diffMatchPatch only once.
    if (!diffMatchPatchInstance) {
      diffMatchPatchInstance = new diffMatchPatch();
    }

    return patchesToOps(path, input, output, diffMatchPatch, diffMatchPatchInstance);
  }

  var primitiveTypes = ["string", "number", "boolean"]; // If either of input/output is a primitive type, there is no need to perform deep recursive calls to
  // figure out what to do. We can just replace the objects.

  if (primitiveTypes.includes(_typeof(output)) || primitiveTypes.includes(_typeof(input))) {
    var op = {
      p: path
    };
    op[isObject ? "od" : "ld"] = input;
    op[isObject ? "oi" : "li"] = output;
    return [op];
  }

  if (Array.isArray(output)) {
    var ops = [];
    var l = Math.max(input.length, output.length);
    var ops = [];
    var offset = 0;

    for (var i = 0; i < l; ++i) {
      var newOps = diff(input[i], output[i], [].concat(_toConsumableArray(path), [i + offset]), diffMatchPatch);
      newOps.forEach(function (op) {
        var opParentPath = op.p.slice(0, -1);

        if (equal(path, opParentPath)) {
          if ('ld' in op && !('li' in op)) offset--;
        }

        ops.push(op);
      });
    }

    return ops;
  }

  var ops = [];
  var keys = new Set([].concat(_toConsumableArray(Object.keys(input)), _toConsumableArray(Object.keys(output))));
  keys.forEach(function (key) {
    var newOps = diff(input[key], output[key], [].concat(_toConsumableArray(path), [key]), diffMatchPatch);
    ops = ops.concat(newOps);
  });
  return ops;
};

var optimizedDiff = function optimizedDiff(input, output, diffMatchPatch) {
  return optimize(diff(input, output, [], diffMatchPatch));
};

module.exports = optimizedDiff;
