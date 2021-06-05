import {Manager} from "./manager";
import {StoredTTVState} from "../util";
import WebSocket from 'ws';

export default class WebsocketManager extends Manager {
    private openSockets: Array<WebSocket> = [];
    public constructor() {
        super("WebsocketManager");
    }

    public handleSocket(sock: WebSocket) {
        sock.on('close', () => {
            this.openSockets.splice(this.openSockets.indexOf(sock), 1);
        });
        this.openSockets.push(sock);
        sock.send(JSON.stringify({connected: true}));
    }

    public broadcast(message: any) {
        this.openSockets.forEach(e => {
            e.send(JSON.stringify(message));
        });
    }

    forceSync(state: StoredTTVState): void {
    }

}