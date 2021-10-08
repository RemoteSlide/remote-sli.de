(function () {
    var inject = function () {
        console.info("[RS] Injecting controller...");
        $("body").append("<div id='remoteSlideOverlayHtmlContainer'></div>");
        $("#remoteSlideOverlayHtmlContainer").load("https://remote-sli.de/inject/controller/overlay.html");

        $.getScript("https://remote-sli.de/inject/controller/pageController.js", function () {
            console.info("[RS] Injection complete.");
        });
    };
    $.getScript("https://cdn.rawgit.com/meetselva/attrchange/master/js/attrchange.js");
    if (typeof window.io === "undefined" || typeof window.io.Socket === "undefined") {
        console.info("[RS] Loading socket.io");

        // store current io variable
        const currentIo = window.io;
        $.getScript("https://cdnjs.cloudflare.com/ajax/libs/socket.io/2.0.1/socket.io.js", function () {
            // move remoteslide io to its own variable
            window.remoteslideio = window.io;
            if (typeof currentIo !== "undefined") {
                // restore old one
                window.io = currentIo;
            }

            inject();
        });
    } else {
        console.info("[RS] socket.io already loaded");
        inject();
    }
})();
