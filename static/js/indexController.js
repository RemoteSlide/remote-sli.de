authApp.controller("indexController", ["$scope", "$http", "$cookies", "$timeout", "$interval", "$location", function ($scope, $http, $cookies, $timeout, $interval, $location) {
    $http.get("/api/session").then(function (data) {
        data = data.data;
        $.extend($scope.session, data);
        $http.get("/res/bookmark.js").then(function (data) {
            data = data.data;
            console.log(data)
            data = data.replace(":sessionId:", $scope.session.session);
            $scope.session.bookmarkContent = data;
            $("#session-bookmark").attr("href", data);

            // Wait for socket init
            var socket = $scope.socket = io();
            socket.on("init", function (data) {
                console.log("init: " + JSON.stringify(data));
                if (data.state == "start") {
                    console.info("Initializing Session #" + $scope.session.session)
                    $timeout(function () {
                        socket.emit("init", {iAm: "observer", session: $scope.session.session});
                    }, 500);
                } else if (data.state == "success") {
                    console.info("Session initialized.")
                    $timeout(function () {
                        $scope.session.initialized = true;
                        $scope.session.type = data.youAre;
                        $scope.statusIcon.showMessage("check", "lime");

                        // Notify extension
                        try {
                            chrome.runtime.sendMessage($scope.chromeExtensionId, {session: $scope.session}, function () {
                            });
                        } catch (ignoerd) {
                        }
                    });
                } else if (data.state == "not_found") {// This should be impossible here, since the observer generates the new session ID
                    console.warn("Session not found");
                    $timeout(function () {
                        $scope.statusIcon.showMessage("times", "red", "Session not found", 20000);
                    })
                    $timeout(function () {
                        window.location.reload(true);
                    }, 500);
                }
            })
            socket.on("info", function (data) {
                console.log(data);
                if (data.type == 'client_connected') {
                    $scope.session.info = data.info;
                    if (data.clientType == 'remote') {
                        $scope.statusIcon.showMessage("check", "lime", "Remote connected", 2500);
                    } else if (data.clientType == 'host') {
                        $scope.statusIcon.showMessage("check", "lime", "Host connected", 2500);
                    }
                }
                if (data.type == 'client_disconnected') {
                    $scope.session.info = data.info;
                    if (data.clientType == 'remote') {
                        $scope.statusIcon.showMessage("times", "red", "Remote disconnected", 2000, function () {
                            $scope.statusIcon.showMessage("check", "lime");
                        });
                    } else if (data.clientType == 'host') {
                        $scope.statusIcon.showMessage("times", "red", "Host disconnected", 2000, function () {
                            $scope.statusIcon.showMessage("check", "lime");
                        });
                    }
                }
            })

            //// Latency
            var startTime;
            setInterval(function () {
                startTime = Date.now();
                socket.emit('latency', {t: startTime});
            }, 2000);
            socket.on('latency', function () {
                $timeout(function () {
                    $scope.session.latency = Date.now() - startTime;
                });
            });
        })
    });

    $scope.qrCodeScan = {
        start: function () {
            $("#qrScanner").empty();

            $("#qrScannerModal").modal("show");
            $timeout(function () {
                $scope.qrCodeScan.status = "scanning";
                $("#qrScanner").html5_qrcode(function (data) {
                    console.info(data)
                    //TODO show different status on invalid data
                    $timeout(function () {
                        $scope.qrCodeScan.status = "success";
                        if (data.startsWith("https://remote-sli.de/")) {
                            $timeout(function () {
                                window.location = data;
                            }, 100);
                        }
                    }, 50);
                }, function (error) {
                    console.warn("error:")
                    console.warn(error)
                }, function (videoError) {
                    console.warn("Video error:")
                    console.warn(videoError);
                    $timeout(function () {
                        $scope.qrCodeScan.status = "videoError";
                    })
                })
            }, 250);
        },
        stop: function () {
            $scope.qrCodeScan.status = "cancelled";
            $("#qrScanner").html5_qrcode_stop()
        },
        cameraToggle: false,// switch front/back camera
        flipCamera: function () {
            $scope.qrCodeScan.cameraToggle = !$scope.qrCodeScan.cameraToggle;
        },
        status: 'none'
    };
    if (window.mobilecheck()) {
        $timeout(function () {
            $scope.qrCodeScan.start();
        }, 500);
    }


}]);

$("#session-bookmark").on("click", function (e) {
    e.preventDefault();
})