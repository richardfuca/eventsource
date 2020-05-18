/// <reference types="node" />
import { EventEmitter } from 'events';
import https from 'https';
export declare enum EventSourceReadyState {
    CONNECTING = 0,
    OPEN = 1,
    CLOSED = 2
}
export interface EventSourceInit {
    withCredentials?: boolean;
    reconnectionInterval?: number;
    headers?: {
        [index: string]: string;
    };
    rejectUnauthorized?: boolean;
    proxy?: string;
    https?: https.RequestOptions;
}
export default class EventSource extends EventEmitter {
    readonly CONNECTING = EventSourceReadyState.CONNECTING;
    readonly OPEN = EventSourceReadyState.OPEN;
    readonly CLOSED = EventSourceReadyState.CLOSED;
    static readonly CONNECTING = EventSourceReadyState.CONNECTING;
    static readonly OPEN = EventSourceReadyState.OPEN;
    static readonly CLOSED = EventSourceReadyState.CLOSED;
    private _readyState;
    private originalUrl;
    private _url;
    private _withCredentials;
    private reconnectionInterval;
    private headers;
    private rejectUnauthorized;
    private proxy?;
    private httpsOptions?;
    private request?;
    private connectionInProgress;
    private lastEventId;
    private isFirstChunk;
    private chunkBuffer?;
    private discardTrailingNewline;
    private startingPosition;
    private startingFieldLength;
    private eventName;
    private data;
    constructor(url: string, eventSourceInitDict?: EventSourceInit);
    private connect;
    private hasBom;
    private parseDataChunk;
    private parseEventStreamLine;
    private onConnectionClosed;
    get url(): string;
    get withCredentials(): boolean;
    get readyState(): EventSourceReadyState;
    set onerror(callback: EventListener);
    set onmessage(callback: EventListener);
    set onopen(callback: EventListener);
    dispatchEvent(event: any): void;
    addEventListener(event: string | symbol, listener: (...args: unknown[]) => void): void;
    removeEventListener(event: string | symbol, listener: (...args: unknown[]) => void): void;
    close(): void;
}
