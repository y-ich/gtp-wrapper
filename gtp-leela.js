/* global exports */
const { coord2move } = require('./gtp-util.js');
const { GtpClient } = require('./gtp-client.js');

class GtpLeela extends GtpClient {
    static init(workDir, command, options) {
        super.init();
        this.prototype.WORK_DIR = workDir;
        this.prototype.COMMAND = command;
        if (!(options.includes('--gtp') || options.includes('-g'))) {
            options.push('--gtp');
        }
        this.prototype.OPTIONS = options;
    }

    async play(coord) {
        this.info = {
            winRate: null,
            pv: null,
            variations: []
        };
        const value = await super.play(coord, this.playStderrHandler);
        return Object.assign(value, this.info);
    }

    async genmove(stderrHandler, stdoutHandler) {
        this.info = {
            comment: null,
            winRate: null,
            pv: null,
            variations: []
        };
        const value = await super.genmove(stderrHandler ? line => {
            this.genmoveStderrHandler(line);
            stderrHandler.call(this, line);
        } : this.genmoveStderrHandler, stdoutHandler);
        return Object.assign(value, this.info);
    }

    playStderrHandler(line) {
        const match = line.match(/([A-Z][0-9]{1,2}) ->\s*([0-9]+) \(W:\s*([.0-9]+)%\).*PV:((?: [a-zA-Z][0-9]{1,2})+)/);
        if (match) {
            this.info.variations.push({
                move: match[1],
                rollouts: parseInt(match[2]),
                winRate: parseFloat(match[3]),
                pv: match[4].trim().split(' ').map(e =>
                coord2move(e.toUpperCase(), this.size))
            });
        } else {
            const match = line.match(/visits, score\s*(-?[0-9\.]+).*PV:((?: [a-zA-Z][0-9]{1,2})+)/);
            if (match) {
                this.info.winRate = parseFloat(match[1]);
                this.info.pv = match[2].trim().split(' ').map(e =>
                    coord2move(e.toUpperCase(), this.size));
            }
        }
    }

    genmoveStderrHandler(line) {
        if (/book moves/.test(line)) {
            this.info.comment = 'book moves';
        } else {
            this.playStderrHandler(line);
        }
    }

    static parseDump(line) {
        const match = line.match(/^Nodes: ([0-9]+), Win:\s+([.0-9]+)%.*, PV:((?:\s[A-Z][0-9]{1,2})+)/);
        return match ? {
            nodes: parseInt(match[1]),
            winrate: parseFloat(match[2]),
            pv: match[3].trim().split(/\s+/)
        } : null;
    }
}

/** もしも複数のLeela Zero(19路盤用,9路盤用)を使うなら、このクラスを継承して複数のクラスを作成する */
class GtpLeelaZero extends GtpClient {
    static init(workDir, command, options) {
        super.init();
        this.prototype.WORK_DIR = workDir;
        this.prototype.COMMAND = command;
        if (!(options.includes('--gtp') || options.includes('-g'))) {
            options.push('--gtp');
        }
        this.prototype.OPTIONS = options;
    }

    async play(coord) {
        this.info = {
            comment: null,
            averageDepth: null,
            maxDepth: null,
            nonLeafNodes: null,
            averageChildren: null,
            visits: null,
            nodes: null,
            variations: []
        };
        const value = await super.play(coord, this.playStderrHandler);
        return Object.assign(value, this.info);
    }

    async genmove(stderrHandler, stdoutHandler) {
        this.info = {
            comment: null,
            averageDepth: null,
            maxDepth: null,
            nonLeafNodes: null,
            averageChildren: null,
            visits: null,
            nodes: null,
            variations: []
        };
        const value = await super.genmove(stderrHandler ? line => {
            this.genmoveStderrHandler(line);
            stderrHandler.call(this, line);
        } : this.genmoveStderrHandler, stdoutHandler);
        return Object.assign(value, this.info);
    }

    lzAnalyze(centisec, stdoutHandler) {
        return this.execCommand(`lz-analyze ${centisec}`, undefined, stdoutHandler);
    }

    playStderrHandler(line) {
        const match = line.match(/([A-Z][0-9]{1,2}) ->\s*([0-9]+) \(V:\s*([.0-9]+)%\) \(N:\s*([.0-9]+)%\).*PV:((?: [a-zA-Z][0-9]{1,2})+)/);
        if (match) {
            this.info.variations.push({
                move: match[1],
                rollouts: parseInt(match[2]),
                winRate: parseFloat(match[3]),
                policy: parseFloat(match[4]),
                pv: match[5].trim().split(' ').map(e =>
                coord2move(e.toUpperCase(), this.size))
            });
        } else {
            const match = line.match(/([0-9\.]+) average depth, ([0-9]+) max depth/);
            if (match) {
                this.info.averageDepth = parseFloat(match[1]);
                this.info.maxDepth = parseInt(match[1]);
            } else {
                const match = line.match(/([0-9]+) non leaf nodes, ([0-9\.]+) average children/);
                if (match) {
                    this.info.nonLeafNodes = parseInt(match[1]);
                    this.info.averageChildren = parseFloat(match[2]);
                } else {
                    const match = line.match(/([0-9]+) visits, ([0-9]+) nodes/);
                    if (match) {
                        this.info.visits = parseInt(match[1]);
                        this.info.nodes = parseInt(match[2]);
                    }
                }
            }
        }
    }

    genmoveStderrHandler(line) {
        this.playStderrHandler(line);
    }

    static parseDump(line) {
        const match = line.match(/^Playouts: ([0-9]+), Win:\s+([.0-9]+)%.*, PV:((?:\s[A-Z][0-9]{1,2})+)/);
        return match ? {
            nodes: parseInt(match[1]),
            winrate: parseFloat(match[2]),
            pv: match[3].trim().split(/\s+/)
        } : null;
    }

    static parseInfo(line) {
        const infos = line.split(/(?=info)/);
        const result = [];
        for (const info of infos) {
            const match = info.match(/^info move ([A-Z][0-9]{1,2}) visits ([0-9]+) winrate ([0-9]+) order ([0-9]+) pv((?:\s[A-Z][0-9]{1,2})+)/);
            if (match) {
                result.push({
                    move: match[1],
                    visits: parseInt(match[2]),
                    winrate: parseInt(match[3]) / 100,
                    order: parseInt(match[4]),
                    pv: match[5].trim().split(/\s+/)
                });
            } else {
                return null;
            }
        }
        return result;
    }
}

exports.GtpLeela = GtpLeela;
exports.GtpLeelaZero = GtpLeelaZero;
