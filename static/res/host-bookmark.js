(function () {
    $.getScript("https://cdnjs.cloudflare.com/ajax/libs/socket.io/2.0.1/socket.io.js", function () {
        var socket = io("https://remote-sli.de");

        socket.on("init", function (data) {
            if (data.state == "start") {
                console.info("Initializing session #" + remote_slide.session);
                socket.emit("init", {iAm: "host", session: remote_slide.session});
            } else if (data.state == "success") {
                console.info("Session initialized");
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

        socket.on("err", function (msg) {
            alert("Slide Error #" + msg.code + ": " + msg.msg)
        });
    });
})();