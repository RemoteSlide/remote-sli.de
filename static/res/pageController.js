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
        try {
            chrome.runtime.sendMessage({action: "session_initialized"}, function (response) {
            });
        } catch (ignored) {
        }
    }
});
try {
    chrome.extension.onMessage.addListener(function (msg, sender, sendResponse) {
        console.log(msg)
        if (msg.action == 'state_request') {
            chrome.runtime.sendMessage({action: "session_initialized"}, function (response) {
            });
        }
    });
} catch (ignored) {
}

socket.on("control", function (msg) {
    var keyCode = msg.keyCode;
    var ctrlKey = msg.keys && msg.keys.ctrl;
    var shiftKey = msg.keys && msg.keys.shift;
    var altKey = msg.keys && msg.keys.alt;

    // alert("Control: " + keyCode);
    console.log("Remote Key Event: " + (ctrlKey ? "[ctrl] + " : shiftKey ? "[shift] + " : altKey ? "[alt] + " : "") + keyCode);
    simulateKeyEvent(keyCode, ctrlKey, shiftKey, altKey);
});
//// http://stackoverflow.com/questions/26816306/is-there-a-way-to-simulate-pressing-multiple-keys-on-mouse-click-with-javascript
function simulateKeyEvent(keyCode, ctrlKey, shiftKey, altKey) {
    // Prepare function for injection into page
    function injected() {
        // Adjust as needed; some events are only processed at certain elements
        var element = document.body;
        var keyCode = ___keyCode;

        function keyEvent(el, ev) {
            var eventObj = document.createEvent("Events");
            eventObj.initEvent(ev, true, true);

            // Edit this to fit
            eventObj.keyCode = keyCode;
            eventObj.which = keyCode;
            //TODO: fix this
            // eventObj.ctrlKey = ctrlKey;
            // eventObj.shiftKey = shiftKey;
            // eventObj.altKey = altKey;

            el.dispatchEvent(eventObj);
        }

        // Trigger all 3 just in case
        keyEvent(element, "keydown");
        keyEvent(element, "keypress");
        keyEvent(element, "keyup");
    }

    // Inject the script
    var script = document.createElement('script');
    script.textContent = "(" + injected.toString().replace("___keyCode", keyCode) + ")();";
    // console.log(script.textContent)
    (document.head || document.documentElement).appendChild(script);
    script.parentNode.removeChild(script);
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
    style: {
        color: 'red'
        //TODO: width & height
    },
    applyStyle: function () {
        var element = $("#rs-laser-dot");
        $.each(laserPointer.style, function (key, value) {
            element.css(key, value);
        })
    },
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
    var $element = which == 'all' ? $(".laser-calibration-dot, .laser-calibration-backdrop") : which == 'start' ? $(".laser-calibration-backdrop") : $(".laser-calibration-dot." + which);
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
socket.on("laserStyle", function (msg) {
    laserPointer.style = msg.style;
    laserPointer.applyStyle();
});

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