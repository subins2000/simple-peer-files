import * as Peer from 'simple-peer'
import PeerFileSend from './PeerFileSend'
import PeerFileReceive from './PeerFileReceive'
import { sign } from 'crypto'

interface PeerInfo {
  controlChannel: Peer
  fileChannels: Peer[] // channels for file transfer
}

export default class PeerFile {
  send (peer: Peer, fileID: string, file: File) {
    return new Promise(resolve => {
      const controlChannel = peer

      let fileChannel = new Peer({
        initiator: true
      })

      fileChannel.on('signal', (signal: Peer.SignalData) => {
        controlChannel.send(JSON.stringify({
          fileID,
          filename: file.name,
          filesize: file.size,
          signal
        }))
      })

      let controlDataHandler = (data: string) => {
        try {
          const dataJSON = JSON.parse(data)

          if (dataJSON.signal && dataJSON.fileID && dataJSON.fileID === fileID) {
            fileChannel.signal(dataJSON.signal)
          }
        } catch (e) {}
      }

      fileChannel.on('connect', () => {
        const pfs = new PeerFileSend(fileChannel, file)

        pfs.on('done', () => {
          controlChannel.off('data', controlDataHandler)
          fileChannel.destroy()
          controlDataHandler = null // garbage collect
        })

        resolve(pfs)
      })

      controlChannel.on('data', controlDataHandler)
    })
  }

  receive (peer: Peer, fileID: string) {
    return new Promise(resolve => {
      const controlChannel = peer

      let filename: string
      let filesize: number

      let fileChannel = new Peer({
        initiator: false,
        trickle: false
      })

      fileChannel.on('signal', (signal: Peer.SignalData) => {
        controlChannel.send(JSON.stringify({
          fileID,
          signal
        }))
      })

      let controlDataHandler = (data: string) => {
        try {
          const dataJSON = JSON.parse(data)

          if (dataJSON.signal && dataJSON.fileID && dataJSON.fileID === fileID) {
            filename = dataJSON.filename,
            filesize = dataJSON.filesize
            fileChannel.signal(dataJSON.signal)
          }
        } catch (e) {}
      }

      fileChannel.on('connect', () => {
        const pfs = new PeerFileReceive(fileChannel, {
          filename,
          filesizeBytes: filesize
        })

        pfs.on('done', () => {
          controlChannel.off('data', controlDataHandler)
          fileChannel.destroy()
          controlDataHandler = null // garbage collect
        })

        resolve(pfs)
      })

      controlChannel.on('data', controlDataHandler)
    })
  }
}
