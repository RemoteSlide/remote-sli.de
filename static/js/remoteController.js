authApp.controller("remoteController", ["$scope", "$http", "$cookies", "$timeout", "$interval", "$location", "$stateParams", "$window", function ($scope, $http, $cookies, $timeout, $interval, $location, $stateParams, $window) {
    console.info("[load] remoteController @" + Date.now());

    var socket = $scope.socket;
    $scope.session.session = $stateParams.session;
    $scope.settings.saveCallback = function (settings) {
        // Synchronize settings
        socket.emit("_forward", {event: "settings", settings: settings});
    };

    $scope.sendControl = function (keyCode, keys) {
        if (!$scope.session.info.host) {
            return;
        }
        socket.emit("control", {keyCode: keyCode, keys: keys});
    };

    $scope.overlayMessage = {
        message: '',
        show: function (msg) {
            $timeout(function () {
                $scope.overlayMessage.message = msg;
            });
        },
        hide: function () {
            $timeout(function () {
                $scope.overlayMessage.message = '';
            });
        }
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
                $scope.session.info = data.info;
                $scope.statusIcon.showMessage("check", "lime", [200], "Connected", 2500);

                if (!$scope.session.info.host) {
                    $scope.overlayMessage.show("Waiting for host to connect...");
                }

                // Synchronize settings
                socket.emit("_forward", {event: "settings", settings: $scope.settings});
            });
        } else if (data.state == "not_found") {
            console.warn("Session not found");
            $timeout(function () {
                $scope.statusIcon.showMessage("times", "red", [100, 30, 100], "Session not found", 20000);
            })
            $timeout(function () {
                window.location = "https://remote-sli.de";
            }, 1500);
        }
    })
    socket.on("info", function (data) {
        console.log(data);
        if (data.type == 'client_connected') {
            $scope.session.info = data.info;
            if (data.clientType == 'remote') {
//                            $scope.statusIcon.showMessage("Remote connected", 2500);
            } else if (data.clientType == 'host') {
                $scope.statusIcon.showMessage("check", "lime", [200], "Host connected", 2500);
                $scope.overlayMessage.hide();

                // Synchronize settings
                socket.emit("_forward", {event: "settings", settings: $scope.settings});
            }
        }
        if (data.type == 'client_disconnected') {
            $scope.session.info = data.info;
            if (data.clientType == 'remote') {
//                            $scope.statusIcon.showMessage("Remote disconnected", 2500);
            } else if (data.clientType == 'host') {
                $scope.statusIcon.showMessage("times", "red", [100, 30, 100], "Host disconnected", 2000, function () {
                    $scope.statusIcon.showMessage("check", "lime");
                });
                $scope.overlayMessage.show("Waiting for host to connect...");
            }
        }
    });

    socket.on("control", function (data) {
        if ($scope.settings.vibration)
            window.navigator.vibrate(50);
    })


    socket.on("err", function (data) {
        console.warn("err: " + JSON.stringify(data))
    })

    $scope.deviceOrientation = {
        lastAlpha: 0,// Yaw
        lastBeta: 0,// Pitch
        lastGamma: 0,// Roll,
        currentYaw: 0,
        currentPitch: 0,
        previousOrientations: [],
        center: {
            yaw: 0,
            pitch: 0
        },
        range: {
            yaw: 0,
            pitch: 0
        },
        laserActive: false,
        calibration: {
            angles: {
                center: [],
                topLeft: [],
                topRight: [],
                bottomLeft: [],
                bottomRight: []
            },
            active: false,
            step: "center",
            toggleCalibration: function () {
                if (!$scope.deviceOrientation.calibration.active) {
                    $scope.deviceOrientation.calibration.startCalibration();
                } else {
                    $scope.deviceOrientation.calibration.active = false;
                    $scope.deviceOrientation.calibration.showOrHidePosition("hide", "all");
                }
            },
            startCalibration: function () {
                $scope.deviceOrientation.calibration.step = "center";// reset step
                $scope.deviceOrientation.calibration.active = true;

                $scope.deviceOrientation.calibration.showOrHidePosition("show", "start");
                $scope.deviceOrientation.calibration.showOrHidePosition("show", "center");

                $scope.settings.put("navigationType", "laser");
                $("#settingsModal").modal("hide");
            },
            onCalibrationFinished: function () {
                $scope.deviceOrientation.calibration.active = false;
                $scope.deviceOrientation.calibration.showOrHidePosition("hide", "all");

                // Center
                $scope.deviceOrientation.center.yaw = $scope.deviceOrientation.calibration.angles.center[0];
                $scope.deviceOrientation.center.pitch = $scope.deviceOrientation.calibration.angles.center[1];

                // Ranges
                $scope.deviceOrientation.range.yaw = Math.abs((($scope.deviceOrientation.calibration.angles.topLeft[0] + $scope.deviceOrientation.calibration.angles.bottomLeft[0]) / 2) - (($scope.deviceOrientation.calibration.angles.topRight[0] + $scope.deviceOrientation.calibration.angles.bottomRight[0]) / 2));
                $scope.deviceOrientation.range.pitch = Math.abs((($scope.deviceOrientation.calibration.angles.topLeft[1] + $scope.deviceOrientation.calibration.angles.topRight[1]) / 2) - (($scope.deviceOrientation.calibration.angles.bottomLeft[1] + $scope.deviceOrientation.calibration.angles.bottomRight[1]) / 2));

                console.info("Center: " + $scope.deviceOrientation.center.yaw + ", " + $scope.deviceOrientation.center.pitch)
                console.info("Range:  " + $scope.deviceOrientation.range.yaw + ", " + $scope.deviceOrientation.range.pitch)

                $scope.settings.laserCalibration = {
                    center: $scope.deviceOrientation.center,
                    range: $scope.deviceOrientation.range
                };
                $scope.settings.save();
            },
            nextStep: function () {
                var currentStep = $scope.deviceOrientation.calibration.step;
                var nextStep = undefined;
                if (currentStep == 'center') {
                    nextStep = "topLeft";
                } else if (currentStep == 'topLeft') {
                    nextStep = "topRight";
                } else if (currentStep == 'topRight') {
                    nextStep = "bottomLeft";
                } else if (currentStep == 'bottomLeft') {
                    nextStep = "bottomRight";
                }
                $scope.deviceOrientation.calibration.step = nextStep;
                if (currentStep) {
                    $scope.deviceOrientation.calibration.showOrHidePosition("hide", currentStep);
                }
                if (nextStep) {
                    $scope.deviceOrientation.calibration.showOrHidePosition("show", nextStep);
                } else {
                    $scope.deviceOrientation.calibration.onCalibrationFinished();
                }
            },
            onCalibrationStepFinished: function () {
                if (!$scope.deviceOrientation.calibration.active) {
                    return;
                }
                $scope.deviceOrientation.calibration.angles[$scope.deviceOrientation.calibration.step] = [$scope.deviceOrientation.lastAlpha, $scope.deviceOrientation.lastBeta];
                console.log(JSON.stringify($scope.deviceOrientation.calibration.angles))
                $timeout(function () {
                    $scope.deviceOrientation.calibration.nextStep();
                }, 500);
            },
            showOrHidePosition: function (action, which) {
                socket.emit("_forward", {event: "calibrationDot", action: action, which: which});
            }
        },
        getVector: function () {
            if ($scope.deviceOrientation.center.yaw == 0) {
                $scope.deviceOrientation.center = $scope.settings.laserCalibration.center;
                $scope.deviceOrientation.range = $scope.settings.laserCalibration.range;
            }
//                        return [$scope.deviceOrientation.lastAlpha, $scope.deviceOrientation.lastBeta, $scope.deviceOrientation.lastGamma]
//                        var pitch = ($scope.deviceOrientation.lastBeta * Math.PI) / 180;
//                        var yaw = ($scope.deviceOrientation.lastAlpha * Math.PI) / 180;
//                        return [
//                                Math.sin(pitch)*Math.cos(yaw),
//                                Math.sin(pitch)*Math.sin(yaw),
//                                Math.cos(pitch)
//                        ]

            var yawCenter = $scope.deviceOrientation.center.yaw;
            var pitchCenter = $scope.deviceOrientation.center.pitch;

            var yawRange = $scope.deviceOrientation.range.yaw;
            var pitchRange = $scope.deviceOrientation.range.pitch;

            var yaw = $scope.deviceOrientation.lastAlpha;// yaw
            var pitch = $scope.deviceOrientation.lastBeta;// pitch

            //TODO: change 45 to a calibrated value (angle from center)
            yaw -= yawCenter;
            $scope.deviceOrientation.currentYaw = yaw;
            if (yaw > (yawRange))yaw = (yawRange);
            if (yaw < (-(yawRange)))yaw = (-(yawRange));
            yaw += (yawRange / 2);

            // taking 0 as center
            //TODO: change 45 to a calibrated value (angle from center)
            pitch -= pitchCenter;
            $scope.deviceOrientation.currentPitch = pitch;
            if (pitch > (pitchRange))pitch = (pitchRange);
            if (pitch < (-(pitchRange)))pitch = (-(pitchRange));
            pitch += (pitchRange / 2);

            //TODO: also consider the 'gamma' value for a more accurate pitch/yaw
            // https://engineering.stackexchange.com/questions/3348/calculating-pitch-yaw-and-roll-from-mag-acc-and-gyro-data


            return [
                yaw,
                pitch,
                $scope.deviceOrientation.lastGamma
            ]
        },
        sendData: function () {
            if ($scope.deviceOrientation.calibration.active) {
                $scope.deviceOrientation.calibration.onCalibrationStepFinished($scope.deviceOrientation.getVector());
                return;
            }
            console.log(JSON.stringify($scope.deviceOrientation.getVector()))
            socket.emit("_forward", {event: "deviceOrientation", v: $scope.deviceOrientation.getVector()})
        }
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
        if ($scope.deviceOrientation.calibration.active)return;
        console.log("touchstart")
        $timeout(function () {
            $scope.deviceOrientation.laserActive = true;
        });
        laserDataTimer = setInterval(function () {
            if (!$scope.deviceOrientation.laserActive)return;
            $scope.deviceOrientation.sendData();
        }, 50);
    }).on("mouseup touchend touchcancel mouseleave", function () {
        console.log("touchend")
        $timeout(function () {
            $scope.deviceOrientation.laserActive = false;
        }, 250);
        clearInterval(laserDataTimer)
    })

    $("#settingsModal").on("hidden.bs.modal",function () {
       $scope.settings.save();
    });

    //TODO: remove
    $scope.sendLaserStyle = function () {
        console.log($scope.settings.laserStyle)
        socket.emit("_forward", {event: "laserStyle", style: $scope.settings.laserStyle});
    };
}]);