import { EventEmitter } from 'ee-ts'
import SimplePeer from 'simple-peer'
import { through } from 'through'

import { ControlHeaders, FileStartMetadata } from './Meta'

import * as read from 'filereader-stream'

interface Events {
  progress(percentage: number, bytesSent: number): void,

  done(): void

  // Called when sender (this) has requested a pause
  pause(): void

  // Called when receiver has requested a pause
  paused(): void

  // Called when sender (this) has requested to resume
  resume(): void

  // Called when receiver has requested to resume
  resumed(): void

  // Called when the sender (this) has requested a cancel
  cancel(): void

  // Called when the receiver has requested a cancel
  cancelled(): void
}

export default class PeerFileSend extends EventEmitter<Events> {
  private peer: SimplePeer.Instance;
  private file: File;

  private chunkSize = Math.pow(2, 13);
  private chunksTotal: number;
  private chunksSent: number = 0;
  private startingChunk: number;

  public paused: boolean = false;
  public cancelled: boolean = false;

  private receiverPaused: boolean = false; // Does the receiver not want data ?
  private stopSending: boolean = false;

  constructor (peer: SimplePeer.Instance, file: File, startingChunk: number = 0) {
    super()

    this.peer = peer
    this.file = file
    this.chunksTotal = Math.ceil(this.file.size / this.chunkSize)

    this.startingChunk = startingChunk
  }

  // Info about file is sent first
  private sendFileStartData () {
    const meta: FileStartMetadata = {
      fileName: this.file.name,
      fileSize: this.file.size,
      fileType: this.file.type,
      chunksTotal: this.chunksTotal,
      chunkSize: this.chunkSize
    }
    const metaString = JSON.stringify(meta)
    const metaByteArray = new TextEncoder().encode(metaString)

    this.sendData(ControlHeaders.FILE_START, metaByteArray)
  }

  // 1st byte -> Data type header
  // Rest of the bytes will be the data to send
  private sendData (header: number, data: Uint8Array = new Uint8Array()) {
    const resp = new Uint8Array(1 + data.length)
    resp[0] = header
    resp.set(data, 1)

    this.peer.send(resp)
  }

  setPeer (peer: SimplePeer.Instance) {
    this.peer = peer
  }

  // Start sending file to receiver
  _resume () {
    if (this.receiverPaused) return

    this.stopSending = false
    let offset = 0

    if (this.startingChunk > 0) {
      // Resume

      // starting chunk number is the next chunk needed to send
      // number of chunks already sent will be -1
      this.chunksSent = this.startingChunk - 1

      offset = this.chunksSent * this.chunkSize
    } else {
      // Start
      this.sendFileStartData()
      this.emit('progress', 0.0, 0)
    }

    // Chunk sending
    const stream = read(this.file, {
      chunkSize: this.chunkSize,
      offset
    })

    const streamHandler = through(
      (chunk: any) => {
        // TODO : Some way to actually stop this function on cancel
        if (this.stopSending) {
          streamHandler.destroy()
        } else {
          this.sendData(ControlHeaders.FILE_CHUNK, chunk)

          this.chunksSent++

          const bytesSent = Math.min(this.file.size, this.chunksSent * this.chunkSize)
          const percentage = parseFloat((100 * (bytesSent / this.file.size)).toFixed(3))

          this.emit('progress', percentage, bytesSent)
        }
      },
      () => {
        if (!this.stopSending) {
          this.sendData(ControlHeaders.FILE_END)

          this.emit('done')

          // Destroy peer
          this.peer.destroy()
        }
      }
    )

    stream.pipe(streamHandler)
  }

  start () {
    // Listen for cancel requests
    this.peer.on('data', (data: Uint8Array) => {
      if (data[0] === ControlHeaders.TRANSFER_PAUSE) {
        this.receiverPaused = true
        this._pause()
        this.emit('paused')
      } else if (data[0] === ControlHeaders.TRANSFER_RESUME) {
        const chunksReceived = parseInt(new TextDecoder().decode(data.slice(1)))

        this.receiverPaused = false
        this.startingChunk = chunksReceived + 1

        if (!this.paused) {
          this._resume()
          this.emit('resumed')
        }
      } else if (data[0] === ControlHeaders.TRANSFER_CANCEL) {
        this.cancelled = true
        this.peer.destroy()

        this.emit('cancelled')
      }
    })

    this._resume()
  }

  _pause () {
    this.stopSending = true
    this.startingChunk = this.chunksSent + 1
  }

  // Stop sending data now & future sending
  pause () {
    this._pause()
    this.paused = true

    this.sendData(ControlHeaders.TRANSFER_PAUSE)
    this.emit('pause')
  }

  // Allow data to be sent & start sending data
  resume () {
    this.paused = false
    this.emit('resume')

    this._resume()
  }

  cancel () {
    this.stopSending = true
    this.cancelled = true
    this.sendData(ControlHeaders.TRANSFER_CANCEL)
    this.emit('cancel')
  }
}
