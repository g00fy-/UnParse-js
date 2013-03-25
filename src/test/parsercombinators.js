define(["app/parser", "app/maybeerror"], function (Parser, MaybeError) {

    return function() {
    
        module("parser combinators");
    
        var item     =  Parser.item,
            sat      =  Parser.satisfy,
            literal  =  Parser.literal,
            zero     =  MaybeError.zero,
            error    =  MaybeError.error,
            pure     =  MaybeError.pure,
            all      =  Parser.all,
            string   =  Parser.string,
            any      =  Parser.any,
            err      =  Parser.error;
    
        function myPure(value, rest, state) {
            return Parser.pure(value).parse(rest, state);
        }
		
        function g(l, r) {
            if(l.length !== r.length) {
                return false;
            }
            for(var i = 0; i < l.length; i++) {
                if(l[i] !== r[i]) {
                    return false;
                }
            }
            return true;
        }
        
        function f(x, y) {
            return x.b === y.b;
        }
        
        function f3(x,y,z) {
            return x + z;
        }
        
        function fe(e) {
            return {e: e, length: e.length};
        }
        
        var allEx = all([item, literal('x'), literal('3')]),
            seq2LEx = literal('a').seq2L(literal("b")),
            seq2REx = literal('a').seq2R(literal("b")),
            anyEx = Parser.any([literal('a'), literal('b'), string("zyx")]);

        test("item", function() {
            deepEqual(myPure('a', 'bdc', 32), item.parse('abdc', 32));
            deepEqual(zero, item.parse("", null));
            deepEqual(myPure(1, [2,3,4], null), item.parse([1,2,3,4], null));
        });
        
        test("fmap", function() {
            var fmapEx = literal(3).fmap(function(x) {return x + 15;});
            deepEqual(myPure(18, [4,5], "q"), fmapEx.parse([3,4,5], 'q'));
            deepEqual(zero, fmapEx.parse([4,5,6], 'q'));
            deepEqual(error('oops'), fmapEx.commit('oops').parse([2,3,4], 'q'));
        });
        
        test("pure", function() {
            deepEqual(myPure('hi there', '123abc', {a: 'bcd'}), Parser.pure("hi there").parse("123abc", {a: 'bcd'}));
        });
        
        test("bind", function() {
            var two = item.bind(literal),
                ex = item.bind(function(x) {
                    return item.bind(function(y) {
                        return literal(x);
                    });
                });

            deepEqual(myPure('a', 'bcd', 3), two.parse("aabcd", 3));
            deepEqual(myPure('b', 'cd', 3), two.parse("bbcd", 3));
            deepEqual(zero, two.parse("abcd"));
            deepEqual(myPure(1, [3], 'oo'), ex.parse([1,2,1,3], 'oo'));
            deepEqual(zero, ex.parse([1,2,3,4], 'oop'));
        });

        test("check", function() {
            function gt3(x) {return x > 3;}
            deepEqual(zero, item.check(fe).parse(""));
            deepEqual(myPure(4, [5, "abc"]), item.check(gt3).parse([4, 5, "abc"]));
            deepEqual(zero, item.check(gt3).parse([2, 5, 'abc']));
        });
        
        test("plus", function() {
            var p = literal('a').plus(literal('b'));
            deepEqual(myPure('a', 'bcde', [1,2]), p.parse("abcde", [1,2]));
            deepEqual(myPure('b', 'cde', [1,2]), p.parse("bcde", [1,2]));
            deepEqual(zero, p.parse("cde", [1,2]));
            deepEqual(MaybeError.error("xyz", [1,2]), literal('a').plus(Parser.get.bind(Parser.error)).parse("xyz", [1,2]));
        });
        
        test("zero", function() {
            deepEqual(zero, Parser.zero.parse("abc123", [1,2]));
        });

		
        var tests = [
            ['satisfy', sat(fe).parse(""), zero],
            ['satisfy', sat(function(x) {return x > 3;}).parse([4, 5, "abc"]), myPure(4, [5, "abc"])],
            ['satisfy', sat(function(y) {return y % 2 === 0;}).parse([17, 'duh']), zero],
            ['literal', literal('a').parse(""), zero],
            ['literal', literal('b').parse("cde"), zero],
            ['literal', literal('m').parse("matt"), myPure('m', "att")],
            ['literal', literal(13).parse([13, 79, 22]), myPure(13, [79, 22])],
            ['literal -- the equality comparison must work for anything"',                         
                literal([12, 13], g).parse([[12,13], 27, "abc"]),
                myPure([12, 13], [27, "abc"])],
            ['literal', literal({b: 2, c: 3}, f).parse([{b: 2, c: 311}, 17]),
                myPure({b: 2, c: 311}, [17])],
            ['commit -- turns failure into an error', 
                literal('a').commit('blegg').parse("bcde"), err('blegg').parse("bcde")],
            ['commit -- does not affect success', 
                literal('a').commit('???').parse("abcde"), myPure('a', 'bcde')],
            ['commit -- does not affect errors', 
                err(123).commit('ouch!').parse('abcde'), MaybeError.error(123)],
            ['all -- identity', all([]).parse('abc'), myPure([], 'abc')],
            ['all', all([literal('2')]).parse("2345"), myPure(['2'], '345')],
            ['all', allEx.parse("ax3dyz"), myPure(['a', 'x', '3'], "dyz")],
            ['all', allEx.parse("bx4zzz"), zero],
            ['seq2L', seq2LEx.parse("abcdefg"), myPure('a', 'cdefg')],
            ['seq2L', seq2LEx.parse("acefg"), zero],
            ['seq2R', seq2REx.parse("abcdefg"), myPure('b', 'cdefg')],
            ['seq2R', seq2REx.parse("acefg"), zero],
            ['string', string('public').parse("publicness"), myPure('public', 'ness')],
            ['string', string('public').parse("pub-a-thon"), zero],
            ['many0', literal('a').many0().parse("bbb"), myPure([], 'bbb')],
            ['many0', literal('a').many0().parse("aaaaaabcd"), myPure(['a', 'a', 'a', 'a', 'a', 'a'], 'bcd')],
            ['many0  -- must respect errors', Parser.error('abc').many0().parse("abc"), 
                MaybeError.error("abc")],
            ['many1', literal('a').many1().parse("bbb"), zero],
            ['many1', literal('a').many1().parse("aaaaaabcd"), myPure(['a', 'a', 'a', 'a', 'a', 'a'], 'bcd')],
            ['many1 -- must respect errors', Parser.error('abc').many1().parse("abc"),
                MaybeError.error("abc")],
            ['any', anyEx.parse("aq123"), myPure('a', 'q123')],
            ['any', anyEx.parse("zyx34534"), myPure('zyx', '34534')],
            ['any', anyEx.parse("zy123"), zero],
            ['any -- must respect errors', 
                any([literal('a'), Parser.error(13)]).parse('cde'),
                MaybeError.error(13)],
            ['app', Parser.app(f3, item, literal(-1), item).parse([18, -1, 27, 3, 4]), 
                myPure(45, [3, 4])],
            ['app', Parser.app(undefined, item, literal(2)).parse([1,3,4,5]), zero],
            ['app -- must respect errors', 
                Parser.app(undefined, item, literal(1).commit('blah')).parse([1,2,3,4]),
                MaybeError.error('blah')],
            ['optional', literal('a').optional().parse('bcde'), myPure(undefined, 'bcde')],
            ['optional', literal('a').optional().parse('abcd'), myPure('a', 'bcd')],
            ['error', literal('a').seq2R(err('qrs')).parse('abcd'),
                MaybeError.error('qrs')],
            ['error', literal('a').seq2R(err('tuv')).parse('bcd'), zero],
            ['mapError', err([89, 22]).parse([2,3,4]).mapError(fe), 
                MaybeError.error({e: [89, 22], length: 2})]
        ];
        
        test("everything?", function() {
            tests.map(function(x) {
                deepEqual(x[1], x[2], x[0]);
            });
        });
    };

});
