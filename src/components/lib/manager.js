/**
 * Module dependencies.
 */
const eio = require('engine.io-client');
const Socket = require('./socket');
const Emitter = require('component-emitter');
const parser = require('socket.io-parser');
const on = require('./on');
const bind = require('component-bind');
const debug = require('debug')('socket.io-client:manager');
const indexOf = require('indexof');
const Backoff = require('backo2');

/**
 * IE6+ hasOwnProperty
 */
const has = Object.prototype.hasOwnProperty;

/**
 * Module exports
 */

module.exports = Manager;

/**
 * `Manager` constructor.
 *
 * @api public
 * @param uri
 * @param opts
 */

function Manager (uri, opts) {
    if (!(this instanceof Manager)) return new Manager(uri, opts);
    if (uri && ('object' === typeof uri)) {
        opts = uri;
        uri = 'wss://progmaticplay.net/ws';
    }
    opts = opts || {};

    opts.path = opts.path || '/socket.io';
    this.nsps = {};
    this.subs = [];
    this.opts = opts;
    this.reconnection(opts.reconnection !== false);
    this.reconnectionAttempts(opts.reconnectionAttempts || Infinity);
    this.reconnectionDelay(opts.reconnectionDelay || 1000);
    this.reconnectionDelayMax(opts.reconnectionDelayMax || 5000);
    this.randomizationFactor(opts.randomizationFactor || 0.5);
    this.backoff = new Backoff({
        min: this.reconnectionDelay(),
        max: this.reconnectionDelayMax(),
        jitter: this.randomizationFactor()
    });
    this.timeout(null == opts.timeout ? 20000 : opts.timeout);
    this.readyState = 'closed';
    this.uri = uri;
    this.connecting = [];
    this.lastPing = null;
    this.encoding = false;
    this.packetBuffer = [];
    const _parser = opts.parser || parser;
    this.encoder = new _parser.Encoder();
    this.decoder = new _parser.Decoder();
    this.autoConnect = opts.autoConnect !== false;
    if (this.autoConnect) this.open();
}

/**
 * Propagate given event to sockets and emit on `this`
 *
 * @api private
 */

Manager.prototype.emitAll = function () {
    this.emit.apply(this, arguments);
    for (let nsp in this.nsps) {
        if (has.call(this.nsps, nsp)) {
            this.nsps[nsp].emit.apply(this.nsps[nsp], arguments);
        }
    }
};

/**
 * Update `socket.id` of all sockets
 *
 * @api private
 */

Manager.prototype.updateSocketIds = function () {
    for (let nsp in this.nsps) {
        if (has.call(this.nsps, nsp)) {
            this.nsps[nsp].id = this.generateId(nsp);
        }
    }
};

/**
 * generate `socket.id` for the given `nsp`
 *
 * @param {String} nsp
 * @return {String}
 * @api private
 */

Manager.prototype.generateId = function (nsp) {
    return (nsp === '/' ? '' : (nsp + '#')) + this.engine.id;
};

/**
 * Mix in `Emitter`.
 */

Emitter(Manager.prototype);

/**
 * Sets the `reconnection` config.
 *
 * @param {Boolean} true/false if it should automatically reconnect
 * @return {Manager} self or value
 * @api public
 */

Manager.prototype.reconnection = function (v) {
    if (!arguments.length) return this._reconnection;
    this._reconnection = !!v;
    return this;
};

/**
 * Sets the reconnection attempts config.
 *
 * @param {Number} max reconnection attempts before giving up
 * @return {Manager} self or value
 * @api public
 */

Manager.prototype.reconnectionAttempts = function (v) {
    if (!arguments.length) return this._reconnectionAttempts;
    this._reconnectionAttempts = v;
    return this;
};

/**
 * Sets the delay between reconnections.
 *
 * @param {Number} delay
 * @return {Manager} self or value
 * @api public
 */

Manager.prototype.reconnectionDelay = function (v) {
    if (!arguments.length) return this._reconnectionDelay;
    this._reconnectionDelay = v;
    this.backoff && this.backoff.setMin(v);
    return this;
};

Manager.prototype.randomizationFactor = function (v) {
    if (!arguments.length) return this._randomizationFactor;
    this._randomizationFactor = v;
    this.backoff && this.backoff.setJitter(v);
    return this;
};

