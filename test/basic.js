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
  t.plan(5)

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
      transfer.on('done', () => {
        t.pass('done event fired at sender')
      })
      transfer.start()
    })
  } catch (err) {
    t.ifError(err)
  }

  await sleep(3000)
})

test('multiple cat pics from peer1', async function (t) {
  t.plan(4)

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

    const cat1Send = pf1.send(peer2, 'cat1', cat1File)
    const cat1ReceiveTransfer = await pf2.receive(peer1, 'cat1')

    const cat2Send = pf1.send(peer2, 'cat2', cat2File)
    const cat2ReceiveTransfer = await pf2.receive(peer1, 'cat2')

    cat1ReceiveTransfer.on('done', async file => {
      t.equal(file.size, cat1File.size)

      const fileContents = await readFile(file)
      const cat1Contents = await readFile(cat1File)

      t.equal(md5(fileContents), md5(cat1Contents))
    })

    cat2ReceiveTransfer.on('done', async file => {
      t.equal(file.size, cat2File.size)

      const fileContents = await readFile(file)
      const cat2Contents = await readFile(cat2File)

      t.equal(md5(fileContents), md5(cat2Contents))
    })

    cat1Send.then(transfer => transfer.start())
    cat2Send.then(transfer => transfer.start())

    cat1ReceiveTransfer.start()
    cat2ReceiveTransfer.start()

    await new Promise((resolve) => {
      setTimeout(resolve, 3000)
    })
  } catch (err) {
    t.ifError(err)
  }

  await sleep(3000)
})
