# EventSource

This library is a pure JavaScript implementation of the [EventSource](https://html.spec.whatwg.org/multipage/server-sent-events.html#server-sent-events) client. The API aims to be W3C compatible.

You can use it with Node.js.  Use the [original package](https://github.com/EventSource/eventsource) for the browser polyfill.

## Install

    npm install eventsource

## Extensions to the W3C API

### Setting HTTP request headers

You can define custom HTTP headers for the initial HTTP request. This can be useful for e.g. sending cookies
or to specify an initial `Last-Event-ID` value.

HTTP headers are defined by assigning a `headers` attribute to the optional `eventSourceInitDict` argument:

```javascript
var eventSourceInitDict = {headers: {'Cookie': 'test=test'}};
var es = new EventSource(url, eventSourceInitDict);
```

### Allow unauthorized HTTPS requests

By default, https requests that cannot be authorized will cause the connection to fail and an exception
to be emitted. You can override this behaviour, along with other https options:

```javascript
var eventSourceInitDict = {https: {rejectUnauthorized: false}};
var es = new EventSource(url, eventSourceInitDict);
```

Note that for Node.js < v0.10.x this option has no effect - unauthorized HTTPS requests are *always* allowed.

### HTTP status code on error events

Unauthorized and redirect error status codes (for example 401, 403, 301, 307) are available in the `status` property in the error event.

```javascript
es.onerror = function (err) {
  if (err) {
    if (err.status === 401 || err.status === 403) {
      console.log('not authorized');
    }
  }
};
```

### HTTP/HTTPS proxy

You can define a `proxy` option for the HTTP request to be used. This is typically useful if you are behind a corporate firewall.

```javascript
var es = new EventSource(url, {proxy: 'http://your.proxy.com'});
```


## License

MIT-licensed. See LICENSE
