# Wenshidu Card

Wenshidu Card 是一个专为 Home Assistant 设计的自定义 Lovelace 卡片组件，用于可视化家居环境的温度和湿度数据。它通过交互式平面图、时间线回放和历史图表，帮助用户监控多个房间的温湿度变化，支持实时更新和历史数据分析。该卡片适用于智能家居场景，如家庭环境监测或自动化调试，支持高度自定义配置以适应不同用户需求。

### 示例截图

以下是 Wenshidu Card 的三种运行效果（左：完整界面；中：单温度面板；右：温度湿度并排），更多自定义效果请自行研究：

<div style="display: flex; justify-content: space-around; align-items: center; flex-wrap: wrap;">
  <img src="https://raw.githubusercontent.com/chjspp520/wenshidu/main/%E5%85%A8%E9%83%A8.png" alt="完整卡片界面，包括时间线、温度和湿度面板" style="width: 30%; height: auto; margin: 5px;">
  <img src="https://raw.githubusercontent.com/chjspp520/wenshidu/main/%E5%8D%95%E6%B8%A9%E5%BA%A6.png" alt="单温度面板，显示房间温度值" style="width: 30%; height: auto; margin: 5px;">
  <img src="https://raw.githubusercontent.com/chjspp520/wenshidu/main/%E6%B8%A9%E5%BA%A6%E6%B9%BF%E5%BA%A6.png" alt="温度和湿度面板并排显示" style="width: 30%; height: auto; margin: 5px;">

  <img src="https://github.com/chjspp520/wenshidu/blob/main/%E5%9B%BE%E8%A1%A8.png" alt="点击房间弹出的图表" style="width: 30%; height: auto; margin: 5px;">
  <img src="https://github.com/chjspp520/wenshidu/blob/main/%E5%9B%BE%E8%A1%A82.png" alt="点击房间弹出的图表" style="width: 30%; height: auto; margin: 5px;">
  <img src="https://github.com/chjspp520/wenshidu/blob/main/%E5%9B%BE%E8%A1%A83.png" alt="点击房间弹出的图表" style="width: 30%; height: auto; margin: 5px;">
  <img src="https://github.com/chjspp520/wenshidu/blob/main/%E6%B8%A9%E6%B9%BF%E5%BA%A6%E5%8D%A1%E7%89%87%E6%BC%94%E7%A4%BAgif.gif" alt="点击房间弹出的图表" style="width: 80%; height: auto; margin: 5px;">
  v1.1.0新增功能
   <img src="https://github.com/chjspp520/wenshidu/blob/main/%E4%BB%85%E6%B8%A9%E6%B9%BF%E5%BA%A6%E6%88%BF%E9%97%B4%E5%8D%A1%E7%89%87.gif" alt="点击房间弹出的图表" style="width: 80%; height: auto; margin: 5px;">

</div>



## 主要功能

楼层平面图可视化： 使用 辅助工具（房间制作.html，已提供）绘制房间布局，在平面图上实时显示每个房间的温度和湿度值。支持点击房间高亮显示，并切换为主显示区域。
时间线回放：内置时间滑块，支持以 5 分钟间隔回放历史数据。包括播放/暂停按钮、日期切换（前一天/后一天/当前），以及渐变进度条显示可用数据范围。

历史数据图表：集成 eCharts 显示单个房间或全屋的温度/湿度历史曲线图。支持 1 天/3 天/7 天范围切换，显示最大/最小值，并通过工具提示展示详细数据（即使某些时间点无数据，也会显示最近值）。

自定义颜色映射：支持温度和湿度颜色范围自定义（例如，低温蓝/高温红），或使用默认渐变色。

数据优化：内置缓存机制，提高加载速度；支持精度配置（小数位数）和字体大小自定义。

显示控制：可配置显示/隐藏时间段、温度面板、湿度面板、标题等。标题位置支持顶部或底部。

实体支持：兼容多种传感器实体（如 sensor.temperature），并处理“未知”或“不可用”状态。

最小模式：新增当show_time_section: false时，点击卡片空白处弹出完整卡片（全功能）


其他：自动滑动检测（无交互时前进到当前时间）、错误处理（如无历史数据提示），以及 eCharts 路径自定义（本地或 CDN）。

该卡片强调用户交互性和视觉反馈，例如房间高亮动画和图表交互（缩放、拖拽）。



## 安装

手动安装：

下载 wenshidu-card.js 文件。

放置到 www 目录下的自定义文件夹中（例如：/config/www/custom-cards/wenshidu-card.js）。

在 Lovelace 配置中添加资源：类型为“JavaScript Module”，URL 为 /local/custom-cards/wenshidu-card.js?v=1.0。

注意：确保 Home Assistant 版本 >= 2023.1，并安装 eCharts 库（默认使用 CDN，或自定义路径）。

重启 Home Assistant。


## 使用说明
在 Lovelace 编辑器中添加卡片，类型为 custom:wenshidu-card。配置使用 YAML 格式，定义房间、实体和显示选项。
图表使用的是echarts.min.js，可以手动配置为本地文件，不配置时使用cdn文件https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js
手动配置时，卡片配置中增加echarts_path: /local/echarts.min.js


