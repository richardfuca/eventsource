import original from 'original';
import { parse } from 'url';
import { EventEmitter } from 'events';
import https from 'https';
import http from 'http';

export enum EventSourceReadyState {
  /** The connection has not yet been established, or it was closed and the user agent is reconnecting. */
  CONNECTING,
  /** The user agent has an open connection and is dispatching events as it receives them. */
  OPEN,
  /** The connection is not open, and the user agent is not trying to reconnect. Either there was a fatal error or the close() method was invoked. */
  CLOSED
}

export interface EventSourceInit {
  /**
   * Indicates whether the EventSource object was instantiated with CORS credentials set (true), or not (false, the default).
   *
   * @default false
   */
  withCredentials?: boolean;
  /**
   * The interval in milliseconds between reconnection attempts. Set to 0 to disable.
   *
   * @default 1000
   */
  reconnectionInterval?: number;
  /**
   * The headers to define in the HTTP request.
   */
  headers?: { [index: string]: string };
  /**
   * If HTTPS requests with invalid certificates should be rejected.
   *
   * @default true
   */
  rejectUnauthorized?: boolean;
  /**
   * A HTTP proxy to use in the request
   */
  proxy?: string;

  /** HTTPS options */
  https?: https.RequestOptions;
}

export default class EventSource extends EventEmitter {
  // Enums
  readonly CONNECTING = EventSourceReadyState.CONNECTING;
  readonly OPEN = EventSourceReadyState.OPEN;
  readonly CLOSED = EventSourceReadyState.CLOSED;
  static readonly CONNECTING = EventSourceReadyState.CONNECTING;
  static readonly OPEN = EventSourceReadyState.OPEN;
  static readonly CLOSED = EventSourceReadyState.CLOSED;

  // ready state
  private _readyState: EventSourceReadyState = EventSourceReadyState.CONNECTING;

  // URL
  private originalUrl: string;
  private _url: string;

  // Other options
  private _withCredentials: boolean;
  private reconnectionInterval: number;
  private headers: { [index: string]: string };
  private rejectUnauthorized: boolean;
  private proxy?: string;
  private httpsOptions?: https.RequestOptions;

  // event source vars
  private request?: http.ClientRequest;
  private connectionInProgress = false;
  private lastEventId = '';

  // chunk vars
  private isFirstChunk = false;
  private chunkBuffer?: Buffer;
  private discardTrailingNewline = false;
  private startingPosition = 0;
  private startingFieldLength = -1;

  // event vars
  private eventName = '';
  private data = '';

  /**
  * Creates a new EventSource object.
  *
  * @param url A string giving the URL that will provide the event stream.
  * @param [eventSourceInitDict] The EventStream options. See README for details.
  * @api public
  * */
  constructor(url: string, eventSourceInitDict: EventSourceInit = {}) {
    super();

    this.originalUrl = url;
    this._url = url;
    this._withCredentials = eventSourceInitDict.withCredentials ?? false;
    this.reconnectionInterval = eventSourceInitDict.reconnectionInterval ?? 1000;
    this.headers = {
      'Cache-Control': 'no-cache',
      Accept: 'text/event-stream',
      ...eventSourceInitDict.headers,
    };
    this.rejectUnauthorized = eventSourceInitDict.rejectUnauthorized ?? true;
    this.proxy = eventSourceInitDict.proxy;
    this.httpsOptions = eventSourceInitDict.https;

    if (this.headers['Last-Event-ID']) {
      this.lastEventId = this.headers['Last-Event-ID'];
      delete this.headers['Last-Event-ID'];
    }

    process.nextTick(() => this.connect());
  }

