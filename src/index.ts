import * as Peer from 'simple-peer'
import PeerFileSend from './PeerFileSend'
import PeerFileReceive from './PeerFileReceive'
import { sign } from 'crypto'

interface PeerInfo {
  controlChannel: Peer
  fileChannels: Peer[] // channels for file transfer
}

export default class PeerFile {
  // active channels
  private peers: {
    [sessionID: string]: PeerInfo
  } = {}

  send (peer: Peer, file: File) {
    return new Promise(resolve => {
      // A Peer object has one data channel
      if (peer.id in this.peers) {
        
      } else {
        const controlChannel = peer
        const sessionID = controlChannel.id // aka peer ID

        this.peers[sessionID] = {
          controlChannel,
          fileChannels: [] as Peer,
        }

        let fileChannel = new Peer({
          initiator: true
        })

        fileChannel.on('signal', (signal: Peer.SignalData) => {
          controlChannel.send(JSON.stringify({
            filename: file.name,
            filesize: file.size,
            signal
          }))
        })

        fileChannel.on('connect', () => {
          this.peers[sessionID].fileChannels.push(fileChannel)

          const pfs = new PeerFileSend(fileChannel, file)

          resolve(pfs)
        })

        controlChannel.on('data', (data: string) => {
          try {
            const dataJSON = JSON.parse(data)

            if ('signal' in dataJSON) {
              fileChannel.signal(dataJSON.signal)
            }
          } catch (e) {}
        })
      }
    })
  }

  receive (peer: Peer) {
    return new Promise(resolve => {
      if (peer.id in this.peers) {

      } else {
        const controlChannel = peer
        const sessionID = controlChannel.id

        let filename: string
        let filesize: number
  
        this.peers[sessionID] = {
          controlChannel,
          fileChannels: [] as Peer,
        }
  
        let fileChannel = new Peer({
          initiator: false
        })
  
        fileChannel.on('signal', (signal: Peer.SignalData) => {
          controlChannel.send(JSON.stringify({
            signal
          }))
        })
  
        fileChannel.on('connect', () => {
          this.peers[sessionID].fileChannels.push(fileChannel)

          const pfs = new PeerFileReceive(fileChannel, {
            filename,
            filesizeBytes: filesize
          })

          resolve(pfs)
        })
  
        controlChannel.on('data', (data: string) => {
          try {
            const dataJSON = JSON.parse(data)
  
            if (dataJSON.signal) {
              filename = dataJSON.filename,
              filesize = dataJSON.filesize
              fileChannel.signal(dataJSON.signal)
            }
          } catch (e) {}
        })
      }
    })
  }
}
