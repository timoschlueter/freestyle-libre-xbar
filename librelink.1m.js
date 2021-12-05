#!/usr/bin/env /usr/local/bin/node
/**
 * Xbar Plugin that shows the current glucose measurement of your FreeStyle Libre 3 CGM in the menu bar
 * 
 *  <xbar.title>FreeStyle Libre 3 Glucose Measurement</xbar.title>
 *  <xbar.version>v1.0</xbar.version>
 *  <xbar.author>Timo Schlueter</xbar.author>
 *  <xbar.author.github>timoschlueter</xbar.author.github>
 *  <xbar.desc>Shows the latest glucose measurement value of your FeeStyle Libre 3 CGM. Requires a (free) LibreLink Up Account.</xbar.desc>
 *  <xbar.image>https://github.com/timoschlueter/freestyle-libre-xbar</xbar.image>
 *  <xbar.dependencies>node</xbar.dependencies>
 *  <xbar.abouturl>https://github.com/timoschlueter/freestyle-libre-xbar</xbar.abouturl>

 *  <xbar.var>string(VAR_EMAIL): LibreLink Up E-Mail Adress</xbar.var>
 *  <xbar.var>string(VAR_PASSWORD): LibreLink Up Password</xbar.var>
 *  <xbar.var>string(VAR_PREFIX): Prefix shown in front of the glucose value</xbar.var>
 */

const https = require("https")
const fs = require("fs");
const path = require("path");

/**
 * Configuration
 */
const API_URL = "api-eu.libreview.io"
const VAR_FILE = path.basename(__filename) + ".vars.json";
const USER_AGENT = "FreeStyle Libre xbar Plugin";
const LIBE_LINK_UP_VERSION = "4.1.1";
const LIBE_LINK_UP_PRODUCT = "llu.ios";

if (fs.existsSync(VAR_FILE))
{
    main();
}
else
{
    console.log("Please set login credentials");
}

function main() {

    if (hasValidAuthentication()) {
        getGlucoseMeasurement();
    }
    else {
        deleteToken();
        login();
    }
}

function login() {

    const data = new TextEncoder().encode(
        JSON.stringify({
            email: process.env["VAR_EMAIL"],
            password: process.env["VAR_PASSWORD"],
        })
    )

    const options = {
        hostname: API_URL,
        port: 443,
        path: "/llu/auth/login",
        method: "POST",
        headers: {
            "User-Agent": USER_AGENT,
            "Content-Type": "application/json",
            "Content-Length": data.length,
            "version": LIBE_LINK_UP_VERSION,
            "product": LIBE_LINK_UP_PRODUCT,
        }
    }

    const req = https.request(options, res => {
        if (res.statusCode !== 200) {
            console.error("Invalid credentials");
            deleteToken();
        }

        res.on("data", response => {
            try {
                let responseObject = JSON.parse(response);
                try {
                    updateAuthTicket(responseObject.data.authTicket);
                    getGlucoseMeasurement();
                } catch (err) {
                    console.error("Invalid authentication token");
                }
            } catch (err) {
                console.error("Invalid response");
            }
        })
    })

    req.on("error", error => {
        console.error("Invalid response");
    })

    req.write(data)
    req.end()
}

function getGlucoseMeasurement() {
    const options = {
        hostname: API_URL,
        port: 443,
        path: "/llu/connections",
        method: "GET",
        headers: {
            "User-Agent": USER_AGENT,
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "version": LIBE_LINK_UP_VERSION,
            "product": LIBE_LINK_UP_PRODUCT,
            "authorization": "Bearer " + getAuthenticationTokenFromFile()
        }
    }

    const req = https.request(options, res => {
        if (res.statusCode !== 200) {
            console.error("Invalid credentials");
            deleteToken();
        }

        res.on("data", response => {
            try {
                let responseObject = JSON.parse(response);
                if (responseObject.message === "invalid or expired jwt")
                {
                    deleteToken();
                    login();
                }
                else {
                    let prefix = process.env["VAR_PREFIX"] || ""
                    console.log(prefix + responseObject.data[0].glucoseMeasurement.Value);
                }
            } catch (err) {
                console.error("Invalid response");
            }
        })
    })

    req.on("error", error => {
        console.error("Invalid response");
    })
    req.end()
}

function deleteToken() {
    updateAuthTicket(null);
}

function updateAuthTicket(authTicket) {
    try {
        const data = fs.readFileSync(VAR_FILE, "utf8")
        if (data) {
            try {
                let dataObject = JSON.parse(data);
                dataObject.authTicket = authTicket;
                fs.writeFileSync(VAR_FILE, JSON.stringify(dataObject));
            } catch (error) {
                return;
            }
        }
    } catch (error) {
        return;
    }
}

function getAuthenticationTokenFromFile() {
    try {
        const data = fs.readFileSync(VAR_FILE, "utf8")
        if (data) {
            try {
                let dataObject = JSON.parse(data);
                return dataObject.authTicket.token;

            } catch (error) {
                return null;
            }
        }
    } catch (error) {
        return null;
    }
}

function hasValidAuthentication() {
    try {
        const data = fs.readFileSync(VAR_FILE, "utf8")
        if (data) {
            try {
                let dataObject = JSON.parse(data);
                let expiryDate = dataObject.authTicket.expires;
                let currentDate = Math.round(new Date().getTime() / 1000);
                if (currentDate < expiryDate) {
                    return true;
                }
                return false;

            } catch (error) {
                return false;
            }
        }
    } catch (error) {
        return false;
    }
}