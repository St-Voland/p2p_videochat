const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' }
];

export class PeerSession {
    constructor(signaling, callbacks = {}) {
        this.signaling = signaling;
        this.callbacks = callbacks;
        this.peerConnection = null;
        this.dataChannel = null;
        this.remoteId = null;
        this.localStream = null;
        this.pendingCandidates = [];
        this.roomId = null;
        this.discoveryStarted = false;
    }

    async start(roomId, localStream) {
        if (!window.RTCPeerConnection || !window.BroadcastChannel) {
            throw new Error('This browser does not support the local WebRTC prototype.');
        }
        this.roomId = roomId;
        this.localStream = localStream;
        this.signaling.join(roomId, {
            onPeer: (peerId) => this.discoverPeer(peerId),
            onSignal: (message, peerId) => this.handleSignal(message, peerId)
        });
    }

    async discoverPeer(peerId) {
        if (this.remoteId && this.remoteId !== peerId) return;
        if (this.discoveryStarted) return;
        this.discoveryStarted = true;
        this.remoteId = peerId;
        try {
            const shouldInitiate = this.signaling.id < peerId;
            this.createConnection(shouldInitiate);
            if (shouldInitiate) {
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                this.signaling.send(peerId, { type: 'offer', description: serializeDescription(this.peerConnection.localDescription) });
            }
        } catch (error) {
            this.callbacks.onError?.(`Peer negotiation failed: ${error.message}`);
        }
    }

    createConnection(initiator) {
        if (this.peerConnection) return this.peerConnection;
        this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        for (const track of this.localStream?.getTracks() || []) this.peerConnection.addTrack(track, this.localStream);
        this.peerConnection.addEventListener('icecandidate', (event) => {
            if (event.candidate && this.remoteId) this.signaling.send(this.remoteId, { type: 'candidate', candidate: serializeCandidate(event.candidate) });
        });
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

    async handleSignal(message, peerId) {
        if (this.remoteId && this.remoteId !== peerId) return;
        this.remoteId = peerId;
        try {
            if (message.type === 'offer') {
                this.createConnection(false);
                await this.peerConnection.setRemoteDescription(message.description);
                await this.flushCandidates();
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                this.signaling.send(peerId, { type: 'answer', description: serializeDescription(this.peerConnection.localDescription) });
            } else if (message.type === 'answer' && this.peerConnection) {
                await this.peerConnection.setRemoteDescription(message.description);
                await this.flushCandidates();
            } else if (message.type === 'candidate') {
                if (this.peerConnection?.remoteDescription) await this.peerConnection.addIceCandidate(message.candidate);
                else this.pendingCandidates.push(message.candidate);
            }
        } catch (error) {
            this.callbacks.onError?.(`Signaling failed: ${error.message}`);
        }
    }

    async flushCandidates() {
        for (const candidate of this.pendingCandidates) await this.peerConnection.addIceCandidate(candidate);
        this.pendingCandidates = [];
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
        this.remoteId = null;
        this.pendingCandidates = [];
        this.discoveryStarted = false;
    }
}

function serializeDescription(description) {
    return { type: description.type, sdp: description.sdp };
}

function serializeCandidate(candidate) {
    return candidate.toJSON ? candidate.toJSON() : {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
        usernameFragment: candidate.usernameFragment
    };
}
