(function(ot) {
    function opsCompare(a, b) {
        if(a.pos === b.pos) { return (a.cmd === "ins") ? -1 : 1; }
        return a.pos - b.pos; 
    }

    /*
     * Both opsA ad opsB are arries of this form:
     *   [ { cmd: "ins", pos: <number>, val: <val> }, { cmd: "del", pos: <number> } ... ]
     */
    function combine(opA, opB) {
        var a = 0, b = 0, opC = [];
        
        while(a < opA.length && b < opB.length) {
            if(opA[a].pos < opB[b].pos) { opC.push(opA[a++]); }
            else if(opB[b].pos < opA[a].pos) { opC.push(opB[b++]); }
            else if(opA[a].cmd !== opB[b].cmd) {
                if(opA[a].cmd === "ins") { opC.push(opA[a++]); }
                else { opC.push(opB[b++]); }
            } else { // opA and opB same pos and same cmd
                if(opA[a].cmd === "del") { opC.push(opB[b++]); a++; }
                else { opC.push({ cmd: "ins", pos: opB[b].pos, val: opA[a++].val + opB[b++].val }); }
            }
        }
        
        while(a < opA.length) { opC.push(opA[a++]); }
        while(b < opB.length) { opC.push(opB[b++]); }
        
        return opC;
    }
    
    function transform(opsA, opsB) {
        var opsB_ = opsB.map(function(o) { return { cmd: o.cmd, pos: o.pos, val: o.val }; });
        
        opsA.reverse().forEach(function(opA) {
            opsB_.forEach(function(opB) {
                if(opB.pos < opA.pos) { return; }
                
                if(opB.pos > opA.pos) {
                    if(opA.cmd === "del") { opB.pos -= 1; }
                    else if(opA.cmd === "ins") { opB.pos += opA.val.length; }
                } else if(opB.pos === opA.pos) {
                    if(opB.cmd === "del" && opA.cmd === "del") { opB.cmd = null; opB.pos = -1; } // delete opB
                    else if(opB.cmd === "del" && opA.cmd === "ins") { opB.pos += opA.val.length; }
                    else if(opB.cmd === "ins" && opA.cmd === "del") { /* no-op */ }
                    else if(opB.cmd === "ins" && opA.cmd === "ins") {
                        if(opB.val < opA.val) { opB.pos += opA.val.length; } else { /* no-op */ }
                    }
                }
            });
        });
        
        return opsB_.filter(function(o) { return !!o.cmd; });
    }
    
    function applyOp(text, ops) {
        var newText = text;
        ops.sort(opsCompare).reverse().forEach(function(o) { // Replace with fold operation?
            if(o.cmd === "del") {
                newText = newText.substr(0, o.pos) + newText.substr(o.pos + 1);
            } else if(o.cmd === "ins") {
                newText = newText.substr(0, o.pos) + o.val + newText.substr(o.pos);
            }
        });
        
        return newText;
    }
    
    var produceOp = (function() {
        function lcs(textA, textB) { // TODO: improve performance with dynamic version of algorithm or memoization
            if(textA === "" || textB === "") { return ""; }
            else if(textA[0] === textB[0]) { return textA[0] + lcs(textA.substr(1), textB.substr(1)); }
            else {
                var ans1 = lcs(textA, textB.substr(1));
                var ans2 = lcs(textA.substr(1), textB);
                
                return (ans1.length > ans2.length ? ans1 : ans2);
            }
        }
    
        function trim(textA, textB) {
            for(var i = 0, l = Math.min(textA.length, textB.length); i < l; i++) {
                if(textA.charAt(i) !== textB.charAt(i)) { break; }
            }
            
            for(var j = 1, l = Math.min(textA.length, textB.length); j <= l - i; j++) {
                if(textA.charAt(textA.length - j) !== textB.charAt(textB.length - j)) { break; }
            }
            
            return { frontOffset: i, backOffset: j, 
                     A: textA.substring(i, textA.length - j + 1), B: textB.substring(i, textB.length - j + 1) };
        }
        
        function produceOp(oriText, newText) {
            var trm = trim(oriText, newText);
            
            if(trm.A === "" && trm.B === "") { return []; }
            else if(trm.A === "") { return [ { cmd: "ins", pos: trm.frontOffset, val: trm.B } ]; }
            else if(trm.B === "") {
                var ops = [];
                
                for(var i = 0; i < trm.A.length; i++) { ops.push({ cmd: "del", pos: trm.frontOffset + i }); }
                
                return ops; 
            } else {
                var common = lcs(trm.A, trm.B), ops = [];
                
                for(var i = 0, o = 0, n = 0; i < common.length; i++) {
                    while(trm.A.charAt(o++) !== common.charAt(i)) {
                        ops.push({ cmd: "del", pos: trm.frontOffset + o - 1 });
                    }
                    
                    while(trm.B.charAt(n++) !== common.charAt(i)) {
                        ops.push({ cmd: "ins", pos: trm.frontOffset + o - 1, val: trm.B.charAt(n - 1) }); 
                    }
                }
                
                while(o++ < trm.A.length) { ops.push({ cmd: "del", pos: trm.frontOffset + o - 1}); }
                if(n < trm.B.length) { ops.push({ cmd: "ins", pos: trm.frontOffset + o - 1, val: trm.B.substr(n) }); }
                
                for(var i = 0; i < ops.length - 1; i++) { // Combine ins's at same pos into one op
                    if(ops[i].cmd !== "ins") { continue; }
                    
                    if(ops[i + 1].cmd !== "ins") { continue; }
                    
                    if(ops[i].pos !== ops[i + 1].pos) { continue; }
                    
                    ops[i].val += ops[i + 1].val;
                    ops.splice(i + 1, 1); i--;
                }
                
                return ops;
            }
        }
        
        return produceOp;
    })();
    
    ot.combine = combine;
    ot.transform = transform;
    ot.applyOp = applyOp;
    ot.produceOp = produceOp;
})(typeof exports === "object" ? exports : (window.ot = {}));