/**
 * Module dependencies.
 */
const url = require('./url');
const parser = require('socket.io-parser');
const Manager = require('./manager');
const debug = require('debug')('socket.io-client');

/**
 * Module exports.
 */

module.exports = exports = lookup;

/**
 * Managers cache.
 */

var cache = exports.managers = {};

/**
 * Looks up an existing `Manager` for multiplexing.
 * If the user summons:
 *
 *   `io('http://localhost/a');`
 *   `io('http://localhost/b');`
 *
 * We reuse the existing instance based on same scheme/port/host,
 * and we initialize sockets for each namespace.
 *
 * @api public
 */

function lookup (uri, opts) {
    if (typeof uri === 'object') {
        opts = uri;
        uri = undefined;
    }

    opts = opts || {
        multiplex: false,
        forceNew () {

        }
    };

    const parsed = url(uri);
    const source = parsed.source;
    const id = parsed.id;
    const path = parsed.path;
    const sameNamespace = cache[id] && path in cache[id].nsps;
    const newConnection = opts.forceNew || opts['force new connection'] ||
        false === opts.multiplex || sameNamespace;

    let io;

    if (newConnection) {

        io = Manager(source, opts);
    } else {
        if (!cache[id]) {

            cache[id] = Manager(source, opts);
        }
        io = cache[id];
    }
    if (parsed.query && !opts.query) {
        opts.query = parsed.query;
    }
    return io.socket(parsed.path, opts);
}

/**
 * Protocol version.
 *
 * @api public
 */

exports.protocol = parser.protocol;

/**
 * `connect`.
 *
 * @param {String} uri
 * @api public
 */

exports.connect = lookup;

/**
 * Expose constructors for standalone build.
 *
 * @api public
 */

exports.Manager = require('./manager');
exports.Socket = require('./socket');



// WEBPACK FOOTER //
// ./lib/index.js