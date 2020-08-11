import { EventEmitter } from 'ee-ts'
import { Duplex } from 'readable-stream'
import SimplePeer from 'simple-peer'
import * as read from 'filereader-stream'

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

/**
 * Make a Uint8Array to send to peer
 * @param header Type of data. See Meta.ts
 * @param data
 */
function pMsg (header: number, data: Uint8Array = null) {
  let resp: Uint8Array
  if (data) {
    resp = new Uint8Array(1 + data.length)
    resp.set(data, 1)
  } else {
    resp = new Uint8Array(1)
  }
  resp[0] = header

  return resp
}

class SendStream extends Duplex {
  public bytesSent: number = 0
  public fileSize: number = 0 // file size
  public paused: boolean = false

  constructor (fileSize: number, bytesSent = 0) {
    super()
    this.fileSize = fileSize
    this.bytesSent = bytesSent
  }

  _read () {}

  /**
   * File stream writes here
   * @param chunk
   * @param encoding
   * @param cb
   */
  _write (chunk: Uint8Array, encoding: string, cb: Function) {
    if (this.paused) return

    this.push(pMsg(ControlHeaders.FILE_CHUNK, chunk))

    const percentage = parseFloat((100 * (this.bytesSent / this.fileSize)).toFixed(3))
    this.emit('progress', percentage, this.bytesSent)

    this.bytesSent += chunk.length

    cb(null) // Signal that we're ready for more data
  }
}

export default class PeerFileSend extends EventEmitter<Events> {
  public paused: boolean = false;
  public cancelled: boolean = false;

  private receiverPaused: boolean = false

  private peer: SimplePeer.Instance;
  private ss: SendStream;

  private file: File;

  // Bytes to start sending from
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

    this.peer.send(pMsg(ControlHeaders.FILE_START, metaByteArray))
  }

  setPeer (peer: SimplePeer.Instance) {
    this.peer = peer
  }

  // Start sending file to receiver
  _resume () {
    if (this.receiverPaused) return

    if (this.offset === 0) {
      // Start
      this.sendFileStartData()
      this.emit('progress', 0.0, 0)
    }

    // Chunk sending
    const stream = read(this.file, {
      offset: this.offset,
      chunkSize: CHUNK_SIZE
    })

    this.ss = new SendStream(this.file.size, this.offset)
    stream.pipe(this.ss).pipe(this.peer)
  }

  start () {
    // Listen for cancel requests
    this.peer.on('data', (data: Uint8Array) => {
      if (data[0] === ControlHeaders.FILE_END) {
        this.emit('done')
      } else if (data[0] === ControlHeaders.TRANSFER_PAUSE) {
        this._pause()

        this.receiverPaused = true
        this.emit('paused')
      } else if (data[0] === ControlHeaders.TRANSFER_RESUME) {
        this.receiverPaused = false

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

  // Pause transfer and store the bytes sent till now for resuming later
  _pause () {
    this.ss.paused = true
    this.offset = this.ss.bytesSent
  }

  // Stop sending data now & future sending
  pause () {
    this._pause()
    this.paused = true

    this.peer.send(pMsg(ControlHeaders.TRANSFER_PAUSE))
    this.emit('pause')
  }

  // Allow data to be sent & start sending data
  resume () {
    this.paused = false
    this._resume()
    this.emit('resume')
  }

  cancel () {
    this.cancelled = true
    this.ss.destroy()
    this.peer.send(pMsg(ControlHeaders.TRANSFER_CANCEL))
    this.peer.destroy()
    this.emit('cancel')
  }
}
