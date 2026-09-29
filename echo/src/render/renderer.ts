import { drawSkeleton } from './skeleton';
import { Level, Actor, WorldState } from '../game/types';
import { Hint } from '../game/hints';

export class Renderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get 2d context');
        this.ctx = ctx;

        this.canvas.width = 1000;
        this.canvas.height = 600;
    }

    draw(
        video: HTMLVideoElement,
        level: Level,
        actors: Actor[],
        world: WorldState,
        hint: Hint | null,
        t: number,
        playerLm: Float32Array | null = null,
        echoes: Float32Array[] = []
    ) {
        const width = this.canvas.width;
        const height = this.canvas.height;
        this.ctx.clearRect(0, 0, width, height);



        // Draw lanes
        const numLanes = 5; // Fixed 5 lanes for MVP
        const laneWidth = width / numLanes;
        this.ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        this.ctx.lineWidth = 2;
        for (let i = 1; i < numLanes; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(i * laneWidth, 0);
            this.ctx.lineTo(i * laneWidth, height);
            this.ctx.stroke();
        }

        // Draw Level Objects
        for (const obj of level.objects) {
            let objLane = 3;
            if ('lane' in obj) objLane = obj.lane;
            else if ('toLane' in obj) objLane = obj.toLane;
            const cx = (objLane - 0.5) * laneWidth;
            
            if (obj.type === 'lever') {
                const isActive = world.levers[obj.id];
                this.ctx.fillStyle = isActive ? '#00ff00' : '#ff0000';
                this.ctx.fillRect(cx - 20, 100, 40, 60);
                this.ctx.fillStyle = 'white';
                this.ctx.font = '16px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(`Lever ${obj.id}`, cx, 90);
            } 
            else if (obj.type === 'plate') {
                const isActive = world.plates[obj.id];
                this.ctx.fillStyle = isActive ? '#00ff00' : '#ff0000';
                this.ctx.beginPath();
                this.ctx.ellipse(cx, height - 50, 40, 15, 0, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.fillStyle = 'white';
                this.ctx.fillText(`Plate ${obj.id}`, cx, height - 20);
            }
            else if (obj.type === 'door') {
                const isOpen = world.doors[obj.id];
                this.ctx.fillStyle = isOpen ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.6)';
                this.ctx.fillRect(cx - 40, 150, 80, 200);
                this.ctx.fillStyle = 'white';
                this.ctx.fillText(`Door ${obj.id}`, cx, 140);
            }
            else if (obj.type === 'exit') {
                this.ctx.fillStyle = '#ffff00';
                this.ctx.fillRect(cx - 30, height / 2 - 30, 60, 60);
                this.ctx.fillStyle = 'black';
                this.ctx.fillText(`EXIT`, cx, height / 2);
                
                // Draw progress
                this.ctx.fillStyle = 'blue';
                this.ctx.fillRect(cx - 30, height / 2 + 40, 60 * world.exitProgress, 10);
            }
            else if (obj.type === 'laser') {
                // simple draw for laser
                const stopLane = world.laserStops[obj.id] || obj.toLane;
                const startX = (obj.path[0] - 0.5) * laneWidth;
                const endX = (stopLane - 0.5) * laneWidth;
                this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
                this.ctx.lineWidth = 5;
                this.ctx.beginPath();
                this.ctx.moveTo(startX, 50); // arbitrary Y for laser
                this.ctx.lineTo(endX, 50);
                this.ctx.stroke();
            }
        }

        // Draw actors state summary (top right)
        this.ctx.fillStyle = 'white';
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'right';
        let y = 30;
        for (const a of actors) {
            const laneText = a.state.visible ? `Lane ${a.state.lane}` : 'Hidden';
            this.ctx.fillText(`${a.id}: ${laneText} (Stun: ${Math.max(0, a.stunnedUntil - t).toFixed(1)}s)`, width - 20, y);
            y += 25;
        }
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Time: ${t.toFixed(1)}s`, 20, 30);
        if (world.won) {
            this.ctx.fillStyle = '#00ff00';
            this.ctx.font = '40px Arial';
            this.ctx.fillText('YOU WON!', width / 2 - 100, height / 2 - 100);
        }

        // Draw Skeletons
        const echoColors = ['#ff4444', '#44ff44', '#4444ff', '#ffff44'];
        echoes.forEach((echo, i) => {
            const color = echoColors[i % echoColors.length];
            drawSkeleton(this.ctx, echo, 0.45, color);
        });

        if (playerLm) {
            drawSkeleton(this.ctx, playerLm, 1.0, '#ffffff');
        }

        // Draw Hint
        if (hint) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(50, height - 100, width - 100, 60);
            
            if (hint.severity === 'error') this.ctx.fillStyle = '#ff4444';
            else if (hint.severity === 'warn') this.ctx.fillStyle = '#ffff44';
            else this.ctx.fillStyle = '#44ff44';
            
            this.ctx.font = '20px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(hint.text, width / 2, height - 62);
        }

        // DEBUG INFO overlay
        const player = actors.find(a => a.id === 'player');
        if (player) {
            this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
            this.ctx.fillRect(10, 10, 250, 150);
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '16px monospace';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(`Visible: ${player.state.visible}`, 20, 30);
            this.ctx.fillText(`Lane: ${player.state.lane}`, 20, 50);
            this.ctx.fillText(`ArmLeft: ${player.state.armUp.left}`, 20, 70);
            this.ctx.fillText(`ArmRight: ${player.state.armUp.right}`, 20, 90);
            this.ctx.fillText(`L_Wr_Y: ${player.state.raw.wristAboveHead.left.toFixed(2)}`, 20, 110);
            this.ctx.fillText(`R_Wr_Y: ${player.state.raw.wristAboveHead.right.toFixed(2)}`, 20, 130);
        }
    }
}
