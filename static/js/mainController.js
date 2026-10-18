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
    // The connection is opened by the index (observer) and remote controllers
    // once they know which session to join.
    $scope.socket = new RemoteSlideSocket(window.location.origin);

    $scope.getFromServer = function (what) {
        $scope.socket.emit("get", {what: what})
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

            if (window._gaq) {
                _gaq.push(["_setCustomVar", 1, "settings.navigationType", $scope.settings.navigationType]);
                _gaq.push(["_setCustomVar", 1, "settings.vibration", $scope.settings.vibration]);
                _gaq.push(["_setCustomVar", 1, "settings.laserTool", $scope.settings.laserTool]);
                _gaq.push(["_setCustomVar", 1, "settings.laserStyle.color", $scope.settings.laserStyle.color]);
            }
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
        installed: false,
        // Chrome exposes chrome.runtime to this site once the extension is
        // installed (externally_connectable). Firefox doesn't let pages message an
        // extension at all, so there the extension's siteBridge.js content script
        // relays what is posted to this window, and posts the answer back.
        send: function (message, callback) {
            if (window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
                try {
                    chrome.runtime.sendMessage($scope.extension.id.chrome, message, function (response) {
                        void chrome.runtime.lastError;
                        if (callback) callback(response);
                    });
                } catch (ignored) {
                }
                return;
            }
            var id = ++extensionBridge.lastId;
            if (callback) extensionBridge.callbacks[id] = callback;
            window.postMessage({channel: "remoteslide", direction: "to-extension", id: id, message: message}, window.location.origin);
        }
    };
    var extensionBridge = {lastId: 0, callbacks: {}};
    window.addEventListener("message", function (event) {
        var data = event.data;
        if (event.source !== window || !data || data.channel !== "remoteslide" || data.direction !== "to-page") return;
        var callback = extensionBridge.callbacks[data.id];
        delete extensionBridge.callbacks[data.id];
        if (callback) callback(data.response);
    });
    $scope.extension.send({ping: "hello"}, function (msg) {
        console.log(msg)
        if (msg && msg.pong && msg.pong == 'hello') {
            $scope.extension.installed = true;
        }
    });

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

    //// Latency (the socket sends its own heartbeats and reports the round trip)
    $scope.socket.on('latency', function (data) {
        $timeout(function () {
            $scope.session.latency = data.latency;
        });
    });
}]);
