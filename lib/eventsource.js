"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventSourceReadyState = void 0;
var original_1 = __importDefault(require("original"));
var url_1 = require("url");
var events_1 = require("events");
var https_1 = __importDefault(require("https"));
var http_1 = __importDefault(require("http"));
var assert_1 = __importDefault(require("assert"));
var EventSourceReadyState;
(function (EventSourceReadyState) {
    EventSourceReadyState[EventSourceReadyState["CONNECTING"] = 0] = "CONNECTING";
    EventSourceReadyState[EventSourceReadyState["OPEN"] = 1] = "OPEN";
    EventSourceReadyState[EventSourceReadyState["CLOSED"] = 2] = "CLOSED";
})(EventSourceReadyState = exports.EventSourceReadyState || (exports.EventSourceReadyState = {}));
var EventSource = (function (_super) {
    __extends(EventSource, _super);
    function EventSource(url, eventSourceInitDict) {
        if (eventSourceInitDict === void 0) { eventSourceInitDict = {}; }
        var _a, _b, _c;
        var _this = _super.call(this) || this;
        _this.CONNECTING = EventSourceReadyState.CONNECTING;
        _this.OPEN = EventSourceReadyState.OPEN;
        _this.CLOSED = EventSourceReadyState.CLOSED;
        _this._readyState = EventSourceReadyState.CONNECTING;
        _this.connectionInProgress = false;
        _this.lastEventId = '';
        _this.isFirstChunk = false;
        _this.discardTrailingNewline = false;
        _this.startingPosition = 0;
        _this.startingFieldLength = -1;
        _this.eventName = '';
        _this.data = '';
        _this.parseDataChunk = function (chunk) {
            _this.chunkBuffer = _this.chunkBuffer ? Buffer.concat([_this.chunkBuffer, chunk]) : chunk;
            if (_this.isFirstChunk && _this.hasBom(_this.chunkBuffer)) {
                _this.chunkBuffer = _this.chunkBuffer.slice(3);
            }
            _this.isFirstChunk = false;
            var position = 0;
            var length = _this.chunkBuffer.length;
            while (position < length) {
                if (_this.discardTrailingNewline) {
                    if (_this.chunkBuffer[position] === 10) {
                        position += 1;
                    }
                    _this.discardTrailingNewline = false;
                }
                var lineLength = -1;
                var fieldLength = _this.startingFieldLength;
                var character = void 0;
                for (var i = _this.startingPosition; lineLength < 0 && i < length; i += 1) {
                    character = _this.chunkBuffer[i];
                    if (character === 58 && fieldLength < 0) {
                        fieldLength = i - position;
                    }
                    else if (character === 13) {
                        _this.discardTrailingNewline = true;
                        lineLength = i - position;
                    }
                    else if (character === 10) {
                        lineLength = i - position;
                    }
                }
                if (lineLength < 0) {
                    _this.startingPosition = length - position;
                    _this.startingFieldLength = fieldLength;
                    break;
                }
                else {
                    _this.startingPosition = 0;
                    _this.startingFieldLength = -1;
                }
                _this.parseEventStreamLine(_this.chunkBuffer, position, fieldLength, lineLength);
                position += lineLength + 1;
            }
            if (position === length) {
                _this.chunkBuffer = undefined;
            }
            else if (position > 0) {
                _this.chunkBuffer = _this.chunkBuffer.slice(position);
            }
        };
        _this.originalUrl = url;
        _this._url = url;
        _this._withCredentials = (_a = eventSourceInitDict.withCredentials) !== null && _a !== void 0 ? _a : false;
        _this.reconnectionInterval = (_b = eventSourceInitDict.reconnectionInterval) !== null && _b !== void 0 ? _b : 1000;
        _this.headers = __assign({ 'Cache-Control': 'no-cache', Accept: 'text/event-stream' }, eventSourceInitDict.headers);
        _this.rejectUnauthorized = (_c = eventSourceInitDict.rejectUnauthorized) !== null && _c !== void 0 ? _c : true;
        _this.proxy = eventSourceInitDict.proxy;
        _this.httpsOptions = eventSourceInitDict.https;
        if (_this.headers['Last-Event-ID']) {
            _this.lastEventId = _this.headers['Last-Event-ID'];
            delete _this.headers['Last-Event-ID'];
        }
        process.nextTick(function () { return _this.connect(); });
        return _this;
    }
    EventSource.prototype.connect = function () {
        var _this = this;
        var _a;
        var reqOptions = url_1.parse(this._url);
        var isSecure = reqOptions.protocol === 'https:';
        reqOptions.headers = this.headers;
        if (this.lastEventId) {
            reqOptions.headers['Last-Event-ID'] = this.lastEventId;
        }
        reqOptions.rejectUnauthorized = this.rejectUnauthorized;
        if (this.proxy) {
            var proxy = url_1.parse(this.proxy);
            isSecure = proxy.protocol === 'https:';
            reqOptions.protocol = isSecure ? 'https:' : 'http:';
            reqOptions.path = this._url;
            reqOptions.headers.Host = (_a = reqOptions.host) !== null && _a !== void 0 ? _a : undefined;
            reqOptions.hostname = proxy.hostname;
            reqOptions.host = proxy.host;
            reqOptions.port = proxy.port;
        }
        if (this.httpsOptions) {
            reqOptions = __assign(__assign({}, reqOptions), this.httpsOptions);
        }
        if (this._withCredentials) {
            reqOptions.withCredentials = this._withCredentials;
        }
        this.request = (isSecure ? https_1.default : http_1.default).request(reqOptions, function (res) {
            _this.connectionInProgress = false;
            if (res.statusCode && res.statusCode >= 500) {
                _this.emit('error', { type: 'error', status: res.statusCode, message: res.statusMessage });
                _this.onConnectionClosed();
                return;
            }
            if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
                if (!res.headers.location) {
                    _this.emit('error', { type: 'error', status: res.statusCode, message: 'Server sent redirect response without Location header.' });
                    return;
                }
                if (res.statusCode === 301)
                    _this.originalUrl = res.headers.location;
                _this._url = res.headers.location;
                process.nextTick(function () { return _this.connect(); });
                return;
            }
            if (res.statusCode !== 200) {
                _this.emit('error', { type: 'error', status: res.statusCode, message: res.statusMessage });
                _this.close();
                return;
            }
            _this._readyState = EventSourceReadyState.OPEN;
            res.on('close', function () {
                res.removeAllListeners('close');
                res.removeAllListeners('end');
                _this.onConnectionClosed();
            });
            res.on('end', function () {
                res.removeAllListeners('close');
                res.removeAllListeners('end');
                _this.onConnectionClosed();
            });
            _this.emit('open', { type: 'open' });
            _this.isFirstChunk = true;
            _this.chunkBuffer = undefined;
            _this.startingPosition = 0;
            _this.startingFieldLength = -1;
            res.on('data', _this.parseDataChunk);
        });
        this.request.on('error', function (err) {
            _this.onConnectionClosed(err.message, err);
        });
        if (typeof this.request.setNoDelay === 'function') {
            this.request.setNoDelay(true);
        }
        this.request.end();
    };
    EventSource.prototype.hasBom = function (buffer) {
        return [239, 187, 191].every(function (charCode, index) { return buffer[index] === charCode; });
    };
    EventSource.prototype.parseEventStreamLine = function (chunkBuffer, position, fieldLength, lineLength) {
        if (lineLength === 0) {
            if (this.data) {
                var type = this.eventName || 'message';
                this.emit(type, {
                    data: this.data.slice(0, -1),
                    lastEventId: this.lastEventId,
                    origin: original_1.default(this._url),
                    type: type,
                });
                this.data = '';
            }
            this.eventName = '';
        }
        else if (fieldLength > 0) {
            var noValue = fieldLength < 0;
            var step = 0;
            var field = chunkBuffer.slice(position, position + (noValue ? lineLength : fieldLength)).toString();
            if (noValue) {
                step = lineLength;
            }
            else if (chunkBuffer[position + fieldLength + 1] !== 32) {
                step = fieldLength + 1;
            }
            else {
                step = fieldLength + 2;
            }
            var valueLength = lineLength - step;
            var value = chunkBuffer.slice(position + step, position + step + valueLength).toString();
            if (field === 'data') {
                this.data += value + "\n";
            }
            else if (field === 'event') {
                this.eventName = value;
            }
            else if (field === 'id') {
                this.lastEventId = value;
            }
            else if (field === 'retry') {
                var retry = parseInt(value, 10);
                if (!Number.isNaN(retry) && this.reconnectionInterval !== 0) {
                    this.reconnectionInterval = retry;
                }
            }
        }
    };
    EventSource.prototype.onConnectionClosed = function (message, error) {
        var _this = this;
        if (this._readyState === EventSourceReadyState.CLOSED)
            return;
        this._readyState = EventSourceReadyState.CONNECTING;
        this.emit('error', { type: 'error', error: error, message: message });
        if (this.reconnectionInterval === 0) {
            this._readyState = EventSourceReadyState.CLOSED;
            return;
        }
        ;
        this._url = this.originalUrl;
        setTimeout(function () {
            if (_this._readyState !== EventSourceReadyState.CONNECTING || _this.connectionInProgress)
                return;
            _this.connectionInProgress = true;
            _this.connect();
        }, this.reconnectionInterval);
    };
    Object.defineProperty(EventSource.prototype, "url", {
        get: function () {
            return this._url;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(EventSource.prototype, "withCredentials", {
        get: function () {
            return this._withCredentials;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(EventSource.prototype, "readyState", {
        get: function () {
            return this._readyState;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(EventSource.prototype, "onerror", {
        set: function (callback) {
            this.removeAllListeners('error');
            if (callback != null) {
                this.on('error', callback);
            }
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(EventSource.prototype, "onmessage", {
        set: function (callback) {
            this.removeAllListeners('message');
            if (callback != null) {
                this.on('message', callback);
            }
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(EventSource.prototype, "onopen", {
        set: function (callback) {
            this.removeAllListeners('open');
            if (callback != null) {
                this.on('open', callback);
            }
        },
        enumerable: false,
        configurable: true
    });
    EventSource.prototype.dispatchEvent = function (event) {
        assert_1.default(event.type);
        this.emit(event.type, event.detail || event);
    };
    EventSource.prototype.addEventListener = function (event, listener) {
        this.addListener(event, listener);
    };
    EventSource.prototype.removeEventListener = function (event, listener) {
        this.removeListener(event, listener);
    };
    EventSource.prototype.close = function () {
        var _a, _b, _c;
        if (this._readyState === EventSourceReadyState.CLOSED)
            return;
        this._readyState = EventSourceReadyState.CLOSED;
        if (typeof ((_a = this.request) === null || _a === void 0 ? void 0 : _a.abort) === 'function')
            this.request.abort();
        if (typeof ((_b = this.request) === null || _b === void 0 ? void 0 : _b.xhr) === 'object' && typeof ((_c = this.request) === null || _c === void 0 ? void 0 : _c.xhr.abort) === 'function')
            this.request.xhr.abort();
    };
    EventSource.CONNECTING = EventSourceReadyState.CONNECTING;
    EventSource.OPEN = EventSourceReadyState.OPEN;
    EventSource.CLOSED = EventSourceReadyState.CLOSED;
    return EventSource;
}(events_1.EventEmitter));
exports.default = EventSource;
module.exports = EventSource;
