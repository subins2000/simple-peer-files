/*!
 * Simple library to send files over WebRTC
 *
 * @author   Subin Siby <https://subinsb.com>
 * @license  MPL-2.0
 */
import * as Peer from 'simple-peer';
import PeerFileSend from './PeerFileSend';
import PeerFileReceive from './PeerFileReceive';
export default class SimplePeerFiles {
    private arrivals;
    send(peer: Peer, fileID: string, file: File): Promise<unknown>;
    receive(peer: Peer, fileID: string): Promise<unknown>;
}
export { PeerFileSend, PeerFileReceive };
