export class BroadcastSignaling {
    constructor() {
        this.id = crypto.randomUUID();
        this.channel = null;
        this.roomId = null;
        this.onSignal = () => {};
        this.onPeer = () => {};
    }

    join(roomId, { onSignal, onPeer }) {
        this.roomId = roomId;
        this.onSignal = onSignal;
        this.onPeer = onPeer;
        this.channel = new BroadcastChannel(`fieldline:${roomId}`);
        this.channel.addEventListener('message', (event) => this.handleMessage(event.data));
        this.channel.postMessage({ type: 'hello', from: this.id });
    }

    handleMessage(message) {
        if (!message || message.from === this.id) return;
        if (message.type === 'hello') {
            this.onPeer(message.from);
            this.channel.postMessage({ type: 'hello-ack', from: this.id, to: message.from });
        } else if (message.type === 'hello-ack' && message.to === this.id) {
            this.onPeer(message.from);
        } else if (message.type === 'signal' && message.to === this.id) {
            this.onSignal(message.payload, message.from);
        }
    }

    send(to, payload) {
        this.channel?.postMessage({ type: 'signal', from: this.id, to, payload });
    }

    leave() {
        this.channel?.close();
        this.channel = null;
    }
}
