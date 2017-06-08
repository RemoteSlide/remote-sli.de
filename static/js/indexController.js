authApp.controller("indexController", ["$scope", "$http", "$cookies", "$timeout", "$interval", "$location", "$state", function ($scope, $http, $cookies, $timeout, $interval, $location, $state) {
    console.info("[load] indexController @" + Date.now());

    var socket = $scope.socket;
    console.info($scope.socket)

    socket.on("init", function (data) {
        console.log("init: " + JSON.stringify(data));
        if (data.state == "start") {
            waitForCondition(function () {
                return $scope.session.session.length > 0;
            }, function () {
                console.info("Initializing Session #" + $scope.session.session)
                $timeout(function () {
                    socket.emit("init", {iAm: "observer", session: $scope.session.session});
                }, 500);
            })
        } else if (data.state == "success") {
            console.info("Session initialized.")
            $timeout(function () {
                $scope.session.initialized = true;
                $scope.session.type = data.youAre;
                $scope.session.clientId = data.yourId;
                $scope.session.info = data.info;
                console.log(data.info)
                $scope.statusIcon.showMessage("check", "lime", [200], "Connected", 2000);

                // Notify extension
                try {
                    chrome.runtime.sendMessage($scope.extension.id.chrome, {session: $scope.session}, function (msg) {
                    });
                    if ($state.params.sessionOnly) {
                        $timeout(function () {
                            window.close();
                        }, 100);
                    }
                } catch (ignoerd) {
                }
            });
        } else if (data.state == "not_found") {// This should be impossible here, since the observer generates the new session ID
            console.warn("Session not found");
            $timeout(function () {
                $scope.statusIcon.showMessage("times", "red", [100, 30, 100], "Session not found", 20000);
            })
            $timeout(function () {
                window.location.reload(true);
            }, 500);
        }
    })
    socket.on("disconnect", function (data) {
        console.warn("DISCONNECT")
        $scope.statusIcon.showMessage("times", "red", [100, 30, 100], "Lost connection", 2000);
    })
    socket.on("info", function (data) {
        console.log(data);
        if (data.type == 'client_connected') {
            $scope.session.info = data.info;
            console.log(data.info)
            if (data.clientType == 'remote') {
                $scope.statusIcon.showMessage("check", "lime", false, "Remote connected", 2500);
            } else if (data.clientType == 'host') {
                $scope.statusIcon.showMessage("check", "lime", false, "Host connected", 2500);
            }
        }
        if (data.type == 'client_disconnected') {
            $scope.session.info = data.info;
            if (data.clientType == 'remote') {
                $scope.statusIcon.showMessage("times", "red", false, "Remote disconnected", 2000, function () {
                    $scope.statusIcon.showMessage("check", "lime");
                });
            } else if (data.clientType == 'host') {
                $scope.statusIcon.showMessage("times", "red", false, "Host disconnected", 2000, function () {
                    $scope.statusIcon.showMessage("check", "lime");
                });
            }
        }
    })
    socket.on("connectionInfo", function (data) {
        console.log(data)
        $scope.session.info = data.info;
    })

    $http.get("/api/session").then(function (data) {
        data = data.data;
        $.extend($scope.session, data);
        $http.get("/inject/bookmark.js").then(function (data) {
            data = data.data;
            console.log(data)
            data = data.replace(":sessionId:", $scope.session.session);
            $scope.session.bookmarkContent = data;
            $("#session-bookmark").attr("href", data);
        })
    });

    $scope.qrCodeScan = {
        start: function () {
            $("#qrScanner").empty();

            $("#qrScannerModal").modal("show");
            $timeout(function () {
                $("#qrScanner").fadeIn();
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
                            if ($scope.settings.vibration) {
                                window.navigator.vibrate(100);
                            }
                        }
                    }, 50);
                }, function (error) {
                    console.warn("error:")
                    console.warn(error)
                }, function (videoError) {
                    console.warn("Video error:")
                    console.warn(videoError);
                    $("#qrScanner").hide();
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
        //TODO: don't directly scan on first visit
        $timeout(function () {
            $scope.qrCodeScan.start();
        }, 500);
    }

    // First time visit message
    var lastVisitCookie = $cookies.get("rs-last-visit");
    if (!lastVisitCookie && $scope.isDesktop()) {
        $scope.infoModal.show("Welcome!", "/pages/instructions/welcome.html");
        $cookies.put("rs-last-visit", Date.now(), {
            expires: new Date(Date.now() + 2.628e+9)
        })
    }

    // Bookmark stuff

    $("#session-bookmark").on("click", function (e) {
        e.preventDefault();
    });

    var bookmarkDragCounter = 0;
    var bookmarkInfoTimer;
    var bookmarkInfoTriggered = false;
    $("#session-bookmark").on("drag", function () {
        if (bookmarkInfoTriggered) return;
        bookmarkDragCounter++;
        clearTimeout(bookmarkInfoTimer);
        bookmarkInfoTimer = setTimeout(function () {
            if (bookmarkDragCounter > 200) {
                bookmarkInfoTriggered = true;
                $scope.infoModal.show("Bookmark", "/pages/instructions/bookmark.html");
            }
        }, 200)
    });
}]);