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
        if (now - session.lastActivity > 1.8e+6) {// 30 mins
            expiredSessions.push(key);
        }
    });

    console.info("Cleaning up " + expiredSessions.length + " expired sessions...");
    expiredSessions.forEach(function (session) {
        delete sessions[session];
    });
}).every(30, "minutes").start();

app.set('view engine', 'ejs');
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
            host: undefined,
            remotes: []
        };

        console.info("New Session: " + sessionId)
    } else {
        sessions[sessionId].lastActivity = new Date().valueOf();
    }

    // Set session cookie
    cookies.set("rs-session-id", sessionId, {
        maxAge: 1.2e+6
    });

    qrcode.toDataURL("https://remote-sli.de/" + sessionId, {margin: 1, scale: 5}, function (err, url) {
        res.send({
            session: sessionId,
            qr: url
        })
    });
});

app.get("*", function (req, res) {
    res.sendFile(__dirname + "/views/index.html");
});

// app.get('/', function (req, res) {
//     var cookies = new Cookies(req, res);
//
//     // First check if there's an old session
//     var sessionId = cookies.get("rs-session-id");
//     if (!sessionId || !sessions[sessionId]) {
//         // Or create a new one
//         sessionId = randomstring.generate(10);
//
//         sessions[sessionId] = {
//             id: sessionId,
//             lastActivity: new Date().valueOf(),
//             host: undefined,
//             remotes: []
//         };
//
//         console.info("New Session: " + sessionId)
//     } else {
//         sessions[sessionId].lastActivity = new Date().valueOf();
//     }
//
//     qrcode.toDataURL("https://remote-sli.de/r/" + sessionId, {margin: 1, scale: 5}, function (err, url) {
//         res.render("index", {
//             sessionId: sessionId,
//             sessionQrCode: url
//         });
//     });
//
//     // Set session cookie
//     cookies.set("rs-session-id", sessionId, {
//         maxAge: 1.2e+6
//     });
// });
// app.get('/remote/:session?', function (req, res) {
//     var session = req.params.session;
//     res.render("remote", {
//         session: session
//     })
// });
// app.get("/host", function (req, res) {
//     res.render("host");
// })
//
// app.get("/r/:session?", function (req, res) {
//     res.redirect("/remote/" + req.params.session);
// });

io.on('connection', function (socket) {
    console.log("connection");
    socket.emit("init", {state: "start"});

    socket.on('init', function (msg) {
        console.log(msg)
        var clientType = msg["iAm"];// either 'host' or 'remote'
        if ('host' !== clientType && 'remote' !== clientType) {
            socket.emit("err", {code: 400, msg: "Invalid client type"});
            return;
        }
        var sessionId = msg["session"];

        var session = sessions[sessionId];
        if (!session) {
            socket.emit("err", {code: 404, msg: "Session not found"});
            return;
        }

        // Assign session ID
        socket.clientType = clientType;
        socket.sessionId = sessionId;

        if (socket.clientType == 'host') {
            session.host = socket;
        }
        if (socket.clientType == 'remote') {
            session.remotes.push(socket);
        }

        socket.emit("init", {state: "success"});
        console.log("[+]" + (clientType == 'host' ? "Host" : 'Remote' ) + " for #" + sessionId + " connected (Host: " + (session.host ? "connected" : "not connected") + ", " + session.remotes.length + " Remotes connected)");
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

            if (session.host) {
                session.host.emit("control", {keyCode: keyCode});
            } else {
                //TODO: maybe change to err
                socket.emit("info", {code: 200, msg: "Session host not yet connected"});
            }

            session.lastActivity = new Date().valueOf();

            session.remotes.forEach(function (remote) {
                remote.emit("control", {keyCode: keyCode});
            })
        }
    });

    socket.on('disconnect', function () {
        if (socket.sessionId) {
            // Remove the client
            var session = sessions[socket.sessionId];
            if (session) {
                if (socket.clientType == 'host') {
                    session.host = undefined;
                    console.log("[-] Host of #" + socket.sessionId + " disconnected (Host: " + (session.host ? "connected" : "not connected") + ", " + session.remotes.length + " Remotes connected)");
                }
                if (socket.clientType == 'remote') {
                    var index = session.remotes.indexOf(socket);
                    if (index !== -1) {
                        session.remotes.splice(index, 1);
                    }
                    console.log("[-] A remote of #" + socket.sessionId + " disconnected (Host: " + (session.host ? "connected" : "not connected") + ", " + session.remotes.length + " Remotes connected)")
                }
            }
        }
    });
});


http.listen(port, function () {
    console.log('listening on *:' + port);
});
//
// process.on('uncaughtException', function (err) {
//     console.info(util.inspect(err, {colors: true}));
// });