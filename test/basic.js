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
  t.plan(6)

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

    receiveTransfer.on('progress', (progress, bytes) => {
      if (progress === 100.0) {
        t.equal(bytes, catFile.size)
      }
    })
    receiveTransfer.on('done', async file => {
      t.equal(file.name, catFile.name)
      t.equal(file.type, catFile.type)
      t.equal(file.size, catFile.size)

      const fileContents = await readFile(file)
      const catContents = await readFile(catFile)

      t.equal(md5(fileContents), md5(catContents))
    })
    receiveTransfer.start()

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

  await sleep(3000)
})

test('multiple cat pics from peer1', async function (t) {
  try {
    const pf1 = new PeerFile()
    const pf2 = new PeerFile()

    const [peer1, peer2] = await makePeers()

    // get a file
    const cat1 = await axios.get('/test/cat.jpg', {
      responseType: 'blob'
    })
    const cat2 = await axios.get('/test/cat2.jpg', {
      responseType: 'blob'
    })
    const cat1File = new window.File([cat1.data], 'cat1.jpg', { type: 'image/jpeg' })
    const cat2File = new window.File([cat2.data], 'cat2.jpg', { type: 'image/jpeg' })

    let receivedFiles = 0
    const validateReceive = (receive, sentFile) => {
      receive.then(transfer => {
        transfer.on('done', async file => {
          t.equal(file.size, sentFile.size)

          const fileContents = await readFile(file)
          const cat1Contents = await readFile(sentFile)

          t.equal(md5(fileContents), md5(cat1Contents))

          if (++receivedFiles === 2) t.end()
        })
        transfer.start()
      })
    }

    const cat1Receive = pf2.receive(peer1, 'cat1')
    const cat2Receive = pf2.receive(peer1, 'cat2')

    validateReceive(cat1Receive, cat1File)
    validateReceive(cat2Receive, cat2File)

    await sleep(1000)

    const cat1SendTransfer = pf1.send(peer2, 'cat1', cat1File)
    const cat2SendTransfer = pf1.send(peer2, 'cat2', cat2File)

    cat1SendTransfer.then(transfer => {
      transfer.start()
    })
    cat2SendTransfer.then(transfer => {
      transfer.start()
    })

    await sleep(5000)
  } catch (err) {
    t.ifError(err)
  }
})
