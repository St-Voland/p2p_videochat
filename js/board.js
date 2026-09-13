const BOARD_WIDTH = 1200;
const BOARD_HEIGHT = 760;

export class SharedBoard {
    constructor(canvas, onMessage) {
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
        this.onMessage = onMessage;
        this.strokes = [];
        this.activeStroke = null;
        this.color = '#e85d3f';
        this.size = 7;
        this.render();
        this.bindPointerEvents();
    }

    setColor(color) { this.color = color; }
    setSize(size) { this.size = Number(size); }

    bindPointerEvents() {
        this.canvas.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            this.canvas.setPointerCapture(event.pointerId);
            const point = this.pointFromEvent(event);
            this.activeStroke = { id: crypto.randomUUID(), color: this.color, size: this.size, points: [point] };
            this.strokes.push(this.activeStroke);
            this.render();
        });
        this.canvas.addEventListener('pointermove', (event) => {
            if (!this.activeStroke) return;
            event.preventDefault();
            this.activeStroke.points.push(this.pointFromEvent(event));
            this.render();
        });
        const finishStroke = () => {
            if (!this.activeStroke) return;
            this.onMessage({ type: 'stroke', stroke: this.activeStroke });
            this.activeStroke = null;
        };
        this.canvas.addEventListener('pointerup', finishStroke);
        this.canvas.addEventListener('pointercancel', finishStroke);
    }

    pointFromEvent(event) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: ((event.clientX - rect.left) / rect.width) * BOARD_WIDTH,
            y: ((event.clientY - rect.top) / rect.height) * BOARD_HEIGHT
        };
    }

    receive(message) {
        if (message.type === 'stroke' && message.stroke) {
            if (!this.strokes.some((stroke) => stroke.id === message.stroke.id)) this.strokes.push(message.stroke);
        } else if (message.type === 'snapshot-request') {
            this.onMessage({ type: 'snapshot', strokes: this.strokes });
        } else if (message.type === 'snapshot') {
            this.strokes = message.strokes || [];
        } else if (message.type === 'clear') {
            this.strokes = [];
        } else if (message.type === 'undo') {
            this.strokes = this.strokes.filter((stroke) => stroke.id !== message.strokeId);
        }
        this.render();
    }

    undo() {
        const stroke = this.strokes.pop();
        if (!stroke) return;
        this.render();
        this.onMessage({ type: 'undo', strokeId: stroke.id });
    }

    clear() {
        if (!this.strokes.length) return;
        this.strokes = [];
        this.render();
        this.onMessage({ type: 'clear' });
    }

    render() {
        const context = this.context;
        context.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
        context.fillStyle = '#fffdf7';
        context.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
        for (const stroke of this.strokes) this.drawStroke(stroke);
    }

    drawStroke(stroke) {
        const points = stroke.points;
        if (!points.length) return;
        const context = this.context;
        context.strokeStyle = stroke.color;
        context.lineWidth = stroke.size;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        for (const point of points.slice(1)) context.lineTo(point.x, point.y);
        if (points.length === 1) context.lineTo(points[0].x + 0.01, points[0].y + 0.01);
        context.stroke();
    }

    snapshot() { return { type: 'snapshot', strokes: this.strokes }; }
}
