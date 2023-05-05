export declare const ControlHeaders: {
    FILE_START: number;
    FILE_CHUNK: number;
    FILE_CHUNK_ACK: number;
    FILE_END: number;
    TRANSFER_PAUSE: number;
    TRANSFER_RESUME: number;
    TRANSFER_CANCEL: number;
};
export interface FileSendRequest {
    filename: string;
    filesizeBytes: number;
}
export interface FileStartMetadata {
    fileName: string;
    fileSize: number;
    fileType: string;
}
