authApp.controller("slideController", ["$scope", "$cookies", "$location", "$http", "$interval", "$timeout", "$window", function ($scope, $cookies, $location, $http, $interval, $timeout, $window) {
    console.info("[load] mainController @" + Date.now());

    window.__$scope = $scope;

    $scope.session = {
        session: "",
        qr: "",
        bookmarkContent: "",
        type: "",
        latency: 0,
        info: {
            observer: false,
            host: false,
            remotes: 0
        }
    };
    $scope.socket = io()

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
        save: function (callback) {
            localStorage.setItem("rs-settings", JSON.stringify($scope.settings));
            if (callback) callback();
            if ($scope.settings.saveCallback)$scope.settings.saveCallback($scope.settings);
        },
        saveCallback: undefined
    };

    // Load settings
    var storedSettings = JSON.parse(localStorage.getItem("rs-settings")) || {};
    $.extend($scope.settings, storedSettings);


    $scope.openSettings = function () {
        $("#settingsModal").modal("show");
    };


    // Non-settings stuff
    $scope.extension = {
        id: {
            chrome: "enmfbjneielhjagdgebkmcdhgbbionek"
        },
        installed: false
    };
    try {
        chrome.runtime.sendMessage($scope.extension.id.chrome, {ping: "hello"}, function (msg) {
            console.log(msg)
            if (msg && msg.pong && msg.pong == 'hello') {
                $scope.extension.installed = true;
            }
        });
    } catch (ignoerd) {
    }

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
                    //TODO: don't base vibration of of the 'type', mainly because it vibrates twice when setting it to 'times' first and then changing it to something else
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

    //// Latency
    var startTime;
    setInterval(function () {
        startTime = Date.now();
        $scope.socket.emit('latency', {t: startTime});
    }, 2000);
    $scope.socket.on('latency', function () {
        $timeout(function () {
            $scope.session.latency = Date.now() - startTime;
        });
    });
}]);
