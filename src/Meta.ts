// The first byte in every data sent will be what kind of data it is

export const ControlHeaders = {
  FILE_START: 0,
  FILE_CHUNK: 1,
  FILE_CHUNK_ACK: 2,
  FILE_END: 3,

  TRANSFER_PAUSE: 4,
  TRANSFER_RESUME: 5,
  TRANSFER_CANCEL: 6
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
  fileType: string
}
