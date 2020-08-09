export default interface FileSendRequest {
  /// File name of the content to be sent
  filename: string
  /// Size of the file (in bytes) to be sent
  filesizeBytes: number
}
