"use strict";
/* Copyright (C) [2003] - [2016] RealEyes Media, LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by RealEyes Media, October 2016
 *
 * THIS CODE AND INFORMATION ARE PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND,
 * EITHER EXPRESSED OR IMPLIED,  INCLUDING BUT NOT LIMITED TO THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY AND/OR FITNESS FOR A PARTICULAR PURPOSE.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of RealEyes Media, LLC and its suppliers,
 * if any.  The intellectual and technical concepts contained
 * herein are proprietary to RealEyes Media, LLC
 * and its suppliers and may be covered by U.S. and Foreign Patents,
 * patents in process, and are protected by trade secret or copyright law.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from RealEyes Media, LLC.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const AWS = require("aws-sdk");
const url = require("url");
const config = require("../config/config");
const status = require("../control/status");
const mime = require("mime");
const promisify = require("promisify-node");
const fs = promisify('fs');
const s3 = new AWS.S3({
    apiVersion: '2012-11-05',
    region: config.AWS_REGION,
    accessKeyId: config.AWS_ACCESS_KEY,
    secretAccessKey: config.AWS_SECRET_KEY,
    maxRetries: config.AWS_RETRIES,
});
const bucketName = config.BUCKET_NAME;
// Kick off and manage s3 upload process
function s3Upload(options) {
    return __awaiter(this, void 0, void 0, function* () {
        status.updateStatusObject(options.statusURI, 'Uploading videos to storage...');
        // List of tasks for m3u8 s3 upload
        // Collect all files, upload all files, get URLS for playback assets (m3u8s)
        options.remotePaths = [];
        options.signedUrls = [];
        options = yield getFiles(options);
        options = yield asyncUpload(options);
        options = yield getRemotePaths(options);
        return options;
    });
}
exports.s3Upload = s3Upload;
// Find all files and create remote paths
function getFiles(options) {
    return __awaiter(this, void 0, void 0, function* () {
        // file names
        options.files = [];
        // local paths
        options.uploadFilePaths = [];
        // remote paths
        options.remoteFilePaths = [];
        options.filePaths = [];
        if (options.outputType === 'm3u8') {
            console.log('here?');
            const hlsPaths = yield getHlsPaths(options.outputDirectory + config.HLS_DIR, options.outputDirectory + config.HLS_DIR, options.reverseTimestamp);
            options.filePaths = options.filePaths.concat(hlsPaths);
        }
        console.log('how about here?');
        options.outputDirs.forEach((directory, key) => __awaiter(this, void 0, void 0, function* () {
            const files = yield fs.readdir(directory);
            options.files = options.files.concat(files);
            const mp4Files = files.map((file) => __awaiter(this, void 0, void 0, function* () {
                file = `${directory}/${file}`;
                const stat = yield fs.stat(file);
                if (stat.isFile()) {
                    return { localPath: `${directory}/${file}`, remotePath: `${options.reverseTimestamp}/${options.bitrates[key]}/${file}` };
                }
            }));
            options.filePaths = options.filePaths.concat(mp4Files);
        }));
        console.log(options.filePaths);
        return options;
    });
}
function getHlsPaths(fullAssetPath, assetPath, uploadPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const stat = yield fs.stat(assetPath);
        if (stat.isFile()) {
            return [{ localPath: assetPath, remotePath: path.join(uploadPath, assetPath) }];
        }
        // Complex so I'll explain... Concat all files with the directory prefix
        const fileCollection = yield Promise.all((yield fs.readdir(assetPath)).map((fileName) => __awaiter(this, void 0, void 0, function* () {
            const filePath = path.join(assetPath, fileName);
            const stat = yield fs.stat(filePath);
            if (stat.isDirectory()) {
                return yield this.getPathsForUpload({
                    fullAssetPath: fullAssetPath,
                    assetPath: filePath,
                    uploadPath: uploadPath
                });
            }
            const remoteFileName = filePath.substring(filePath.indexOf(fullAssetPath) + fullAssetPath.length, filePath.length);
            return { localPath: filePath, remotePath: path.join(uploadPath, remoteFileName) };
        })).reduce((a, b) => a.concat(b), []));
        return [].concat(...fileCollection);
    });
}
// Loop through all files and call upload function
function asyncUpload(options) {
    return __awaiter(this, void 0, void 0, function* () {
        options.remotePaths = [];
        // Loop through all files
        options.filePaths.forEach((pathMap) => __awaiter(this, void 0, void 0, function* () {
            const remotePath = pathMap.remotePath;
            const localPath = pathMap.localPath;
            if (playbackUrl(localPath)) {
                options.remotePaths.push(remotePath);
            }
            yield upload(localPath, remotePath);
        }));
        return options;
    });
}
// Function for async uploading of a single file
function upload(file, remotePath) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            console.log(file);
            const body = fs.createReadStream(file);
            const params = { Bucket: bucketName, Key: remotePath, Body: body, ContentType: mime.getType(file) };
            s3.upload(params, function (err, data) {
                if (err) {
                    body.destroy();
                    reject(err);
                }
                else {
                    body.destroy();
                    resolve();
                }
            });
        });
    });
}
// Get remote paths of playback URLS
function getRemotePaths(options) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            options.remotePaths.forEach(file => {
                const params = { Bucket: bucketName, Key: file, Expires: 31556926 };
                s3.getSignedUrl('getObject', params, function (err, s3url) {
                    if (err) {
                        reject(err);
                    }
                    else {
                        // Successfully signed URL
                        if (config.SIGNED_URLS) {
                            options.signedUrls.push(s3url);
                        }
                        else {
                            options.signedUrls.push('http://' + url.parse(s3url).host + url.parse(s3url).pathname);
                        }
                        resolve(options);
                    }
                });
            });
        });
    });
}
// Helper function for asset types
function getAssetTypeByFile(fileName) {
    let rc = '';
    if (fileName) {
        const fn = fileName.toLowerCase();
        if (fn.indexOf('.jpg') >= 0)
            rc = 'jpg';
        else if (fn.indexOf('.png') >= 0)
            rc = 'png';
        else if (fn.indexOf('.gif') >= 0)
            rc = 'gif';
        else if (fn.indexOf('.vtt') >= 0)
            rc = 'vtt';
        else if (fn.indexOf('.mp4') >= 0)
            rc = 'mp4';
        else if (fn.indexOf('.flv') >= 0)
            rc = 'flv';
        else if (fn.indexOf('.mov') >= 0)
            rc = 'mov';
        else if (fn.indexOf('.avi') >= 0)
            rc = 'avi';
        else if (fn.indexOf('.wmv') >= 0)
            rc = 'wmv';
        else if (fn.indexOf('.m3u8') >= 0)
            rc = 'm3u8';
        else if (fn.indexOf('.ts') >= 0)
            rc = 'ts';
        else if (fn.indexOf('.json') >= 0)
            rc = 'json';
    }
    return rc;
}
// Helper function for determining playback urls (no ts fragments)
function playbackUrl(file) {
    switch (getAssetTypeByFile(file)) {
        case 'ts': {
            return false;
        }
        default: {
            return true;
        }
    }
}
//# sourceMappingURL=uploader.js.map