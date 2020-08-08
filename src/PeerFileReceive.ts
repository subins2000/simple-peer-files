import { EventEmitter } from 'ee-ts'
import SimplePeer from 'simple-peer'
import FileSendRequest from './FileSendRequest'
import PeerFileSend from './PeerFileSend'
import FileStartMetadata from './FileStartMetadata'

interface Events {
  progress(bytesCompleted: number): void,
  done(receivedFile: Blob, filename: string): void

  // Called when the receiver (this) calls cancel
  cancel(): void

  // Called when the sender cancels the transfer
  cancelled(): void
}

export default class PeerFileReceive extends EventEmitter<Events> {
  // Special data headers sent by Receivers
  static HEADER_REC_CANCEL = 20;

  private peer: SimplePeer.Instance;
  private req: FileSendRequest;

  private receivedData: any[];

  private fileType!: string;
  private chunkSizeBytes!: number;
  private receivedChunkCount!: number;
  private chunkCount!: number;

  constructor (peer: SimplePeer.Instance, req: FileSendRequest) {
    super()

    this.peer = peer
    this.req = req

    this.receivedData = []

    this.handleData = this.handleData.bind(this)
  }

  private handleData (data: Uint8Array) {
    if (data[0] === PeerFileSend.HEADER_FILE_START) {
      const meta = JSON.parse(new TextDecoder().decode(data.slice(1))) as FileStartMetadata

      console.log(data)
      this.chunkCount = meta.totalChunks
      this.receivedChunkCount = 0
      this.chunkSizeBytes = meta.chunkSize
      this.fileType = meta.fileType

      this.emit('progress', 0)
    } else if (data[0] === PeerFileSend.HEADER_FILE_CHUNK) {
      this.receivedData.push(data.slice(1))

      this.receivedChunkCount++

      this.emit('progress', Math.min(this.chunkSizeBytes * this.receivedChunkCount, this.req.filesizeBytes))
    } else if (data[0] === PeerFileSend.HEADER_FILE_END) {
      console.log(this.receivedData)
      this.emit('done', new window.Blob(this.receivedData, { type: this.fileType }), this.req.filename)

      // Disconnect from the peer and cleanup
      this.peer.off('data', this.handleData)
      this.peer.destroy()
    } else if (data[0] === PeerFileSend.HEADER_SEND_CANCEL) {
      this.peer.off('data', this.handleData)
      this.peer.destroy()

      this.emit('cancelled')
    }
  }

  start () {
    this.peer.on('data', this.handleData)
  }

  // Structure for cancel data
  // 1st byte -> Header for the sent data type (HEADER_REC_CANCEL)
  private prepareCancelData (): Uint8Array {
    const resp = new Uint8Array(1)

    resp[0] = PeerFileReceive.HEADER_REC_CANCEL
    return resp
  }

  cancel () {
    this.peer.send(this.prepareCancelData())
    this.peer.off('data', this.handleData)
    this.peer.destroy()

    this.emit('cancel')
  }
}