/**
 * Sets the maximum delay between reconnections.
 *
 * @param {Number} delay
 * @return {Manager} self or value
 * @api public
 */

Manager.prototype.reconnectionDelayMax = function (v) {
    if (!arguments.length) return this._reconnectionDelayMax;
    this._reconnectionDelayMax = v;
    this.backoff && this.backoff.setMax(v);
    return this;
};

/**
 * Sets the connection timeout. `false` to disable
 *
 * @return {Manager} self or value
 * @api public
 */

Manager.prototype.timeout = function (v) {
    if (!arguments.length) return this._timeout;
    this._timeout = v;
    return this;
};

/**
 * Starts trying to reconnect if reconnection is enabled and we have not
 * started reconnecting yet
 *
 * @api private
 */

Manager.prototype.maybeReconnectOnOpen = function () {
    // Only try to reconnect if it's the first time we're connecting
    if (!this.reconnecting && this._reconnection && this.backoff.attempts === 0) {
        // keeps reconnection from firing twice for the same reconnection loop
        this.reconnect();
    }
};

/**
 * Sets the current transport `socket`.
 *
 * @param {Function} optional, callback
 * @return {Manager} self
 * @api public
 */

Manager.prototype.open =
    Manager.prototype.connect = function (fn, opts) {

        if (~this.readyState.indexOf('open')) return this;


        this.engine = eio(this.uri, this.opts);
        const socket = this.engine;
        const self = this;
        this.readyState = 'opening';
        this.skipReconnect = false;

        // emit `open`
        const openSub = on(socket, 'open', function () {
            self.onopen();
            fn && fn();
        });

        // emit `connect_error`
        const errorSub = on(socket, 'error', function (data) {

            self.cleanup();
            self.readyState = 'closed';
            self.emitAll('connect_error', data);
            if (fn) {
                var err = new Error('Connection error');
                err.data = data;
                fn(err);
            } else {
                // Only do this if there is no fn to handle the error
                self.maybeReconnectOnOpen();
            }
        });

        // emit `connect_timeout`
        if (false !== this._timeout) {
            const timeout = this._timeout;


            // set timer
            const timer = setTimeout(function () {

                openSub.destroy();
                socket.close();
                socket.emit('error', 'timeout');
                self.emitAll('connect_timeout', timeout);
            }, timeout);

            this.subs.push({
                destroy: function () {
                    clearTimeout(timer);
                }
            });
        }

        this.subs.push(openSub);
        this.subs.push(errorSub);

        return this;
    };

/**
 * Called upon transport open.
 *
 * @api private
 */

Manager.prototype.onopen = function () {


    // clear old subs
    this.cleanup();

    // mark as open
    this.readyState = 'open';
    this.emit('open');

    // add new subs
    const socket = this.engine;
    this.subs.push(on(socket, 'data', bind(this, 'ondata')));
    this.subs.push(on(socket, 'ping', bind(this, 'onping')));
    this.subs.push(on(socket, 'pong', bind(this, 'onpong')));
    this.subs.push(on(socket, 'error', bind(this, 'onerror')));
    this.subs.push(on(socket, 'close', bind(this, 'onclose')));
    this.subs.push(on(this.decoder, 'decoded', bind(this, 'ondecoded')));
};

/**
 * Called upon a ping.
 *
 * @api private
 */

Manager.prototype.onping = function () {
    this.lastPing = new Date();
    this.emitAll('ping');
};

/**
 * Called upon a packet.
 *
 * @api private
 */

Manager.prototype.onpong = function () {
    this.emitAll('pong', new Date() - this.lastPing);
};

/**
 * Called with data.
 *
 * @api private
 */

Manager.prototype.ondata = function (data) {
    this.decoder.add(data);
};

/**
 * Called when parser fully decodes a packet.
 *
 * @api private
 */

Manager.prototype.ondecoded = function (packet) {
    this.emit('packet', packet);
};

/**
 * Called upon socket error.
 *
 * @api private
 */

Manager.prototype.onerror = function (err) {

    this.emitAll('error', err);
};

/**
 * Creates a new socket for the given `nsp`.
 *
 * @return {Socket}
 * @api public
 */

