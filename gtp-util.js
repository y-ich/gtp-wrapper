/* global exports */

function alphabet2number(char) {
    return char.charCodeAt(0) - 'a'.charCodeAt(0);
}

function number2alphabet(n) {
    return String.fromCharCode(n + 'a'.charCodeAt(0));
}

function move2coord(sgfMove, size) {
    if (sgfMove === '') {
        return 'PASS';
    }
    const X = 'ABCDEFGHJKLMNOPQRST';
    const x = X[alphabet2number(sgfMove.charAt(0))];
    const y = size - alphabet2number(sgfMove.charAt(1));
    return x + y;
}

function coord2move(coord, size) {
    if (coord == 'PASS') {
        return '';
    }
    const X = 'ABCDEFGHJKLMNOPQRST';
    const x = number2alphabet(X.indexOf(coord.charAt(0)));
    const y = number2alphabet(size - parseInt(coord.slice(1)));
    return x + y;
}

exports.move2coord = move2coord;
exports.coord2move = coord2move;
