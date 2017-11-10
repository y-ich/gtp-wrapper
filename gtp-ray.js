/* global exports */

const { coord2move } = require('./gtp-util.js');
const { InvalidConfiguration, GtpClient } = require('./gtp.js');

class GtpRay extends GtpClient {
    static init() {
        super.init();
        this.WORK_DIR = process.env.PWD;
        if (!process.env.RAY_PATH) {
            throw new InvalidConfiguration('no RAY_PATH');
        }
        this.COMMAND = process.env.RAY_PATH;
    }
    genmoveStderrExecutor(res, rej) {
        const pv = [];
        this.genmoveStderrHandler = line => {
            if (/^Best Sequence :/.test(line)) {
                while (true) {
                    const match = /[A-Z][0-9]{1,2}/g.exec(line);
                    if (!match) {
                        break;
                    }
                    pv.push(coord2move(match[0], this.size));
                }
            } else {
                const match = line.match(/Winning Percentage :\s*([0-9.]+)%/);
                if (match) {
                    res({
                        winRate: parseFloat(match[1]),
                        pv
                    });
                }
            }
        }
    }
}

try {
    GtpRay.init();
} catch(e) {
    console.log(e.reason);
}

exports.GtpRay = GtpRay;
