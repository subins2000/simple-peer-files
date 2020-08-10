# WebRTC File Transfer

A simple library to send & receive files over WebRTC data channels. All you need to pass is a [simple-peer](https://www.npmjs.com/package/simple-peer) object, the file, and an ID!

Thanks to [Andrew Bastin](https://github.com/AndrewBastin/justshare-client/tree/master/src/api)'s initial implementation.

## Features

* Pause/Resume file transfers
* No file size limit
* Independent, just pass a `simple-peer` object
* Multiple file transfers at the same time using the same `simple-peer` object

## Example

Sender :
```
import SimplePeerFiles from 'simple-peer-files'
const pf = new SimplePeerFiles()

function readyToSend () {
  // peer is the SimplePeer object connection to receiver
  pf.send(peer, 'myFileID', file).then(transfer => {
    transfer.on('progress', sentBytes => {
      console.log(sentBytes)
    })
    transfer.start()
  })
}
```

Receiver :

```
import SimplePeerFiles from 'simple-peer-files'
const pf = new SimplePeerFiles()

// peer is the SimplePeer object connection to sender
pf.receive(peer, 'myFileID').then(transfer => {
  transfer.on('progress', sentBytes => {
    console.log(sentBytes)
  })
  transfer.start()

  // Call readyToSend() in the sender side
  peer.send('heySenderYouCanSendNow')
})
```

You have to call `transfer.start()` in receiver before you call `transfer.start()` in sender. This to prepare receiver to accept file before sending starts. This also allows the receiver to accept or reject file.