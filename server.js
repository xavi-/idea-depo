var sys = require("sys");
var url = require("url");
var fs = require("fs");
var bind = require("./libraries/bind-js");

var DEPO_DIR = "./depos/"

fs.mkdir(DEPO_DIR, 0666);

var srv = require("./libraries/xavlib/simple-router");

var sendChannel = (function() {
    function bindAndSend(res, data, context) {
        bind.to(data, context, function(data) {
            res.sendHeader(200, { "Conent-Length": data.length,
                                  "Content-Type": "text/html" });
            res.end(data, "utf8");
        });
    }
    
    return function sendChannel(res, channelId) {
        fs.readFile("./index.html", function(err, data) {
            if(err) { throw err; };
            
            var context, channel = chn.channels[channelId];
            
            if(!channel) {
                context = { text: "", "channel-name": channelId, "initial-info-id": 0 };
                chn.create(channelId).onload(function(text) {
                    context["text"] = text;
                    
                    bindAndSend(res, data, context);
                });
            }
            else {
                context = { text: channel.text, "channel-name": channelId, "initial-info-id": channel.lastInfoId };
                bindAndSend(res, data, context); 
            }
        });
    };
})();

srv.urls["/operational-transforms.js"] = srv.staticFileHandler("./operational-transforms.js", "application/x-javascript");

srv.urls["/client.js"] = srv.staticFileHandler("./libraries/xavlib/channel/client.js", "application/x-javascript");

srv.urls["/json2.js"] = srv.staticFileHandler("./libraries/json2.js", "application/x-javascript");

srv.urls["/"] = srv.urls["/index.html"] = function(req, res) { sendChannel(res, "index"); };
(function() {
    var regChannel = new RegExp("^/([a-zA-Z0-9_-]+)$");
    srv.patterns.push({
        test: function(req) { return regChannel.test(url.parse(req.url).pathname); },
        handler: function(req, res) { 
            var channelId = regChannel.exec(url.parse(req.url).pathname)[1];
            sendChannel(res, channelId);
        }
    });
})()

// /channel/<session-id>/send?msg=<json> => returns an info-id
// /channel/<session-id>/read?info-id=<int-id> => returns a list of json messages
var chn = require("./libraries/xavlib/channel");
var event = require("./libraries/xavlib/event");
var ot = require("./operational-transforms");
chn.onCreate(function(id, channel) {
    channel.text = "";
    
    channel.onload = event.create(channel);
    
    fs.readFile(DEPO_DIR + id, function(err, text) {
        sys.puts("Read in file: " + id);
        
        if(err) { text = ""; }
        
        channel.text = text;
        
        channel.onload.trigger(text);
        
        delete channel.onload;
    });
    
    var writeInFlight = false;
    
    channel.onReceive(function(msg, sendMoreInfo) { // TODO: handle case were messages come in while reading in file
        channel.text = ot.applyOp(channel.text, msg.content);
        
        if(!writeInFlight) {
            setTimeout(function() {
                fs.writeFile(DEPO_DIR + id, channel.text, function(err) {
                    if(err) { throw err; }
                    
                    sys.puts("Wrote: " + id);
                    writeInFlight = false; 
                });
            }, 1000);
            writeInFlight = true;
        }
    });
});

srv.server.listen(8001);
chn.start(srv);