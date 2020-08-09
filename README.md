# WebRTC File Transfer

A simple library to send & receive files over WebRTC data channels. All you need to pass is a [simple-peer](https://www.npmjs.com/package/simple-peer) object, the file, and an ID!

Thanks to [Andre Bastin](https://github.com/AndrewBastin/justshare-client/tree/master/src/api)'s initial implementation.

## Features

* Pause/Resume file transfers
* No file size limit
* Independent, just pass a `simple-peer` object
* Multiple file transfers at the same time using the same `simple-peer` object

## Example

```
import PeerFile from 'simple-peer-files'

// peer is the SimplePeer object
new PeerFile(peer, 'myFileID', file).then(transfer => {
  transfer.on('progress', sentBytes => {
    console.log(sentBytes)
  })
  transfer.start()
})
```
