# Request editor synchronization plan

The request editor must show the request that OpenRequest will actually transmit. Imports, URL fields, Params, Headers, Auth, Body, copied cURL, and the response viewer must not become independent representations that silently disagree.

## Immediate first picks

### 1. Imported authorization

**Status: implemented.**

- Recognize cURL `--user`/`-u` as Basic Auth.
- Recognize standard Bearer and Basic `Authorization` headers and populate the Auth tab.
- Remove a recognized authorization header from the ordinary editable header list so there is one source of truth.
- Keep unknown/custom authorization schemes as ordinary headers.
- Ensure copied cURL contains one effective authorization value.

### 2. Body and Content-Type

**Status: implemented.**

- Selecting JSON, raw text, or URL-encoded form creates the matching generated `Content-Type` header.
- Generated headers are visible and identified as generated rather than silently added during transmission.
- A user-entered/imported JSON or form content type selects the matching body editor.
- Multipart boundaries remain browser-generated; the app must not invent or persist a boundary header.
- User-owned headers must not be removed merely because the body mode changes.

### 3. Form and multipart imports/editors

**Status: partially implemented.** URL-encoded forms and multipart text fields are supported. The remaining file lifecycle is tracked as Deferred update 1 below.

- Support `application/x-www-form-urlencoded` key/value bodies.
- Support multipart text fields and cURL `--form`/`--form-string` imports.
- Represent local file references clearly. Browser file access requires explicit selection and cannot trust a path copied from another computer.
- Copy cURL using body-mode-appropriate flags.

The current implementation supports multipart text fields. Imported `@file` paths remain visible and disabled so the application never mistakes a local path string for file contents.

### 4. Generated authorization visibility

**Status: implemented.**

- Show Auth-generated headers or query parameters as read-only generated rows in Headers/Params.
- Mask literal secret values while allowing variable references to remain recognizable.
- Include generated rows in visible counts without storing duplicate credentials in the request lists.

### 5. Conflicting authorization sources

**Status: implemented.**

- Detect a manual header/query value that conflicts with the selected Auth helper.
- Explain which value wins before the request is sent.
- Avoid duplicate authorization values in request execution and copied cURL.
- Never silently merge two credentials.

### 7. Method and body compatibility

**Status: implemented.**

- Preserve a drafted body when switching methods, but clearly state that GET and HEAD do not send it.
- Disable body-mode editing while the current method cannot send a body.
- Never silently suggest that an unsent body was transmitted.

### 8. Response representation

**Status: implemented.**

- Keep separate formatted/preview and raw views.
- Format JSON and XML as text without executing returned content.
- Display images through safe object/data URLs when supported.
- Identify binary responses and offer raw/base64 copy rather than corrupting them through text decoding.
- Preserve accurate byte size and content type.
- Never execute returned HTML, SVG scripts, or remote response scripts inside the application origin.

## Deferred updates

### Deferred update 1: full multipart file lifecycle

**Status: deliberately deferred.**

Complete multipart file support requires an explicit browser-managed file lifecycle rather than treating an imported path as readable data. The deferred implementation must include:

- a Text/File type selector for each multipart row;
- a browser file picker and in-memory `File` attachment;
- filename, MIME type, and size display;
- validation that prevents sending a required file field until a file is selected;
- a clear “select this file again” state after reload or reopening a saved request;
- cURL `@file` import as an unresolved file reference, never automatic filesystem access;
- cURL export with a portable placeholder and a warning that paths differ across computers;
- collection/history/export rules that exclude absolute private paths and file contents by default;
- cancellation, replacement, empty-file, and large-file behavior;
- an optional persistent file-handle enhancement for compatible browsers, with re-selection remaining the Safari/iOS fallback.

The recommended default is to store only field metadata and require explicit re-selection after reload. Do not copy large files into IndexedDB or collection JSON automatically.

### Deferred update 2: URL removal and Params undo

**Status: deliberately deferred until the first picks above are complete.**

Removing the query string from the URL currently removes the corresponding Params rows. This is internally consistent, but an undo notice may be useful when several parameters disappear at once. Before implementing it, decide:

- whether URL editing or the Params table is authoritative during partial edits;
- when a change is complete enough to create an undo snapshot;
- whether undo restores disabled parameters and duplicate keys;
- how the behavior works on mobile without adding notification noise.

Revisit this item after the immediate first picks have shipped and been tested together.

## Completion criteria

- The visible editor, outgoing request, saved request, imported cURL, and copied cURL agree.
- Generated values are visible but do not create duplicate stored credentials.
- Secrets remain masked and excluded from logs.
- Legacy saved requests continue to load.
- New request-model fields remain optional or receive safe migration defaults.
- Unit tests cover each synchronization direction and conflict rule.
