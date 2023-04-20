import { Readable } from 'readable-stream';
import { EventEmitter } from 'ee-ts';
import SimplePeer from 'simple-peer';
interface Events {
    progress(percentage: number, bytesSent: number): void;
    done(receivedFile: File): void;
    pause(): void;
    paused(): void;
    resume(): void;
    cancel(): void;
    cancelled(): void;
}
export default class PeerFileReceive extends EventEmitter<Events> {
    paused: boolean;
    cancelled: boolean;
    bytesReceived: number;
    peer: SimplePeer.Instance;
    private rs;
    fileName: string;
    fileSize: number;
    private fileData;
    private fileStream;
    fileType: string;
    constructor(peer: SimplePeer.Instance);
    setPeer(peer: SimplePeer.Instance): void;
    /**
     * Send a message to sender
     * @param header Type of message
     * @param data   Message
     */
    private sendPeer;
    createReadStream(): Readable;
    pause(): void;
    resume(): void;
    cancel(): void;
}
export {};
