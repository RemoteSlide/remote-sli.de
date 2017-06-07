var express = require('express');
var app = express();
var http = require('http');
var https = require("https");
var server = http.Server(app);
var io = require('socket.io')(server, {'pingInterval': 2000, 'pingTimeout': 5000});
var randomstring = require("randomstring");
var qrcode = require("qrcode");
var repeat = require("repeat");
var cookieParser = require("cookie-parser");
var Cookies = require("cookies");
var storage = require("node-persist");
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

storage.initSync();
{
    var s = storage.getItemSync("sessions") || [];
    console.log("Loading " + s.length + " sessions from storage...");
    s.forEach(function (item) {
        sessions[item.id] = {
            id: item.id,
            lastActivity: item.lastActivity,
            observer: undefined,
            host: undefined,
            remotes: [],
            clientCounter: item.clientCounter
        };
    })
}

function exitHandler() {
    console.log(sessions)
    var s = [];
    Object.keys(sessions).forEach(function (key) {
        var session = sessions[key];
        s.push({
            id: session.id,
            lastActivity: session.lastActivity,
            clientCounter: session.clientCounter
        })
    });
    console.log("Saving " + s.length + " sessions to storage...");
    storage.setItemSync("sessions", s);
    process.exit();
}

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
            clientCounter: 0
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
            id: item1.rs.clientId,
            latency: item1.rs.latency,
            settings: item1.rs.settings,
            ip: item1.realAddress
        })
    });
    return {
        observer: session.observer ? {
            id: session.observer.rs.clientId,
            latency: session.observer.rs.latency,
            ip: session.observer.realAddress
        } : false,
        host: session.host ? {
            id: session.host.rs.clientId,
            latency: session.host.rs.latency,
            ip: session.host.realAddress,
            injector: session.injectorType
        } : false,
        remotes: r
    };
}

