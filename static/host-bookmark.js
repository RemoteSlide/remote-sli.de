(function () {
    // Load dependencies
    $.getScript("https://code.jquery.com/jquery-3.2.1.min.js");

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

        // alert("Control: " + keyCode);
        console.log("Remote Key Event: " + keyCode);
        keyEvent(keyCode);
    });

    function keyEvent(keyCode) {
        var event = new Event("keydown");
        event.keyCode = keyCode;
        event.which = keyCode;

        document.dispatchEvent(event);
        document.body.dispatchEvent(event);
        window.dispatchEvent(event);
    }

    socket.on("err", function (msg) {
        alert("Slide Error #" + msg.code + ": " + msg.msg)
    });
})();