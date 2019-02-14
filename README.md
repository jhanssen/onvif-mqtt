# onvif-mqtt
Publish thumbnail images from HikVision cameras to mqtt

#### Config file format

```json5
{
  "cameras": [{
      "xaddr": "http://camera1.address:80/onvif/device_service",
      "user": "username",
      "pass": "password",
      "name": "porch"
   },
   {
      "xaddr": "http://camera2.address:80/onvif/device_service",
      "user": "username",
      "pass": "password",
      "name": "garage"
   }],
   "mqtt-host": "mqtt.address",
   "mqtt-user": "username",
   "mqtt-password": "password"
}
```
