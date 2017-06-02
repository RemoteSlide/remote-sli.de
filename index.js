var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var randomstring = require("randomstring");
var qrcode = require("qrcode");
var repeat = require("repeat");
var cookieParser = require("cookie-parser");
var Cookies = require("cookies");
var port = 3011;

require('console-stamp')(console, 'HH:MM:ss.l');


/*

 "-sessionId-": {
 lastActivity: -timestamp-,
 host: -socket-,
 remotes: [-socket-],

 }

 */
var sessions = {};

repeat(function () {
    var expiredSessions = [];
    var now = new Date().valueOf();
    Object.keys(sessions).forEach(function (key) {
        var session = sessions[key];
        if (now - session.lastActivity > 3.6e+6) {// 1 hour
            expiredSessions.push(key);
        }
    });

    if (expiredSessions.length > 0) {
        console.info("Cleaning up " + expiredSessions.length + " expired sessions (" + (Object.keys(sessions).length - expiredSessions.length) + " remaining)...");
        expiredSessions.forEach(function (session) {
            delete sessions[session];
        });
    }
}).every(30, "minutes").during(function () {
    return true;
}).start();

app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        return res.send(200);
    } else {
        return next();
    }
});
app.use(express.static("static"));
app.use(cookieParser());

app.get("/download/extension/chrome", function (req, res) {
    res.redirect("https://github.com/RemoteSlide/RemoteSlide-Chrome/archive/master.zip");
});


app.get("/api/session", function (req, res) {// Continue or create session
    var cookies = new Cookies(req, res);

    // First check if there's an old session
    var sessionId = cookies.get("rs-session-id");
    if (!sessionId || !sessions[sessionId]) {
        // Or create a new one
        sessionId = randomstring.generate(10);

        sessions[sessionId] = {
            id: sessionId,
            lastActivity: new Date().valueOf(),
            observer: undefined,
            host: undefined,
            remotes: [],
            remoteCounter: 0
        };

        console.info("New Session: " + sessionId)
    } else {
        sessions[sessionId].lastActivity = new Date().valueOf();
    }

    // Set session cookie
    cookies.set("rs-session-id", sessionId, {
        maxAge: 3.6e+6
    });

    qrcode.toDataURL("https://remote-sli.de/" + sessionId, {margin: 1, scale: 10}, function (err, url) {
        res.send({
            session: sessionId,
            qr: url
        })
    });
});

app.get("*", function (req, res) {
    // redirects
    if ('remote-slide.ga' == req.headers.host || 'www.remote-sli.de' == req.headers.host) {
        res.redirect("https://remote-sli.de" + req.originalUrl);
        return;
    }

    res.sendFile(__dirname + "/views/index.html");
});

function getConnectionInfo(session) {
    var r = [];
    session.remotes.forEach(function (item1) {
        r.push({
            id: item1.remoteId
        })
    });
    return {
        observer: session.observer ? true : false,
        host: session.host ? true : false,
        remotes: r
    };
}

