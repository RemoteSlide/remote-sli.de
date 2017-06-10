javascript:if (!remote_slide) {
    console.log("hi");
    var remote_slide = {
        session: ':sessionId:',
        injector: 'bookmark'
    };
    (function () {
        var inject = function () {
            var sc = document.createElement('SCRIPT');
            sc.type = 'text/javascript';
            sc.src = "https://remote-sli.de/inject/injector.js";
            document.getElementsByTagName('head')[0].appendChild(sc);
        };

        if (typeof $ === "undefined") {
            console.info("[RS] Loading JQuery...");
            var sc = document.createElement('SCRIPT');
            sc.type = 'text/javascript';
            sc.src = "https://code.jquery.com/jquery-3.2.1.min.js";
            sc.onload = inject;
            document.getElementsByTagName('head')[0].appendChild(sc);
        } else {
            console.info("[RS] JQuery already loaded");
            inject();
        }
    })();
}