var sys = require("sys");
var http = require("http");
var url = require("url");
var fs = require("fs");

var srv = (function() {
    var urls = {},
        patterns = [],
        error = function(req, res) { 
            var body = "404'd";
            res.sendHeader(404, { "Content-Length": body.length,
                                  "Content-Type": "text/plain" });
            res.write(body);
            res.close();
            
            sys.puts("Someone 404'd: " + req.url);
        };

    function findPattern(req) {
        for(var i = 0, l = patterns.length; i < l; i++) {
            if(patterns[i].test(req)) { return patterns[i].handler; }
        }
        
        return null;
    }    
        
    http.createServer(function(req, res) {
        (urls[url.parse(req.url).pathname] || findPattern(req) || error)(req, res);
    }).listen(8000);
    
    return { urls: urls, patterns: patterns, error: error };
})();

var StaticFileHandler = (function() {
    function Handler(path, mime, req, res) {
        fs.readFile(path, function(err, data) {
            if(err) { throw err; };
            
            res.sendHeader(200, { "Conent-Length": data.length,
                                  "Content-Type": mime });
            res.write(data, "utf8");
            res.close();
        });
    }

    return function(path, mime) {
        return function(req, res) { Handler(path, mime, req, res); }; 
    };
})();

srv.urls["/"] = srv.urls["/index.html"] = StaticFileHandler("./index.html", "text/html");

srv.urls["/operational-transforms.js"] = StaticFileHandler("./operational-transforms.js",  "application/x-javascript");

srv.urls["/client.js"] = StaticFileHandler("./client.js", "application/x-javascript");


// /channel/<session-id>/send?msg=<json> => returns an info-id
// /channel/<session-id>/read?info-id=<int-id> => returns a list of json messages
var chn = (function() {
    var _onCreate = [];

    var Channel = (function() {
        var nextInfoId = (function() {
            var infoId = 1;
            return function nextInfoId() { return infoId++; };
        })();
        
        function sendJSON(userId, content, res) {
            var body = JSON.stringify(content);                    
            res.sendHeader(200, { "Content-Length": body.length,
                                  "Content-Type": "application/json",
                                  "Cache-Control": "no-cache",
                                  "Set-Cookie": userId  + "; path=/;"});
            res.write(body);
            res.close();
        }
        
        return function Channel(id) {
            var users = {}, responses = [], _onReceive = [];
            
            this.id = id;
            
            this.data = [];
            
            this.users = function() { return users; };
            
            this.onReceive = function onReceive(callback) { _onReceive.push(callback); };
            
            this.info = function info(userId, type, res) {
                var content = { type: type };
                
                if(type === "users") { content.message = users; }
                else if(type === "remove-me") {
                    content.message = (users[userId] ? "OK" : "NA");
                    responses = responses.filter(function(o) { return o.userId !== userId; });
                    users[userId] = 0;
                }
                else { content.message = "Unknown Type"; }
                
                sendJSON(userId, content, res);
            };
            
            this.send = function send(userId, content) {                
                var info = [], lastInfoId;
                function sendMore(userId, content) {
                    lastInfoId = nextInfoId();
                    info.push({ infoId: lastInfoId, message: { userId: userId, content: content } });
                    return lastInfoId;
                }
                
                sendMore(userId, content);
                
                for(var i = 0; i < _onReceive.length; i++) { _onReceive[i].call(this, info[0].message, sendMore); }
                if(!info[0].message.content) { return -1; }
                
                Array.prototype.push.apply(this.data, info);
                
                responses.filter(function(o) { return o.userId !== userId; })
                         .forEach(function(o) { sendJSON(o.userId, info, o.response); });
                responses = responses.filter(function(o) { return o.userId === userId; });
                
                var newInfo = info.filter(function(o) { return o.message.userId !== userId; });
                if(newInfo.length > 0) {
                    responses.forEach(function(o) { sendJSON(o.userId, newInfo, o.response); });
                    responses = [];
                }
                    
                return lastInfoId;
            };
            
            this.read = function read(userId, infoId, res) {
                var content = this.data.filter(function(item) { return item.infoId > infoId; });
                
                if(content.length === 0) {
                    responses = responses.filter(function(o) { return o.userId !== userId; });
                    responses.push({ userId: userId, response: res, time: (new Date()).getTime() });
                } else { sendJSON(userId, content, res); }
            };
            
            setInterval(function() {
                var curTime = (new Date()).getTime();
                responses // Removing old responses
                    .filter(function(o) { return curTime - o.time > 45000; })
                    .forEach(function(o) { sendJSON(o.userId, [], o.response);  o.response = null; });
                responses = responses.filter(function(o) { return o.response != null });
                
                for(var userId in users) { users[userId] -= 1; }
                responses.forEach(function(o) { users[o.userId] = 2; });
                for(var userId in users) if(users[userId] <= 0) { delete users[userId]; }
            }, 5000);
            
            for(var i = 0; i < _onCreate.length; i++) { _onCreate[i].call(this, id, this); }
        };
    })();
    
    var channels = {};
    
    var nextUserId = (function() {
        var userId = (new Date()).getTime();
        return function nextUserId() { return (userId++).toString(); };
    })();
    
    (function() { // Info
        var regSend = new RegExp("/channel/([a-zA-Z0-9_-]+)/info");
        srv.patterns.push({
            test: function(req) { return regSend.test(url.parse(req.url).pathname); },
            handler: function(req, res) {
                var uri = url.parse(req.url, true);
                var channelId = regSend.exec(uri.pathname)[1];
                
                channels[channelId] = channels[channelId] || (new Channel(channelId));
                
                var userId = req.headers["cookie"] || nextUserId();
                var type = uri.query["type"];
                channels[channelId].info(userId, type, res);
            }
        });
    })();
    
    (function() { // Send
        var regSend = new RegExp("/channel/([a-zA-Z0-9_-]+)/send");
        srv.patterns.push({
            test: function(req) { return regSend.test(url.parse(req.url).pathname); },
            handler: function(req, res) {
                var uri = url.parse(req.url, true);
                var channelId = regSend.exec(uri.pathname)[1];
                
                channels[channelId] = channels[channelId] || (new Channel(channelId));
                
                var userId = req.headers["cookie"] || nextUserId();
                var content = JSON.parse(uri.query["msg"]);
                var infoId = channels[channelId].send(userId, content).toString();
                
                // reply new info to listeners
                res.sendHeader(200, { "Content-Length": infoId.length,
                                      "Content-Type": "text/plain",
                                      "Cache-Control": "no-cache",
                                      "Set-Cookie": userId + "; path=/;"});
                res.write(infoId);
                res.close();
            }
        });
    })();
    
    (function() { // Read
        var regRead = new RegExp("/channel/([a-zA-Z0-9_-]+)/read");
        srv.patterns.push({
            test: function(req) { return regRead.test(url.parse(req.url).pathname); },
            handler: function(req, res) { 
                var uri = url.parse(req.url, true);
                var channelId = regRead.exec(uri.pathname)[1];
                
                channels[channelId] = channels[channelId] || (new Channel(channelId));
                
                var userId = req.headers["cookie"] || nextUserId();
                var infoId = parseInt(uri.query["info-id"], 10) || 0;
                channels[channelId].read(userId, infoId, res);
                
                sys.puts(req.headers["cookie"]);
            }
        });
    })();
    
    return { channels: channels, onCreate: function(callback) { _onCreate.push(callback); } };
})();