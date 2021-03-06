/* global exports */
const jssgf = require('jssgf');
const { move2coord, coord2move } = require('./gtp-util.js');
const { GtpBase } = require('./gtp-base.js');


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


class GtpClient extends GtpBase {
    /**
     * GtpClientのサブクラスは使用前にinitをコールすること
     */
    static init() {
        /* 以下の3つの定数は後でユーザーが定義するかサブクラスのinitが定義すること */
        this.prototype.WORK_DIR = null;
        this.prototype.COMMAND = null;
        this.prototype.OPTIONS = [];
        
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
    static genmoveFrom(sgf, byoyomi = null, format = 'gtp', options = [], stderrHandler, stdoutHandler) {
        let instance = new this();
        instance.start(options);
        return {
            instance,
            promise: instance.genmoveFrom(sgf, byoyomi, format, stderrHandler, stdoutHandler)
        };
    }

    constructor(cmdIndex = false) {
        super(cmdIndex);
        this.size = 19;
    }

    start(options = []) {
        return super.start(
            this.COMMAND,
            this.OPTIONS.concat(options),
            this.WORK_DIR);
    }

    async genmoveFrom(sgf, byoyomi = null, format = 'gtp', stderrHandler, stdoutHandler) {
        await this.loadSgf(sgf);
        if (byoyomi) {
            await this.timeSettings(0, byoyomi, 1);
        }
        const value = await this.genmove(stderrHandler, stdoutHandler);
        if (value && value.move && format === 'sgf') {
            value.move = coord2move(value.move, this.size);
        }
        await this.quit();
        return value;
    }

    async loadSgf(sgf) {
        const [root] = jssgf.fastParse(sgf);
        this.size = parseInt(root.SZ || '19');
        const komi = parseFloat(root.KM || '0');
        const handicaps = root.AB ? root.AB.map(x => move2coord(x, this.size)) : null
        await this.setConditions(this.size, handicaps, komi);
        let node = root._children[0];
        while (node) {
            const move = node.B != null ? node.B : node.W; // ''はそのままmoveに代入しなければいけない
            if (move != null) {
                await this.play(move2coord(move, this.size));
            }
            node = node._children[0];
        }
    }

    async setConditions(size, handicaps, komi) {
        await this.boardsize(size);
        if (handicaps) {
            await this.setFreeHandicap(handicaps);
            komi = komi != null ? komi : 0;
            this.turn = 'white';
        } else {
            this.turn = 'black';
        }
        if (komi != null) {
            await this.komi(komi);
        }
    }

    changeTurn() {
        this.turn = this.turn === 'black' ? 'white' : 'black';
    }

    boardsize(size = 19) {
        this.size = size;
        return super.boardsize(size);
    }

    async play(coord, stderrHandler) {
        const value = await super.play(this.turn, coord, stderrHandler);
        this.changeTurn();
        return value;
    }

    async genmove(stderrHandler, stdoutHandler) {
        const value = await super.genmove(this.turn, stderrHandler, stdoutHandler);
        this.changeTurn();
        return value;
    }
}

exports.GtpClient = GtpClient;
