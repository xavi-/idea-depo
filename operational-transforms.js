(function(ot) {
    function opsSorter(a, b) {
        if(a.pos === b.pos) { return (a.cmd === "ins") ? -1 : 1; }
        return a.pos - b.pos; 
    }

    /*
     * Both opsA ad opsB are arries of this form:
     *   [ { cmd: "ins", pos: <number>, val: <val> }, { cmd: "del", pos: <number> } ... ]
     */
    function combine(opsA, opsB) {
        return opsA.concat(opsB).sort(opsSorter);
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
    
    function applyOps(text, ops) {
        var newText = text;
        ops.sort(opsSorter).reverse().forEach(function(o) { // Replace with fold operation?
            if(o.cmd === "del") {
                newText = newText.substr(0, o.pos) + newText.substr(o.pos + 1);
            } else if(o.cmd === "ins") {
                newText = newText.substr(0, o.pos) + o.val + newText.substr(o.pos);
            }
        });
        
        return newText;
    }
    
    ot.combine = combine;
    ot.transform = transform;
    ot.applyOps = applyOps;
})(typeof exports === "object" ? exports : (window.ot = {}));