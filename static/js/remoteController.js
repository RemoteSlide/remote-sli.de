authApp.controller("remoteController", ["$scope", "$http", "$cookies", "$timeout", "$interval", "$location", "$routeParams", "$window", function ($scope, $http, $cookies, $timeout, $interval, $location, $routeParams, $window) {
    var socket = io();
    $scope.session.session = $routeParams.session;

    $scope.sendControl = function (keyCode, keys) {
        socket.emit("control", {keyCode: keyCode, keys: keys});
    };

    // (mobile)
    $(document).swipe({
        swipe: function (event, direction, distance, duration, fingerCount, fingerData) {
            if ($scope.settings.navigationType != 'swipe')
                return;
            event.preventDefault();

            console.log(event);
            console.log(direction);
            console.log(distance);

            if (direction == "right")
                $scope.sendControl(37);//left
            if (direction == "down")
                $scope.sendControl(38);//up
            if (direction == "left")
                $scope.sendControl(39);//right
            if (direction == "up")
                $scope.sendControl(40);//down
        },
        tap: function (event, target) {
            console.log(target)
            console.log(target == document);
            console.log(target == $(document));
            console.log($(target) == $(document))
            console.log(target.id)
            if ($scope.settings.navigationType != 'swipe')
                return;
            if (target.id != 'outer-html-wrapper' && target.id != 'swipe-controls')// ignore taps on any other controls
                return;
            $scope.sendControl(32);//space
        }
    });


    // Init
    socket.on("info", function (data) {
        console.log(data);
        if (data.type == 'client_connected') {
            if (data.clientType == 'remote') {
//                            $scope.statusIcon.showMessage("Remote connected", 2500);
            } else if (data.clientType == 'host') {
                $scope.statusIcon.showMessage("check", "lime", "Host connected", 2500);
            }
        }
        if (data.type == 'client_disconnected') {
            if (data.clientType == 'remote') {
//                            $scope.statusIcon.showMessage("Remote disconnected", 2500);
            } else if (data.clientType == 'host') {
                $scope.statusIcon.showMessage("times", "red", "Host disconnected", 2000, function () {
                    $scope.statusIcon.showMessage("check", "lime");
                });
            }
        }
    });
    socket.on("init", function (data) {
        console.log("init: " + JSON.stringify(data));
        if (data.state == "start") {
            console.info("Initializing Session #" + $scope.session.session)
            $timeout(function () {
                socket.emit("init", {iAm: "remote", session: $scope.session.session});
            }, 500);
        } else if (data.state == "success") {
            console.info("Session initialized.")
            $timeout(function () {
                $scope.session.initialized = true;
                $scope.session.type = data.youAre;
                $scope.statusIcon.showMessage("check", "lime", "Connected", 2500);
            });
        } else if (data.state == "not_found") {
            console.warn("Session not found");
            $timeout(function () {
                $scope.statusIcon.showMessage("times", "red", "Session not found", 20000);
            })
            $timeout(function () {
                window.location = "https://remote-sli.de";
            }, 1500);
        }
    })
    socket.on("control", function (data) {
        if ($scope.settings.vibration)
            window.navigator.vibrate(50);
    })

    $scope.deviceOrientation.sendData = function () {
        if ($scope.deviceOrientation.calibration.active) {
            $scope.deviceOrientation.calibration.onCalibrationStepFinished($scope.deviceOrientation.getVector());
            return;
        }
        console.log(JSON.stringify($scope.deviceOrientation.getVector()))
        socket.emit("deviceOrientation", {v: $scope.deviceOrientation.getVector()})
    };
    $scope.deviceOrientation.calibration.showOrHidePosition = function (action, which) {
        socket.emit("calibrationDot", {action: action, which: which});
    };
    $scope.deviceOrientation.calibration.sendRange = function (yaw, pitch) {
        socket.emit("orientationRange", {yaw: yaw, pitch: pitch})
    };
    window.laserPointer = $scope.deviceOrientation;
    window.addEventListener("deviceorientation", function (event) {
        var absolute = event.absolute;
        var alpha = event.alpha;//  yaw (rotation) | z-axis | [0-360]
        var beta = event.beta;//    pitch          | x-axis | [-180-180]
        var gamma = event.gamma;//  roll           | y-axis | [-90-90]

        if (Math.abs(alpha - $scope.deviceOrientation.lastAlpha) > 0.2 ||
            Math.abs(beta - $scope.deviceOrientation.lastBeta) > 0.2 ||
            Math.abs(gamma - $scope.deviceOrientation.lastGamma) > 0.2) {

            alpha -= 180;

            /*
             // push the original values before modification
             $scope.deviceOrientation.previousOrientations.push([alpha, beta, gamma]);

             // take averages to smooth
             var length = $scope.deviceOrientation.previousOrientations.length;
             if (length > 0) {
             $scope.deviceOrientation.previousOrientations.forEach(function (orientation) {
             alpha += orientation[0];
             beta += orientation[1];
             gamma += orientation[2];
             });
             alpha /= length;
             beta /= length;
             gamma /= length;
             }
             */

            // save the smoothed values
            $scope.deviceOrientation.lastAlpha = alpha;
            $scope.deviceOrientation.lastBeta = beta;
            $scope.deviceOrientation.lastGamma = gamma;

            // remove the oldest orientation
            // TODO: maybe make smoothness level configurable
            if ($scope.deviceOrientation.previousOrientations.length > 4) {
                $scope.deviceOrientation.previousOrientations.shift();
            }


//                        console.log(" ")
//                        console.log("alpha: " + alpha)
//                        console.log(" beta: " + beta)
//                        console.log("gamma: " + gamma)
        }
    }, true);
    var laserDataTimer;
    $("#btn-control-laser").on("mousedown touchstart", function () {
        laserDataTimer = setInterval(function () {
            $scope.deviceOrientation.sendData();
        }, 50);
    }).on("mouseup touchend mouseleave", function () {
        clearInterval(laserDataTimer)
    })

    socket.on("err", function (data) {
        console.warn("err: " + JSON.stringify(data))
    })
}]);