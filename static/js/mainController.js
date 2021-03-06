slideApp.controller("slideController", ["$scope", "$cookies", "$location", "$http", "$interval", "$timeout", "$window", function ($scope, $cookies, $location, $http, $interval, $timeout, $window) {
    console.info("[load] mainController @" + Date.now());

    window.__$scope = $scope;

    $scope.tutorialMode = false;

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

    $scope.getFromServer = function (what) {
        $scope.socket.emit("_get", {what: what})
    };

    //TODO: disable some (most) settings for the host
    $scope.settings = {
        username: '',
        navigationType: 'swipe',
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
            'font-size': 15,
            _icon: "circle"
        },
        laserTool: 'pointer',

        put: function (name, value) {
            $timeout(function () {
                $scope.settings[name] = value;
                localStorage.setItem("rs-settings", JSON.stringify($scope.settings));
            });
        },
        save: function (callback) {
            localStorage.setItem("rs-settings", JSON.stringify($scope.settings));
            console.info("[Settings] Saved!")
            if (callback) callback();
            if ($scope.settings.saveCallback) $scope.settings.saveCallback($scope.settings);

            _gaq.push(["_setCustomVar", 1, "settings.navigationType", $scope.settings.navigationType]);
            _gaq.push(["_setCustomVar", 1, "settings.vibration", $scope.settings.vibration]);
            _gaq.push(["_setCustomVar", 1, "settings.laserTool", $scope.settings.laserTool]);
            _gaq.push(["_setCustomVar", 1, "settings.laserStyle.color", $scope.settings.laserStyle.color]);
        },
        saveCallback: undefined
    };
    //TODO: track some settings, like navigationType, vibration and laserStyle via GoogleAnalytics

    // Load settings
    var storedSettings = JSON.parse(localStorage.getItem("rs-settings")) || {};
    $.extend($scope.settings, storedSettings);


    $scope.openSettings = function () {
        $("#settingsModal").modal("show");
    };
    $scope.closeSettings = function () {
        $("#settingsModal").modal("hide");
    };

    $scope.showConnectionInfo = function () {
        $scope.getFromServer("connectionInfo");
        $("#connectionInfoModal").modal("show")
    };


    // Non-settings stuff
    $scope.extension = {
        id: {
            // chrome: "enmfbjneielhjagdgebkmcdhgbbionek"
            chrome: "ojmlekgoiolmbfddhkdbnlpndbcipfkp"
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
        showMessage: function (type, color, vibration, msg, timeout, doneCallback) {
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
                if ($scope.settings.vibration && vibration) {
                    window.navigator.vibrate(vibration);
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

    $scope.infoModal = {
        title: "",
        show: function (title, source) {
            $scope.infoModal.title = title;
            $("#infoModalContent").load(source, function () {
                $("#infoModal").modal("show");
            });
        },
        onClose: function () {
            $timeout(function () {
                $("#infoModalContent").empty();
            }, 500);
        }
    }

    //// Latency
    var startTime;
    setInterval(function () {
        startTime = Date.now();
        $scope.socket.emit('latency', {t: startTime, l: $scope.session.latency});
    }, 2000);
    $scope.socket.on('latency', function () {
        $timeout(function () {
            $scope.session.latency = Date.now() - startTime;
        });
    });
}]);
