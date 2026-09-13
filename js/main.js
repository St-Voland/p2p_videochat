import { SharedBoard } from './board.js';
import { BroadcastSignaling } from './signaling.js';
import { PeerSession } from './webrtc.js';

const elements = {
    joinPanel: document.getElementById('joinPanel'),
    joinForm: document.getElementById('joinForm'),
    roomCode: document.getElementById('roomCode'),
    workspace: document.getElementById('workspace'),
    localVideo: document.getElementById('localVideo'),
    remoteVideo: document.getElementById('remoteVideo'),
    remotePlaceholder: document.getElementById('remotePlaceholder'),
    connectionStatus: document.getElementById('connectionStatus'),
    connectionText: document.getElementById('connectionText'),
    notice: document.getElementById('notice'),
    localMediaState: document.getElementById('localMediaState'),
    micButton: document.getElementById('micButton'),
    micLabel: document.getElementById('micLabel'),
    cameraButton: document.getElementById('cameraButton'),
    cameraLabel: document.getElementById('cameraLabel'),
    copyButton: document.getElementById('copyButton'),
    leaveButton: document.getElementById('leaveButton'),
    boardCanvas: document.getElementById('boardCanvas'),
    brushColor: document.getElementById('brushColor'),
    brushSize: document.getElementById('brushSize'),
    brushSizeValue: document.getElementById('brushSizeValue'),
    undoButton: document.getElementById('undoButton'),
    clearButton: document.getElementById('clearButton'),
    boardSync: document.getElementById('boardSync')
};

let localStream = null;
let peerSession = null;
let sharedBoard = null;
let currentRoom = '';

function setStatus(state, text) {
    elements.connectionStatus.dataset.state = state;
    elements.connectionText.textContent = text;
}

function setNotice(text) { elements.notice.textContent = text; }

function setRoomFromUrl() {
    const room = new URLSearchParams(window.location.search).get('room');
    if (room) elements.roomCode.value = room;
}

async function joinRoom(event) {
    event.preventDefault();
    const room = elements.roomCode.value.trim().toLowerCase();
    if (!room) return;
    elements.joinForm.querySelector('button').disabled = true;
    setStatus('connecting', 'Requesting media');
    currentRoom = room;
    window.history.replaceState({}, '', `?room=${encodeURIComponent(room)}`);
    elements.joinPanel.hidden = true;
    elements.workspace.hidden = false;
    sharedBoard = new SharedBoard(elements.boardCanvas, (message) => peerSession?.send(message));

    let mediaMessage = '';
    if (navigator.mediaDevices?.getUserMedia) {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            elements.localVideo.srcObject = localStream;
        } catch (error) {
            mediaMessage = error.name === 'NotAllowedError'
                ? 'Camera and microphone permission was denied. The shared board is still available.'
                : `Media unavailable (${error.name}). The shared board is still available.`;
        }
    } else {
        mediaMessage = 'Camera and microphone require HTTPS or localhost. The shared board is still available.';
    }

    try {
        peerSession = new PeerSession(new BroadcastSignaling(), {
            onRemoteStream: (stream) => {
                elements.remoteVideo.srcObject = stream;
                elements.remotePlaceholder.hidden = true;
            },
            onConnectionState: handleConnectionState,
            onDataChannelState: (state) => {
                elements.boardSync.textContent = state === 'open' ? 'Peer synced' : 'Local canvas';
            },
            onData: (message) => sharedBoard?.receive(message),
            onError: (message) => {
                setStatus('idle', 'Connection error');
                setNotice(message);
            },
            onPeerLeft: () => {
                elements.remotePlaceholder.hidden = false;
                setStatus('connecting', 'Peer disconnected');
                setNotice('Your room is still open. A peer can rejoin with the same code.');
            }
        });
        await peerSession.start(currentRoom, localStream);
        setStatus('connecting', 'Waiting for peer');
        setNotice(mediaMessage || 'Share the room link, then keep this tab open while the peer joins.');
    } catch (error) {
        peerSession = null;
        setStatus('idle', 'Board only');
        setNotice(`${mediaMessage ? `${mediaMessage} ` : ''}Peer connection unavailable: ${error.message}`);
    }
}

function handleConnectionState(state) {
    if (state === 'connected') {
        setStatus('connected', 'Peer connected');
        setNotice('You are connected directly. Board changes travel over the peer data channel.');
    } else if (state === 'connecting') setStatus('connecting', 'Connecting peer');
    else if (state === 'failed') setStatus('idle', 'Connection failed');
}

function toggleTrack(kind) {
    const track = localStream?.getTracks().find((item) => item.kind === kind);
    if (!track) return;
    track.enabled = !track.enabled;
    const enabled = track.enabled;
    if (kind === 'audio') {
        elements.micButton.setAttribute('aria-pressed', String(!enabled));
        elements.micLabel.textContent = enabled ? 'Mute mic' : 'Unmute mic';
    } else {
        elements.cameraButton.setAttribute('aria-pressed', String(!enabled));
        elements.cameraLabel.textContent = enabled ? 'Stop camera' : 'Start camera';
    }
    elements.localMediaState.textContent = `${localStream.getAudioTracks()[0]?.enabled ? 'mic' : 'muted'} / ${localStream.getVideoTracks()[0]?.enabled ? 'camera' : 'camera off'}`;
}

async function copyRoomLink() {
    const link = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(currentRoom)}`;
    try {
        await navigator.clipboard.writeText(link);
        setNotice('Room link copied to your clipboard.');
    } catch {
        setNotice(`Share this room code: ${currentRoom}`);
    }
}

function leaveRoom() {
    peerSession?.stop();
    localStream?.getTracks().forEach((track) => track.stop());
    peerSession = null;
    localStream = null;
    elements.localVideo.srcObject = null;
    elements.remoteVideo.srcObject = null;
    elements.remotePlaceholder.hidden = false;
    elements.workspace.hidden = true;
    elements.joinPanel.hidden = false;
    elements.joinForm.querySelector('button').disabled = false;
    setStatus('idle', 'Ready to connect');
    setNotice('Camera and microphone are requested after you join. The board is ready immediately.');
}

elements.joinForm.addEventListener('submit', joinRoom);
elements.micButton.addEventListener('click', () => toggleTrack('audio'));
elements.cameraButton.addEventListener('click', () => toggleTrack('video'));
elements.copyButton.addEventListener('click', copyRoomLink);
elements.leaveButton.addEventListener('click', leaveRoom);
elements.brushColor.addEventListener('input', (event) => sharedBoard?.setColor(event.target.value));
elements.brushSize.addEventListener('input', (event) => {
    elements.brushSizeValue.textContent = event.target.value;
    sharedBoard?.setSize(event.target.value);
});
elements.undoButton.addEventListener('click', () => sharedBoard?.undo());
elements.clearButton.addEventListener('click', () => sharedBoard?.clear());
window.addEventListener('beforeunload', leaveRoom);
setRoomFromUrl();
