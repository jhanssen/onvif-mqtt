const options = require("@jhanssen/options")("onvif-mqtt");
const mqtt = require("mqtt");
const onvif = require("node-onvif");
const request = require("request-promise-native");
const sharp = require("sharp");
const url = require("url");
const WebSocket = require("ws");

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

function append(str, sub)
{
    if (str.substr(sub.length * -1) === sub)
        return str;
    return str + sub;
}

const mqtttopic = append(options("mqtt-topic", "/security/camera/"), "/");

const interval = options.int("publish-interval", 10000);

const width = options.int("resize-width", 320);
const height = options.int("resize-height", 200);

const listenPort = options.int("listen-port", 0);
const listenHost = options("listen-host", "localhost");

function captureImage(camera, subtopic) {
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
            .resize(width, height)
            //.toFormat("jpeg")
            .toBuffer()
            .then(resized => {
                //console.log("resized", resized.length);

                const topic = append(mqtttopic + (camera.name || u.host), "/") + subtopic;
                console.log("publishing to", topic);
                mqttclient.publish(topic, resized);
            }).catch(err => {
                console.error("failed to resize", err);
            });
    }).catch(err => {
        console.error("streaming error", err);
    });
}

if (listenPort > 0) {
    console.log(`listening on ${listenHost}:${listenPort}`);
    const wss = new WebSocket.Server({ port: listenPort, host: listenHost });
    wss.on('connection', function connection(ws) {
        ws.on('message', function incoming(message) {
            try {
                const msg = JSON.parse(message);
                if (typeof msg === "object" && "type" in msg && "camera" in msg) {
                    cameras.forEach(camera => {
                        if (camera.device && camera.name == msg.camera) {
                            captureImage(camera, msg.type);
                        }
                    });
                } else {
                    console.error("invalid message", msg);
                }
            } catch (e) {
                console.error("unable to parse json", message);
            }
            ws.close();
        });
    });
}

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
            captureImage(camera, "live");
        }
    });
}, interval);
