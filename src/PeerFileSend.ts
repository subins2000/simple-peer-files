import { EventEmitter } from 'ee-ts'
import SimplePeer from 'simple-peer'
import { through } from 'through'

import { ControlHeaders, FileStartMetadata } from './Meta'

import * as read from 'filereader-stream'

interface Events {
  progress(bytesSent: number): void,
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

  // Structure of File Start Data
  // 1st byte -> Type of data sent (will be set to ControlHeaders.FILE_START)
  // Rest of the data will be assigned to the uint8array merge of JSON string the file metadata
  // TODO : Much more compressed binary representation plz
  private prepareFileStartData (): Uint8Array {
    const meta: FileStartMetadata = {
      fileName: this.file.name,
      fileSize: this.file.size,
      fileType: this.file.type,
      chunksTotal: this.chunksTotal,
      chunkSize: this.chunkSize
    }

    const metaString = JSON.stringify(meta)

    const metaByteArray = new TextEncoder().encode(metaString)

    // + 1 for storing the header byte
    const resp = new Uint8Array(metaByteArray.length + 1)

    // Header byte
    resp[0] = ControlHeaders.FILE_START
    resp.set(metaByteArray, 1)

    return resp
  }

  // Structure for chunk data
  // 1st byte -> Data type header (ControlHeaders.FILE_CHUNK)
  // Rest of the bytes will be the chunk data with length the length specified in the chunk size
  private prepareChunkData (chunk: Uint8Array): Uint8Array {
    // + 1 for the header
    const resp = new Uint8Array(chunk.length + 1)

    resp[0] = ControlHeaders.FILE_CHUNK
    resp.set(chunk, 1)

    return resp
  }

  // Structure for end data
  // 1st byte -> Data type header (ControlHeaders.FILE_END)
  private prepareFileEndData (): Uint8Array {
    const resp = new Uint8Array(1)

    resp[0] = ControlHeaders.FILE_END

    return resp
  }

  // Structure for delete data
  // 1st byte -> Data type header (ControlHeaders.TRANSFER_CANCEL)
  private prepareCancelData (): Uint8Array {
    const resp = new Uint8Array(1)

    resp[0] = ControlHeaders.TRANSFER_CANCEL

    return resp
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
      const startHeader = this.prepareFileStartData()

      this.peer.send(startHeader)
      this.emit('progress', 0)
    }

    // Chunk sending
    const stream = read(this.file, {
      chunkSize: this.chunkSize,
      offset
    })

    const streamHandler = through(
      (chunk: any) => {
        console.log(this.chunksSent)
        // TODO : Some way to actually stop this function on cancel
        if (this.stopSending) {
          streamHandler.destroy()
        } else {
          this.peer.send(this.prepareChunkData(chunk))

          this.chunksSent++

          this.emit('progress', Math.min(this.file.size, this.chunksSent * this.chunkSize))
        }
      },
      () => {
        if (!this.stopSending) {
          this.peer.send(this.prepareFileEndData())

          this.emit('progress', this.file.size)
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

    const resp = new Uint8Array(1)
    resp[0] = ControlHeaders.TRANSFER_PAUSE

    this.peer.send(resp)
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
    this.peer.send(this.prepareCancelData())
    this.emit('cancel')
  }
}
