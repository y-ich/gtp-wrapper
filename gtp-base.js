/* global exports */

const { spawn } = require('child_process');
const byline = require('byline');


class InvalidConfiguration extends Error {
}

/* GtpBase - ベースクラス */
class GtpBase {
    constructor(cmdIndex = false) {
        this.cmdIndex = cmdIndex;
        this.process = null;
        this.commandHandlers = [];
        this.stderrHandler = null;
        this.id = 1;
        this.response = null;
        this._command = null;
    }

    start(command, options, workDir) {
        this.process = spawn(command, options, {
            cwd: workDir,
            env: process.env
        });
        this.process.on('error', function(err) {
            console.log('GtpBase error event', err);
            if (this.commandHandlers.length === 0 && !this.exitHandler) {
                throw err;
            }
            for (const { reject } of this.commandHandlers) {
                reject(err);
            }
            this.commandHandlers = [];
            this.response = null;
            if (this.exitHandler) {
                this.exitHandler.reject(err);
            }
        });
        this.process.on('exit', (code, signal) => {
            for (const { reject } of this.commandHandlers) {
                reject({ code, signal });
            }
            this.commandHandlers = [];
            this.response = null;
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
        this.process.stdout.setEncoding('utf8');
        this.process.stderr.setEncoding('utf8');
        const stdout = byline.createStream(this.process.stdout, { keepEmptyLines: true });
        const stderr = byline.createStream(this.process.stderr, { keepEmptyLines: true });
        stdout.on('data', this.onStdoutData.bind(this));
        stderr.on('data', this.onStderrData.bind(this));
    }

    execCommand(cmdStr, stderrHandler, stdoutHandler) {
        this._stderrHandler = stderrHandler;
        this._stdoutHandler = stdoutHandler;
        return new Promise((resolve, reject) => {
            if (!this.process) {
                reject(`no gtp processes(${cmdStr})`);
                return;
            }
            this.commandHandlers.push({ resolve, reject });
            this._command = this.cmdIndex ? `${this.id} ${cmdStr}` : cmdStr;
            this.process.stdin.write(this._command + '\n');
            this.id += 1;
        });
    }

    name() {
        return this.execCommand('name');
    }

    knownCommand(cmd) {
        return this.execCommand(`known_command ${cmd}`);
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

    genmove(turn, stderrHandler, stdoutHandler) {
        const response = this.execCommand(`genmove ${turn}`, stderrHandler, stdoutHandler);
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
        if (this._stdoutHandler) {
            this._stdoutHandler(data);
        }
        if (this.commandHandlers.length === 0) {
            return;
        }
        try {
            if (this.response) {
                if (data !== '') {
                    this.response.result += '\n' + data;
                } else if (data === '') {
                    const commandHandler = this.commandHandlers.shift();
                    switch (this.response.prompt) {
                        case '=':
                        commandHandler.resolve(this.response);
                        break;
                        case '?':
                        commandHandler.reject(this.response);
                        break;
                        default:
                        commandHandler.reject(new Error('illegal format'));
                    }
                    this.response = null;
                }
            } else {
                const match = data.match(/^(=|\?)([0-9]+)?(.*)/);
                if (match) {
                    this.response = {
                        command: this._command,
                        prompt: match[1],
                        id: match[2],
                        result: match[3].trim()
                    };
                }
            }
        } catch (e) {
            const commandHandler = this.commandHandlers.shift();
            commandHandler.reject(e);
            this.response = null;
        }
    }
}

exports.InvalidConfiguration = InvalidConfiguration;
exports.GtpBase = GtpBase;
