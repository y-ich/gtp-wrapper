/* global exports */

const jssgf = require('jssgf');
const { move2coord, coord2move } = require('./gtp-util.js');
const { GtpClient } = require('./gtp-client.js');


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


/* GtpClient - ベースクラス */
class GtpHelper extends GtpClient {
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
        super();
        this.size = 19;
        this.genmoveStderrHandler = null;
    }

    start(options = [], timeout = 0) {
        return super.start(
            this.constructor.COMMAND,
            this.constructor.OPTIONS.concat(options),
            this.constructor.WORK_DIR,
            timeout);
    }

    async genmoveFrom(sgf, byoyomi = null, format = 'gtp', options = [], timeout = 0) {
        await this.loadSgf(sgf, options, timeout);
        if (byoyomi) {
            await this.timeSettings(0, byoyomi, 1);
        }
        const value = await this.genmoveWithInfo();
        if (value && value.move && format === 'sgf') {
            value.move = coord2move(value.move, this.size);
        }
        await this.quit();
        return value;
    }

    async loadSgf(sgf, options = [], timeout = 0) {
        const [root] = jssgf.fastParse(sgf);
        this.size = parseInt(root.SZ || '19');
        const komi = parseFloat(root.KM || '0');
        const handicaps = root.AB ? root.AB.map(x => move2coord(x, this.size)) : null
        await this.start(options, timeout);
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

    async play(coord) {
        const value = await super.play(this.turn, coord);
        this.changeTurn();
        return value;
    }

    async genmove() {
        const value = await super.genmove(this.turn);
        this.changeTurn();
        return value;
    }

    async genmoveWithInfo() {
        const [info, response] = await Promise.all([new Promise(this.genmoveStderrExecutor.bind(this)), this.genmove()]);
        if (/^pass|[a-z][0-9]{1,2}$/.test(response.result)) {
            response.result = response.result.toUpperCase();
        }
        return Object.assign(response, info);
    }
}

exports.GtpHelper = GtpHelper;
