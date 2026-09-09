# remote-sli.de

The website and signalling server behind [Remote Slide](https://remote-sli.de):
control a presentation from your phone, with a laser pointer, slide previews
and no app to install.

It runs as a [Cloudflare Worker](https://developers.cloudflare.com/workers/).
The static site (AngularJS, served from `static/`) is uploaded as Workers
static assets; each presentation session is a
[Durable Object](https://developers.cloudflare.com/durable-objects/) that
holds the host, the remotes and the observer as hibernatable WebSockets and
relays messages between them. See [PROTOCOL.md](PROTOCOL.md) for the wire
format.

## Layout

| path                       | what                                                          |
| -------------------------- | ------------------------------------------------------------- |
| `src/index.ts`             | Worker entry: routing, `/api/session`, `/ws/:session`, assets |
| `src/session-room.ts`      | `SessionRoom` Durable Object, one per session                 |
| `src/protocol.ts`          | shared constants and validation                               |
| `static/`                  | the website; `static/index.html` is the SPA shell             |
| `static/inject/`           | bookmarklet loader (`bookmark.js`, `injector.js`)             |
| `static/inject/controller` | git submodule: [RemoteSlide-Controller](https://github.com/RemoteSlide/RemoteSlide-Controller), the script injected into presentation pages, plus `rs-socket.js`, the WebSocket client used everywhere |
| `test/`                    | Vitest suite running inside `workerd`                         |

## Development

```sh
git clone --recurse-submodules https://github.com/RemoteSlide/remote-sli.de
npm ci
npm run dev        # http://localhost:8787
npm test
npm run typecheck
```

`npm run dev` serves the site and the API locally. Sessions, QR codes and
WebSockets all work against localhost; the QR code and the bookmarklet point
at `CANONICAL_ORIGIN` from `wrangler.jsonc` when that variable is set, so
override it (or remove it) in a local environment if you want to scan codes
against a dev server.

The `static/inject/controller` submodule has to be checked out (`git submodule
update --init`) for the bookmarklet and the website's socket client to work.

## Deployment

```sh
npm run deploy
```

`.github/workflows/deploy.yml` does the same on every push to `master`,
using the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository
secrets (an API token with the *Edit Cloudflare Workers* template is enough).
The first deploy creates the `SessionRoom` Durable Object namespace from the
migration in `wrangler.jsonc`.

Point the `remote-sli.de` zone at the Worker with a custom domain or route.
Requests to `www.remote-sli.de` are redirected to the apex by the Worker
(`REDIRECT_HOSTS`).

## Companion repositories

* [RemoteSlide-Controller](https://github.com/RemoteSlide/RemoteSlide-Controller) - the page controller and `rs-socket.js`
* [RemoteSlide-Chrome](https://github.com/RemoteSlide/RemoteSlide-Chrome) - the Chrome extension (Manifest V3)

## License

[MIT](LICENSE)