  // eslint-disable-next-line class-methods-use-this
  private connect(): void {
    let reqOptions: https.RequestOptions = parse(this._url);
    let isSecure = reqOptions.protocol === 'https:';
    reqOptions.headers = this.headers;
    if (this.lastEventId) {
      reqOptions.headers['Last-Event-ID'] = this.lastEventId;
    }

    // Legacy: this should be specified as `eventSourceInitDict.https.rejectUnauthorized`,
    // but for now exists as a backwards-compatibility layer
    reqOptions.rejectUnauthorized = this.rejectUnauthorized;

    // If specify http proxy, make the request to sent to the proxy server,
    // and include the original url in path and Host headers
    if (this.proxy) {
      const proxy = parse(this.proxy);
      isSecure = proxy.protocol === 'https:';

      reqOptions.protocol = isSecure ? 'https:' : 'http:';
      reqOptions.path = this._url;
      reqOptions.headers.Host = reqOptions.host ?? undefined;
      reqOptions.hostname = proxy.hostname;
      reqOptions.host = proxy.host;
      reqOptions.port = proxy.port;
    }

    // If https options are specified, merge them into the request options
    if (this.httpsOptions) {
      reqOptions = {
        ...reqOptions,
        ...this.httpsOptions,
      };
    }

    if (this._withCredentials) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      reqOptions.withCredentials = this._withCredentials;
    }

