var MaybeError = (function() {
    "use strict";

    var STATUSES = {
        'success': 1,
        'failure': 1,
        'error'  : 1
    };

    function ME(status, value) {
        if(!(status in STATUSES)) {
            throw new Error('invalid MaybeError constructor name: ' + status);
        }
        this.status = status;
        this.value = value;
    }
    
    ME.prototype.fmap = function(f) {
        if(this.status === 'success') {
            return new ME('success', f(this.value));
        }
        return this;
    };
    
    ME.pure = function(x) {
        return new ME('success', x);
    };
    
    ME.prototype.ap = function(y) {
        if(this.status === 'success') {
            return y.fmap(this.value);
        }
        return this;
    }
    
    ME.prototype.bind = function(f) {
        if(this.status === 'success') {
            return f(this.value);
        }
        return this;
    }
    
    ME.error = function(e) {
        return new ME('error', e);
    };
    
    ME.prototype.mapError = function(f) {
        if(this.status === 'error') {
            return ME.error(f(this.value));
        }
        return this;
    };
    
    ME.prototype.plus = function(that) {
        if(this.status === 'failure') {
            return that;
        }
        return this;
    };
    
    ME.zero = new ME('failure', undefined);
        
    return ME;

})();



function ParserFactory(Type) {
    "use strict";
    
    // (s -> [t] -> ME (s, [t], a)) -> Parser s t a
    function Parser(f) {
        this.parse = f;
    }
    
    function reportError(fName, type, expected, actual) {
        throw new Error(JSON.stringify({type: type, function: fName,
               expected: expected, actual: actual}));
    }

    function result(state, rest, value) {
        return {state: state, rest: rest, result: value};
    }
    
    function good(state, rest, value) {
        return Type.pure(result(state, rest, value));
    }

    
    // (s -> t -> s) -> Parser s t t
    Parser.item = new Parser(function(s, xs) {
        if(xs.length === 0) {
            return Type.zero;
        }
        var x = xs[0];
        return good(s, xs.slice(1), x);
    });
    
    // (a -> b) -> Parser t a -> Parser t b
    Parser.prototype.fmap = function(f) {
        if(typeof f !== 'function') {
            reportError('fmap', 'TypeError', 'function', f);
        }
        var self = this;
        return new Parser(function(s, xs) {
            return self.parse(s, xs).fmap(function(r) {
                return result(r.state, r.rest, f(r.result));
            });
        });
    };
    
    // a -> Parser t a
    Parser.pure = function(x) {
        return new Parser(function(s, xs) {
            return good(s, xs, x);
        });
    };
    
    // skipping Applicative ... for now
    
    // m a -> (a -> m b) -> m b
    // ([t] -> m ([t], a)) -> (a -> [t] -> m ([t], b)) -> [t] -> m ([t], b)
    Parser.prototype.bind = function(f) {
        if(typeof f !== 'function') {
            reportError('bind', 'TypeError', 'function', f);
        }
        var self = this;
        return new Parser(function(s, xs) {
            var r = self.parse(s, xs),
                val = r.value;
            if(r.status === 'success') {
                return f(val.result).parse(val.state, val.rest);
            }
            return r;
        });
    };
    
    Parser.prototype.plus = function(that) {
        if(!(that instanceof Parser)) {
            reportError('plus', 'TypeError', 'Parser', that);
        }
        var self = this;
        return new Parser(function(s, xs) {
            return self.parse(s, xs).plus(that.parse(s, xs));
        });
    };
    
    Parser.zero = new Parser(function(s, xs) {
        return Type.zero;
    });
    
    // Parser [t] t a
    Parser.error = function(value) {
        return new Parser(function(s, xs) {
            return Type.error(value);
        });
    };
    
    // (e -> m) -> Parser e t a -> Parser m t a
    Parser.prototype.mapError = function(f) {
        if(typeof f !== 'function') {
            reportError('mapError', 'TypeError', 'function', f);
        }
        var self = this;
        return new Parser(function(s, xs) {
            return self.parse(s, xs).mapError(f);
        });
    };
    
    // Parser t [t]
    Parser.get = new Parser(function(s, xs) {
        return good(s, xs, xs);
    });
    
    // [t] -> Parser t ()
    Parser.put = function(xs) {
        return new Parser(function(s, _xs_) {
            return good(s, xs, null);
        });
    };

    Parser.getState = new Parser(function(s, xs) {
        return good(s, xs, s);
    });

    Parser.putState = function(s) {
        return new Parser(function(_s_, xs) {
            return good(s, xs, null);
        });
    };
    
    // (s -> s) -> Parser s t ()
    Parser.updateState = function(f) {
        return new Parser(function(s, xs) {
            return good(f(s), xs, null);
        });
    };
    
    // (a -> Bool) -> Parser t a -> Parser t a
    Parser.prototype.check = function(p) {
        if(typeof p !== 'function') {
            reportError('check', 'TypeError', 'function', p);
        }
        var self = this;
        return new Parser(function(s, xs) {
            var r = self.parse(s, xs);
            if(r.status !== 'success') {
                return r;
            } else if(p(r.value.result)) {
                return r;
            }
            return Type.zero;
        });
    };
    
    function equality(x, y) {
        return x === y;
    }

    // t -> Maybe (t -> t -> Bool) -> Parser t t    
    Parser.literal = function(x, f) {
        var eq = f ? f : equality;
        if(typeof eq !== 'function') {
            reportError('literal', 'TypeError', 'function', eq);
        }
        return Parser.item.check(function (y) {
                                     return eq(x, y);
                                 });
    };
    
    // (t -> Bool) -> Parser t t
    Parser.satisfy = function(pred) {
        if(typeof pred !== 'function') {
            reportError('satisfy', 'TypeError', 'function', pred);
        }
        return Parser.item.check(pred);
    };
    
    // Parser t a -> Parser t [a]
    Parser.prototype.many0 = function() {
        var self = this;
        return new Parser(function(s, xs) {
            var vals = [],
                state = s,
                tokens = xs,
                r;
            while(true) {
                r = self.parse(state, tokens);
                if(r.status === 'success') {
                    vals.push(r.value.result);
                    state = r.value.state;
                    tokens = r.value.rest;
                } else if(r.status === 'failure') {
                    return good(state, tokens, vals);
                } else { // must respect errors
                    return r;
                }
            }
        });
    };
    
    // Parser t a -> Parser t [a]
    Parser.prototype.many1 = function() {
        return this.many0().check(function(x) {return x.length > 0;});
    };

    // (a -> b -> ... z) -> (Parser t a, Parser t b, ...) -> Parser t z
    // example:   app(myFunction, parser1, parser2, parser3, parser4)
    Parser.app = function(f, ps__) {
        var p = Parser.all(Array.prototype.slice.call(arguments, 1));
        return p.fmap(function(rs) {
            return f.apply(undefined, rs); // 'undefined' gets bound to 'this' inside f
        });
    };
    
    // a -> Parser t a -> Parser t a
    Parser.prototype.optional = function(x) {
        return this.plus(Parser.pure(x));
    };
    
    // [Parser t a] -> Parser t [a]
    Parser.all = function(ps) {
        ps.map(function(p) {
            if(!(p instanceof Parser)) {
                reportError('all', 'TypeError', 'Parser', p);
            }
        });
        return new Parser(function(s, xs) {
            var vals = [],
                i, r,
                state = s,
                tokens = xs;
            for(i = 0; i < ps.length; i++) {
                r = ps[i].parse(state, tokens);
                if(r.status === 'error') {
                    return r;
                } else if(r.status === 'success') {
                    vals.push(r.value.result);
                    state = r.value.state;
                    tokens = r.value.rest;
                } else {
                    return Type.zero;
                }
            }
            return Type.pure({state: state, rest: tokens, result: vals});
        });
    };
    
    // Parser t a -> Parser t ()
    Parser.prototype.not0 = function() {
        var self = this;
        return new Parser(function(s, xs) {
            var r = self.parse(s, xs);
            if(r.status === 'error') {
                return r;
            } else if(r.status === 'success') {
                return Type.zero;
            } else {
                return Type.pure({state: s, rest: xs, result: null});
            }
        });
    };
    
    // Parser t a -> Parser t t
    Parser.prototype.not1 = function() {
        return this.not0().seq2R(Parser.item);
    };
    
    // e -> Parser e t a
    Parser.prototype.commit = function(e) {
        return this.plus(Parser.error(e));
    };
    
    Parser.prototype.seq2L = function(p) {
        if(!(p instanceof Parser)) {
            reportError('seq2L', 'TypeError', 'Parser', p);
        }
        return Parser.all([this, p]).fmap(function(x) {return x[0];});
    };
    
    Parser.prototype.seq2R = function(p) {
        if(!(p instanceof Parser)) {
            reportError('seq2R', 'TypeError', 'Parser', p);
        }
        return Parser.all([this, p]).fmap(function(x) {return x[1];});
    };
    
    // purpose:  '[].map' passes in index also
    //   which messed up literal because it
    //   expects 2nd arg to be a function or undefined
    // this function ensures that doesn't happen
    function safeMap(array, f) {
        var out = [], i;
        for(i = 0; i < array.length; i++) {
            out.push(f(array[i]));
        }
        return out;
    }
    
    // [t] -> Parser t [t]
    // n.b.:  [t] != string !!!
    Parser.string = function(str) {
        return Parser.all(safeMap(str, Parser.literal)).seq2R(Parser.pure(str));
    };

    // [Parser t a] -> Parser t a
    Parser.any = function (ps) {
        ps.map(function(p) {
            if(!(p instanceof Parser)) {
                reportError('any', 'TypeError', 'Parser', p);
            }
        });
        return new Parser(function(s, xs) {
            var r = Type.zero,
                i;
            for(i = 0; i < ps.length; i++) {
                r = ps[i].parse(s, xs);
                if(r.status === 'success' || r.status === 'error') {
                    return r;
                }
            }
            return r;
        });
    };
    
    return Parser;
    
};



