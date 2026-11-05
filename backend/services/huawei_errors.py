"""把华为云 SDK / IoTDA 异常转成「指出哪个参数错了」的中文说明。"""

from __future__ import annotations

import re
from typing import Any


def _attr(exc: BaseException, name: str, default: Any = None) -> Any:
    try:
        return getattr(exc, name, default)
    except Exception:
        return default


def parse_huawei_error(exc: BaseException) -> dict[str, Any]:
    """从 SDK 异常或字符串中提取 status_code / error_code / error_msg。"""
    status = _attr(exc, "status_code")
    code = _attr(exc, "error_code")
    msg = _attr(exc, "error_msg")
    text = str(exc) or ""

    if code is None or msg is None:
        m = re.search(
            r"status_code\s*[:=]\s*(\d+).*?error_code\s*[:=]\s*([^,\s}]+).*?error_msg\s*[:=]\s*(.+?)(?:,\s*encoded_|})",
            text,
            re.I | re.S,
        )
        if m:
            status = status or m.group(1)
            code = code or m.group(2).strip()
            msg = msg or m.group(3).strip().rstrip(" }")
        else:
            m2 = re.search(r"(IOTDA\.\d+|APIGW\.\d+|APIG\.\d+)", text, re.I)
            if m2:
                code = code or m2.group(1)

    if isinstance(code, str):
        code = code.strip().strip("'\"")
    if isinstance(msg, str):
        msg = msg.strip().strip("'\"")

    return {
        "status_code": status,
        "error_code": code or "",
        "error_msg": msg or text,
        "raw": text,
    }


def format_huawei_error(exc: BaseException, hw: dict[str, Any] | None = None) -> str:
    """生成面向用户的中文错误说明，尽量点名出错字段。"""
    hw = hw or {}
    info = parse_huawei_error(exc)
    code = str(info.get("error_code") or "").upper()
    msg = str(info.get("error_msg") or "")
    msg_l = msg.lower()
    device_id = str(hw.get("device_id") or "").strip()
    project_id = str(hw.get("project_id") or "").strip()
    endpoint = str(hw.get("iotda_endpoint") or "").strip()
    region = str(hw.get("region") or "").strip()
    service_id = str(hw.get("service_id") or "").strip()
    derived = bool(hw.get("use_derived_auth", True))

    tip = _map_known_code(
        code, msg_l, device_id, project_id, endpoint, region, service_id, derived
    )
    if tip:
        return tip

    tip = _map_by_keywords(msg_l, text=str(info.get("raw") or ""), device_id=device_id)
    if tip:
        return tip

    if code:
        return f"连接失败（{code}）：{msg or '未知错误'}。请核对系统设置中的华为云连接参数。"
    return f"连接失败：{msg or str(exc)}。请核对系统设置中的华为云连接参数。"


def looks_like_standard_iotda_endpoint(endpoint: str) -> bool:
    """标准版/企业版应用侧地址通常带实例前缀，如 xxx.st1.iotda-app..."""
    ep = (endpoint or "").strip().lower()
    if not ep:
        return False
    if "iotda." in ep and ".st" not in ep and "iotda-app" not in ep:
        return False
    return bool(re.search(r"\.st\d*\.iotda-app\.|[\da-f]{6,}\.st\d*\.", ep))


def _quote(value: str) -> str:
    return f"「{value}」" if value else "（当前为空）"


