/* global exports __dirname */
const path = require('path');
const { coord2move } = require('./gtp-util.js');
const { GtpClient } = require('./gtp-client.js');

class GtpLeela extends GtpClient {
    static init() {
        super.init();
        this.WORK_DIR = path.join(__dirname, 'Leela0110GTP');
        this.COMMAND = './' + (function() {
            switch (process.platform) {
                case 'linux': return 'leela_0110_linux_x64';
                case 'darwin': return 'leela_0110_macOS';
                default: throw new Error('not-supported');
            }
        })() + (process.env.LEELA === 'opencl' ? '_opencl' : '');
        this.OPTIONS = ['--gtp'];
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

    async genmove(stderrHandler) {
        this.info = {
            comment: null,
            winRate: null,
            pv: null,
            variations: []
        };
        const value = await super.genmove(stderrHandler ? line => {
            this.genmoveStderrHandler(line);
            stderrHandler.call(this, line);
        } : this.genmoveStderrHandler);
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

class GtpLeelaZero extends GtpClient {
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

    async genmove(stderrHandler) {
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
        } : this.genmoveStderrHandler);
        return Object.assign(value, this.info);
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
}

class GtpLeelaZero19 extends GtpLeelaZero {
    static init() {
        super.init();
        this.WORK_DIR = path.join(__dirname, 'Leela-Zero');
        this.COMMAND = './' + (function() {
            switch (process.platform) {
                case 'linux': return 'leelaz';
                case 'darwin': return 'leelaz_macOS';
                default: throw new Error('not-supported');
            }
        })();
        this.OPTIONS = ['-g', '-w', process.env.LZ19_WEIGHTS || path.join(__dirname, 'private/weights19.txt')];
    }
}

class GtpLeelaZero9 extends GtpLeelaZero {
    static init() {
        super.init();
        this.WORK_DIR = path.join(__dirname, 'Leela-Zero9');
        this.COMMAND = './' + (function() {
            switch (process.platform) {
                case 'linux': return 'leelaz';
                case 'darwin': return 'leelaz_macOS';
                default: throw new Error('not-supported');
            }
        })();
        this.OPTIONS = ['-g', '-w', '20-128-6.5.txt'];
    }
}

try {
    GtpLeela.init();
    GtpLeelaZero19.init();
    GtpLeelaZero9.init();
} catch (e) {
    console.log(e.message);
}

exports.GtpLeela = GtpLeela;
exports.GtpLeelaZero19 = GtpLeelaZero19;
exports.GtpLeelaZero9 = GtpLeelaZero9;