# Fieldline P2P video board
Simple p2p videochat with whiteboard, for 1-1 sessions and local history.

A dependency-free browser prototype for two-person video chat with a shared freehand board.

## Run locally

WebRTC camera and microphone access works on `localhost` or over HTTPS. From the workspace root:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/p2p_videochat/` in two browser tabs. Joining opens the board even if camera or microphone permission is denied; media is an independent enhancement.

## Deploy to GitHub Pages

The repository includes an Actions workflow at `.github/workflows/pages.yml`. Push to `master`, then in the repository settings choose **Pages -> Build and deployment -> Source: GitHub Actions**. The site will be published at:

`https://st-voland.github.io/p2p_videochat/`

GitHub Pages serves the static client over HTTPS, so camera and microphone permissions can work there. No backend is used. The two browsers exchange WebRTC offer/answer codes manually, then video and board data travel directly between peers.

### Connect two computers without a server

1. Open the deployed page on both computers and join any room code.
2. On computer A, choose **Create invitation**, then copy the generated code to computer B by any separate channel.
3. On computer B, paste it and choose **Answer invitation**, then send the returned code back to computer A.
4. On computer A, paste the answer and choose **Complete connection**.
l
The generated codes include ICE candidates, so this exchange only happens once per connection. A public STUN server helps discover network paths; some restrictive networks still require TURN, which would be a relay service and is outside the pure no-server mode.

The app can prepare these messages for email without a backend: enter **Your email** and **Peer email**, then use **Create invitation email** or **Create answer email**. GitHub Pages opens the device's default mail composer with a prefilled message; it cannot send mail itself. The recipient should paste the complete received message, including its `FIELDLINE CONNECTION CODE` markers, into the matching field.

### Verify the peer

After exchanging codes, each device shows **Your identity code** and **Peer identity code**. Compare them through a separate trusted channel, such as a voice call:

- Computer A's **Your identity code** must equal Computer B's **Peer identity code**.
- Computer B's **Your identity code** must equal Computer A's **Peer identity code**.

Only check **I compared the codes and they match** after both comparisons agree. These are DTLS fingerprints, not passwords; they authenticate the WebRTC peer but do not contain camera, microphone, or board data.

## Architecture

- `js/signaling.js` contains the manual signaling boundary. The connection codes are copied outside the app; no signaling backend is involved.
- `js/webrtc.js` owns the two-peer WebRTC offer/answer, ICE, media tracks, and ordered data channel.
- `js/board.js` owns local strokes and snapshot/undo/clear messages.
- `js/main.js` wires the interface, media controls, and lifecycle.

The static client must not contain private TURN credentials. Configure a TURN provider for reliable connections on restrictive networks; the current prototype includes a public STUN server for development only.

## Current scope

This is intentionally ephemeral: no accounts, durable rooms, server-side board history, screen sharing, or multiparty rooms. The board synchronizes after the WebRTC data channel opens and can send a snapshot to a late joiner.


https://st-voland.github.io/p2p_videochat/?room=lana