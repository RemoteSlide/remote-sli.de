authApp.controller("indexController", ["$scope", "$http", "$cookies", "$timeout", "$interval", "$location", function ($scope, $http, $cookies, $timeout, $interval, $location) {
    $http.get("/api/session").then(function (data) {
        data = data.data;
        $scope.session = data;
        $http.get("/res/bookmark.js").then(function (data) {
            data = data.data;
            console.log(data)
            data = data.replace(":sessionId:", $scope.session.session);
            $scope.session.bookmarkContent = data;
            $("#session-bookmark").attr("href", data);

            // Wait for socket init
            var socket = io();
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
                        chrome.runtime.sendMessage($scope.chromeExtensionId, {session: $scope.session}, function () {

                        });
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
                    if (data.clientType == 'remote') {
                        $scope.statusIcon.showMessage("check", "lime", "Remote connected", 2500);
                    } else if (data.clientType == 'host') {
                        $scope.statusIcon.showMessage("check", "lime", "Host connected", 2500);
                    }
                }
                if (data.type == 'client_disconnected') {
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
        })
    });
}]);
