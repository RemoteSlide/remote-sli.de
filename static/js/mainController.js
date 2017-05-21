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
        laserStyle: {
            color: "red",
            'font-size': 15
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
}]);
