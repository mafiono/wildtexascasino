/**
 * Module dependencies.
 */
const parseuri = require('parseuri');
const debug = require('debug')('socket.io-client:url');

/**
 * Module exports.
 */

module.exports = url;

/**
 * URL parser.
 *
 *                 Defaults to window.location.
 * @api public
 * @param uri
 * @param loc
 */

function url (uri, loc) {
    let obj = uri;

    // default to window.location
    loc = loc || (typeof location !== 'undefined' && location);
    if (null == uri) uri = loc.protocol + '//' + loc.host;

    // relative path support
    if ('string' === typeof uri) {
        if ('/' === uri.charAt(0)) {
            if ('/' === uri.charAt(1)) {
                uri = loc.protocol + uri;
            } else {
                uri = loc.host + uri;
            }
        }

        if (!/^(https?|wss?):\/\//.test(uri)) {

            if ('undefined' !== typeof loc) {
                uri = loc.protocol + '//' + uri;
            } else {
                uri = 'https://' + uri;
            }
        }

        // parse

        obj = parseuri(uri);
    }

    // make sure we treat `localhost:80` and `localhost` equally
    if (!obj.port) {
        if (/^(http|ws)$/.test(obj.protocol)) {
            obj.port = '80';
        } else if (/^(http|ws)s$/.test(obj.protocol)) {
            obj.port = '443';
        }
    }

    obj.path = obj.path || '/';

    const ipv6 = obj.host.indexOf(':') !== -1;
    const host = ipv6 ? '[' + obj.host + ']' : obj.host;

    // define unique id
    obj.id = obj.protocol + '://' + host + ':' + obj.port;
    // define href
    obj.href = obj.protocol + '://' + host + (loc && loc.port === obj.port ? '' : (':' + obj.port));

    return obj;
}



// WEBPACK FOOTER //
// ./lib/url.js