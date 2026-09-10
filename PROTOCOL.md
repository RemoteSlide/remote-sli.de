# Remote Slide wire protocol

The website, the injected page controller (bookmarklet or Chrome extension)
and the server talk over a single WebSocket per client. Every frame is a
JSON object with an `event` name; all other keys are the payload.

## Joining a session

```
GET /api/session
```

Creates a session, or continues the one named by the `rs-session-id` cookie.
Returns `{ "session": "<10 alphanumeric chars>", "qr": "data:image/svg+xml;base64,..." }`.
The QR code encodes `https://remote-sli.de/<session>`, the remote page.

```
GET /ws/<session>?as=<role>[&injector=<name>]   (WebSocket upgrade)
```

| role       | who                                                     |
| ---------- | ------------------------------------------------------- |
| `observer` | the browser tab showing the QR code (remote-sli.de/)    |
| `host`     | the presentation page, with the controller injected     |
| `remote`   | a phone on remote-sli.de/&lt;session&gt;                |

A session has at most one host and one observer; a newer connection replaces
the older one, which is closed with code `4001`. Any number of remotes can
join. `injector` is free text describing how the host got injected
(`bookmark`, `extension_chrome`) and is shown in the connection info.

The first frame the server sends is always `init`:

```json
{ "event": "init", "state": "success", "youAre": "remote", "yourId": 2, "info": { ... } }
{ "event": "init", "state": "not_found" }
```

`not_found` is followed by close code `4004`. Clients must not reconnect on
close codes `4000`–`4999`; those are deliberate. Any other close is a lost
connection and should be retried (`rs-socket.js` does this with backoff).

## Connection info

```json
{
  "observer": { "id": 0 } | false,
  "host": { "id": 1, "injector": "bookmark" } | false,
  "remotes": [ { "id": 2, "settings": { ... } } ]
}
```

Included in `init`, in every `info` frame, and returned on request:

| client sends                              | server answers                                  |
| ----------------------------------------- | ----------------------------------------------- |
| `{ "event": "get", "what": "connectionInfo" }` | `{ "event": "connectionInfo", "info": {...} }` |

## Presence

Whenever a host or remote joins or leaves, the other parties get:

```json
{ "event": "info", "type": "client_connected",    "clientType": "host",   "who": "host", "info": { ... } }
{ "event": "info", "type": "client_disconnected", "clientType": "remote", "who": 2,      "info": { ... } }
```

Host events go to the observer and all remotes; remote events go to the
observer, the host and the other remotes. Observers join and leave silently.

## Control

Only remotes may send it. It is delivered to the host (which synthesises the
key press) and echoed to every remote (used for haptic feedback).

```json
{ "event": "control", "keyCode": 39, "keys": { "shift": true } }
```

`keys` may contain `ctrl`, `shift`, `alt`; anything else is dropped. The
relayed frame carries an extra `from` (the sender's client id).

## Relayed events

Any event name that is not reserved (`init`, `info`, `connectionInfo`,
`err`, `control`, `latency`, `get`, `connect`, `disconnect`) is relayed
untouched, with `from` (client id) and `fromType` (`remote` | `host`) added:

* from a remote, to the host
* from the host, to all remotes
* observers cannot relay

The clients currently use `settings`, `slideInfo`, `screenshot`,
`overlayMessage`, `calibrationDot` and `deviceOrientation`. A remote's
`settings` are remembered by the server and included in the connection info,
so a host that connects later still learns the laser colour and username.

## Heartbeat and latency

Clients send the exact string `{"event":"latency"}` every two seconds and get
`{"event":"latency"}` back. The reply is produced by the edge without waking
the session's Durable Object. A client that stays silent for 45 seconds is
closed with code `4008`. (A `latency` frame with additional fields is answered
by the object itself with `{ "event": "latency", "t": <server time> }`.)

## Errors

```json
{ "event": "err", "code": 400, "msg": "Missing keyCode" }
```

Codes follow HTTP: `400` malformed, `403` not allowed for this role,
`413` too large.

## Lifecycle

A session lives in a Durable Object and expires one hour after the last
activity (an `/api/session` call, or a connection opening or closing). It
never expires while someone is connected.
