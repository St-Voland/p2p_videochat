# Fieldline P2P video board
Simple p2p videochat with whiteboard, for 1-1 sessions and local history.

A dependency-free browser prototype for two-person video chat with a shared freehand board.

## Run locally

WebRTC camera and microphone access works on `localhost` or over HTTPS. From the workspace root:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/p2p_videochat/` in two browser tabs. Enter the same room code in both tabs. The local prototype uses `BroadcastChannel` for signaling, so both tabs must share the same origin. Joining opens the board even if camera or microphone permission is denied; media is an independent enhancement.

## Deploy to GitHub Pages

The repository includes an Actions workflow at `.github/workflows/pages.yml`. Push to `master`, then in the repository settings choose **Pages -> Build and deployment -> Source: GitHub Actions**. The site will be published at:

`https://st-voland.github.io/p2p_videochat/`

GitHub Pages serves the static client over HTTPS, so camera and microphone permissions can work there. The current `BroadcastSignaling` adapter only connects tabs sharing the same browser origin; it does not connect different devices. For real remote rooms, replace it with a hosted signaling adapter such as Supabase Realtime, Firebase, or a small WebSocket service. GitHub Pages cannot run that signaling server itself.

## Architecture

- `js/signaling.js` contains the replaceable signaling boundary. `BroadcastSignaling` is a local same-origin adapter for development.
- `js/webrtc.js` owns the two-peer WebRTC offer/answer, ICE, media tracks, and ordered data channel.
- `js/board.js` owns local strokes and snapshot/undo/clear messages.
- `js/main.js` wires the interface, media controls, and lifecycle.

For deployment across different devices, replace `BroadcastSignaling` with a managed realtime adapter that transports room presence and signaling messages. The static client must not contain private TURN credentials. Configure a TURN provider for reliable connections on restrictive networks; the current prototype includes a public STUN server for development only.

## Current scope

This is intentionally ephemeral: no accounts, durable rooms, server-side board history, screen sharing, or multiparty rooms. The board synchronizes after the WebRTC data channel opens and can send a snapshot to a late joiner.
