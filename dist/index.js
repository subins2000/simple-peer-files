"use strict";
/*!
 * Simple library to send files over WebRTC
 *
 * @author   Subin Siby <https://subinsb.com>
 * @license  MPL-2.0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PeerFileReceive = exports.PeerFileSend = void 0;
var Peer = require("simple-peer");
var PeerFileSend_1 = require("./PeerFileSend");
exports.PeerFileSend = PeerFileSend_1.default;
var PeerFileReceive_1 = require("./PeerFileReceive");
exports.PeerFileReceive = PeerFileReceive_1.default;
var SimplePeerFiles = /** @class */ (function () {
    function SimplePeerFiles() {
        this.arrivals = {};
    }
    SimplePeerFiles.prototype.send = function (peer, fileID, file) {
        return new Promise(function (resolve) {
            var controlChannel = peer;
            var startingByte = 0;
            var fileChannel = new Peer({
                initiator: true
            });
            fileChannel.on('signal', function (signal) {
                controlChannel.send(JSON.stringify({
                    fileID: fileID,
                    signal: signal
                }));
            });
            var controlDataHandler = function (data) {
                try {
                    var dataJSON = JSON.parse(data);
                    if (dataJSON.signal && dataJSON.fileID && dataJSON.fileID === fileID) {
                        if (dataJSON.start) {
                            startingByte = dataJSON.start;
                        }
                        fileChannel.signal(dataJSON.signal);
                    }
                }
                catch (e) { }
            };
            fileChannel.on('connect', function () {
                var pfs = new PeerFileSend_1.default(fileChannel, file, startingByte);
                var destroyed = false;
                var destroy = function () {
                    if (destroyed)
                        return;
                    controlChannel.removeListener('data', controlDataHandler);
                    fileChannel.destroy();
                    // garbage collect
                    controlDataHandler = null;
                    pfs = null;
                    destroyed = true;
                };
                pfs.on('done', destroy);
                pfs.on('cancel', destroy);
                fileChannel.on('close', function () {
                    // cancel pfs if its available
                    pfs === null || pfs === void 0 ? void 0 : pfs.cancel();
                });
                resolve(pfs);
            });
            controlChannel.on('data', controlDataHandler);
        });
    };
    SimplePeerFiles.prototype.receive = function (peer, fileID) {
        var _this = this;
        return new Promise(function (resolve) {
            var controlChannel = peer;
            var fileChannel = new Peer({
                initiator: false
            });
            fileChannel.on('signal', function (signal) {
                // chunk to start sending from
                var start = 0;
                // File resume capability
                if (fileID in _this.arrivals) {
                    start = _this.arrivals[fileID].bytesReceived;
                }
                controlChannel.send(JSON.stringify({
                    fileID: fileID,
                    start: start,
                    signal: signal
                }));
            });
            var controlDataHandler = function (data) {
                try {
                    var dataJSON = JSON.parse(data);
                    if (dataJSON.signal && dataJSON.fileID && dataJSON.fileID === fileID) {
                        fileChannel.signal(dataJSON.signal);
                    }
                }
                catch (e) { }
            };
            fileChannel.on('connect', function () {
                var pfs;
                if (fileID in _this.arrivals) {
                    pfs = _this.arrivals[fileID];
                    pfs.setPeer(fileChannel);
                }
                else {
                    pfs = new PeerFileReceive_1.default(fileChannel);
                    _this.arrivals[fileID] = pfs;
                }
                var destroyed = false;
                var destroy = function () {
                    if (destroyed)
                        return;
                    controlChannel.removeListener('data', controlDataHandler);
                    fileChannel.destroy();
                    delete _this.arrivals[fileID];
                    // garbage collect
                    controlDataHandler = null;
                    pfs = null;
                    destroyed = true;
                };
                pfs.on('done', destroy);
                pfs.on('cancel', destroy);
                resolve(pfs);
            });
            controlChannel.on('data', controlDataHandler);
        });
    };
    return SimplePeerFiles;
}());
exports.default = SimplePeerFiles;
