import { Writable } from 'readable-stream'
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

class ReceiveStream extends Writable {
  /**
   * File stream writes here
   * @param chunk
   * @param encoding
   * @param cb
   */
  _write (data: Uint8Array, encoding: string, cb: Function) {
    if (data[0] === ControlHeaders.FILE_START) {
      const meta = JSON.parse(new TextDecoder().decode(data.slice(1))) as FileStartMetadata
      this.emit('start', meta)
    } else if (data[0] === ControlHeaders.FILE_CHUNK) {
      this.emit('chunk', data.slice(1))
    } else if (data[0] === ControlHeaders.TRANSFER_PAUSE) {
      this.emit('paused')
    } else if (data[0] === ControlHeaders.TRANSFER_CANCEL) {
      this.emit('cancelled')
      this.destroy()
    }

    cb(null) // Signal that we're ready for more data
  }
}

export default class PeerFileReceive extends EventEmitter<Events> {
  public paused: boolean = false;
  public cancelled: boolean = false;
  public bytesReceived: number = 0;

  private peer: SimplePeer.Instance;
  private rs: ReceiveStream;

  private fileName: string;
  private fileSize!: number; // File size in bytes
  private fileType!: string;
  private receivedData: Uint8Array[] = [];

  constructor (peer: SimplePeer.Instance) {
    super()

    this.setPeer(peer)
  }

  private sendData (header: number, data: Uint8Array = null) {
    let resp: Uint8Array
    if (data) {
      resp = new Uint8Array(1 + data.length)
      resp.set(data, 1)
    } else {
      resp = new Uint8Array(1)
    }
    resp[0] = header

    this.peer.send(resp)
  }

  // Request sender to pause transfer
  pause () {
    this.sendData(ControlHeaders.TRANSFER_PAUSE)
    this.paused = true
    this.emit('pause')
  }

  // Request sender to resume sending file
  resume () {
    this.sendData(ControlHeaders.TRANSFER_RESUME)
    this.paused = false
    this.emit('resume')
  }

  cancel () {
    this.sendData(ControlHeaders.TRANSFER_CANCEL)

    this.rs.destroy()
    this.peer.destroy()

    this.emit('cancel')
  }

  // When peer is changed, start a new stream handler and assign events
  setPeer (peer: SimplePeer.Instance) {
    if (this.rs) {
      this.rs.destroy()
    }

    this.rs = new ReceiveStream()
    this.peer = peer

    peer.pipe(this.rs)

    this.rs.on('start', meta => {
      this.fileName = meta.fileName
      this.fileSize = meta.fileSize
      this.fileType = meta.fileType
    })
    this.rs.on('chunk', chunk => {
      this.receivedData.push(chunk)
      this.bytesReceived += chunk.byteLength

      if (this.bytesReceived === this.fileSize) {
        // completed
        this.sendData(ControlHeaders.FILE_END)

        const file = new window.File(
          this.receivedData,
          this.fileName,
          {
            type: this.fileType
          }
        )

        this.emit('progress', 100.0, this.fileSize)
        this.emit('done', file)
      } else {
        const percentage = parseFloat((100 * (this.bytesReceived / this.fileSize)).toFixed(3))

        this.emit('progress', percentage, this.bytesReceived)
      }
    })
    this.rs.on('paused', () => {
      this.emit('paused')
    })
    this.rs.on('cancelled', () => {
      this.emit('cancelled')
    })
  }
}
