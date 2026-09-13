const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export class PeerSession {
    constructor(signaling, callbacks = {}) {
        this.signaling = signaling;
        this.callbacks = callbacks;
        this.peerConnection = null;
        this.dataChannel = null;
        this.localStream = null;
    }

    async start(localStream) {
        if (!window.RTCPeerConnection) throw new Error('This browser does not support WebRTC.');
        this.localStream = localStream;
        await this.signaling.join();
    }

    createConnection(initiator) {
        if (this.peerConnection) return this.peerConnection;
        this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        for (const track of this.localStream?.getTracks() || []) this.peerConnection.addTrack(track, this.localStream);
        this.peerConnection.addEventListener('track', (event) => this.callbacks.onRemoteStream?.(event.streams[0]));
        this.peerConnection.addEventListener('connectionstatechange', () => {
            this.callbacks.onConnectionState?.(this.peerConnection.connectionState);
            if (['failed', 'closed', 'disconnected'].includes(this.peerConnection.connectionState)) this.callbacks.onPeerLeft?.();
        });
        this.peerConnection.addEventListener('datachannel', (event) => this.attachDataChannel(event.channel));
        if (initiator) this.attachDataChannel(this.peerConnection.createDataChannel('fieldline-board', { ordered: true }));
        return this.peerConnection;
    }

    attachDataChannel(channel) {
        this.dataChannel = channel;
        channel.addEventListener('open', () => {
            this.callbacks.onDataChannelState?.('open');
            this.send({ type: 'snapshot-request' });
        });
        channel.addEventListener('close', () => this.callbacks.onDataChannelState?.('closed'));
        channel.addEventListener('message', (event) => {
            try { this.callbacks.onData?.(JSON.parse(event.data)); } catch { /* Ignore malformed peer data. */ }
        });
    }

    async createInvitation() {
        this.createConnection(true);
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        await this.waitForIceGathering();
        return JSON.stringify({ type: 'offer', description: serializeDescription(this.peerConnection.localDescription) });
    }

    async answerInvitation(code) {
        const invitation = parseCode(code, 'offer');
        this.createConnection(false);
        await this.peerConnection.setRemoteDescription(invitation.description);
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        await this.waitForIceGathering();
        return JSON.stringify({ type: 'answer', description: serializeDescription(this.peerConnection.localDescription) });
    }

    async completeConnection(code) {
        const answer = parseCode(code, 'answer');
        if (!this.peerConnection) throw new Error('Create an invitation first.');
        await this.peerConnection.setRemoteDescription(answer.description);
    }

    waitForIceGathering() {
        if (this.peerConnection.iceGatheringState === 'complete') return Promise.resolve();
        return new Promise((resolve) => {
            const finish = () => {
                if (this.peerConnection.iceGatheringState === 'complete') {
                    this.peerConnection.removeEventListener('icegatheringstatechange', finish);
                    resolve();
                }
            };
            this.peerConnection.addEventListener('icegatheringstatechange', finish);
        });
    }

    send(message) {
        if (this.dataChannel?.readyState === 'open') this.dataChannel.send(JSON.stringify(message));
    }

    stop() {
        this.dataChannel?.close();
        this.peerConnection?.close();
        this.signaling.leave();
        this.dataChannel = null;
        this.peerConnection = null;
    }
}

function parseCode(code, expectedType) {
    let parsed;
    try { parsed = JSON.parse(code); } catch { throw new Error('Connection code is not valid JSON.'); }
    if (parsed.type !== expectedType || !parsed.description?.sdp) throw new Error(`Expected a WebRTC ${expectedType} code.`);
    return parsed;
}

function serializeDescription(description) {
    return { type: description.type, sdp: description.sdp };
}
