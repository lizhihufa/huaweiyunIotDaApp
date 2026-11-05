"""华为云 IoTDA 应用侧：查影子、下发属性、测连。"""

from __future__ import annotations

import logging
from typing import Any

from huaweicloudsdkcore.auth.credentials import BasicCredentials, DerivedCredentials
from huaweicloudsdkcore.http.http_config import HttpConfig
from huaweicloudsdkcore.region.region import Region
from huaweicloudsdkiotda.v5 import (
    DevicePropertiesRequest,
    IoTDAClient,
    ShowDeviceShadowRequest,
    UpdatePropertiesRequest,
)

log = logging.getLogger("hwy.huawei")


class HuaweiIoTClient:
    def __init__(self, cfg: dict[str, Any]) -> None:
        self.device_id = cfg["device_id"]
        self.service_id = cfg.get("service_id") or "storage"
        project_id = cfg["project_id"]
        region_id = cfg.get("region") or "cn-north-4"
        endpoint = str(cfg["iotda_endpoint"]).rstrip("/")
        host = endpoint.replace("https://", "").replace("http://", "")

        credentials = BasicCredentials(cfg["ak"], cfg["sk"], project_id)
        if cfg.get("use_derived_auth", True):
            credentials.with_derived_predicate(
                DerivedCredentials.get_default_derived_predicate()
            )

        http_config = HttpConfig.get_default_config()
        http_config.ignore_ssl_verification = False
        http_config.timeout = 35

        self._client = (
            IoTDAClient.new_builder()
            .with_credentials(credentials)
            .with_region(Region(region_id, host))
            .with_http_config(http_config)
            .build()
        )

    def get_reported_properties(self) -> dict[str, Any]:
        req = ShowDeviceShadowRequest(device_id=self.device_id)
        resp = self._client.show_device_shadow(req)
        shadow_list = resp.shadow or []
        for item in shadow_list:
            if getattr(item, "service_id", None) != self.service_id:
                continue
            reported = getattr(item, "reported", None)
            if reported is None:
                return {}
            props = getattr(reported, "properties", None)
            if props is None:
                return {}
            if isinstance(props, dict):
                return dict(props)
            if hasattr(props, "to_dict"):
                return dict(props.to_dict())
            return dict(props)
        return {}

    def set_properties(self, properties: dict[str, Any]) -> None:
        log.info(
            "set_properties device=%s service=%s %s",
            self.device_id,
            self.service_id,
            properties,
        )
        body = DevicePropertiesRequest(
            services=[
                {
                    "service_id": self.service_id,
                    "properties": properties,
                }
            ]
        )
        req = UpdatePropertiesRequest(device_id=self.device_id, body=body)
        self._client.update_properties(req)
        log.info("set_properties ok")
