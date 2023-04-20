import { EventEmitter } from 'ee-ts';
import SimplePeer from 'simple-peer';
interface Events {
    progress(percentage: number, bytesSent: number): void;
    done(): void;
    pause(): void;
    paused(): void;
    resume(): void;
    resumed(): void;
    cancel(): void;
    cancelled(): void;
}
export default class PeerFileSend extends EventEmitter<Events> {
    paused: boolean;
    cancelled: boolean;
    receiverPaused: boolean;
    peer: SimplePeer.Instance;
    file: File;
    private ss;
    private offset;
    /**
     * @param peer   Peer to send
     * @param file   File to send
     * @param offset Bytes to start sending from, useful for file resume
     */
    constructor(peer: SimplePeer.Instance, file: File, offset?: number);
    /**
     * Send a message to receiver
     * @param header Type of message
     * @param data   Message
     */
    private sendPeer;
    private sendFileStartData;
    setPeer(peer: SimplePeer.Instance): void;
    _resume(): void;
    start(): void;
    _pause(): void;
    pause(): void;
    resume(): void;
    cancel(): void;
}
export {};
