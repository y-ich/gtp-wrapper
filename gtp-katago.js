/* global exports */
const { coord2move } = require('./gtp-util.js');
const { GtpClient } = require('./gtp-client.js');

class GtpKataGo extends GtpClient {
    static init(workDir, command, options) {
        super.init();
        this.prototype.WORK_DIR = workDir;
        this.prototype.COMMAND = command;
        if (!options.includes('gtp')) {
            options.unshift('gtp');
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

    kataAnalyze(centisec, stdoutHandler) {
        return this.execCommand(`kata-analyze ${centisec}`, undefined, stdoutHandler);
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
        if (!line.includes("info")) {
            return { info: [], ownership: null };
        }
        const [preOwnership, ownership] = line.split("ownership ");
        const infos = preOwnership.split("info ");
        const result = {
            infos: [],
            ownership: ownership != null ? ownership.split(" ").map(e => parseFloat(e)) : []
        };
        for (const info of infos) {
            if (info === "") continue;
            const [prePv, pv] = info.split("pv ");
            const regex = /([a-zA-Z]+) ([A-Z][0-9]{1,2}|pass|PASS|-?\d+\.\d+(?:e-?\d+)?|[0-9]+)/g;
            let match;
            const obj = { pv: pv.split(" ") };
            while ((match = regex.exec(prePv)) != null) {
                if (match[1] === "winrate") {
                    obj[match[1]] = parseFloat(match[2]) * 100;
                } else if (/^[0-9]+$/.test(match[2])) {
                    obj[match[1]] = parseInt(match[2]);
                } else if (/-?\d+\.\d+(?:e-?\d+)?/.test(match[2])) {
                    obj[match[1]] = parseFloat(match[2]);
                } else {
                    obj[match[1]] = match[2] === "pass" ? "PASS" : match[2];
                }
            }
            if (Object.keys(obj).length > 0) {
                result.infos.push(obj);
            }
        }
        return result;
    }
}

exports.GtpKataGo = GtpKataGo;
