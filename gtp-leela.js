/* global exports __dirname */

const { coord2move } = require('./gtp-util.js');
const { GtpClient } = require('./gtp-client.js');

class GtpLeela extends GtpClient {
    static init() {
        super.init();
        if (process.env.LEELA === 'leelaz') {
            this.WORK_DIR = __dirname + '/Leela-Zero/';
            this.COMMAND = './leelaz';
            this.OPTIONS = ['-g', '-w', 'weights.txt'];
        } else {
            this.WORK_DIR = __dirname + '/Leela0110GTP/';
            this.COMMAND = './' + (function() {
                switch (process.platform) {
                    case 'linux': return 'leela_0110_linux_x64';
                    case 'darwin': return 'leela_0110_macOS';
                    default: throw new Error('not-supported');
                }
            })() + (process.env.LEELA === 'opencl' ? '_opencl' : '');
            this.OPTIONS = ['--gtp'];
        }
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
                winRate: parseInt(match[3]),
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
}

try {
    GtpLeela.init();
} catch (e) {
    console.log(e.message);
}

exports.GtpLeela = GtpLeela;
