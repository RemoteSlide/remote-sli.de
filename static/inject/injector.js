/*
 * Bookmarklet loader. bookmark.js drops this script into the presentation
 * page (after making sure jQuery is around); it then pulls in the page
 * controller from the RemoteSlide-Controller submodule served under
 * /inject/controller/. The extension has its own copy of these files and
 * injects them directly.
 */
(function () {
    var base = "https://remote-sli.de";

    // Loaded in order: attrchange (slide index tracking), the socket client,
    // then the controller that uses both.
    var scripts = [
        base + "/inject/lib/attrchange.js",
        base + "/inject/controller/rs-socket.js",
        base + "/inject/controller/pageController.js"
    ];

    function loadNext() {
        var src = scripts.shift();
        if (!src) {
            console.info("[RS] Injection complete.");
            return;
        }
        $.getScript(src).done(loadNext).fail(function (jqxhr, settings, error) {
            console.error("[RS] Failed to load " + src, error);
        });
    }

    console.info("[RS] Injecting controller...");
    $("body").append("<div id='remoteSlideOverlayHtmlContainer'></div>");
    $("#remoteSlideOverlayHtmlContainer").load(base + "/inject/controller/overlay.html", loadNext);
})();
