(function () {
    $.getScript("https://cdnjs.cloudflare.com/ajax/libs/socket.io/2.0.1/socket.io.js", function () {
        $("body").append("<div id='remoteSlideOverlayHtmlContainer'></div>");
        $("#remoteSlideOverlayHtmlContainer").load("https://remote-sli.de/res/overlay.html");

        var socket = io("https://remote-sli.de");
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
            range: {
                yaw: 90,// default
                pitch: 90// default
            },
            lastPoint: [],
            currentPoint: [],
            lastMessage: 0,
            visible: false,
            hideTimer: undefined
        };
        socket.on("deviceOrientation", function (msg) {
            laserPointer.lastMessage = new Date().valueOf();
            laserPointer.currentVectorRaw = msg.v;

            var screenWidth = $(window).width() - 10;
            var screenHeight = $(window).height() - 10;

            var vector = msg.v;

            var cx = screenWidth * vector[0] / laserPointer.range.yaw;//90
            var cy = screenHeight * vector[1] / laserPointer.range.pitch;//90

            cx = screenWidth - cx;


            cy = screenHeight - cy;


            $(".laser-pos").text(cx + ", " + cy)
            cx = Math.min(screenWidth, cx);
            cy = Math.min(screenHeight, cy);
            cx = Math.max(0, cx);
            cy = Math.max(0, cy);

            console.log("Screen: " + screenWidth + "," + screenHeight)
            console.info("Cursor Position: " + cx + "," + cy);
            laserPointer.currentPoint = [cx, cy];

            if (!laserPointer.visible) {
                console.log("fade in")
                $("#rs-laser-dot").fadeIn(50);
                laserPointer.visible = true;

                laserPointer.hideTimer = setInterval(function () {
                    if (new Date().valueOf() - laserPointer.lastMessage > 200) {
                        if (laserPointer.visible) {
                            laserPointer.visible = false;
                            $("#rs-laser-dot").fadeOut("fast");
                            console.log("fade out")

                            clearInterval(laserPointer.hideTimer);
                        }
                    }
                }, 200)
            }

            $("#rs-laser-dot").css("left", cx).css("top", cy);
            console.log(laserPointer)
        })

        socket.on("calibrationDot", function (msg) {
            var action = msg.action;
            var which = msg.which;
            var $element = $(".laser-calibration-dot." + which);
            if (action == 'show') {
                $element.fadeIn();
            } else if (action == 'hide') {
                $element.fadeOut();
            }
        })
        socket.on("orientationRange", function (msg) {
            console.info("Orientation Range")
            console.info(msg)
            laserPointer.range = msg;
        })


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