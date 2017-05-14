javascript:if (!remote_slide) {
    console.log("hi");
    var remote_slide = {
        session: ':sessionId:'
    };
    (function () {
        var sc = document.createElement('SCRIPT');
        sc.type = 'text/javascript';
        sc.src = "https://cdnjs.cloudflare.com/ajax/libs/socket.io/2.0.1/socket.io.js";
        sc.onload = function () {
            var sc = document.createElement('SCRIPT');
            sc.type = 'text/javascript';
            sc.src = "https://remote-sli.de/host-bookmark.min.js";
            document.getElementsByTagName('head')[0].appendChild(sc);
        };
        document.getElementsByTagName('head')[0].appendChild(sc);
    })();
}