    this.request = (isSecure ? https : http).request(reqOptions, (res) => {
      this.connectionInProgress = false;
      // Handle HTTP errors
      if (res.statusCode && res.statusCode >= 500) {
        this.emit('error', { type: 'error', status: res.statusCode, message: res.statusMessage });
        this.onConnectionClosed();
        return;
      }

      // Handle HTTP redirects
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        if (!res.headers.location) {
          // Server sent redirect response without Location header.
          this.emit('error', { type: 'error', status: res.statusCode, message: 'Server sent redirect response without Location header.' });
          return;
        }
        if (res.statusCode === 301) this.originalUrl = res.headers.location;
        this._url = res.headers.location;
        process.nextTick(() => this.connect());
        return;
      }

      if (res.statusCode !== 200) {
        this.emit('error', { type: 'error', status: res.statusCode, message: res.statusMessage });
        this.close();
        return;
      }

      this._readyState = EventSourceReadyState.OPEN;

      res.on('close', () => {
        res.removeAllListeners('close');
        res.removeAllListeners('end');
        this.onConnectionClosed();
      });

      res.on('end', () => {
        res.removeAllListeners('close');
        res.removeAllListeners('end');
        this.onConnectionClosed();
      });

      this.emit('open', { type: 'open' });

      // text/event-stream parser adapted from webkit's
      // Source/WebCore/page/EventSource.cpp
      this.isFirstChunk = true;
      this.chunkBuffer = undefined;
      this.startingPosition = 0;
      this.startingFieldLength = -1;
      res.on('data', this.parseDataChunk);
    });

    this.request.on('error', (err) => {
      this.onConnectionClosed(err.message, err);
    });

    if (typeof this.request.setNoDelay === 'function') {
      this.request.setNoDelay(true);
    }
    this.request.end();
  }

  // eslint-disable-next-line class-methods-use-this
  private hasBom(buffer: Buffer): boolean {
    return [239, 187, 191].every((charCode, index) => buffer[index] === charCode);
  }

  private parseDataChunk = (chunk: Buffer): void => {
    this.chunkBuffer = this.chunkBuffer ? Buffer.concat([this.chunkBuffer, chunk]) : chunk;
    if (this.isFirstChunk && this.hasBom(this.chunkBuffer)) {
      this.chunkBuffer = this.chunkBuffer.slice(3);
    }

    this.isFirstChunk = false;
    let position = 0;
    const { length } = this.chunkBuffer;

    while (position < length) {
      if (this.discardTrailingNewline) {
        if (this.chunkBuffer[position] === 10) {
          position += 1;
        }
        this.discardTrailingNewline = false;
      }

      let lineLength = -1;
      let fieldLength = this.startingFieldLength;
      let character: number;

      for (let i = this.startingPosition; lineLength < 0 && i < length; i += 1) {
        character = this.chunkBuffer[i];
        if (character === 58 && fieldLength < 0) {
          fieldLength = i - position;
        } else if (character === 13) {
          this.discardTrailingNewline = true;
          lineLength = i - position;
        } else if (character === 10) {
          lineLength = i - position;
        }
      }

      if (lineLength < 0) {
        this.startingPosition = length - position;
        this.startingFieldLength = fieldLength;
        break;
      } else {
        this.startingPosition = 0;
        this.startingFieldLength = -1;
      }

      this.parseEventStreamLine(this.chunkBuffer, position, fieldLength, lineLength);

      position += lineLength + 1;
    }

    if (position === length) {
      this.chunkBuffer = undefined;
    } else if (position > 0) {
      this.chunkBuffer = this.chunkBuffer.slice(position);
    }
  };

  private parseEventStreamLine(chunkBuffer: Buffer, position: number, fieldLength: number, lineLength: number): void {
    if (lineLength === 0) {
      if (this.data) {
        const type = this.eventName || 'message';
        this.emit(type, {
          data: this.data.slice(0, -1), // remove trailing newline
          lastEventId: this.lastEventId,
          origin: original(this._url),
          type,
        });
        this.data = '';
      }
      this.eventName = '';
    } else if (fieldLength > 0) {
      const noValue = fieldLength < 0;
      let step = 0;
      const field = chunkBuffer.slice(position, position + (noValue ? lineLength : fieldLength)).toString();

      if (noValue) {
        step = lineLength;
      } else if (chunkBuffer[position + fieldLength + 1] !== 32) {
        step = fieldLength + 1;
      } else {
        step = fieldLength + 2;
      }

      const valueLength = lineLength - step;
      const value = chunkBuffer.slice(position + step, position + step + valueLength).toString();

      if (field === 'data') {
        this.data += `${value}\n`;
      } else if (field === 'event') {
        this.eventName = value;
      } else if (field === 'id') {
        this.lastEventId = value;
      } else if (field === 'retry') {
        const retry = parseInt(value, 10);
        if (!Number.isNaN(retry) && this.reconnectionInterval !== 0) {
          this.reconnectionInterval = retry;
        }
      }
    }
  }

  private onConnectionClosed(message?: string, error?: Error): void {
    if (this._readyState === EventSourceReadyState.CLOSED) return;
    this._readyState = EventSourceReadyState.CONNECTING;

    this.emit('error', { type: 'error', error, message });

    if (this.reconnectionInterval === 0) return;

    this._url = this.originalUrl;

    setTimeout(() => {
      if (this._readyState !== EventSourceReadyState.CONNECTING || this.connectionInProgress) return;

      this.connectionInProgress = true;
      this.connect();
    }, this.reconnectionInterval);
  }

  /** Returns the URL providing the event stream. */
  get url(): string {
    return this._url;
  }

  /** Returns true if the credentials mode for connection requests to the URL providing the event stream is set to "include", and false otherwise. */
  get withCredentials(): boolean {
    return this._withCredentials;
  }

  /** Returns the state of this EventSource object's connection. It can have the values described below. */
  get readyState(): EventSourceReadyState {
    return this._readyState;
  }

  set onerror(callback: EventListener) {
    this.removeAllListeners('error');
    if (callback != null) {
      this.on('error', callback);
    }
  }

  set onmessage(callback: EventListener) {
    this.removeAllListeners('message');
    if (callback != null) {
      this.on('message', callback);
    }
  }

  set onopen(callback: EventListener) {
    this.removeAllListeners('open');
    if (callback != null) {
      this.on('open', callback);
    }
  }

  dispatchEvent(event: string | symbol, ...args: unknown[]): void {
    this.emit(event, ...args);
  }

  addEventListener(event: string | symbol, listener: (...args: unknown[]) => void): void {
    this.addListener(event, listener);
  }

  removeEventListener(event: string | symbol, listener: (...args: unknown[]) => void): void {
    this.removeListener(event, listener);
  }

  /** Aborts any instances of the fetch algorithm started for this EventSource object, and sets the readyState attribute to CLOSED. */
  close(): void {
    if (this._readyState === EventSourceReadyState.CLOSED) return;
    this._readyState = EventSourceReadyState.CLOSED;
    if (typeof this.request?.abort === 'function') this.request.abort();
    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    if (typeof this.request?.xhr === 'object' && typeof this.request?.xhr.abort === 'function') this.request.xhr.abort();
  }
}

module.exports = EventSource;
