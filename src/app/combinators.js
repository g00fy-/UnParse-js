define(["app/maybeerror"], function(M) {
    "use strict";

    function Parser(f) {
        /*
        A wrapper around a callable of type `[t] -> s -> ME ([t], s, a)`.
        Run the parser using the `parse` method.
        */
        this.parse = f;
    }
    
    function checkFunction(fName, actual) {
        if ( typeof actual !== 'function' ) {
            var obj = {
                'message' : 'type error', 
                'function': fName,
                'expected': 'function', 
                'actual'  : actual
            };
            throw new Error(JSON.stringify(obj));
        }
        // else:  nothing to do
    }

    function checkParser(fName, actual) {
        if ( !(actual instanceof Parser) ) {
            var obj = {
                'message' : 'type error', 
                'function': fName,
                'expected': 'Parser', 
                'actual'  : actual
            };
            throw new Error(JSON.stringify(obj));
        }
        // else:  nothing to do
    }

    function result(value, rest, state) {
        return {
            'state' : state, 
            'rest'  : rest, 
            'result': value
        };
    }
    
    function good(value, rest, state) {
        return M.pure(result(value, rest, state));
    }
    
    function compose(f, g) {
        return function(x) {
            return f(g(x));
        };
    }
    
    function fmap(g, parser) {
        /*
        (a -> b) -> Parser e s (m t) a -> Parser e s (m t) b
        */
        checkFunction('fmap', g);
        function h(r) {
            return result(g(r.result), r.rest, r.state);
        }
        function f(xs, s) {
            return parser.parse(xs, s).fmap(h);
        }
        return new Parser(f);
    }
    
    function pure(x) {
        /*
        a -> Parser e s (m t) a
        */
        return new Parser(function(xs, s) {return good(x, xs, s);});
    }

    function bind(parser, g) {
        /*
        Parser e s (m t) a -> (a -> Parser e s (m t) b) -> Parser e s (m t) b
        */
        checkParser('bind', parser);
        checkFunction('bind', g);
        function f(xs, s) {
            var r = parser.parse(xs, s),
                val = r.value;
            if ( r.status === 'success' ) {
                return g(val.result).parse(val.rest, val.state);
            } else {
                return r;
            }
        }
        return new Parser(f);
    }
    
    function error(e) {
        /*
        e -> Parser e s (m t) a
        */
        function f(xs, s) {
            return M.error(e);
        }
        return new Parser(f);
    }
    
    function catchError(f, parser) {
        /*
        Parser e s (m t) a -> (e -> Parser e s (m t) a) -> Parser e s (m t) a
        */
        checkFunction('catchError', f);
        checkParser('catchError', parser);
        function g(xs, s) {
            var v = parser.parse(xs, s)
            if ( v.status === 'error' ) {
                return f(v.value).parse(xs, s)
            }
            return v;
        }
        return new Parser(g);
    }

    function mapError(f, parser) {
        checkFunction('mapError', f);
        checkParser('mapError', parser);
        /*
        Parser e s (m t) a -> (e -> e) -> Parser e s (m t) a
        */
        return catchError(compose(error, f), parser);
    }
    
    function put(xs) {
        /*
        m t -> Parser e s (m t) a
        */
        function f(_xs_, s) {
            return good(null, xs, s);
        }
        return new Parser(f);
    }
    
    function putState(s) {
        /*
        s -> Parser e s (m t) a
        */
        function f(xs, _s_) {
            return good(null, xs, s);
        }
        return new Parser(f);
    }

    function updateState(g) {
        /*
        (s -> s) -> Parser e s (m t) a
        */
        checkFunction('updateState', g);
        function f(xs, s) {
            return good(null, xs, g(s));
        }
        return new Parser(f);
    }
    
    function check(predicate, parser) {
        /*
        (a -> Bool) -> Parser e s (m t) a -> Parser e s (m t) a
        */
        checkFunction('check', predicate);
        checkParser('check', parser);
        function f(xs, s) {
            var r = parser.parse(xs, s);
            if ( r.status !== 'success' ) {
                return r;
            } else if ( predicate(r.value.result) ) {
                return r;
            }
            return M.zero;
        }
        return new Parser(f);
    }
    
    function many0(parser) {
        /*
        Parser e s (m t) a -> Parser e s (m t) [a]
        */
        checkParser('many0', parser);
        function f(xs, s) {
            var vals = [],
                tokens = xs,
                state = s,
                r;
            while ( true ) {
                r = parser.parse(tokens, state);
                if ( r.status === 'success' ) {
                    vals.push(r.value.result);
                    state = r.value.state;
                    tokens = r.value.rest;
                } else if ( r.status === 'failure' ) {
                    return good(vals, tokens, state);
                } else { // must respect errors
                    return r;
                }
            }
        }
        return new Parser(f);
    }
    
    function many1(parser) {
        /*
        Parser e s (m t) a -> Parser e s (m t) [a]
        */
        checkParser('many1', parser);
        return check(function(x) {return x.length > 0;}, many0(parser));
    }

    function _get_args(args, ix) {
        return Array.prototype.slice.call(args, ix);
    }
    
    function seq() {
        /*
        [Parser e s (m t) a] -> Parser e s (m t) [a]
        */
        var parsers = _get_args(arguments, 0);
        parsers.map(checkParser.bind(null, 'seq')); // can I use `forEach` here instead of `map`?
        function f(xs, s) {
            var vals = [],
                state = s,
                tokens = xs,
                r;
            for(var i = 0; i < parsers.length; i++) {
                r = parsers[i].parse(tokens, state);
                if ( r.status === 'success' ) {
                    vals.push(r.value.result);
                    state = r.value.state;
                    tokens = r.value.rest;
                } else {
                    return r;
                }
            }
            return good(vals, tokens, state);
        }
        return new Parser(f);
    }
    
    function app(f) {
        var parsers = _get_args(arguments, 1);
        checkFunction('app', f);
        parsers.map(checkParser.bind(null, 'app')); // can I use `forEach` here as well?
        function g(args) {
            return f.apply(undefined, args);
        }
        return fmap(g, seq.apply(undefined, parsers));
    }
    
    function optional(parser, default_v) {
        /*
        Parser e s (m t) a -> a -> Parser e s (m t) a
        */
        // `default_v` is optional
        //   change undefineds to nulls to help distinguish accidents
        if ( typeof default_v === 'undefined' ) {
            default_v = null;
        }
        checkParser('optional', parser);
        return alt(parser, pure(default_v));
    }
    
    function _first(x, _) {
        return x;
    }
    
    function _second(_, y) {
        return y;
    }
    
    function seq2L(self, other) {
        /*
        Parser e s (m t) a -> Parser e s (m t) b -> Parser e s (m t) a
        */
        checkParser('seq2L', self);
        checkParser('seq2L', other);
        return app(_first, self, other);
    }
    
    function seq2R(self, other) {
        /*
        Parser e s (m t) a -> Parser e s (m t) b -> Parser e s (m t) b
        */
        checkParser('seq2R', self);
        checkParser('seq2R', other);
        return app(_second, self, other);
    }

    function lookahead(parser) {
        /*
        Parser e s (m t) a -> Parser e s (m t) None
        */
        checkParser('lookahead', parser);
        return bind(get, function(xs) {return seq2R(parser, put(xs));});
    }
    
    function not0(parser) {
        /*
        Parser e s (m t) a -> Parser e s (m t) None
        */
        checkParser('not0', parser);
        function f(xs, s) {
            var r = parser.parse(xs, s);
            if ( r.status === 'error' ) {
                return r;
            } else if ( r.status === 'success' ) {
                return M.zero;
            } else {
                return good(null, xs, s);
            }
        }
        return new Parser(f);
    }

    function commit(e, parser) {
        /*
        Parser e s (m t) a -> e -> Parser e s (m t) a
        */
        checkParser('commit', parser);
        return alt(parser, error(e));
    }
    
    function alt() {
        /*
        [Parser e s (m t) a] -> Parser e s (m t) a
        */
        var parsers = _get_args(arguments, 0);
        parsers.map(checkParser.bind(null, 'alt')); // use `forEach` here, too?
        function f(xs, s) {
            var r = M.zero;
            for(var i = 0; i < parsers.length; i++) {
                r = parsers[i].parse(xs, s);
                if ( r.status === 'success' || r.status === 'error' ) {
                    return r;
                }
            }
            return r;
        }
        return new Parser(f);
    }

    // Parser e s (m t) a
    var zero = new Parser(function(xs, s) {return M.zero;});
    
    // Parser e s (m t) (m t)
    var get = new Parser(function(xs, s) {return good(xs, xs, s);});
    
    // Parser e s (m t) s
    var getState = new Parser(function(xs, s) {return good(s, xs, s);});

    
    function _build_set(elems) {
        var obj = {};
        for(var i = 0; i < elems.length; i++) {
            obj[elems[i]] = 1;
        }
        return obj;
    }
    
    /*
    item :: Parser e s (m t) t
    `item` is the most basic parser and should:
     - succeed, consuming one single token if there are any tokens left
     - fail if there are no tokens left
    */    
    function Itemizer(item) {
        checkParser('Itemizer', item);
        
        function literal(x) {
            /*
            Eq t => t -> Parser e s (m t) t
            */
            return check(function(y) {return x === y;}, item); // what about other notions of equality ??
        };
        
        function satisfy(pred) {
            /*
            (t -> Bool) -> Parser e s (m t) t
            */
            checkFunction('satisfy', pred);
            return check(pred, item);
        };
        
        function not1(parser) {
            /*
            Parser e s (m t) a -> Parser e s (m t) t
            */
            checkParser('not1', parser);
            return seq2R(not0(parser), item);
        };
    
        function string(elems) {
            /*
            Eq t => [t] -> Parser e s (m t) [t] 
            */
            var ps = [];
            for(var i = 0; i < elems.length; i++) { // have to do this b/c strings don't have a `map` method
                ps.push(literal(elems[i]));
            }
            var matcher = seq.apply(undefined, ps);
            return seq2R(matcher, pure(elems));
        }
        
        function oneOf(elems) {
            var c_set = _build_set(elems);
            return satisfy(function(x) {return x in c_set;}); // does this hit prototype properties ... ???
        };
        
        return {
            'item'   :  item,
            'literal':  literal,
            'satisfy':  satisfy,
            'string' :  string,
            'not1'   :  not1,
            'oneOf'  :  oneOf
        };
    }


    function _f_item_basic(xs, s) {
        /*
        Simply consumes a single token if one is available, presenting that token
        as the value.  Fails if token stream is empty.
        */
        if ( xs.length === 0 ) {
            return M.zero;
        }
        var first = xs[0],
            rest = xs.slice(1);
        return good(first, rest, s);
    }
    
    var basic = new Itemizer(new Parser(_f_item_basic));

    function _bump(char, position) {
        var line = position[0],
            col = position[1];
        if ( char === '\n' ) {
            return [line + 1, 1];
        }
        return [line, col + 1];
    }
    
    function _f_position(c) {
        return seq2R(updateState(function(s) {return _bump(c, s);}), pure(c));
    }
    
    var _item_position = bind(basic.item, _f_position),
        position = new Itemizer(_item_position);
        
    var _item_count = seq2L(basic.item, updateState(function(x) {return x + 1;})),
        count = new Itemizer(_item_count);

    function run(parser, input_string, state) {
        /*
        Run a parser given the token input and state.
        */
        return parser.parse(input_string, state);
    }

    
    return {
        'Parser'     : Parser,
        'Itemizer'   : Itemizer,
        
        'fmap'       : fmap,
        'pure'       : pure,
        'bind'       : bind,
        'error'      : error,
        'catchError' : catchError,
        'mapError'   : mapError,
        'put'        : put,
        'putState'   : putState,
        'updateState': updateState,
        'check'      : check,
        'many0'      : many0,
        'many1'      : many1,
        'seq'        : seq,
        'app'        : app,
        'optional'   : optional,
        'seq2L'      : seq2L,
        'seq2R'      : seq2R,
        'lookahead'  : lookahead,
        'not0'       : not0,
        'commit'     : commit,
        'alt'        : alt,
        'zero'       : zero,
        'get'        : get,
        'getState'   : getState,
        
        'basic'      : basic,
        'position'   : position,
        'count'      : count,
        
        'run'        : run
    };
});
