/* global exports */

const { execFile } = require('child_process');
const byline = require('byline');
const jssgf = require('jssgf');
const { move2coord, coord2move } = require('./gtp-util.js');


class InvalidConfiguration extends Error {
}

class CancelableJob {
    constructor() {
        this.cancelFlag = false;
        this.terminable = null;
    }
    async cancel() {
        this.cancelFlag = true;
        if (this.terminable) {
            await this.terminable.terminate();
        }
    }
}

// TODO: ソース更新でのサーバーリスタートでは子プロセスは死なないので、殺す必要あり。
// ServerSession使ってstartupで殺そうとしたら、
// コールバック中のGtpClient#stopでServerSessionを更新するには
// bindEnvironemntする必要があり、面倒くさくなった。
/* GtpClient - ベースクラス */
class GtpClient {
    static init() {
        this.WORK_DIR = ''; // サブクラスで定義すること
        this.COMMAND = ''; // サブクラスで定義すること
        this.OPTIONS = []; // サブクラスで定義すること
        this.LOG = false;
        this.currentPromise = Promise.resolve();
        this.CONNECTION_RELATED_JOBS = {};
    }

    static async cancelById(id) {
        if (id in this.CONNECTION_RELATED_JOBS) {
            await this.CONNECTION_RELATED_JOBS[id].cancel();
        }
    }

    static nextMove(id, sgf, byoyomi, format = "gtp", options = []) {
        const cancelableJob = new CancelableJob();
        this.CONNECTION_RELATED_JOBS[id] = cancelableJob;
        const next = () => {
            if (cancelableJob.cancelFlag) {
                return Promise.reject('canceled');
            } else {
                const result = this.genmoveFrom(sgf, byoyomi, format, options);
                cancelableJob.terminable = result.instance;
                return result.promise;
            }
        }
        this.currentPromise = this.currentPromise.then(next, next);
        return this.currentPromise;
    }

    /**
     * MyClass のインスタンスを操作し、何かを返します。
     * @param {timeSettings} function client, size, handicapsを引数に取り、clientに
     *     GTPコマンドを送って時間設定を行う関数
     */
    static genmoveFrom(sgf, byoyomi = null, format = 'gtp', options = [], timeout = 0) {
        let instance = new this();
        return {
            instance,
            promise: instance.genmoveFrom(sgf, byoyomi, format, options, timeout)
        };
    }

    constructor(cmdIndex = false) {
        this.size = 19;
        this.process = null;
        this.stdoutHandler = null;
        this.stderrHandler = null;
        this.genmoveStderrHandler = null;
        this.id = 1;
        this.cmdIndex = cmdIndex;
    }

    async genmoveFrom(sgf, byoyomi = null, format = 'gtp', options = [], timeout = 0) {
        await this.loadSgf(sgf, options, timeout);
        if (byoyomi) {
            await this.timeSettings(0, byoyomi, 1);
        }
        const value = await this.genmove();
        if (value && value.move && format === 'sgf') {
            value.move = coord2move(value.move, this.size);
        }
        await this.quit();
        return value;
    }

    async loadSgf(sgf, options = [], timeout = 0) {
        const [root] = jssgf.fastParse(sgf);
        const size = parseInt(root.SZ || '19');
        const komi = parseFloat(root.KM || '0');
        const handicaps = root.AB ? root.AB.map(x => move2coord(x, size)) : null
        await this.start(options, timeout);
        await this.setConditions(size, handicaps, komi);
        let node = root._children[0];
        while (node) {
            const move = node.B != null ? node.B : node.W; // ''はそのままmoveに代入しなければいけない
            if (move != null) {
                await this.play(move2coord(move, size));
            }
            node = node._children[0];
        }
    }

    start(options = [], timeout = 0) {
        if (this.constructor.LOG) {
            console.log('starting: ', this.constructor.COMMAND, this.constructor.OPTIONS.concat(options));
        }
        this.process = execFile(this.constructor.COMMAND, this.constructor.OPTIONS.concat(options), {
            cwd: this.constructor.WORK_DIR,
            env: process.env,
            timeout: timeout
        });
        this.process.on('error', function(err) {
            console.log('GtpClient error event', err);
            if (this.stdoutHandler) {
                // もしコマンド実行中にexitしたらそのプロミスをrejectする
                this.stdoutHandler.reject(err);
            }
            if (this.exitHandler) {
                this.exitHandler.reject(err);
            }
        });
        this.process.on('exit', (code, signal) => {
            if (this.stdoutHandler) {
                // もしコマンド実行中にexitしたらそのプロミスをrejectする
                this.stdoutHandler.reject({ code, signal });
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

    async setConditions(size, handicaps, komi) {
        this.size = size || 19;
        await this.execCommand(`boardsize ${this.size}`);
        if (handicaps) {
            await this.execCommand(`set_free_handicap ${handicaps.join(' ')}`);
            komi = komi != null ? komi : 0;
            this.turn = 'white';
        } else {
            this.turn = 'black';
        }
        if (komi != null) {
            await this.execCommand(`komi ${komi}`);
        }
    }

    changeTurn() {
        this.turn = this.turn === 'black' ? 'white' : 'black';
    }

    execCommand(cmdStr, stderrExecutor) {
        let promise = new Promise((resolve, reject) => {
            if (!this.process) {
                if (this.constructor.LOG) {
                    console.log(`execCommand(${cmdStr}): no gtp processes`);
                }
                reject(`no gtp processes(${cmdStr})`);
                return;
            }
            this.stdoutHandler = { resolve, reject };
            if (this.cmdIndex)
                this.process.stdin.write(this.id + ' ');
            this.process.stdin.write(cmdStr + '\n');
            this.id += 1;
        });
        if (stderrExecutor) {
            promise = Promise.all([new Promise(stderrExecutor), promise]);
        }
        return promise;
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

    setFreeHandicap(handicaps) {
        return this.execCommand(`set_free_handicap ${handicaps.join(' ')}`);
    }

    async play(coord) {
        const value = await this.execCommand(`play ${this.turn} ${coord}`);
        this.changeTurn();
        return value;
    }

    async genmove() {
        const [info, response] = await this.execCommand(`genmove ${this.turn}`,
            this.genmoveStderrExecutor ? this.genmoveStderrExecutor.bind(this) : null);
        const result = response.result;
        let res;
        if (/resign/.test(result)) {
            res = { move: 'resign' };
        } else {
            const match = result.match(/^(pass|PASS|[a-zA-Z][0-9]{1,2})/);
            if (match) {
                res = { move: match[1].toUpperCase() };
                this.changeTurn();
            } else {
                throw result
            }
        }
        return Object.assign(res, info);
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
        if (this.constructor.LOG) {
            console.log('stderr: ', data);
        }
        if (this.stderrHandler) {
            this.stderrHandler(data);
        }
        if (this.genmoveStderrHandler) {
            this.genmoveStderrHandler(data);
        }
    }

    onStdoutData(data) {
        if (this.constructor.LOG) {
            console.log('stdout: ', data);
        }
        const match = data.match(/^(=|\?)([0-9]+)?(.*)/);
        if (!match)
            return
        if (this.stdoutHandler) {
            switch (match[1]) {
            case '=':
                this.stdoutHandler.resolve({
                    id: match[2],
                    result: match[3].trim()
                });
                break;
            default:
                this.stdoutHandler.reject({
                    id: match[2],
                    reason: match[3].trim()
                });
            }
        }
    }
}

exports.InvalidConfiguration = InvalidConfiguration;
exports.GtpClient = GtpClient;
