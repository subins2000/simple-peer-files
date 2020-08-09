import { EventEmitter } from 'ee-ts'
import SimplePeer from 'simple-peer'

import ControlHeaders from './ControlHeaders'
import FileSendRequest from './FileSendRequest'
import FileStartMetadata from './FileStartMetadata'

interface Events {
  progress(bytesCompleted: number): void,
  done(receivedFile: File): void

  // Called when receiver (this) has requested a pause
  pause(): void

  // Called when sender paused the transfer
  paused(): void

  // Called when receiver (this) has requested to resume
  resume(): void

  // Called when the receiver (this) calls cancel
  cancel(): void

  // Called when the sender cancels the transfer
  cancelled(): void
}

export default class PeerFileReceive extends EventEmitter<Events> {
  private peer: SimplePeer.Instance;
  private req: FileSendRequest;

  private receivedData: any[];

  private fileType!: string;
  private chunkSizeBytes!: number;

  public receivedChunkCount!: number;
  private chunkCount!: number;

  public paused: boolean = false;

  constructor (peer: SimplePeer.Instance, req: FileSendRequest) {
    super()

    this.peer = peer
    this.req = req

    this.receivedData = []

    this.handleData = this.handleData.bind(this)
  }

  private handleData (data: Uint8Array) {
    if (data[0] === ControlHeaders.FILE_START) {
      const meta = JSON.parse(new TextDecoder().decode(data.slice(1))) as FileStartMetadata

      this.chunkCount = meta.totalChunks
      this.receivedChunkCount = 0
      this.chunkSizeBytes = meta.chunkSize
      this.fileType = meta.fileType

      this.emit('progress', 0)
    } else if (data[0] === ControlHeaders.FILE_CHUNK) {
      this.receivedData.push(data.slice(1))

      this.receivedChunkCount++

      this.emit('progress', Math.min(this.chunkSizeBytes * this.receivedChunkCount, this.req.filesizeBytes))
    } else if (data[0] === ControlHeaders.FILE_END) {
      const file = new window.File(
        this.receivedData,
        this.req.filename,
        {
          type: this.fileType
        }
      )
      this.emit('done', file)

      // Disconnect from the peer and cleanup
      this.peer.off('data', this.handleData)
      this.peer.destroy()
    } else if (data[0] === ControlHeaders.TRANSFER_PAUSE) {
      this.emit('paused')
    } else if (data[0] === ControlHeaders.TRANSFER_CANCEL) {
      this.peer.off('data', this.handleData)
      this.peer.destroy()

      this.emit('cancelled')
    }
  }

  start () {
    this.peer.on('data', this.handleData)
  }

  _pause () {
    const resp = new Uint8Array(1)
    resp[0] = ControlHeaders.TRANSFER_PAUSE

    this.peer.send(resp)

    this.paused = true
  }

  pause () {
    this._pause()

    const resp = new Uint8Array(1)
    resp[0] = ControlHeaders.TRANSFER_PAUSE

    this.peer.send(resp)
    this.emit('pause')
  }

  resume () {
    const resp = new Uint8Array(1)
    resp[0] = ControlHeaders.TRANSFER_RESUME

    this.peer.send(resp)
    this.emit('resume')
  }

  // Structure for cancel data
  // 1st byte -> Header for the sent data type (ControlHeaders.TRANSFER_CANCEL)
  private prepareCancelData (): Uint8Array {
    const resp = new Uint8Array(1)

    resp[0] = ControlHeaders.TRANSFER_CANCEL
    return resp
  }

  cancel () {
    this.peer.send(this.prepareCancelData())
    this.peer.off('data', this.handleData)
    this.peer.destroy()

    this.emit('cancel')
  }

  setPeer (peer: SimplePeer.Instance) {
    this.peer = peer
  }
}
