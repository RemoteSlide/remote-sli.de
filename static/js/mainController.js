authApp.controller("slideController", ["$scope", "$route", "$cookies", "$location", "$http", "$interval", "$timeout", "$window", function ($scope, $route, $cookies, $location, $http, $interval, $timeout, $window) {
    window.__$scope = $scope;

    $scope.session = {
        session: "",
        qr: "",
        bookmarkContent: "",
        type: ""
    };
    //TODO: disable some (most) settings for the host
    $scope.settings = {
        navigationType: 'button',
        vibration: true,
        laserCalibration: {
            center: {
                yaw: 0,
                pitch: 0
            },
            range: {
                yaw: 90,
                pitch: 90
            }
        },

        put: function (name, value) {
            $timeout(function () {
                $scope.settings[name] = value;
                localStorage.setItem("rs-settings", JSON.stringify($scope.settings));
            });
        },
        save: function () {
            localStorage.setItem("rs-settings", JSON.stringify($scope.settings));
        }
    };

    // Load settings
    var storedSettings = JSON.parse(localStorage.getItem("rs-settings")) || {};
    $.extend($scope.settings, storedSettings);


    $scope.openSettings = function () {
        $("#settingsModal").modal("show");
    };


    // Non-settings stuff
    $scope.chromeExtensionId = "bablpajeibomldijmnkliinaealllklb";

    $scope.isMobile = function () {
        return window.mobilecheck();
    };
    $scope.isDesktop = function () {
        return !window.mobilecheck();
    };

    $scope.statusIcon = {
        type: 'question',
        color: 'orange',
        message: '',
        messageVisible: false,
        hideTimeout: undefined,
        showMessage: function (type, color, msg, timeout, doneCallback) {
            $timeout(function () {
                if (type)
                    $scope.statusIcon.type = type;
                if (color)
                    $scope.statusIcon.color = color;

                $scope.statusIcon.messageVisible = false;
                if (msg) {
                    $scope.statusIcon.message = msg;
                    $scope.statusIcon.messageVisible = true;
                }
                if ($scope.settings.vibration) {
                    if (type == "times") {// error
                        window.navigator.vibrate([100, 30, 100]);
                    } else {// info
                        window.navigator.vibrate(200);
                    }
                }

                if (timeout) {
                    $timeout.cancel($scope.statusIcon.hideTimeout);
                    $timeout(function () {
                        $scope.statusIcon.messageVisible = false;
                        if (doneCallback)
                            doneCallback();
                    }, timeout);
                } else {
                    if (doneCallback)
                        doneCallback();
                }
            });
        },
        hideMessage: function () {
            $scope.statusIcon.messageVisible = false;
        }
    };

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
    }

//TODO: move to remote
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

                $scope.deviceOrientation.calibration.sendRange($scope.deviceOrientation.range.yaw, $scope.deviceOrientation.range.pitch);
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
                }, 250);
            }
        },
        updateYawOffset: function () {// Use the current device yaw as the new offset
            $scope.settings.yawOffset = $scope.deviceOrientation.center.yaw = $scope.deviceOrientation.lastAlpha;
            console.info("New Yaw offset: " + $scope.deviceOrientation.lastAlpha);
            $scope.settings.save()
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
                pitch
            ]
        }
    };
}]);