io.on('connection', function (socket) {
    console.log("connection");
    socket.emit("init", {state: "start"});

    socket.on('init', function (msg) {
        console.log(msg)
        var clientType = msg["iAm"];// either 'host', 'remote' or 'observer'
        if ('host' !== clientType && 'remote' !== clientType && 'observer' !== clientType) {
            socket.emit("err", {code: 400, msg: "Invalid client type"});
            return;
        }
        var sessionId = msg["session"];

        var session = sessions[sessionId];
        if (!session) {
            socket.emit("err", {code: 404, msg: "Session not found"});
            socket.emit("init", {state: "not_found"});
            return;
        }

        // Assign session ID
        socket.clientType = clientType;
        socket.sessionId = sessionId;
        if (msg.injector) {
            session.injectorType = msg.injector;
        }

        if (socket.clientType == 'observer') {
            if (session.observer) {
                session.observer.disconnect();
            }
            session.observer = socket;
        }
        if (socket.clientType == 'host') {
            if (session.host) {
                session.host.disconnect();
            }
            session.host = socket;
            if (session.observer) {
                session.observer.emit("info", {type: "client_connected", clientType: "host", info: getConnectionInfo(session), who: "host"});
            }
            session.remotes.forEach(function (remote) {
                remote.emit("info", {type: "client_connected", clientType: "host", info: getConnectionInfo(session), who: "host"});
            });
        }
        if (socket.clientType == 'remote') {
            socket.remoteId = session.remoteCounter++;
            session.remotes.push(socket);
            if (session.observer) {
                session.observer.emit("info", {type: "client_connected", clientType: "remote", info: getConnectionInfo(session), who: socket.remoteId});
            }
            if (session.host) {
                session.host.emit("info", {type: "client_connected", clientType: "remote", info: getConnectionInfo(session), who: socket.remoteId});
            }
        }

        socket.emit("init", {state: "success", youAre: clientType, info: getConnectionInfo(session)});
        console.log("[+]" + (clientType == 'host' ? "Host" : clientType == 'remote' ? "Remote" : clientType == 'observer' ? "Observer" : "???" ) + " for #" + sessionId + " connected (Host: " + (session.host ? "connected" : "not connected") + ", " + session.remotes.length + " Remotes connected)");
    });

    socket.on("control", function (msg) {
        console.log(msg);
        if (!socket.sessionId || !socket.clientType) {
            socket.emit("err", {code: 400, msg: "Invalid session"});
            return;
        }
        var session = sessions[socket.sessionId];
        if (!session) {
            socket.emit("err", {code: 400, msg: "Invalid session"});
            return;
        }

        // we should only need to listen for control messages by clients
        if (socket.clientType == 'remote') {
            var keyCode = msg["keyCode"];

            if (!keyCode) {
                socket.emit("err", {code: 400, msg: "Missing keyCode"});
                return;
            }

            var keys = {};
            if (msg.keys && msg.keys.ctrl)
                keys.ctrl = true;
            if (msg.keys && msg.keys.shift)
                keys.shift = true;
            if (msg.keys && msg.keys.alt)
                keys.alt = true;

            if (session.host) {
                session.host.emit("control", {keyCode: keyCode, keys: keys});
            } else {
                //TODO: maybe change to err
                socket.emit("info", {code: 200, msg: "Session host not yet connected"});
            }

            session.lastActivity = new Date().valueOf();

            session.remotes.forEach(function (remote) {
                remote.emit("control", {keyCode: keyCode, keys: keys});
            })
        }
    });

    socket.on("_forward", function (data) {
        console.log(data)
        if (!socket.sessionId || !socket.clientType) {
            socket.emit("err", {code: 400, msg: "Invalid session"});
            return;
        }
        var session = sessions[socket.sessionId];
        if (!session) {
            socket.emit("err", {code: 400, msg: "Invalid session"});
            return;
        }

        if (!data.event) {
            socket.emit("err", {code: 400, msg: "Missing 'event' value for forward"});
            return;
        }
        var event = data.event;
        delete data.event;

        session.lastActivity = new Date().valueOf();

        if (socket.clientType == 'remote') {
            data.from = socket.remoteId;
            if (session.host) {
                session.host.emit(event, data);
            } else {
                //TODO: maybe change to err
                socket.emit("info", {code: 200, msg: "Session host not yet connected"});
            }
        } else if (socket.clientType == 'host') {
            data.from = "host";
            if (session.remotes.length > 0) {
                session.remotes.forEach(function (remote) {
                    remote.emit(event, data);
                })
            } else {
                //TODO: maybe change to err
                socket.emit("info", {code: 200, msg: "No session remotes are connected yet"});
            }
        }
    });

    socket.on('latency', function () {
        socket.emit('latency', {t: Date.now()});
    });

    socket.on('disconnect', function () {
        if (socket.sessionId) {
            // Remove the client
            var session = sessions[socket.sessionId];
            if (session) {
                if (socket.clientType == 'observer') {
                    session.observer = undefined;
                    console.log("[-] Observer of #" + socket.sessionId + " disconnected (Observer: " + (session.observer ? "connected" : "not connected") + ", Host: " + (session.host ? "connected" : "not connected") + ", " + session.remotes.length + " Remotes connected)");
                }
                if (socket.clientType == 'host') {
                    session.host = undefined;
                    console.log("[-] Host of #" + socket.sessionId + " disconnected (Observer: " + (session.observer ? "connected" : "not connected") + ", Host: " + (session.host ? "connected" : "not connected") + ", " + session.remotes.length + " Remotes connected)");

                    if (session.observer) {
                        session.observer.emit("info", {type: "client_disconnected", clientType: "host", info: getConnectionInfo(session), who: "host"});
                    }
                    session.remotes.forEach(function (remote) {
                        remote.emit("info", {type: "client_disconnected", clientType: "host", info: getConnectionInfo(session), who: "host"});
                    });
                }
                if (socket.clientType == 'remote') {
                    var index = session.remotes.indexOf(socket);
                    if (index !== -1) {
                        session.remotes.splice(index, 1);
                    }
                    console.log("[-] A remote of #" + socket.sessionId + " disconnected (Observer: " + (session.observer ? "connected" : "not connected") + ", Host: " + (session.host ? "connected" : "not connected") + ", " + session.remotes.length + " Remotes connected)")

                    if (session.observer) {
                        session.observer.emit("info", {type: "client_disconnected", clientType: "remote", info: getConnectionInfo(session), who: socket.remoteId});
                    }
                    if (session.host) {
                        session.host.emit("info", {type: "client_disconnected", clientType: "remote", info: getConnectionInfo(session), who: socket.remoteId});
                    }
                    session.remotes.forEach(function (remote) {
                        remote.emit("info", {type: "client_disconnected", clientType: "remote", info: getConnectionInfo(session), who: socket.remoteId});
                    });
                }
            }
        }
    });
});


http.listen(port, function () {
    console.log('listening on *:' + port);
});