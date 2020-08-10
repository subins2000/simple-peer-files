// The first byte in every data sent will be what kind of data it is

export const ControlHeaders = {
  FILE_START: 0,
  FILE_CHUNK: 1,
  FILE_END: 2,

  TRANSFER_PAUSE: 3,
  TRANSFER_RESUME: 4,
  TRANSFER_CANCEL: 5
}

export interface FileSendRequest {
  /// File name of the content to be sent
  filename: string
  /// Size of the file (in bytes) to be sent
  filesizeBytes: number
}

export interface FileStartMetadata {
  fileName: string,
  fileSize: number,
  fileType: string,

  chunkSize: number
  chunksTotal: number
}
