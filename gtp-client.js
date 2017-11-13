/* global exports */

const { execFile } = require('child_process');
const byline = require('byline');


class InvalidConfiguration extends Error {
}

/* GtpClient - ベースクラス */
class GtpClient {
    constructor(command, options, workDir, cmdIndex = false) {
        this.cmdIndex = cmdIndex;
        this.process = null;
        this.commandHandler = null;
        this.stderrHandler = null;
        this.id = 1;
    }

    start(command, options, workDir, timeout = 0) {
        this.process = execFile(command, options, {
            cwd: workDir,
            env: process.env,
            timeout: timeout
        });
        this.process.on('error', function(err) {
            console.log('GtpClient error event', err);
            if (this.commandHandler) {
                // もしコマンド実行中にexitしたらそのプロミスをrejectする
                this.commandHandler.reject(err);
            }
            if (this.exitHandler) {
                this.exitHandler.reject(err);
            }
        });
        this.process.on('exit', (code, signal) => {
            if (this.commandHandler) {
                // もしコマンド実行中にexitしたらそのプロミスをrejectする
                this.commandHandler.reject({ code, signal });
            }
            if (this.exitHandler) {
                this.exitHandler.resolve({ code, signal });
            }
            this.process = null;
        });
        this.process.on('close', (code, signal) => {
            // 処理はexitイベントで行う
            console.log('GtpClient close event', code, signal);
        });
        this.process.on('disconnect', () => {
            console.log('GtpClient disconnect event');
        });
        this.process.on('message', (message, sendHandle) => {
            console.log('GtpClient message event', message);
        });
        const stdout = byline.createStream(this.process.stdout);
        const stderr = byline.createStream(this.process.stderr);
        stdout.on('data', this.onStdoutData.bind(this));
        stderr.on('data', this.onStderrData.bind(this));
    }

    execCommand(cmdStr) {
        return new Promise((resolve, reject) => {
            if (!this.process) {
                reject(`no gtp processes(${cmdStr})`);
                return;
            }
            this.commandHandler = { resolve, reject };
            if (this.cmdIndex)
                this.process.stdin.write(this.id + ' ');
            this.process.stdin.write(cmdStr + '\n');
            this.id += 1;
        });
    }

    boardsize(size) {
        return this.execCommand(`boardsize ${size}`);
    }

    setFreeHandicap(handicaps) {
        return this.execCommand(`set_free_handicap ${handicaps.join(' ')}`);
    }

    komi(komi) {
        return this.execCommand(`komi ${komi}`);
    }

    timeSettings(mainTime, byoyomiTime, byoyomiStones) {
        return this.execCommand(`time_settings ${mainTime} ${byoyomiTime} ${byoyomiStones}`);
    }

    kgsTimeSettings(system, mainTime, option1, option2) {
        let cmd = 'kgs-time_settings ';
        switch (system) {
        case 'none':
            cmd += system;
            break;
        case 'absolute':
            cmd += `${system} ${mainTime}`;
            break;
        default:
            cmd += `${system} ${mainTime} ${option1} ${option2}`
        }
        return this.execCommand(cmd);
    }

    play(turn, coord) {
        return this.execCommand(`play ${turn} ${coord}`);
    }

    genmove(turn) {
        return this.execCommand(`genmove ${turn}`);
    }

    quit() {
        return new Promise((resolve, reject) => {
            this.exitHandler = { resolve, reject };
            this.execCommand('quit');
        });
    }

    terminate() {
        return new Promise((resolve, reject) => {
            if (!this.process) {
                resolve();
                return
            }
            this.exitHandler = { resolve, reject };
            this.process.kill('SIGINT');
        });
    }

    onStderrData(data) {
        if (this.stderrHandler) {
            this.stderrHandler(data);
        }
    }

    onStdoutData(data) {
        const match = data.match(/^(=|\?)([0-9]+)?(.*)/);
        if (!match)
            return
        if (this.commandHandler) {
            switch (match[1]) {
            case '=':
                this.commandHandler.resolve({
                    id: match[2],
                    result: match[3].trim()
                });
                break;
            default:
                this.commandHandler.reject({
                    id: match[2],
                    reason: match[3].trim()
                });
            }
        }
    }
}

exports.InvalidConfiguration = InvalidConfiguration;
exports.GtpClient = GtpClient;