## 鸣谢

设置每个房间的温湿度字体大小、保留小数位数、是否显示房间名称（该功能由[sun0962](https://github.com/sun0962)完善；

## 配置示例
以下是 `wenshidu-card` 的 YAML 配置示例。你可以复制并调整到你的 Home Assistant Lovelace 中。

```yaml

type: custom:wenshidu-card
show_time_section: true     # 显示时间段（默认 true）
show_temperature_section: true   # 显示温度面板（默认 true）
show_humidity_section: true       # 显示湿度面板（默认 true）
card_bg: rgba(238, 241, 245, 0)
control_card_bg: rgba(255, 255, 255, 1)
floor_plan_panel_bg: rgba(255, 255, 255, 1)
default_main_room: 客厅                 #主房间，用于在时间轴中以颜色显示温度变化
show_title: true         # 显示标题（默认 true）
control_floor_boxshadow: 0 4px 10px rgba(0,0,0,0.7)
show_room_data: true          # 显示房间数据（默认 true）
show_room_label: true          # 显示房间标签（默认 true）
main_entities:
  客厅:
    temperature: sensor.keting_wendu   #主房间的实体
rooms:
  - id: 次卧
    name: 次卧
    points: 38.6611,128.3136 324.6361,128.3136 324.6361,443.9453 38.6611,443.9453
    labelX: "181.6486"
    labelY: "200"
    dataX: "181.6486"
    dataY: "250"
    room-data_font_size_round: 60,1                  #房间温湿度字体大小，不配置时默认55px，1代表保留小数位数
    room-label_font_size: 55                         #房间名称字体大小，不配置时默认55px
    room-unit_display:
      temperature: true                              #是否显示温度单位          
      humidity: true                                 #是否显示湿度单位   
  - id: 厨房
    name: 厨房
    points: 347.9378,88.0653 631.7944,88.0653 631.7944,251.1769 347.9378,251.1769
    labelX: "489.8661"
    labelY: "150"
    dataX: "489.8661"
    dataY: "200"
  - id: 餐厅
    name: 餐厅
    points: 345.8194,261.7686 629.6761,261.7686 629.6761,446.0636 345.8194,446.0636
    labelX: "487.7478"
    labelY: "320"
    dataX: "487.7478"
    dataY: "370"
  - id: 儿童房
    name: 儿童房
    points: 652.9778,92.3019 924.1244,92.3019 924.1244,310.4903 652.9778,310.4903
    labelX: "788.5511"
    labelY: "180"
    dataX: "788.5511"
    dataY: "230"
  - id: 大卫生间
    name: 大卫
    points: 813.9711,325.3186 1013.0944,325.3186 1013.0944,524.4419 813.9711,524.4419
    labelX: "913.5327"
    labelY: "400"
    dataX: "913.5327"
    dataY: "450"
  - id: 小卫生间
    name: 小卫
    points: 813.9711,541.3886 1013.0944,541.3886 1013.0944,685.4353 813.9711,685.4353
    labelX: "913.5327"
    labelY: "600"
    dataX: "913.5327"
    dataY: "650"
  - id: 客厅
    name: 客厅
    points: |-
      178.4711,632.4769 343.7011,632.4769
       343.7011,1015.8953 682.6344,1015.8953 682.6344,592.2286 801.2611,592.2286
       801.2611,325.3186 650.8594,325.3186 650.8594,460.3003 178.4711,460.3003
    labelX: "500"
    labelY: "750"
    dataX: "500"
    dataY: "800"
  - id: 主卧
    name: 主卧
    points: >-
      1008.8578,1085.8003 1013.0944,1090.0369 1013.0944,696.0269
      803.3794,696.0269 803.3794,602.8203 699.5811,602.8203 699.5811,1018.0136
      784.3144,1018.0136 784.3144,1087.9186 1008.8578,1087.9186
      1013.0944,1087.9186
    labelX: "900"
    labelY: "850"
    dataX: "900"
    dataY: "900"
entities:
  次卧:
    temperature: sensor.ciwo_wendu
    humidity: sensor.ciwo_shidu
  厨房:
    temperature: sensor.chufang_wendu
    humidity: sensor.chufang_shidu
  餐厅:
    temperature: sensor.canting_wendu
    humidity: sensor.canting_shidu
  儿童房:
    temperature: sensor.ertongfang_wendu
    humidity: sensor.ertongfang_shidu
  大卫生间:
    temperature: sensor.daweishengjian_wendu
    humidity: sensor.daweishengjian_shidu
  小卫生间:
    temperature: sensor.xiaoweishengjian_wendu
    humidity: sensor.xiaoweishengjian_shidu
  客厅:
    temperature: sensor.keting_wendu
    humidity: sensor.keting_shidu
  主卧:
    temperature: sensor.zhuwo_wendu
    humidity: sensor.zhuwo_shidu
temp_colors:
  16-20: "#3498db"
  20-25: "#2ecc71"
  25-30: "#f39c12"
  30-32: "#e74c3c"
humidity_colors:
  0-30: "#e74c3c"
  30-50: "#f39c12"
  50-70: "#2ecc71"
  70-100: "#3498db"


```




