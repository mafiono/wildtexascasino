let initializing = false;

function isUri(str) {
    if (typeof str !== "string") {
        return false;
    }

    return /^[a-z]{2,}:\/\/.+/i.test(str);
}

function call(name) {
    if (typeof window[name] === "undefined") {
        return false;
    }

    window[name]();

    return true;
}

const gameLog = (action) => {
    if (initializing) {
        return Promise.reject();
    }

    function gameLogsHost () {

    }

    let SID;
    return fetch(gameLogsHost, {
        method: "POST",
        body: JSON.stringify({
            action,
            args: { data: { url: window.location.href, sid: SID } },
        }),
    });
};

function gameLogsTime () {

}

const logTime = parseInt(gameLogsTime);
let gameLogsHost;
if (!!logTime && !!gameLogsHost) {
    setTimeout(() => gameLog("fail"), logTime * 1000);
}

window.addEventListener("message", ({ data }) => {
    if (data.method === "WGEAPI.status.initializing") {
        initializing = true;
    }

    if (data.action === "close") {
        call("EXTERNAL_notifyClose");
    }
});

window.onunload = () => gameLog("abort");

function send(action) {
    window.parent.postMessage({ action }, "*");
}

function EXTERNAL_closeWindow(newUrl) {
    let isTablet;
    const platform = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";
    let isMobile;
    const orientation = isMobile
        ? window.matchMedia("(orientation: portrait)").matches
            ? "_vertical"
            : "_horizontal"
        : "";
    let background = document.createElement("div");
    background.id = "maintenance";
    let assetsBase;
    background.style.background = `url("${assetsBase}/game-close/wazdan_gameclose_${platform}${orientation}.jpg")`;
    document.body.replaceChildren(background);

    let onClose;
    if (typeof onClose !== "undefined") {
        send(onClose);
    }

    let closeWindowBody;
    if (typeof closeWindowBody !== "undefined") {
        eval(closeWindowBody);

        return;
    }

    if (isUri(newUrl)) {
        window.top.location = newUrl;

        return;
    }

    function lobby () {

    }

    if (isUri(lobby)) {
        window.location = lobby;

        return;
    }

    window.close();
}

function EXTERNAL_logoutPLayer () {
    let onLogout;
    if (typeof onLogout !== "undefined") {
        send(onLogout);
    }
}