const options = require("@jhanssen/options")("onvif-mqtt");
const mqtt = require("mqtt");
const onvif = require("node-onvif");
const request = require("request-promise-native");
const sharp = require("sharp");
const url = require("url");

const cameras = options("cameras");
if (typeof cameras !== "object" || !(cameras instanceof Array)) {
    console.error("need at least one camera");
    process.exit(1);
}

const mqtthost = options("mqtt-host");
const mqttport = options.int("mqtt-port", 1883);

if (!mqtthost || !mqttport) {
    console.error("no mqtt config");
    process.exit(1);
}

const mqttuser = options("mqtt-user");
const mqttpasswd = options("mqtt-password");

const mqtttopic = options("mqtt-topic", "/security/camera/");

const interval = options.int("publish-interval", 10000);

let mqttauth = "";
if (mqttuser || mqttpasswd) {
    if (!mqttuser || !mqttpasswd) {
        console.error("needs both mqtt user and password if one is set");
        process.exit(1);
    }
    mqttauth = `${mqttuser}:${mqttpasswd}@`;
}

const mqttclient = mqtt.connect(`mqtt://${mqttauth}${mqtthost}:${mqttport}`);
mqttclient.on("error", err => {
    console.error("mqtt error", err);
});

cameras.forEach(camera => {
    if (typeof camera !== "object" || !("xaddr" in camera)) {
        console.error("invalid camera, need at least an xaddr property", camera);
        return;
    }
    const device = new onvif.OnvifDevice(camera);
    device.init().then(info => {
        camera.device = device;
        console.error("camera init success", info);
    }).catch(err => {
        console.error("camera init error", camera, err);
    })
});

setInterval(() => {
    cameras.forEach(camera => {
        if (camera.device) {
            console.log("requesting image");
            const u = url.parse(camera.xaddr);
            let a = u.auth;
            if (!a) {
                if (camera.user && camera.pass) {
                    a = `${camera.user}:${camera.pass}`;
                }
            }
            const nu = url.format({ protocol: u.protocol, auth: a, host: u.host });
            request({ url: `${nu}/Streaming/channels/1/picture`, method: "GET", resolveWithFullResponse: true, encoding: null }).then(data => {
                //console.log("streaming", data.body.length, data.headers, typeof data.body);

                sharp(data.body)
                    .resize(320, 240)
                    //.toFormat("jpeg")
                    .toBuffer()
                    .then(resized => {
                        //console.log("resized", resized.length);

                        const topic = mqtttopic + (camera.name || u.host);
                        console.log("publishing to", topic);
                        mqttclient.publish(topic, resized);
                    }).catch(err => {
                        console.error("failed to resize", err);
                    });
                // publish

            }).catch(err => {
                console.error("streaming error", err);
            });
        } else {
            console.log("no device for camera", camera);
        }
    });
}, interval);
