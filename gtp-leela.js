/* global exports */

const { coord2move } = require('./gtp-util.js');
const { InvalidConfiguration } = require('./gtp-client.js');
const { GtpHelper } = require('./gtp-helper.js');

class GtpLeela extends GtpHelper {
    static init() {
        super.init();
        this.WORK_DIR = process.env.PWD;
        if (!process.env.LEELA_PATH) {
            throw new InvalidConfiguration('no LEELA_PATH');
        }
        this.COMMAND = process.env.LEELA_PATH;
        this.OPTIONS = ['--gtp'];
    }

    async genmove() {
        const promise = new Promise(this.genmoveStderrExecutor.bind(this));
        const result = await super.genmove();
        const info = await promise;
        return [info, result];
    }

    genmoveStderrExecutor(res, rej) {
        const variations = [];
        let mcFlag = false;
        this.stderrHandler = line => {
            console.log(line);
            if (/book moves/.test(line)) {
                res({ comment: 'book moves' });
            } else if (/^MC winrate=/.test(line)) {
                mcFlag = true;
            } else if (mcFlag) { // ponderの結果でなければ
                const match = line.match(/[A-Z][0-9]{1,2} ->\s*([0-9]+).*PV:((?: [a-zA-Z][0-9]{1,2})+)/);
                if (match && match[1] !== '0') {
                    variations.push(match[2].trim().split(' ').map(e =>
                        coord2move(e.toUpperCase(), this.size)));
                } else {
                    const match = line.match(/visits, score\s*(-?[0-9\.]+).*PV:((?: [a-zA-Z][0-9]{1,2})+)/);
                    if (match) {
                        res({
                            winRate: parseFloat(match[1]),
                            pv: match[2].trim().split(' ').map(e =>
                                coord2move(e.toUpperCase(), this.size)),
                            variations
                        });
                    }
                }
            }
        }
    }
}

try {
    GtpLeela.init();
} catch(e) {
    console.log(e.reason);
}

exports.GtpLeela = GtpLeela;