var Parser = ParserFactory(MaybeError),
    eg1 = Parser.all([Parser.literal('a'), Parser.get, Parser.getState, Parser.putState(13), Parser.literal('b')]);


var Braces = (function() {
    
    function Braces(opens) {
        this.opens = opens;
    }
    
    Braces.prototype.push = function(b) {
        var newBs = this.opens.slice();
        newBs.push(b);
        return new Braces(newBs);
    };
    
    Braces.prototype.pop = function() {
        if(this.opens.length === 0) {
            return false;
        }
        return new Braces(this.opens.slice(0, this.opens.length - 1));
    };
    
    return Braces;
    
})();
    
var BlockParser = (function () {
    "use strict";
    
    function eq(a, b) {
        return a === b[0];
    }
    
    function openBrace(t) {
        return Parser.updateState(function(bs) {
            return bs.push(t);
        }).seq2R(Parser.pure(t));
    }
    
    function closeBrace(t) {
        return Parser.getState.bind(function(bs) {
            var newBs = bs.pop();
            if(newBs) {return Parser.putState(newBs).seq2R(Parser.pure(t));}
            return Parser.error({message: "unmatched }", brace: t});
        });
    }
    
    var open = Parser.literal("{", eq).bind(openBrace),
        close = Parser.literal("}", eq).bind(closeBrace),
        normalChar = open.plus(close).not1().fmap(function(t) {return t[0];});
        
    var form = new Parser(function() {}); // forward declaration to allow recursion
    
    /*var block = Parser.app(
        function(o, fs, cl) {return {type: 'block', start: o.slice(1), forms: fs, end: cl.slice(1)};},
        open,
        form.many0(),
        close.commit('unmatched {'));
    */
    var block = open.bind(function(o) {
        return Parser.app(
            function(fs, cl) {
                return {type: 'block', start: o.slice(1), forms: fs, end: cl.slice(1)};
            },
            form.many0(),
            close.commit({message: 'unmatched {', brace: o}));
    });
    
    form.parse = normalChar.plus(block).parse; // set 'form' to its actual value
    
    var parser = form.many0();
    
    return parser;

})();

var str = "abc{\nd{derr}ef}g\nh}ib{largh".split(''),
    line = 1, column = 1, toks = [];

for(var i = 0; i < str.length; i++) {
    toks.push([str[i], line, column]);
    column++;
    if(str[i] === '\n') {line++; column = 1;}
}
