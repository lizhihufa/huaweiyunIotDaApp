"""设备模块库（开发板/传感器/执行器）与场景素材库（草/树/木/植物/作物）。"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

from app.paths import LIBRARY_DIR
from storage.files import read_json, write_json

_SAFE = re.compile(r"^[a-zA-Z0-9_\-]+$")

DEVICES_FILE = LIBRARY_DIR / "devices.json"
SCENES_FILE = LIBRARY_DIR / "scenes.json"

DEVICE_KINDS = ("board", "sensor", "actuator", "module")
# 天际线式分区：住宅 / 大棚 / 商店 / 装饰 / 马路
SCENE_KINDS = ("residential", "greenhouse", "shop", "decoration", "road")

# 旧分类 → 新分类（兼容已有库）
_SCENE_KIND_MIGRATE = {
    "grass": "decoration",
    "tree": "decoration",
    "wood": "decoration",
    "plant": "decoration",
    "crop": "decoration",
    "prop": "decoration",
}

DEFAULT_DEVICES: list[dict[str, Any]] = [
    # —— 开发板 ——
    {
        "id": "stm32_mcu",
        "name": "STM32 主控板",
        "kind": "board",
        "layer": "控制层",
        "part_id": "mcu",
        "model": {"kind": "builtin", "id": "dev_mcu"},
        "builtin": True,
        "desc": "STM32 最小系统 / 主控模块",
    },
    {
        "id": "esp32_devkit",
        "name": "ESP32 DevKit",
        "kind": "board",
        "layer": "控制层",
        "part_id": "mcu",
        "model": {"kind": "builtin", "id": "dev_esp32"},
        "builtin": True,
        "desc": "Wi-Fi / BLE 双模开发板",
    },
    {
        "id": "esp8266_nodemcu",
        "name": "ESP8266 NodeMCU",
        "kind": "board",
        "layer": "控制层",
        "part_id": "mcu",
        "model": {"kind": "builtin", "id": "dev_esp8266"},
        "builtin": True,
        "desc": "低成本 Wi-Fi 开发板",
    },
    {
        "id": "arduino_uno",
        "name": "Arduino Uno",
        "kind": "board",
        "layer": "控制层",
        "part_id": "mcu",
        "model": {"kind": "builtin", "id": "dev_arduino"},
        "builtin": True,
        "desc": "经典入门开发板",
    },
    {
        "id": "raspberry_pi_zero",
        "name": "树莓派 Zero",
        "kind": "board",
        "layer": "控制层",
        "part_id": "gateway",
        "model": {"kind": "builtin", "id": "dev_rpi"},
        "builtin": True,
        "desc": "边缘网关 / 轻量 Linux 板",
    },
    # —— 传感器 ——
    {
        "id": "ldr_module",
        "name": "光敏电阻模块",
        "kind": "sensor",
        "layer": "传感层",
        "part_id": "ldr",
        "model": {"kind": "builtin", "id": "dev_ldr"},
        "builtin": True,
        "desc": "光照强度检测",
    },
    {
        "id": "dht11",
        "name": "DHT11 温湿度",
        "kind": "sensor",
        "layer": "传感层",
        "part_id": "sensor_temp",
        "model": {"kind": "builtin", "id": "dev_dht11"},
        "builtin": True,
        "desc": "空气温湿度传感器",
    },
    {
        "id": "soil_moisture",
        "name": "土壤湿度探头",
        "kind": "sensor",
        "layer": "传感层",
        "part_id": "soil_sensor",
        "model": {"kind": "builtin", "id": "dev_soil"},
        "builtin": True,
        "desc": "电阻式土壤湿度传感器",
    },
    {
        "id": "hc_sr04",
        "name": "HC-SR04 超声波",
        "kind": "sensor",
        "layer": "传感层",
        "part_id": "ultrasonic",
        "model": {"kind": "builtin", "id": "dev_ultrasonic"},
        "builtin": True,
        "desc": "测距 / 水位辅助",
    },
    {
        "id": "mq2",
        "name": "MQ-2 气体传感器",
        "kind": "sensor",
        "layer": "传感层",
        "part_id": "gas_sensor",
        "model": {"kind": "builtin", "id": "dev_mq2"},
        "builtin": True,
        "desc": "烟雾 / 可燃气体检测",
    },
    {
        "id": "pir_motion",
        "name": "PIR 人体红外",
        "kind": "sensor",
        "layer": "传感层",
        "part_id": "pir",
        "model": {"kind": "builtin", "id": "dev_pir"},
        "builtin": True,
        "desc": "人体感应传感器",
    },
    {
        "id": "water_level",
        "name": "水位传感器",
        "kind": "sensor",
        "layer": "传感层",
        "part_id": "water_sensor",
        "model": {"kind": "builtin", "id": "dev_water"},
        "builtin": True,
        "desc": "液位 / 浸水检测",
    },
    {
        "id": "camera_module",
        "name": "摄像头模块",
        "kind": "sensor",
        "layer": "传感层",
        "part_id": "camera",
        "model": {"kind": "builtin", "id": "dev_camera"},
        "builtin": True,
        "desc": "OV2640 / USB 摄像头示意",
    },
    # —— 执行器 ——
    {
        "id": "relay_module",
        "name": "继电器模块",
        "kind": "actuator",
        "layer": "执行层",
        "part_id": "relay",
        "model": {"kind": "builtin", "id": "dev_relay"},
        "builtin": True,
        "desc": "开关执行器",
    },
    {
        "id": "sg90_servo",
        "name": "SG90 舵机",
        "kind": "actuator",
        "layer": "执行层",
        "part_id": "servo",
        "model": {"kind": "builtin", "id": "dev_servo"},
        "builtin": True,
        "desc": "微型舵机",
    },
    {
        "id": "water_pump",
        "name": "微型水泵",
        "kind": "actuator",
        "layer": "执行层",
        "part_id": "pump",
        "model": {"kind": "builtin", "id": "dev_pump"},
        "builtin": True,
        "desc": "灌溉 / 抽水执行器",
    },
    {
        "id": "solenoid_valve",
        "name": "电磁阀",
        "kind": "actuator",
        "layer": "执行层",
        "part_id": "valve",
        "model": {"kind": "builtin", "id": "dev_valve"},
        "builtin": True,
        "desc": "管路开关阀",
    },
    {
        "id": "cooling_fan",
        "name": "散热风机",
        "kind": "actuator",
        "layer": "执行层",
        "part_id": "fan",
        "model": {"kind": "builtin", "id": "dev_fan"},
        "builtin": True,
        "desc": "大棚通风 / 散热",
    },
    {
        "id": "street_lamp_head",
        "name": "路灯灯头",
        "kind": "actuator",
        "layer": "执行层",
        "part_id": "lamp",
        "model": {"kind": "builtin", "id": "dev_lamp"},
        "builtin": True,
        "desc": "路灯执行部件",
    },
    {
        "id": "led_strip",
        "name": "LED 灯带模块",
        "kind": "actuator",
        "layer": "执行层",
        "part_id": "led",
        "model": {"kind": "builtin", "id": "dev_led"},
        "builtin": True,
        "desc": "指示灯 / 补光",
    },
    # —— 通信 / 人机 / 整机 ——
    {
        "id": "wifi_module",
        "name": "Wi-Fi 通信模块",
        "kind": "module",
        "layer": "通信层",
        "part_id": "wifi",
        "model": {"kind": "builtin", "id": "dev_wifi"},
        "builtin": True,
        "desc": "无线通信模块",
    },
    {
        "id": "oled_096",
        "name": "0.96 OLED 屏",
        "kind": "module",
        "layer": "人机",
        "part_id": "oled",
        "model": {"kind": "builtin", "id": "dev_oled"},
        "builtin": True,
        "desc": "SSD1306 显示模块",
    },
    {
        "id": "lora_module",
        "name": "LoRa 模块",
        "kind": "module",
        "layer": "通信层",
        "part_id": "lora",
        "model": {"kind": "builtin", "id": "dev_lora"},
        "builtin": True,
        "desc": "远距离低功耗通信",
    },
    {
        "id": "street_light_kit",
        "name": "智能路灯整机（示例）",
        "kind": "module",
        "layer": "结构",
        "part_id": "assembly",
        "model": {"kind": "builtin", "id": "street_light"},
        "builtin": True,
        "desc": "内置路灯装配：节点名=partId",
    },

    {"id": "esp32_s3", "name": "ESP32-S3", "kind": "board", "layer": "控制层", "part_id": "mcu", "model": {"kind": "builtin", "id": "dev_esp32s3"}, "builtin": True, "desc": "AI / 双 USB 开发板"},
    {"id": "arduino_nano", "name": "Arduino Nano", "kind": "board", "layer": "控制层", "part_id": "mcu", "model": {"kind": "builtin", "id": "dev_arduino_nano"}, "builtin": True, "desc": "紧凑型 Arduino"},
    {"id": "raspberry_pi4", "name": "树莓派 4", "kind": "board", "layer": "控制层", "part_id": "gateway", "model": {"kind": "builtin", "id": "dev_rpi4"}, "builtin": True, "desc": "边缘计算网关"},
    {"id": "nrf52840", "name": "nRF52840", "kind": "board", "layer": "控制层", "part_id": "mcu", "model": {"kind": "builtin", "id": "dev_nrf"}, "builtin": True, "desc": "低功耗蓝牙 SoC"},
    {"id": "dht22", "name": "DHT22 温湿度", "kind": "sensor", "layer": "传感层", "part_id": "sensor_temp", "model": {"kind": "builtin", "id": "dev_dht22"}, "builtin": True, "desc": "高精度温湿度"},
    {"id": "bmp280", "name": "BMP280 气压", "kind": "sensor", "layer": "传感层", "part_id": "pressure", "model": {"kind": "builtin", "id": "dev_bmp280"}, "builtin": True, "desc": "气压 / 海拔"},
    {"id": "bh1750", "name": "BH1750 光照", "kind": "sensor", "layer": "传感层", "part_id": "lux", "model": {"kind": "builtin", "id": "dev_bh1750"}, "builtin": True, "desc": "数字光照传感器"},
    {"id": "ph_sensor", "name": "pH 探头", "kind": "sensor", "layer": "传感层", "part_id": "ph_sensor", "model": {"kind": "builtin", "id": "dev_ph"}, "builtin": True, "desc": "水质酸碱度"},
    {"id": "rain_sensor", "name": "雨滴传感器", "kind": "sensor", "layer": "传感层", "part_id": "rain", "model": {"kind": "builtin", "id": "dev_rain"}, "builtin": True, "desc": "降雨检测"},
    {"id": "flow_sensor", "name": "水流流量计", "kind": "sensor", "layer": "传感层", "part_id": "flow", "model": {"kind": "builtin", "id": "dev_flow"}, "builtin": True, "desc": "灌溉流量"},
    {"id": "mq135", "name": "MQ-135 空气质量", "kind": "sensor", "layer": "传感层", "part_id": "gas_sensor", "model": {"kind": "builtin", "id": "dev_mq135"}, "builtin": True, "desc": "CO2 / 空气质量"},
    {"id": "gps_neo", "name": "GPS NEO-6M", "kind": "sensor", "layer": "传感层", "part_id": "gps", "model": {"kind": "builtin", "id": "dev_gps"}, "builtin": True, "desc": "定位模块"},
    {"id": "button_mod", "name": "按键模块", "kind": "sensor", "layer": "人机", "part_id": "button", "model": {"kind": "builtin", "id": "dev_button"}, "builtin": True, "desc": "输入按键"},
    {"id": "stepper_28byj", "name": "步进电机", "kind": "actuator", "layer": "执行层", "part_id": "stepper", "model": {"kind": "builtin", "id": "dev_stepper"}, "builtin": True, "desc": "28BYJ / 驱动"},
    {"id": "buzzer", "name": "有源蜂鸣器", "kind": "actuator", "layer": "执行层", "part_id": "buzzer", "model": {"kind": "builtin", "id": "dev_buzzer"}, "builtin": True, "desc": "报警提示音"},
    {"id": "heater_pad", "name": "加热垫", "kind": "actuator", "layer": "执行层", "part_id": "heater", "model": {"kind": "builtin", "id": "dev_heater"}, "builtin": True, "desc": "育苗加热"},
    {"id": "sprinkler", "name": "喷灌头", "kind": "actuator", "layer": "执行层", "part_id": "sprinkler", "model": {"kind": "builtin", "id": "dev_sprinkler"}, "builtin": True, "desc": "喷淋执行器"},
    {"id": "rgb_led", "name": "RGB 灯珠", "kind": "actuator", "layer": "执行层", "part_id": "rgb", "model": {"kind": "builtin", "id": "dev_rgb"}, "builtin": True, "desc": "彩色指示"},
    {"id": "hc05", "name": "蓝牙 HC-05", "kind": "module", "layer": "通信层", "part_id": "bluetooth", "model": {"kind": "builtin", "id": "dev_bt"}, "builtin": True, "desc": "经典蓝牙串口"},
    {"id": "tft_18", "name": "1.8 TFT 彩屏", "kind": "module", "layer": "人机", "part_id": "tft", "model": {"kind": "builtin", "id": "dev_tft"}, "builtin": True, "desc": "彩色显示"},
    {"id": "nbiot", "name": "NB-IoT 模块", "kind": "module", "layer": "通信层", "part_id": "nbiot", "model": {"kind": "builtin", "id": "dev_nbiot"}, "builtin": True, "desc": "蜂窝窄带物联网"},
    {"id": "rs485", "name": "RS485 模块", "kind": "module", "layer": "通信层", "part_id": "rs485", "model": {"kind": "builtin", "id": "dev_rs485"}, "builtin": True, "desc": "工业总线"},
    {"id": "sd_card", "name": "SD 卡模块", "kind": "module", "layer": "存储", "part_id": "sd", "model": {"kind": "builtin", "id": "dev_sd"}, "builtin": True, "desc": "本地存储"},
    {"id": "battery_pack", "name": "电池组", "kind": "module", "layer": "电源", "part_id": "battery", "model": {"kind": "builtin", "id": "dev_battery"}, "builtin": True, "desc": "供电模块"},
    {"id": "breadboard", "name": "面包板", "kind": "module", "layer": "结构", "part_id": "breadboard", "model": {"kind": "builtin", "id": "dev_breadboard"}, "builtin": True, "desc": "原型搭接"},
]

DEFAULT_SCENES: list[dict[str, Any]] = [
    # —— 住宅 ——
    {"id": "house_small", "name": "小住宅", "kind": "residential", "model": {"kind": "builtin", "id": "bld_house_small"}, "builtin": True, "desc": "单层住宅"},
    {"id": "house_two_story", "name": "两层住宅", "kind": "residential", "model": {"kind": "builtin", "id": "bld_house_two"}, "builtin": True, "desc": "双层民居"},
    {"id": "apartment_block", "name": "公寓楼", "kind": "residential", "model": {"kind": "builtin", "id": "bld_apartment"}, "builtin": True, "desc": "多层公寓"},
    # —— 大棚 ——
    {"id": "greenhouse_tunnel", "name": "拱形大棚", "kind": "greenhouse", "model": {"kind": "builtin", "id": "bld_greenhouse"}, "builtin": True, "desc": "种植拱棚"},
    {"id": "greenhouse_glass", "name": "玻璃温室", "kind": "greenhouse", "model": {"kind": "builtin", "id": "bld_glasshouse"}, "builtin": True, "desc": "玻璃房温室"},
    {"id": "crop_tomato", "name": "番茄架", "kind": "greenhouse", "model": {"kind": "builtin", "id": "scene_tomato"}, "builtin": True, "desc": "棚内作物"},
    {"id": "crop_row", "name": "作物行", "kind": "greenhouse", "model": {"kind": "builtin", "id": "scene_crop"}, "builtin": True, "desc": "种植行"},
    # —— 商店 ——
    {"id": "shop_small", "name": "小商店", "kind": "shop", "model": {"kind": "builtin", "id": "bld_shop"}, "builtin": True, "desc": "临街商铺"},
    {"id": "shop_market", "name": "市集摊位", "kind": "shop", "model": {"kind": "builtin", "id": "bld_market"}, "builtin": True, "desc": "露天摊位"},
    {"id": "shop_warehouse", "name": "仓储小库", "kind": "shop", "model": {"kind": "builtin", "id": "bld_warehouse"}, "builtin": True, "desc": "商用库房"},
    # —— 装饰（花草树） ——
    {"id": "grass_patch", "name": "草地块", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_grass"}, "builtin": True, "desc": "短草坪"},
    {"id": "grass_tall", "name": "高草丛", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_grass_tall"}, "builtin": True, "desc": "高草"},
    {"id": "tree_deciduous", "name": "阔叶树", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_tree"}, "builtin": True, "desc": "行道树"},
    {"id": "tree_pine", "name": "松树", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_pine"}, "builtin": True, "desc": "针叶树"},
    {"id": "tree_fruit", "name": "果树", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_fruit_tree"}, "builtin": True, "desc": "果树"},
    {"id": "plant_bush", "name": "灌木盆栽", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_plant"}, "builtin": True, "desc": "盆栽"},
    {"id": "plant_flower", "name": "花卉丛", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_flower"}, "builtin": True, "desc": "花卉"},
    {"id": "plant_vine", "name": "藤蔓架", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_vine"}, "builtin": True, "desc": "藤蔓"},
    {"id": "wood_log", "name": "原木", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_wood"}, "builtin": True, "desc": "装饰木"},
    {"id": "wood_fence", "name": "木栅栏", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_fence"}, "builtin": True, "desc": "围栏"},
    {"id": "prop_rock", "name": "石块", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_rock"}, "builtin": True, "desc": "景观石"},
    {"id": "crop_wheat", "name": "麦田簇", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_wheat"}, "builtin": True, "desc": "麦田装饰"},
    {"id": "crop_corn", "name": "玉米株", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_corn"}, "builtin": True, "desc": "玉米"},
    {"id": "crop_rice", "name": "稻丛", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_rice"}, "builtin": True, "desc": "稻丛"},
    # —— 马路（可铺路） ——
    {"id": "road_tile", "name": "马路砖", "kind": "road", "model": {"kind": "builtin", "id": "road_tile"}, "builtin": True, "desc": "正方形路砖，可网格铺设", "snap": 2},
    {"id": "road_straight", "name": "直道段", "kind": "road", "model": {"kind": "builtin", "id": "road_straight"}, "builtin": True, "desc": "直线马路段", "snap": 2},
    {"id": "road_cross", "name": "十字路口", "kind": "road", "model": {"kind": "builtin", "id": "road_cross"}, "builtin": True, "desc": "交叉路口砖", "snap": 2},
    {"id": "road_sidewalk", "name": "人行道", "kind": "road", "model": {"kind": "builtin", "id": "road_sidewalk"}, "builtin": True, "desc": "人行道板", "snap": 2},
    {"id": "prop_path", "name": "石板小路", "kind": "road", "model": {"kind": "builtin", "id": "scene_path"}, "builtin": True, "desc": "石板小路段", "snap": 1},

    {"id": "villa", "name": "别墅", "kind": "residential", "model": {"kind": "builtin", "id": "bld_villa"}, "builtin": True, "desc": "独栋别墅"},
    {"id": "townhouse", "name": "联排屋", "kind": "residential", "model": {"kind": "builtin", "id": "bld_townhouse"}, "builtin": True, "desc": "联排住宅"},
    {"id": "courtyard", "name": "四合院", "kind": "residential", "model": {"kind": "builtin", "id": "bld_courtyard"}, "builtin": True, "desc": "院落住宅"},
    {"id": "nursery_bench", "name": "育苗架", "kind": "greenhouse", "model": {"kind": "builtin", "id": "bld_nursery"}, "builtin": True, "desc": "穴盘育苗"},
    {"id": "water_tank", "name": "蓄水罐", "kind": "greenhouse", "model": {"kind": "builtin", "id": "bld_tank"}, "builtin": True, "desc": "灌溉水箱"},
    {"id": "shade_net", "name": "遮阳网架", "kind": "greenhouse", "model": {"kind": "builtin", "id": "bld_shade"}, "builtin": True, "desc": "遮阳设施"},
    {"id": "cafe", "name": "咖啡馆", "kind": "shop", "model": {"kind": "builtin", "id": "bld_cafe"}, "builtin": True, "desc": "临街咖啡店"},
    {"id": "farm_store", "name": "农资店", "kind": "shop", "model": {"kind": "builtin", "id": "bld_farm_store"}, "builtin": True, "desc": "农资商铺"},
    {"id": "tree_willow", "name": "柳树", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_willow"}, "builtin": True, "desc": "垂柳"},
    {"id": "tree_palm", "name": "棕榈", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_palm"}, "builtin": True, "desc": "热带树"},
    {"id": "bamboo", "name": "竹丛", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_bamboo"}, "builtin": True, "desc": "竹子"},
    {"id": "sunflower", "name": "向日葵", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_sunflower"}, "builtin": True, "desc": "花卉作物"},
    {"id": "bench", "name": "长椅", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_bench"}, "builtin": True, "desc": "街边长椅"},
    {"id": "fountain", "name": "喷泉", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_fountain"}, "builtin": True, "desc": "景观喷泉"},
    {"id": "mailbox", "name": "邮筒", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_mailbox"}, "builtin": True, "desc": "路边邮筒"},
    {"id": "yard_lamp", "name": "庭院灯", "kind": "decoration", "model": {"kind": "builtin", "id": "scene_lamp_deco"}, "builtin": True, "desc": "装饰路灯"},
    {"id": "road_t", "name": "丁字路口", "kind": "road", "model": {"kind": "builtin", "id": "road_t"}, "builtin": True, "desc": "T 型路口", "snap": 2},
    {"id": "road_curve", "name": "弯道", "kind": "road", "model": {"kind": "builtin", "id": "road_curve"}, "builtin": True, "desc": "转弯路段", "snap": 2},
    {"id": "road_zebra", "name": "斑马线", "kind": "road", "model": {"kind": "builtin", "id": "road_zebra"}, "builtin": True, "desc": "人行横道", "snap": 2},
    {"id": "parking", "name": "停车位", "kind": "road", "model": {"kind": "builtin", "id": "road_parking"}, "builtin": True, "desc": "停车格", "snap": 2},
    {"id": "bridge", "name": "小桥", "kind": "road", "model": {"kind": "builtin", "id": "road_bridge"}, "builtin": True, "desc": "过河小桥", "snap": 2},
]



def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _ensure_store(path, defaults: list[dict[str, Any]]) -> list[dict[str, Any]]:
    LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
    data = read_json(path, None)
    if not isinstance(data, dict) or "items" not in data:
        payload = {"items": [dict(x) for x in defaults]}
        for it in payload["items"]:
            it.setdefault("created_at", _now())
            it.setdefault("updated_at", _now())
        write_json(path, payload)
        return payload["items"]
    items = list(data.get("items") or [])
    by_id = {str(i.get("id")): i for i in items}
    default_ids = {d["id"] for d in defaults}
    changed = False
    now = _now()
    for d in defaults:
        if d["id"] not in by_id:
            row = dict(d)
            row.setdefault("created_at", now)
            row.setdefault("updated_at", now)
            items.append(row)
            by_id[d["id"]] = row
            changed = True
            continue
        cur = by_id[d["id"]]
        if not cur.get("builtin"):
            continue
        # 同步内置项的分类 / 名称 / 模型
        for key in ("name", "kind", "model", "desc", "snap", "layer", "part_id"):
            if key in d and cur.get(key) != d.get(key):
                cur[key] = d[key]
                changed = True
        cur["builtin"] = True
    # 迁移旧分类名
    for cur in items:
        kind = cur.get("kind")
        if kind in _SCENE_KIND_MIGRATE:
            cur["kind"] = _SCENE_KIND_MIGRATE[kind]
            changed = True
        # 移除已废弃的内置项（仍保留用户自定义）
        if cur.get("builtin") and cur.get("id") not in default_ids and path == SCENES_FILE:
            # 保留旧装饰类内置，不删，仅已迁移 kind
            pass
    if changed:
        write_json(path, {"items": items})
    return items


def _write_items(path, items: list[dict[str, Any]]) -> None:
    write_json(path, {"items": items})


def ensure_default() -> None:
    _ensure_store(DEVICES_FILE, DEFAULT_DEVICES)
    _ensure_store(SCENES_FILE, DEFAULT_SCENES)


def list_devices() -> list[dict[str, Any]]:
    return _ensure_store(DEVICES_FILE, DEFAULT_DEVICES)


def list_scenes() -> list[dict[str, Any]]:
    return _ensure_store(SCENES_FILE, DEFAULT_SCENES)


def get_device(item_id: str) -> dict[str, Any] | None:
    return next((x for x in list_devices() if x.get("id") == item_id), None)


def get_scene(item_id: str) -> dict[str, Any] | None:
    return next((x for x in list_scenes() if x.get("id") == item_id), None)


def _sanitize_id(raw: str | None, prefix: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9_\-]", "", (raw or "").strip())[:40]
    if base and _SAFE.match(base):
        return base
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def save_device(body: dict[str, Any]) -> dict[str, Any]:
    items = list_devices()
    item_id = _sanitize_id(body.get("id"), "dev")
    kind = body.get("kind") or "module"
    if kind not in DEVICE_KINDS:
        kind = "module"
    model = body.get("model") or {"kind": "builtin", "id": "dev_mcu"}
    now = _now()
    existing = next((i for i in items if i["id"] == item_id), None)
    item = {
        **(existing or {}),
        "id": item_id,
        "name": (body.get("name") or item_id).strip(),
        "kind": kind,
        "layer": body.get("layer") or "自定义",
        "part_id": body.get("part_id") or item_id,
        "model": model,
        "desc": body.get("desc") or "",
        "builtin": bool((existing or {}).get("builtin")) and body.get("builtin") is not False,
        "updated_at": now,
        "created_at": (existing or {}).get("created_at") or now,
    }
    if body.get("builtin") is False or not existing:
        item["builtin"] = bool(body.get("builtin"))
    if existing:
        items = [item if i["id"] == item_id else i for i in items]
    else:
        items.append(item)
    _write_items(DEVICES_FILE, items)
    return item


def save_scene(body: dict[str, Any]) -> dict[str, Any]:
    items = list_scenes()
    item_id = _sanitize_id(body.get("id"), "scn")
    kind = body.get("kind") or "prop"
    if kind not in SCENE_KINDS:
        kind = "prop"
    model = body.get("model") or {"kind": "builtin", "id": "scene_grass"}
    now = _now()
    existing = next((i for i in items if i["id"] == item_id), None)
    item = {
        **(existing or {}),
        "id": item_id,
        "name": (body.get("name") or item_id).strip(),
        "kind": kind,
        "model": model,
        "desc": body.get("desc") or "",
        "builtin": bool((existing or {}).get("builtin")) and body.get("builtin") is not False,
        "updated_at": now,
        "created_at": (existing or {}).get("created_at") or now,
    }
    if body.get("builtin") is False or not existing:
        item["builtin"] = bool(body.get("builtin"))
    if existing:
        items = [item if i["id"] == item_id else i for i in items]
    else:
        items.append(item)
    _write_items(SCENES_FILE, items)
    return item


def delete_device(item_id: str) -> bool:
    items = list_devices()
    target = next((i for i in items if i["id"] == item_id), None)
    if not target:
        return False
    if target.get("builtin"):
        raise ValueError("内置设备不可删除")
    next_items = [i for i in items if i["id"] != item_id]
    _write_items(DEVICES_FILE, next_items)
    return True


def delete_scene(item_id: str) -> bool:
    items = list_scenes()
    target = next((i for i in items if i["id"] == item_id), None)
    if not target:
        return False
    if target.get("builtin"):
        raise ValueError("内置场景素材不可删除")
    next_items = [i for i in items if i["id"] != item_id]
    _write_items(SCENES_FILE, next_items)
    return True