def _map_known_code(
    code: str,
    msg_l: str,
    device_id: str,
    project_id: str,
    endpoint: str,
    region: str,
    service_id: str,
    derived: bool = True,
) -> str | None:
    # —— 设备相关 ——
    if code in {"IOTDA.014000"} or "device does not exist" in msg_l:
        return (
            f"【默认设备 ID】填写有误或设备不在当前项目中：{_quote(device_id)}。"
            "请到华为云物联网平台复制正确的设备 ID，并确认与【项目 ID】属于同一资源空间。"
        )

    if code == "IOTDA.014016" or "device is offline" in msg_l or "not online" in msg_l:
        return (
            f"设备当前不在线：{_quote(device_id)}。"
            "鉴权与设备 ID 可能正确，但设备未上报；请检查设备联网后再试。"
        )

    if code in {"IOTDA.014025", "IOTDA.014034"} or "serviceid" in msg_l:
        return (
            f"【服务 ID】不正确或不匹配：{_quote(service_id)}。"
            "请在产品模型 / 设备影子中核对 service_id（如 storage）。"
        )

    if code == "IOTDA.014018" or "frozen" in msg_l:
        return f"设备已被冻结，无法操作：{_quote(device_id)}。请在华为云控制台解冻后再试。"

    # —— 鉴权 / AK SK / 项目 ——
    if code in {"APIGW.0301", "APIG.0301", "IOTDA.000002", "IOTDA.001003"}:
        if "ak not exist" in msg_l or "get secretkey failed" in msg_l:
            return "【AK】不正确或已失效。请到华为云 IAM 控制台核对访问密钥 AK。"
        if "signature" in msg_l or "secret" in msg_l:
            return (
                "【AK / SK】鉴权失败：密钥不匹配或签名错误。"
                "请确认 SK 未输错；若 SK 显示为 **** 掩码且刚改过 AK，请重新粘贴完整 SK。"
            )
        if "project" in msg_l:
            return (
                f"【项目 ID】可能不正确：{_quote(project_id)}。"
                "请确认与物联网实例所在项目一致。"
            )
        # 标准版/企业版接入地址必须开派生认证
        if looks_like_standard_iotda_endpoint(endpoint) and not derived:
            return (
                "鉴权失败：当前是【标准版/企业版】接入地址，但【派生认证】未勾选。"
                "请勾选派生认证后保存，再点连接（这通常不是 AK/SK 填错）。"
            )
        if looks_like_standard_iotda_endpoint(endpoint) and derived:
            return (
                "鉴权失败（派生认证已开启）。请再核对【AK / SK】是否属于该【项目 ID】，"
                "以及接入密钥是否已启用。"
            )
        if not derived:
            return (
                "鉴权失败。若实例为标准版/企业版，请勾选【派生认证】后重试；"
                "基础版保持不勾选。也可先核对 AK / SK / 项目 ID。"
            )
        return (
            "【AK / SK】或【项目 ID】鉴权失败。"
            "基础版请取消【派生认证】；标准版/企业版请勾选。"
        )

    if code.startswith("APIGW.") or code.startswith("APIG."):
        if "endpoint" in msg_l or "not found" in msg_l:
            return (
                f"【物联网平台应用侧接入地址】可能不正确：{_quote(endpoint)}。"
                "须使用含 iotda-app 的应用侧地址，并带 https://。"
            )
        return (
            f"网关鉴权失败（{code}）。请检查【AK / SK】、【项目 ID】、【区域】与【接入地址】是否匹配。"
        )

    if "region" in msg_l and ("invalid" in msg_l or "mismatch" in msg_l):
        return (
            f"【区域】可能不正确：{_quote(region)}。"
            "请与接入地址中的区域一致（如 cn-north-4）。"
        )

    if code in {"IOTDA.013001", "IOTDA.013002"}:
        return (
            f"【项目 ID】或资源空间不正确：{_quote(project_id)}。"
            "请确认设备所属应用/项目与填写一致。"
        )

    return None


def _map_by_keywords(msg_l: str, text: str, device_id: str) -> str | None:
    t = (msg_l + " " + text.lower()).lower()

    if "device does not exist" in t or "设备不存在" in text:
        return (
            f"【默认设备 ID】填写有误：{_quote(device_id)}。"
            "云端查无此设备，请核对设备 ID 与项目是否对应。"
        )
    if "verify aksk" in t or "signature fail" in t:
        return "【AK / SK】不正确：签名校验失败，请重新填写访问密钥。"
    if "ak not exist" in t:
        return "【AK】不存在或已删除，请到 IAM 重新创建并填写。"
    if "ssl" in t or "certificate" in t:
        return "接入地址 HTTPS 证书校验失败，请检查【物联网平台应用侧接入地址】是否完整正确。"
    if "timed out" in t or "timeout" in t or "connection refused" in t:
        return (
            "无法连接到【物联网平台应用侧接入地址】。"
            "请检查地址、本机网络，以及是否误用了设备侧/非 iotda-app 地址。"
        )
    if "name or service not known" in t or "getaddrinfo" in t or "nodename" in t:
        return "【物联网平台应用侧接入地址】主机名无法解析，请检查地址拼写。"
    return None
