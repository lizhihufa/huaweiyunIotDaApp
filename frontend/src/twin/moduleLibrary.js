/**
 * 常见电子/IoT 模块图库：提供检索词与网络搜图入口。
 * 说明：网上三视图版权与可用性不稳定，默认以「打开搜图」为主；
 * 也可粘贴图片直链，由后端下载到本地 /media。
 */

export const MODULE_LIBRARY = [
  {
    id: "stm32_bluepill",
    label: "STM32 最小系统板",
    layer: "控制层",
    shape: "box",
    keywords: ["STM32 blue pill", "STM32F103C8T6 开发板", "STM32 最小系统 三视图"],
    tips: "常见蓝色/黑色最小系统板，搜「blue pill」更准",
  },
  {
    id: "esp32_devkit",
    label: "ESP32 DevKit",
    layer: "通信层",
    shape: "box",
    keywords: ["ESP32 DevKitC", "ESP32 开发板 正面", "ESP32 module pinout"],
    tips: "可搜正面/背面针脚图作为正视与俯视参考",
  },
  {
    id: "esp8266_nodemcu",
    label: "ESP8266 NodeMCU",
    layer: "通信层",
    shape: "box",
    keywords: ["NodeMCU ESP8266", "ESP8266 开发板", "NodeMCU pinout"],
  },
  {
    id: "relay_module",
    label: "继电器模块",
    layer: "执行层",
    shape: "box",
    keywords: ["1 channel relay module", "继电器模块 5V", "relay module top view"],
  },
  {
    id: "ldr_sensor",
    label: "光敏电阻模块",
    layer: "传感层",
    shape: "sensor",
    keywords: ["LDR module", "光敏电阻模块", "photosensitive sensor module"],
  },
  {
    id: "dht11",
    label: "DHT11 温湿度",
    layer: "传感层",
    shape: "box",
    keywords: ["DHT11 module", "DHT11 温湿度模块", "DHT11 sensor"],
  },
  {
    id: "hc_sr04",
    label: "HC-SR04 超声波",
    layer: "传感层",
    shape: "box",
    keywords: ["HC-SR04 ultrasonic", "超声波测距模块", "HC-SR04 dimensions"],
  },
  {
    id: "sg90",
    label: "SG90 舵机",
    layer: "执行层",
    shape: "box",
    keywords: ["SG90 servo", "SG90 舵机 尺寸", "micro servo dimensions"],
  },
  {
    id: "oled_096",
    label: "0.96 OLED 屏",
    layer: "人机",
    shape: "box",
    keywords: ["0.96 OLED I2C", "SSD1306 OLED module", "OLED 0.96 模块"],
  },
  {
    id: "mq2",
    label: "MQ-2 气体传感器",
    layer: "传感层",
    shape: "sensor",
    keywords: ["MQ-2 gas sensor", "MQ2 烟雾传感器模块"],
  },
  {
    id: "led_street",
    label: "路灯灯头 / LED",
    layer: "执行层",
    shape: "lamp",
    keywords: ["LED street light head", "路灯灯头", "solar street light lamp head"],
  },
  {
    id: "lamp_pole",
    label: "灯杆",
    layer: "结构",
    shape: "pole",
    keywords: ["street light pole", "路灯灯杆", "lamp post 3d"],
  },
  {
    id: "breadboard",
    label: "面包板",
    layer: "结构",
    shape: "box",
    keywords: ["solderless breadboard", "面包板", "breadboard top view"],
  },
  {
    id: "power_mb102",
    label: "面包板电源模块",
    layer: "电源",
    shape: "box",
    keywords: ["MB102 breadboard power", "面包板电源模块"],
  },
  {
    id: "l298n",
    label: "L298N 电机驱动",
    layer: "执行层",
    shape: "box",
    keywords: ["L298N motor driver", "L298N 驱动模块"],
  },
];

/** 打开国内/国际图片搜索（新标签页） */
export function openImageSearch(keyword, engine = "bing") {
  const q = encodeURIComponent(`${keyword} 三视图 OR datasheet OR module`);
  const urls = {
    bing: `https://www.bing.com/images/search?q=${q}`,
    baidu: `https://image.baidu.com/search/index?tn=baiduimage&word=${encodeURIComponent(keyword + " 模块")}`,
    google: `https://www.google.com/search?tbm=isch&q=${q}`,
  };
  const url = urls[engine] || urls.bing;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function searchModuleImages(mod, engine = "bing") {
  const kw = (mod.keywords && mod.keywords[0]) || mod.label;
  openImageSearch(kw, engine);
}

export function filterLibrary(query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return MODULE_LIBRARY;
  return MODULE_LIBRARY.filter((m) => {
    const blob = [m.label, m.layer, ...(m.keywords || []), m.tips || ""]
      .join(" ")
      .toLowerCase();
    return blob.includes(q);
  });
}
