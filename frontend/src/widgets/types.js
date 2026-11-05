/** 大屏组件展示方式 */
export const WIDGET_TYPES = [
  {
    id: "value",
    name: "数值卡",
    desc: "大号当前值",
    defaultW: 3,
    defaultH: 3,
    multi: false,
  },
  {
    id: "gauge",
    name: "仪表盘",
    desc: "环形进度/仪表",
    defaultW: 4,
    defaultH: 5,
    multi: false,
  },
  {
    id: "line",
    name: "折线图",
    desc: "多属性趋势对比",
    defaultW: 6,
    defaultH: 5,
    multi: true,
  },
  {
    id: "bar",
    name: "柱状图",
    desc: "多属性柱状对比",
    defaultW: 6,
    defaultH: 5,
    multi: true,
  },
  {
    id: "table",
    name: "表格",
    desc: "多属性列表",
    defaultW: 6,
    defaultH: 5,
    multi: true,
  },
  {
    id: "status",
    name: "状态灯 / 开关",
    desc: "布尔状态，大屏可点按控制",
    defaultW: 4,
    defaultH: 4,
    multi: true,
  },
  {
    id: "setpoint",
    name: "阈值卡",
    desc: "可编辑数值，大屏可下发",
    defaultW: 4,
    defaultH: 4,
    multi: false,
  },
];

export function getWidgetType(id) {
  return WIDGET_TYPES.find((t) => t.id === id) || WIDGET_TYPES[0];
}

export function defaultSize(typeId) {
  const t = getWidgetType(typeId);
  return { w: t.defaultW, h: t.defaultH };
}
