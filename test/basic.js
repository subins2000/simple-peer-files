const axios = require('axios')
const md5 = require('md5')
const test = require('tape')

const Peer = require('simple-peer')
const PeerFile = require('../dist/index').default

function sleep (seconds) {
  return new Promise(resolve => {
    setTimeout(resolve, seconds)
  })
}

function makePeers () {
  return new Promise(resolve => {
    const peer1 = new Peer({ initiator: true })
    const peer2 = new Peer()

    peer1.on('signal', signal => {
      peer2.signal(signal)
    })

    peer2.on('signal', signal => {
      peer1.signal(signal)
    })

    peer1.on('connect', () => {
      resolve([peer1, peer2])
    })
  })
}

function readFile (file) {
  return new Promise(resolve => {
    var fr = new window.FileReader()
    fr.onload = e => {
      resolve(e.target.result)
    }
    fr.readAsBinaryString(file)
  })
}

test('one cat pic from peer1', async function (t) {
  // Number of assertions expected
  t.plan(7)

  try {
    const pf1 = new PeerFile()
    const pf2 = new PeerFile()

    const [peer1, peer2] = await makePeers()

    // get a file
    const cat = await axios.get('/test/cat.jpg', {
      responseType: 'blob'
    })

    const catFile = new window.File([cat.data], 'cat.jpg', { type: 'image/jpeg' })

    const send = pf1.send(peer2, 'fileID1', catFile)
    const receiveTransfer = await pf2.receive(peer1, 'fileID1')

    receiveTransfer.on('progress', progress => {
      t.ok(progress, 'Progress emits')
    })
    receiveTransfer.on('done', async file => {
      t.equal(file.name, catFile.name)
      t.equal(file.type, catFile.type)
      t.equal(file.size, catFile.size)

      const fileContents = await readFile(file)
      const catContents = await readFile(catFile)

      t.equal(md5(fileContents), md5(catContents))
    })

    send.then(transfer => {
      transfer.on('done', (progress, bytes) => {
        t.pass('done event fired at sender')

        if (progress === 100.0) {
          t.equal(bytes, catFile.size)
        }
      })
      transfer.start()
    })
  } catch (err) {
    t.ifError(err)
  }

  // Tape just recently got async func callback support
  // This sleep will make sure processes get all completed
  // See t.pass() value
  await sleep(3000)
})

test('multiple cat pics & pause/resume', async function (t) {
  try {
    const pf1 = new PeerFile()
    const pf2 = new PeerFile()

    const [peer1, peer2] = await makePeers()

    // get a file
    const cat1 = await axios.get('/test/cat.jpg', {
      responseType: 'blob'
    }) // 90KB
    const cat2 = await axios.get('/test/cat2.jpg', {
      responseType: 'blob'
    }) // 26KB

    const cat1File = new window.File([cat1.data], 'cat1.jpg', { type: 'image/jpeg' })
    const cat2File = new window.File([cat2.data], 'cat2.jpg', { type: 'image/jpeg' })

    let receivedFiles = 0
    const onDone = async (file, sentFile) => {
      t.equal(file.size, sentFile.size)

      const fileContents = await readFile(file)
      const cat1Contents = await readFile(sentFile)

      t.equal(md5(fileContents), md5(cat1Contents))

      if (++receivedFiles === 2) t.end()
    }

    // ----
    // In cat 1, receiver pauses the transfer
    // ----

    pf2.receive(peer1, 'cat1').then(transfer => {
      transfer.on('pause', () => {
        t.pass('pause event emitted at receiver')
        setTimeout(() => {
          transfer.resume()
        }, 500)
      })

      transfer.on('progress', progress => {
        if (progress > 10) {
          transfer.pause()
        }
      })

      transfer.on('done', file => {
        onDone(file, cat1File)
      })
    })

    const cat1SendOnTransfer = transfer => {
      transfer.on('paused', () => t.pass('paused event emitted at sender'))
      transfer.start()
    }

    // ----
    // In cat 2, sender pauses the transfer
    // ----

    pf2.receive(peer1, 'cat2').then(transfer => {
      transfer.on('paused', () => {
        t.pass('paused event emitted at receiver')
        setTimeout(() => {
          // Receiver asks to resume transfer
          peer2.send('resume-please')
        }, 100)
      })

      transfer.on('done', file => {
        onDone(file, cat2File)
      })
    })

    const cat2SendOnTransfer = transfer => {
      transfer.on('progress', progress => {
        // Cat 2 is a big file, so limit the pause calls
        if (progress > 50 && progress < 55) {
          transfer.pause()
        }
      })

      // Peer 1 is sender
      peer1.on('data', data => {
        if (data.toString() === 'resume-please') {
          t.pass('request to resume received')
          transfer.resume()
        }
      })

      transfer.start()
    }

    await sleep(100)

    pf1.send(peer2, 'cat1', cat1File).then(cat1SendOnTransfer)
    pf1.send(peer2, 'cat2', cat2File).then(cat2SendOnTransfer)

    await sleep(5000)
  } catch (err) {
    t.ifError(err)
  }
})

test('cancel events', async function (t) {
  // Number of assertions expected
  t.plan(2)

  try {
    const pf1 = new PeerFile()
    const pf2 = new PeerFile()

    const [peer1, peer2] = await makePeers()

    // get a file
    const cat = await axios.get('/test/cat.jpg', {
      responseType: 'blob'
    })

    const catFile = new window.File([cat.data], 'cat.jpg', { type: 'image/jpeg' })

    const send = pf1.send(peer2, 'fileID1', catFile)
    const receiveTransfer = await pf2.receive(peer1, 'fileID1')

    receiveTransfer.on('cancel', () => t.pass('cancel event fired at receiver'))

    receiveTransfer.on('progress', progress => {
      if (progress > 50) {
        receiveTransfer.cancel()
      }
    })

    send.then(transfer => {
      transfer.on('cancelled', () => {
        t.pass('cancelled event fired at sender')
      })
      transfer.start()
    })
  } catch (err) {
    t.ifError(err)
  }

  // Tape just recently got async func callback support
  // This sleep will make sure processes get all completed
  // See t.pass() value
  await sleep(3000)
})
