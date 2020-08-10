import { EventEmitter } from 'ee-ts'
import SimplePeer from 'simple-peer'

import { ControlHeaders, FileStartMetadata } from './Meta'

interface Events {
  progress(percentage: number, bytesSent: number): void,

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

  private fileName: string;
  private fileSize!: number; // File size in bytes
  private fileType!: string;

  private receivedData: any[];

  public chunkSize!: number; // Chunk size in bytes
  public chunksTotal!: number;
  public chunksReceived: number = 0;

  public paused: boolean = false;
  public cancelled: boolean = false;

  constructor (peer: SimplePeer.Instance) {
    super()

    this.peer = peer
    this.receivedData = []
    this.handleData = this.handleData.bind(this)

    this.peer.on('data', this.handleData)
  }

  private handleData (data: Uint8Array) {
    if (data[0] === ControlHeaders.FILE_START) {
      const meta = JSON.parse(new TextDecoder().decode(data.slice(1))) as FileStartMetadata

      this.chunksTotal = meta.chunksTotal
      this.chunksReceived = 0
      this.chunkSize = meta.chunkSize

      this.fileName = meta.fileName
      this.fileSize = meta.fileSize
      this.fileType = meta.fileType

      this.emit('progress', 0.0, 0)
    } else if (data[0] === ControlHeaders.FILE_CHUNK && !this.paused) {
      this.receivedData.push(data.slice(1))

      this.chunksReceived++

      const bytesReceived = Math.min(this.chunkSize * this.chunksReceived, this.fileSize)
      const percentage = parseFloat((100 * (bytesReceived / this.fileSize)).toFixed(3))

      this.emit('progress', percentage, bytesReceived)
    } else if (data[0] === ControlHeaders.FILE_END) {
      const file = new window.File(
        this.receivedData,
        this.fileName,
        {
          type: this.fileType
        }
      )
      this.emit('done', file)

      // Disconnect from the peer and cleanup
      this.peer.removeListener('data', this.handleData)
      this.peer.destroy()
    } else if (data[0] === ControlHeaders.TRANSFER_PAUSE) {
      this.emit('paused')
    } else if (data[0] === ControlHeaders.TRANSFER_CANCEL) {
      this.peer.removeListener('data', this.handleData)
      this.peer.destroy()

      this.cancelled = true
      this.emit('cancelled')
    }
  }

  private sendData (header: number, data: Uint8Array = new Uint8Array()) {
    const resp = new Uint8Array(1 + data.length)
    resp[0] = header
    resp.set(data, 1)

    this.peer.send(resp)
  }

  // Request to stop sending data
  _pause () {
    this.sendData(ControlHeaders.TRANSFER_PAUSE)
    this.paused = true
  }

  // Pause receival of data
  pause () {
    this.paused = true
    this._pause()
    this.emit('pause')
  }

  // Request to resume sending data
  _resume () {
    const crByteArray = new TextEncoder().encode(this.chunksReceived.toString())
    this.sendData(ControlHeaders.TRANSFER_RESUME, crByteArray)
  }

  // Allow data to be acceptable by receiver & request sender to resume
  resume () {
    this.paused = false
    this._resume()
    this.emit('resume')
  }

  cancel () {
    this.sendData(ControlHeaders.TRANSFER_CANCEL)
    this.peer.removeListener('data', this.handleData)
    this.peer.destroy()

    this.emit('cancel')
  }

  setPeer (peer: SimplePeer.Instance) {
    this.peer = peer
  }
}
