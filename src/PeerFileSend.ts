import { Duplex } from 'readable-stream'
import SimplePeer from 'simple-peer'
import * as read from 'filereader-stream'
import { through } from 'through'

import { ControlHeaders, FileStartMetadata } from './Meta'

const CHUNK_SIZE = Math.pow(2, 16)

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

export default class PeerFileSend extends Duplex {
  public paused: boolean = false;
  public cancelled: boolean = false;

  private peer: SimplePeer.Instance;
  private file: File;

  // The number of bytes transferred
  private offset: number = 0;

  /**
   * @param peer   Peer to send
   * @param file   File to send
   * @param offset Bytes to start sending from, useful for file resume
   */
  constructor (peer: SimplePeer.Instance, file: File, offset: number = 0) {
    super()

    this.peer = peer
    this.file = file
    this.offset = offset

    this.pipe(peer)
  }

  // Info about file is sent first
  private sendFileStartData () {
    const meta: FileStartMetadata = {
      fileName: this.file.name,
      fileSize: this.file.size,
      fileType: this.file.type
    }
    const metaString = JSON.stringify(meta)
    const metaByteArray = new TextEncoder().encode(metaString)

    this.sendData(ControlHeaders.FILE_START, metaByteArray)
  }

  // 1st byte -> Data type header
  // Rest of the bytes will be the data to send
  private sendData (header: number, data: Uint8Array = null) {
    let resp: Uint8Array
    if (data) {
      resp = new Uint8Array(1 + data.length)
      resp.set(data, 1)
    } else {
      resp = new Uint8Array(1)
    }
    resp[0] = header

    this.push(resp)
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
      offset
    })

    stream.pipe(this)
    stream.once('end', () => {
      this.sendData(ControlHeaders.FILE_END)
      this.emit('progress', this.file.size)
      this.emit('done')
    })
  }

  start () {
    // Listen for cancel requests
    this.peer.on('data', (data: Uint8Array) => {
      if (data[0] === ControlHeaders.FILE_CHUNK_ACK) {
        this.receiverLastChunk = parseInt(new TextDecoder().decode(data.slice(1)))
      } else if (data[0] === ControlHeaders.TRANSFER_PAUSE) {
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

  // Stop sending data now & future sending
  pause (): this {
    this.paused = true

    this.sendData(ControlHeaders.TRANSFER_PAUSE)
    this.emit('pause')
    return this
  }

  // Allow data to be sent & start sending data
  resume () {
    this.paused = false
    this._resume()
    this.emit('resume')

    return this
  }

  _read () {}

  /**
   * File stream writes here
   * @param chunk 
   * @param encoding 
   * @param cb 
   */
  _write (chunk: Uint8Array, encoding: string, cb: Function) {
    this.sendData(ControlHeaders.FILE_CHUNK, chunk)
    this.bytesSent += chunk.length

    const percentage = parseFloat((100 * (this.bytesSent / this.file.size)).toFixed(3))
    this.emit('progress', percentage, this.bytesSent)

    if (!this.paused) {
      cb(null) // Signal that we're ready for more data
    }
  }

  _onMessage (buffer) {
    console.log(buffer)
  }

  cancel () {
    this.stopSending = true
    this.cancelled = true
    this.sendData(ControlHeaders.TRANSFER_CANCEL)
    this.emit('cancel')
  }
}
