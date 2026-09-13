import { SharedBoard } from './board.js';
import { ManualSignaling } from './signaling.js';
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
    boardSync: document.getElementById('boardSync'),
    invitationCode: document.getElementById('invitationCode'),
    answerCode: document.getElementById('answerCode'),
    localEmail: document.getElementById('localEmail'),
    peerEmail: document.getElementById('peerEmail'),
    createOfferButton: document.getElementById('createOfferButton'),
    acceptOfferButton: document.getElementById('acceptOfferButton'),
    acceptAnswerButton: document.getElementById('acceptAnswerButton'),
    localFingerprint: document.getElementById('localFingerprint'),
    remoteFingerprint: document.getElementById('remoteFingerprint'),
    verificationConfirmed: document.getElementById('verificationConfirmed')
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

function setConnectionControlsEnabled(enabled) {
    elements.createOfferButton.disabled = !enabled;
    elements.acceptOfferButton.disabled = !enabled;
    elements.acceptAnswerButton.disabled = !enabled;
}

function getPeerSession() {
    if (!peerSession) {
        setStatus('idle', 'Join room first');
        setNotice('Join the room and wait for the board to finish loading before exchanging connection codes.');
        return null;
    }
    return peerSession;
}

function updateVerification(fingerprints = {}) {
    elements.localFingerprint.textContent = fingerprints.local || 'Waiting for invitation';
    elements.remoteFingerprint.textContent = fingerprints.remote || 'Waiting for answer';
    const ready = Boolean(fingerprints.local && fingerprints.remote);
    elements.verificationConfirmed.disabled = !ready;
    if (!ready) elements.verificationConfirmed.checked = false;
}

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
    setConnectionControlsEnabled(false);
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
        peerSession = new PeerSession(new ManualSignaling(), {
            onRemoteStream: (stream) => {
                elements.remoteVideo.srcObject = stream;
                elements.remotePlaceholder.hidden = true;
            },
            onConnectionState: handleConnectionState,
            onDataChannelState: (state) => {
                elements.boardSync.textContent = state === 'open' ? 'Peer synced' : 'Local canvas';
            },
            onData: (message) => sharedBoard?.receive(message),
            onVerification: updateVerification,
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
        await peerSession.start(localStream);
        setConnectionControlsEnabled(true);
        setStatus('idle', 'Ready for invitation');
        setNotice(mediaMessage || 'Create an invitation, then exchange the code with the other computer.');
    } catch (error) {
        peerSession = null;
        setConnectionControlsEnabled(false);
        setStatus('idle', 'Board only');
        setNotice(`${mediaMessage ? `${mediaMessage} ` : ''}Peer connection unavailable: ${error.message}`);
    }
}

async function createInvitation() {
    const session = getPeerSession();
    if (!session) return;
    if (!validEmailPair()) return;
    try {
        const code = await session.createInvitation();
        const message = createMailMessage('FIELDLINE INVITATION', elements.localEmail.value.trim(), elements.peerEmail.value.trim(), code);
        elements.invitationCode.value = message;
        openMailComposer(elements.peerEmail.value.trim(), 'Fieldline invitation', message);
        setStatus('connecting', 'Invitation ready');
        setNotice('Your mail app has an invitation ready. Send the complete message to your peer.');
    } catch (error) { setNotice(`Could not create invitation: ${error.message}`); }
}

async function answerInvitation() {
    const session = getPeerSession();
    if (!session) return;
    const invitation = extractMailMessage(elements.invitationCode.value, 'offer');
    if (!invitation) return;
    elements.peerEmail.value = invitation.from || elements.peerEmail.value;
    if (!validEmailPair()) return;
    try {
        const code = await session.answerInvitation(invitation.code);
        const message = createMailMessage('FIELDLINE ANSWER', elements.localEmail.value.trim(), elements.peerEmail.value.trim(), code);
        elements.answerCode.value = message;
        openMailComposer(elements.peerEmail.value.trim(), 'Fieldline answer', message);
        setStatus('connecting', 'Answer ready');
        setNotice('Your mail app has an answer ready. Send the complete message back to the inviter.');
    } catch (error) { setNotice(`Could not answer invitation: ${error.message}`); }
}

async function completeConnection() {
    const session = getPeerSession();
    if (!session) return;
    const answer = extractMailMessage(elements.answerCode.value, 'answer');
    if (!answer) return;
    try {
        await session.completeConnection(answer.code);
        setStatus('connecting', 'Connecting peer');
        setNotice('Waiting for the direct connection to open.');
    } catch (error) { setNotice(`Could not complete connection: ${error.message}`); }
}

function validEmailPair() {
    if (elements.localEmail.validity.valid && elements.peerEmail.validity.valid && elements.localEmail.value && elements.peerEmail.value) return true;
    setNotice('Enter both your email and your peer email before creating or answering an email.');
    return false;
}

function createMailMessage(title, from, to, code) {
    return `${title}\nFrom: ${from}\nTo: ${to}\n\nFIELDLINE CONNECTION CODE\n${code}\nEND FIELDLINE CODE\n\nThis message contains a temporary WebRTC connection code. Send it only to the intended peer.`;
}

function extractMailMessage(message, expectedType) {
    const codeMatch = message.match(/FIELDLINE CONNECTION CODE\s*([\s\S]*?)\s*END FIELDLINE CODE/i);
    if (!codeMatch) {
        setNotice('Paste the complete Fieldline email, including the connection code markers.');
        return null;
    }
    let code;
    try { code = JSON.parse(codeMatch[1].trim()); } catch {
        setNotice('The pasted email contains an invalid connection code.');
        return null;
    }
    if (code.type !== expectedType) {
        setNotice(`This is not a valid Fieldline ${expectedType} message.`);
        return null;
    }
    const from = message.match(/^From:\s*(.+)$/im)?.[1]?.trim() || '';
    return { code: codeMatch[1].trim(), from };
}

function openMailComposer(recipient, subject, body) {
    window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
    setConnectionControlsEnabled(false);
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
elements.createOfferButton.addEventListener('click', createInvitation);
elements.acceptOfferButton.addEventListener('click', answerInvitation);
elements.acceptAnswerButton.addEventListener('click', completeConnection);
elements.verificationConfirmed.addEventListener('change', (event) => {
    if (event.target.checked) setNotice('Peer identity confirmed. The connection is trusted for this session.');
});
window.addEventListener('beforeunload', leaveRoom);
setRoomFromUrl();
setConnectionControlsEnabled(false);
updateVerification();
