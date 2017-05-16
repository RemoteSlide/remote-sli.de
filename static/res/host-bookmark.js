(function () {
    $.getScript("https://cdnjs.cloudflare.com/ajax/libs/socket.io/2.0.1/socket.io.js", function () {
        $.getScript("https://remote-sli.de/js/vector.js");

        var socket = io("https://remote-sli.de");

        $("body").append("<div id='remoteSlideOverlayHtmlContainer'></div>");
        $("#remoteSlideOverlayHtmlContainer").load("https://remote-sli.de/res/overlay.html");

        socket.on("init", function (data) {
            if (data.state == "start") {
                console.info("Initializing session #" + remote_slide.session);
                setTimeout(function () {
                    socket.emit("init", {iAm: "host", session: remote_slide.session});
                }, 500);
                status("orange", "question", "");
            } else if (data.state == "success") {
                console.info("Session initialized");
                status("green", "check", "", 5000);
            }
        });

        socket.on("control", function (msg) {
            var keyCode = msg.keyCode;
            var ctrlKey = msg.keys && msg.keys.ctrl;
            var shiftKey = msg.keys && msg.keys.shift;
            var altKey = msg.keys && msg.keys.alt;

            // alert("Control: " + keyCode);
            console.log("Remote Key Event: " + (ctrlKey ? "[ctrl] + " : shiftKey ? "[shift] + " : altKey ? "[alt] + " : "") + keyCode);
            keyEvent(keyCode, ctrlKey, shiftKey, altKey);
        });

        var laserPointer = {
            setupVectorsRaw: [
                [0, 0, 0],// top left
                [0, 0, 0],// top right
                [0, 0, 0],// bottom left
                [0, 0, 0]// bottom right
            ],
            setupVectors: [],
            currentVectorRaw: [],
            currentVector: [],
            currentPoint: [],
            lastMessage: 0,
            visible: false,
            hideTimer: setInterval(function () {
                if (new Date().valueOf() - laserPointer.lastMessage > 200) {
                    if (laserPointer.visible) {
                        laserPointer.visible = false;
                        $("#rs-laser-dot").fadeOut("fast");
                        console.log("fade out")
                    }
                }
            }, 500)
        };
        socket.on("deviceOrientation", function (msg) {
            laserPointer.lastMessage = new Date().valueOf();
            var yaw = msg.vector[0];
            var pitch = msg.vector[1];

            if (msg.setup) {
                laserPointer.setupVectorsRaw[msg.setupStep] = msg.vector;

                laserPointer.setupVectors[msg.setupStep] = new Vector(
                    Math.sin(pitch) * Math.cos(yaw),
                    Math.sin(pitch) * -Math.sin(yaw),
                    Math.cos(pitch)
                );
            } else {
                laserPointer.currentVectorRaw = msg.vector;

                var screenWidth = $(window).width() - 10;
                var screenHeight = $(window).height() - 10;

                var vector = msg.vector;
                // var rotation = rv_to_rot(vector[0], vector[1], vector[2]);
                // var ya = [[0.0], [1.0], [0.0]];
                // var xa = [[1.0], [0.0], [0.0]];
                // var ty = mmulti(rotation, ya);
                // var tx = mmulti(rotation, xa);
                // console.log(ty);
                // console.log(tx);
                // var cx = ty[0][0] * screenWidth + screenWidth / 2.0;
                // var cy = -ty[2][0] * screenHeight + screenHeight / 2.0;

                var cx = screenWidth * vector[0] / 90;
                var cy = screenHeight * vector[1] / 90;

                cx = screenWidth - Math.abs(cx);
                cx = Math.min(screenWidth, cx);

                cy = screenHeight - Math.abs(cy);
                cy = Math.min(screenHeight, cy);

                console.log("Screen: " + screenWidth + "," + screenHeight)
                console.info("Cursor Position: " + cx + "," + cy);
                laserPointer.currentPoint = [cx, cy];

                if (!laserPointer.visible) {
                    console.log("fade in")
                    $("#rs-laser-dot").fadeIn(50);
                    laserPointer.visible = true;
                }

                $("#rs-laser-dot").css("left", cx).css("top", cy);
            }
            console.log(laserPointer)
        })


        // TODO: understand this shit
        function mmulti(a, b) {
            if (a.length != b.length)
                return undefined;

            var c = [];
            var m = a.length;
            var n = b[0].length;
            var l = a[0].length;

            for (var i = 0; i < m; i++) {
                var r = [];
                for (var j = 0; j < n; j++) {
                    var t = 0.0;
                    for (var k = 0; k < l; k++) {
                        t += a[i][k] * b[k][j];
                    }
                    r.push(t);
                }
                c.push(r);
            }
            return c;
        }

        // TODO: understand this shit
        function rv_to_rot(x, y, z) {
            var xx = Math.pow(x, 2);
            var yy = Math.pow(y, 2);
            var zz = Math.pow(z, 2);
            var w = 1.0 - xx - yy - zz;

            var xy = x * y;
            var zw = z * w;
            var xz = x * z;
            var yw = y * w;
            var yz = y * z;
            var xw = x * w;

            return [
                [1.0 - 2 * yy - 2 * zz, 2 * xy - 2 * zw, 2 * xz + 2 * yw],
                [2 * xy + 2 * zw, 1.0 - 2 * xx - 2 * zz, 2 * yz - 2 * xw],
                [2 * xz - 2 * yw, 2 * yz + 2 * xw, 1 - 2 * xx - 2 * yy]
            ]
        }


        function keyEvent(keyCode, ctrlKey, shiftKey, altKey) {
            var event = new Event("keydown");
            event.keyCode = keyCode;
            event.which = keyCode;

            event.ctrlKey = ctrlKey;
            event.shiftKey = shiftKey;
            event.altKey = altKey;

            document.dispatchEvent(event);
            document.body.dispatchEvent(event);
            window.dispatchEvent(event);
        }

        socket.on("err", function (msg) {
            alert("Slide Error #" + msg.code + ": " + msg.msg)
        });

        function status(color, type, msg, timeout) {
            // $(".remote-slide-overlay-status").fadeOut(function() {
            //     $("#remoteSlideStatusIcons").css("color", color);
            //     $("#remoteSlideStatus-" + type).fadeIn();
            //     if (timeout) {
            //         setTimeout(function () {
            //             $("#remoteSlideStatus-" + type).fadeOut();
            //         }, timeout)
            //     }
            // });
        }
    });
})();