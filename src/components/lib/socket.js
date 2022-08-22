/**
 * Module dependencies.
 */
const parser = require('socket.io-parser');
const Emitter = require('component-emitter');
const toArray = require('to-array');
const on = require('./on');
const bind = require('component-bind');
const debug = require('debug')('socket.io-client:socket');
const parseqs = require('parseqs');
const hasBin = require('has-binary2');

/**
 * Module exports.
 */

module.exports = exports = Socket;

/**
 * Internal events (blacklisted).
 * These events can't be emitted by the user.
 *
 * @api private
 */
const events = {
    connect: 1,
    connect_error: 1,
    connect_timeout: 1,
    connecting: 1,
    disconnect: 1,
    error: 1,
    reconnect: 1,
    reconnect_attempt: 1,
    reconnect_failed: 1,
    reconnect_error: 1,
    reconnecting: 1,
    ping: 1,
    pong: 1
};

/**
 * Shortcut to `Emitter#emit`.
 */

var emit = Emitter.prototype.emit;

/**
 * `Socket` constructor.
 *
 * @api public
 */

function Socket (io, nsp, opts) {
    this.io = io;
    this.nsp = nsp;
    this.json = this; // compat
    this.ids = 0;
    this.acks = {};
    this.receiveBuffer = [];
    this.sendBuffer = [];
    this.connected = false;
    this.disconnected = true;
    this.flags = {};
    if (opts && opts.query) {
        this.query = opts.query;
    }
    if (this.io.autoConnect) this.open();
}

/**
 * Mix in `Emitter`.
 */

Emitter(Socket.prototype);

/**
 * Subscribe to open, close and packet events
 *
 * @api private
 */

Socket.prototype.subEvents = function () {
    if (this.subs) return;

    const io = this.io;
    this.subs = [
        on(io, 'open', bind(this, 'onopen')),
        on(io, 'packet', bind(this, 'onpacket')),
        on(io, 'close', bind(this, 'onclose'))
    ];
};

/**
 * "Opens" the socket.
 *
 * @api public
 */

Socket.prototype.open =
    Socket.prototype.connect = function () {
        if (this.connected) return this;

        this.subEvents();
        this.io.open(); // ensure open
        if ('open' === this.io.readyState) this.onopen();
        this.emit('connecting');
        return this;
    };

/**
 * Sends a `message` event.
 *
 * @return {Socket} self
 * @api public
 */

Socket.prototype.send = function () {
    const args = toArray(arguments);
    args.unshift('message');
    this.emit.apply(this, args);
    return this;
};

/**
 * Override `emit`.
 * If the event is in `events`, it's emitted normally.
 *
 * @param {String} event name
 * @return {Socket} self
 * @api public
 */

Socket.prototype.emit = function (ev) {
    if (events.hasOwnProperty(ev)) {
        emit.apply(this, arguments);
        return this;
    }

    const args = toArray(arguments);
    const packet = {
        type: (this.flags.binary !== undefined ? this.flags.binary : hasBin(args)) ? parser.BINARY_EVENT : parser.EVENT,
        data: args
    };

    packet.options = {};
    packet.options.compress = !this.flags || false !== this.flags.compress;

    // event ack callback
    if ('function' === typeof args[args.length - 1]) {

        this.acks[this.ids] = args.pop();
        packet.id = this.ids++;
    }

    if (this.connected) {
        this.packet(packet);
    } else {
        this.sendBuffer.push(packet);
    }

    this.flags = {};

    return this;
};

/**
 * Sends a packet.
 *
 * @param {Object} packet
 * @api private
 */

Socket.prototype.packet = function (packet) {
    packet.nsp = this.nsp;
    this.io.packet(packet);
};

/**
 * Called upon engine `open`.
 *
 * @api private
 */

Socket.prototype.onopen = function () {


    // write connect packet if necessary
    if ('/' !== this.nsp) {
        if (this.query) {
            const query = typeof this.query === 'object' ? parseqs.encode(this.query) : this.query;

            this.packet({type: parser.CONNECT, query: query});
        } else {
            this.packet({type: parser.CONNECT});
        }
    }
};

/**
 * Called upon engine `close`.
 *
 * @param {String} reason
 * @api private
 */

Socket.prototype.onclose = function (reason) {

    this.connected = false;
    this.disconnected = true;
    delete this.id;
    this.emit('disconnect', reason);
};

