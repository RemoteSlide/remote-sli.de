(function () {
    $.getScript("https://cdnjs.cloudflare.com/ajax/libs/socket.io/2.0.1/socket.io.js", function () {
        $("body").append("<div id='remoteSlideOverlayHtmlContainer'></div>");
        $("#remoteSlideOverlayHtmlContainer").load("https://remote-sli.de/res/overlay.html");

        $.getScript("https://remote-sli.de/res/pageController.js");
    });
})();