/* global exports */

const { coord2move } = require('./gtp-util.js');
const { InvalidConfiguration } = require('./gtp-base.js');
const { GtpClient } = require('./gtp-client.js');

class GtpLeela extends GtpClient {
    static init() {
        super.init();
        this.WORK_DIR = process.env.PWD;
        if (!process.env.LEELA_PATH) {
            throw new InvalidConfiguration('no LEELA_PATH');
        }
        this.COMMAND = process.env.LEELA_PATH;
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

    async genmove() {
        this.info = {
            comment: null,
            winRate: null,
            pv: null,
            variations: []
        };
        const value = await super.genmove(this.genmoveStderrHandler);
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
} catch(e) {
    console.log(e.reason);
}

exports.GtpLeela = GtpLeela;