io.on('connection', function (socket) {
    socket.realAddress = socket.handshake.headers["x-real-ip"];
    console.log("connection: " + socket.realAddress);
    socket.emit("init", {state: "start"});

    socket.rs = {};

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
        socket.rs = {
            sessionId: sessionId,
            clientId: session.clientCounter++,
            clientType: clientType,
            injectorType: msg.injector
        };
        if (msg.injector) {
            session.injectorType = msg.injector;
        }

        if (socket.rs.clientType == 'observer') {
            if (session.observer) {
                session.observer.disconnect();
            }
            session.observer = socket;
        }
        if (socket.rs.clientType == 'host') {
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
        if (socket.rs.clientType == 'remote') {
            session.remotes.push(socket);
            if (session.observer) {
                session.observer.emit("info", {type: "client_connected", clientType: "remote", info: getConnectionInfo(session), who: socket.rs.clientId});
            }
            if (session.host) {
                session.host.emit("info", {type: "client_connected", clientType: "remote", info: getConnectionInfo(session), who: socket.rs.clientId});
            }
        }

        socket.emit("init", {state: "success", youAre: clientType, yourId: socket.rs.clientId, info: getConnectionInfo(session)});
        console.log("[+]" + (clientType == 'host' ? "Host" : clientType == 'remote' ? "Remote" : clientType == 'observer' ? "Observer" : "???" ) + " for #" + sessionId + " connected (Host: " + (session.host ? "connected" : "not connected") + ", " + session.remotes.length + " Remotes connected)");
    });

    socket.on("control", function (msg) {
        console.log(msg);
        if (!socket.rs.sessionId || !socket.rs.clientType) {
            socket.emit("err", {code: 400, msg: "Invalid session"});
            return;
        }
        var session = sessions[socket.rs.sessionId];
        if (!session) {
            socket.emit("err", {code: 400, msg: "Invalid session"});
            return;
        }

        // we should only need to listen for control messages by clients
        if (socket.rs.clientType == 'remote') {
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
        if (!socket.rs.sessionId || !socket.rs.clientType) {
            socket.emit("err", {code: 400, msg: "Invalid session"});
            return;
        }
        var session = sessions[socket.rs.sessionId];
        if (!session) {
            socket.emit("err", {code: 400, msg: "Invalid session"});
            return;
        }

        if (!data.event) {
            socket.emit("err", {code: 400, msg: "Missing 'event' value for forward"});
            return;
        }
        if (data.event != 'screenshot')
            console.log(JSON.stringify(data))
        var event = data.event;
        delete data.event;

        session.lastActivity = new Date().valueOf();

        if (event == "settings") {
            socket.rs.settings = data.settings;
        }

        data.from = socket.rs.clientId;
        if (socket.rs.clientType == 'remote') {
            data.fromType = "remote";
            if (session.host) {
                session.host.emit(event, data);
            } else {
                //TODO: maybe change to err
                socket.emit("info", {code: 200, msg: "Session host not yet connected"});
            }
        } else if (socket.rs.clientType == 'host') {
            data.fromType = "host";
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

    socket.on("_get", function (data) {
        console.log(data);
        if (!socket.rs || !socket.rs.sessionId)return;
        if (!sessions[socket.rs.sessionId])return;
        var what = data.what;
        if ("connectionInfo" == what) {
            socket.emit("connectionInfo", {info: getConnectionInfo(sessions[socket.rs.sessionId])})
        }
    });

    socket.on('latency', function (msg) {
        if (msg.l)socket.rs.latency = msg.l;
        socket.emit('latency', {t: Date.now()});
    });

    socket.on('disconnect', function () {
        if (socket.rs.sessionId) {
            // Remove the client
            var session = sessions[socket.rs.sessionId];
            if (session) {
                if (socket.rs.clientType == 'observer') {
                    session.observer = undefined;
                    console.log("[-] Observer of #" + socket.rs.sessionId + " disconnected (Observer: " + (session.observer ? "connected" : "not connected") + ", Host: " + (session.host ? "connected" : "not connected") + ", " + session.remotes.length + " Remotes connected)");
                }
                if (socket.rs.clientType == 'host') {
                    session.host = undefined;
                    console.log("[-] Host of #" + socket.rs.sessionId + " disconnected (Observer: " + (session.observer ? "connected" : "not connected") + ", Host: " + (session.host ? "connected" : "not connected") + ", " + session.remotes.length + " Remotes connected)");

                    if (session.observer) {
                        session.observer.emit("info", {type: "client_disconnected", clientType: "host", info: getConnectionInfo(session), who: "host"});
                    }
                    session.remotes.forEach(function (remote) {
                        remote.emit("info", {type: "client_disconnected", clientType: "host", info: getConnectionInfo(session), who: "host"});
                    });
                }
                if (socket.rs.clientType == 'remote') {
                    var index = session.remotes.indexOf(socket);
                    if (index !== -1) {
                        session.remotes.splice(index, 1);
                    }
                    console.log("[-] A remote of #" + socket.rs.sessionId + " disconnected (Observer: " + (session.observer ? "connected" : "not connected") + ", Host: " + (session.host ? "connected" : "not connected") + ", " + session.remotes.length + " Remotes connected)")

                    if (session.observer) {
                        session.observer.emit("info", {type: "client_disconnected", clientType: "remote", info: getConnectionInfo(session), who: socket.rs.clientId});
                    }
                    if (session.host) {
                        session.host.emit("info", {type: "client_disconnected", clientType: "remote", info: getConnectionInfo(session), who: socket.rs.clientId});
                    }
                    session.remotes.forEach(function (remote) {
                        remote.emit("info", {type: "client_disconnected", clientType: "remote", info: getConnectionInfo(session), who: socket.rs.clientId});
                    });
                }
            }
        }
    });
});


server.listen(port, function () {
    console.log('listening on *:' + port);
});

process.on("exit", exitHandler);
process.on("SIGINT", exitHandler);
process.on("uncaughtException", exitHandler);