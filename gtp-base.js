/* global exports */

const { execFile } = require('child_process');
const byline = require('byline');


class InvalidConfiguration extends Error {
}

/* GtpBase - ベースクラス */
class GtpBase {
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
            console.log('GtpBase error event', err);
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
            console.log('GtpBase close event', code, signal);
        });
        this.process.on('disconnect', () => {
            console.log('GtpBase disconnect event');
        });
        this.process.on('message', (message, sendHandle) => {
            console.log('GtpBase message event', message);
        });
        const stdout = byline.createStream(this.process.stdout);
        const stderr = byline.createStream(this.process.stderr);
        stdout.on('data', this.onStdoutData.bind(this));
        stderr.on('data', this.onStderrData.bind(this));
    }

    execCommand(cmdStr, stderrHandler) {
        if (stderrHandler) {
            this._stderrHandler = stderrHandler;
        }
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

    play(turn, coord, stderrHandler) {
        return this.execCommand(`play ${turn} ${coord}`, stderrHandler);
    }

    genmove(turn, stderrHandler) {
        const response = this.execCommand(`genmove ${turn}`, stderrHandler);
        if (/^pass|[a-z][0-9]{1,2}$/.test(response.result)) {
            response.result = response.result.toUpperCase();
        }
        return response;
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
        if (this._stderrHandler) {
            this._stderrHandler(data);
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
exports.GtpBase = GtpBase;
