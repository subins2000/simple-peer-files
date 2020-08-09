// The first byte in every data sent will be what kind of data it is

const headers = {
  FILE_START: 0,
  FILE_CHUNK: 1,
  FILE_END: 2,

  TRANSFER_PAUSE: 3,
  TRANSFER_CANCEL: 4
}

export default headers