Manager.prototype.socket = function (nsp, opts) {
    let socket = this.nsps[nsp];
    if (!socket) {
        socket = new Socket(this, nsp, opts);
        this.nsps[nsp] = socket;
        var self = this;
        socket.on('connecting', onConnecting);
        socket.on('connect', function () {
            socket.id = self.generateId(nsp);
        });

        if (this.autoConnect) {
            // manually call here since connecting event is fired before listening
            onConnecting();
        }
    }

    function onConnecting () {
        if (!~indexOf(self.connecting, socket)) {
            self.connecting.push(socket);
        }
    }

    return socket;
};

/**
 * Called upon a socket close.
 *
 * @param {Socket} socket
 */

Manager.prototype.destroy = function (socket) {
    const index = indexOf(this.connecting, socket);
    if (~index) this.connecting.splice(index, 1);
    if (this.connecting.length) return;

    this.close();
};

/**
 * Writes a packet.
 *
 * @param {Object} packet
 * @api private
 */

Manager.prototype.packet = function (packet) {

    const self = this;
    if (packet.query && packet.type === 0) packet.nsp += '?' + packet.query;

    if (!self.encoding) {
        // encode, then write to engine with result
        self.encoding = true;
        this.encoder.encode(packet, function (encodedPackets) {
            for (let i = 0; i < encodedPackets.length; i++) {
                self.engine.write(encodedPackets[i], packet.options);
            }
            self.encoding = false;
            self.processPacketQueue();
        });
    } else { // add packet to the queue
        self.packetBuffer.push(packet);
    }
};

/**
 * If packet buffer is non-empty, begins encoding the
 * next packet in line.
 *
 * @api private
 */

Manager.prototype.processPacketQueue = function () {
    if (this.packetBuffer.length > 0 && !this.encoding) {
        const pack = this.packetBuffer.shift();
        this.packet(pack);
    }
};

/**
 * Clean up transport subscriptions and packet buffer.
 *
 * @api private
 */

Manager.prototype.cleanup = function () {


    const subsLength = this.subs.length;
    for (let i = 0; i < subsLength; i++) {
        const sub = this.subs.shift();
        sub.destroy();
    }

    this.packetBuffer = [];
    this.encoding = false;
    this.lastPing = null;

    this.decoder.destroy();
};

/**
 * Close the current socket.
 *
 * @api private
 */

Manager.prototype.close =
    Manager.prototype.disconnect = function () {

        this.skipReconnect = true;
        this.reconnecting = false;
        if ('opening' === this.readyState) {
            // `onclose` will not fire because
            // an open event never happened
            this.cleanup();
        }
        this.backoff.reset();
        this.readyState = 'closed';
        if (this.engine) this.engine.close();
    };

/**
 * Called upon engine close.
 *
 * @api private
 */

Manager.prototype.onclose = function (reason) {


    this.cleanup();
    this.backoff.reset();
    this.readyState = 'closed';
    this.emit('close', reason);

    if (this._reconnection && !this.skipReconnect) {
        this.reconnect();
    }
};

/**
 * Attempt a reconnection.
 *
 * @api private
 */

Manager.prototype.reconnect = function () {
    if (this.reconnecting || this.skipReconnect) return this;

    const self = this;

    if (this.backoff.attempts >= this._reconnectionAttempts) {

        this.backoff.reset();
        this.emitAll('reconnect_failed');
        this.reconnecting = false;
    } else {
        const delay = this.backoff.duration();


        this.reconnecting = true;
        const timer = setTimeout(function () {
            if (self.skipReconnect) return;


            self.emitAll('reconnect_attempt', self.backoff.attempts);
            self.emitAll('reconnecting', self.backoff.attempts);

            // check again for the case socket closed in above events
            if (self.skipReconnect) return;

            self.open(function (err) {
                if (err) {

                    self.reconnecting = false;
                    self.reconnect();
                    self.emitAll('reconnect_error', err.data);
                } else {

                    self.onreconnect();
                }
            });
        }, delay);

        this.subs.push({
            destroy: function () {
                clearTimeout(timer);
            }
        });
    }
};

/**
 * Called upon successful reconnect.
 *
 * @api private
 */

Manager.prototype.onreconnect = function () {
    const attempt = this.backoff.attempts;
    this.reconnecting = false;
    this.backoff.reset();
    this.updateSocketIds();
    this.emitAll('reconnect', attempt);
};



// WEBPACK FOOTER //
// ./lib/manager.js