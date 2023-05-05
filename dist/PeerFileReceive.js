"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var readable_stream_1 = require("readable-stream");
var ee_ts_1 = require("ee-ts");
var Meta_1 = require("./Meta");
var ReceiveStream = /** @class */ (function (_super) {
    __extends(ReceiveStream, _super);
    function ReceiveStream() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    /**
     * File stream writes here
     * @param chunk
     * @param encoding
     * @param cb
     */
    ReceiveStream.prototype._write = function (data, encoding, cb) {
        if (data[0] === Meta_1.ControlHeaders.FILE_START) {
            var meta = JSON.parse(new TextDecoder().decode(data.slice(1)));
            this.emit('start', meta);
        }
        else if (data[0] === Meta_1.ControlHeaders.FILE_CHUNK) {
            this.emit('chunk', data.slice(1));
        }
        else if (data[0] === Meta_1.ControlHeaders.TRANSFER_PAUSE) {
            this.emit('paused');
        }
        if (data[0] === Meta_1.ControlHeaders.TRANSFER_CANCEL) {
            this.emit('cancelled');
            this.destroy();
        }
        else {
            cb(null); // Signal that we're ready for more data
        }
    };
    return ReceiveStream;
}(readable_stream_1.Writable));
var PeerFileReceive = /** @class */ (function (_super) {
    __extends(PeerFileReceive, _super);
    function PeerFileReceive(peer) {
        var _this = _super.call(this) || this;
        _this.paused = false;
        _this.cancelled = false;
        _this.bytesReceived = 0;
        _this.fileData = [];
        _this.fileStream = null;
        _this.setPeer(peer);
        return _this;
    }
    // When peer is changed, start a new stream handler and assign events
    PeerFileReceive.prototype.setPeer = function (peer) {
        var _this = this;
        if (this.rs) {
            this.rs.destroy();
        }
        this.rs = new ReceiveStream();
        this.peer = peer;
        peer.pipe(this.rs);
        this.rs.on('start', function (meta) {
            _this.fileName = meta.fileName;
            _this.fileSize = meta.fileSize;
            _this.fileType = meta.fileType;
            _this.fileData = [];
        });
        this.rs.on('chunk', function (chunk) {
            _this.fileData.push(chunk);
            if (_this.fileStream) {
                _this.fileStream.push(chunk);
            }
            _this.bytesReceived += chunk.byteLength;
            if (_this.bytesReceived === _this.fileSize) {
                // completed
                _this.sendPeer(Meta_1.ControlHeaders.FILE_END);
                if (_this.fileStream)
                    _this.fileStream.push(null); // EOF
                var file = new window.File(_this.fileData, _this.fileName, {
                    type: _this.fileType
                });
                _this.emit('progress', 100.0, _this.fileSize);
                _this.emit('done', file);
            }
            else {
                var percentage = parseFloat((100 * (_this.bytesReceived / _this.fileSize)).toFixed(3));
                _this.emit('progress', percentage, _this.bytesReceived);
            }
        });
        this.rs.on('paused', function () {
            _this.emit('paused');
        });
        this.rs.on('cancelled', function () {
            _this.emit('cancelled');
        });
    };
    /**
     * Send a message to sender
     * @param header Type of message
     * @param data   Message
     */
    PeerFileReceive.prototype.sendPeer = function (header, data) {
        if (data === void 0) { data = null; }
        if (!this.peer.connected)
            return;
        var resp;
        if (data) {
            resp = new Uint8Array(1 + data.length);
            resp.set(data, 1);
        }
        else {
            resp = new Uint8Array(1);
        }
        resp[0] = header;
        this.peer.send(resp);
    };
    // Create a stream for receiving file data
    PeerFileReceive.prototype.createReadStream = function () {
        this.fileStream = new readable_stream_1.Readable({
            objectMode: true,
            read: function () { } // We'll be using push when we have file chunk
        });
        return this.fileStream;
    };
    // Request sender to pause transfer
    PeerFileReceive.prototype.pause = function () {
        this.sendPeer(Meta_1.ControlHeaders.TRANSFER_PAUSE);
        this.paused = true;
        this.emit('pause');
    };
    // Request sender to resume sending file
    PeerFileReceive.prototype.resume = function () {
        this.sendPeer(Meta_1.ControlHeaders.TRANSFER_RESUME);
        this.paused = false;
        this.emit('resume');
    };
    PeerFileReceive.prototype.cancel = function () {
        this.cancelled = true;
        this.sendPeer(Meta_1.ControlHeaders.TRANSFER_CANCEL);
        this.fileData = [];
        this.rs.destroy();
        this.peer.destroy();
        if (this.fileStream)
            this.fileStream.destroy();
        this.emit('cancel');
    };
    return PeerFileReceive;
}(ee_ts_1.EventEmitter));
exports.default = PeerFileReceive;
