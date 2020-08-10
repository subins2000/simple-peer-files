# WebRTC Simple File Transfer

A simple library to send & receive files over WebRTC data channels. All you need to pass is a [simple-peer](https://www.npmjs.com/package/simple-peer) object, the file, and an ID!

Thanks to [Andrew Bastin](https://github.com/AndrewBastin/justshare-client/tree/master/src/api)'s initial implementation.

## Features

* Pause/Resume file transfers
* No file size limit
* Independent, just pass a `simple-peer` object
* Multiple file transfers at the same time using the same `simple-peer` object

## Examples

### Apps Made With SPF

* [WebDrop](https://WebDrop.Space) - A web app to share files and messages across all your devices. [Try It Here!]()

### Simple Example

Open [this webpage](https://codepen.io/subins2000/pen/abNOggM) in two separate browser windows. This simple example is based on the example shown in [simple-peer README](https://github.com/feross/simple-peer#usage)

Sender :
```
import SimplePeerFiles from 'simple-peer-files'
const spf = new SimplePeerFiles()

function readyToSend () {
  // peer is the SimplePeer object connection to receiver
  spf.send(peer, 'myFileID', file).then(transfer => {
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
const spf = new SimplePeerFiles()

// peer is the SimplePeer object connection to sender
spf.receive(peer, 'myFileID').then(transfer => {
  transfer.on('progress', sentBytes => {
    console.log(sentBytes)
  })

  // Call readyToSend() in the sender side
  peer.send('heySenderYouCanSendNow')
})
```

You have to call `spf.receive()` in receiver before you call `spf.send()` in sender. This is to prepare the receiver to accept file before sending starts. This also allows to implement a functionality for the receiver to accept or reject the file.