/**
 * Called with socket packet.
 *
 * @param {Object} packet
 * @api private
 */

Socket.prototype.onpacket = function (packet) {
    const sameNamespace = packet.nsp === this.nsp;
    const rootNamespaceError = packet.type === parser.ERROR && packet.nsp === '/';

    if (!sameNamespace && !rootNamespaceError) return;

    switch (packet.type) {
        case parser.CONNECT:
            this.onconnect();
            break;

        case parser.EVENT:
            this.onevent(packet);
            break;

        case parser.BINARY_EVENT:
            this.onevent(packet);
            break;

        case parser.ACK:
            this.onack(packet);
            break;

        case parser.BINARY_ACK:
            this.onack(packet);
            break;

        case parser.DISCONNECT:
            this.ondisconnect();
            break;

        case parser.ERROR:
            this.emit('error', packet.data);
            break;
    }
};

/**
 * Called upon a server event.
 *
 * @param {Object} packet
 * @api private
 */

Socket.prototype.onevent = function (packet) {
    const args = packet.data || [];


    if (null != packet.id) {

        args.push(this.ack(packet.id));
    }

    if (this.connected) {
        emit.apply(this, args);
    } else {
        this.receiveBuffer.push(args);
    }
};

/**
 * Produces an ack callback to emit with an event.
 *
 * @api private
 */

Socket.prototype.ack = function (id) {
    const self = this;
    let sent = false;
    return function () {
        // prevent double callbacks
        if (sent) return;
        sent = true;
        var args = toArray(arguments);


        self.packet({
            type: hasBin(args) ? parser.BINARY_ACK : parser.ACK,
            id: id,
            data: args
        });
    };
};

/**
 * Called upon a server acknowlegement.
 *
 * @param {Object} packet
 * @api private
 */

Socket.prototype.onack = function (packet) {
    const ack = this.acks[packet.id];
    if ('function' === typeof ack) {

        ack.apply(this, packet.data);
        delete this.acks[packet.id];
    } else {

    }
};

/**
 * Called upon server connect.
 *
 * @api private
 */

Socket.prototype.onconnect = function () {
    this.connected = true;
    this.disconnected = false;
    this.emit('connect');
    this.emitBuffered();
};

/**
 * Emit buffered events (received and emitted).
 *
 * @api private
 */

Socket.prototype.emitBuffered = function () {
    let i;
    for (i = 0; i < this.receiveBuffer.length; i++) {
        emit.apply(this, this.receiveBuffer[i]);
    }
    this.receiveBuffer = [];

    for (i = 0; i < this.sendBuffer.length; i++) {
        this.packet(this.sendBuffer[i]);
    }
    this.sendBuffer = [];
};

/**
 * Called upon server disconnect.
 *
 * @api private
 */

Socket.prototype.ondisconnect = function () {

    this.destroy();
    this.onclose('io server disconnect');
};

/**
 * Called upon forced client/server side disconnections,
 * this method ensures the manager stops tracking us and
 * that reconnections don't get triggered for this.
 *
 * @api private.
 */

Socket.prototype.destroy = function () {
    if (this.subs) {
        // clean subscriptions to avoid reconnections
        for (let i = 0; i < this.subs.length; i++) {
            this.subs[i].destroy();
        }
        this.subs = null;
    }

    this.io.destroy(this);
};

/**
 * Disconnects the socket manually.
 *
 * @return {Socket} self
 * @api public
 */

Socket.prototype.close =
    Socket.prototype.disconnect = function () {
        if (this.connected) {

            this.packet({ type: parser.DISCONNECT });
        }

        // remove socket from pool
        this.destroy();

        if (this.connected) {
            // fire events
            this.onclose('io client disconnect');
        }
        return this;
    };

/**
 * Sets the compress flag.
 *
 * @param {Boolean} if `true`, compresses the sending data
 * @return {Socket} self
 * @api public
 */

Socket.prototype.compress = function (compress) {
    this.flags.compress = compress;
    return this;
};

/**
 * Sets the binary flag
 *
 * @param {Boolean} whether the emitted data contains binary
 * @return {Socket} self
 * @api public
 */

Socket.prototype.binary = function (binary) {
    this.flags.binary = binary;
    return this;
};



// WEBPACK FOOTER //
// ./lib/socket.js