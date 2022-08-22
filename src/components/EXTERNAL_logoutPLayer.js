function EXTERNAL_logoutPLayer () {
    let onLogout;
    if (typeof onLogout !== "undefined") {
        send(onLogout);
    }
}