"use strict";
// The first byte in every data sent will be what kind of data it is
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlHeaders = void 0;
exports.ControlHeaders = {
    FILE_START: 0,
    FILE_CHUNK: 1,
    FILE_CHUNK_ACK: 2,
    FILE_END: 3,
    TRANSFER_PAUSE: 4,
    TRANSFER_RESUME: 5,
    TRANSFER_CANCEL: 6
};
