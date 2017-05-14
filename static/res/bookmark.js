javascript:if (!remote_slide) {
    console.log("hi");
    var remote_slide = {
        session: ':sessionId:'
    };
    (function () {
        var sc = document.createElement('SCRIPT');
        sc.type = 'text/javascript';
        sc.src = "https://code.jquery.com/jquery-3.2.1.min.js";
        sc.onload = function () {
            var sc = document.createElement('SCRIPT');
            sc.type = 'text/javascript';
            sc.src = "https://remote-sli.de/res/host-bookmark.js";
            document.getElementsByTagName('head')[0].appendChild(sc);
        };
        document.getElementsByTagName('head')[0].appendChild(sc);
    })();
}