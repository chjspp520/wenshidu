class WenshiduCard extends HTMLElement {
  setConfig(config) {
    this.config = config;
    this.rooms = config.rooms || [];
    this.entities = config.entities || {};
    this.mainEntities = config.main_entities || {};
    this.currentMainRoom = config.default_main_room || Object.keys(this.mainEntities)[0];
    this.showTimeSection = config.show_time_section !== false;
    this.showTemperatureSection = config.show_temperature_section !== false;
    this.showHumiditySection = config.show_humidity_section !== false;
    this.showTitle = config.show_title !== false;
    this.controlCardBg = config.control_card_bg || 'white';
    this.floorPlanPanelBg = config.floor_plan_panel_bg || 'white';
    this.cardBg = config.card_bg || '#eef1f5';
    this.controlFloorBoxShadow = config.control_floor_boxshadow !== undefined ? 
      config.control_floor_boxshadow : '0 2px 5px rgba(0,0,0,0.5)';
    this.viewBox = config.view_box || '0 0 1100 1200';
    this.showRoomData = config.show_room_data !== false;
    this.showRoomLabel = config.show_room_label !== false;   
    this.tempColors = this.parseColorRanges(config.temp_colors);
    this.humidityColors = this.parseColorRanges(config.humidity_colors);
    this.historyDays = 1;
    this.currentDate = new Date();
    this.chartStartDate = new Date();
    this.currentTimeIndex = 0;
    this.isPlaying = false;
    this.playInterval = null;
    this.refreshInterval = null;
    this.autoSlideInterval = null;
    this.lastUserInteraction = Date.now();
    this.titlePosition = config.title_position || 'top'; // 'top' 或 'bottom'，默认在上面
    
    // 新增：eCharts库地址配置，如果用户配置了echarts_path，就使用用户配置的地址，如果用户没有配置，就使用默认的CDN地址
    if (config.echarts_path) {
      this.echartsPath = config.echarts_path;
      this.useCdnEcharts = false;
    } else {
      this.echartsPath = 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js';
      this.useCdnEcharts = true;
    }

    // 数据缓存优化
    this.dataCache = new Map();
    this.isCaching = false;
    this.cacheProgress = 0;
    this.cachePromise = null;
    
    // 添加：历史模式标志
    this.isHistoricalMode = false;
    
    // 5分钟间隔，一天有 24 * 12 = 288 个时间点
    this.timeSlots = this.generateTimeSlots();
    
    // 计算当前时间的索引
    this.updateCurrentTimeIndex();
    
    // 添加：记录上次自动前进的时间
    this.lastAutoAdvanceTime = 0;
    
    // 添加：上次maxTimeIndex更新时间
    this.lastMaxIndexUpdate = Date.now();
    
    // 添加：存储房间字体大小和精度配置的对象
    this.roomDataFontSizes = {}; // 存储字体大小
    this.roomLabelFontSizes = {}; // 存储标签字体大小
    this.roomDecimalPlaces = {}; // 存储小数位数
      
    // 解析房间精度配置
    if (config.rooms) {
      config.rooms.forEach(room => {
        const roomId = room.id;
        
        // 1. 解析 room-data_font_size_round 配置
        let dataFontSize = 40; // 默认字体大小
        let decimalPlaces = 1; // 默认保留1位小数
        
        if (room['room-data_font_size_round'] !== undefined) {
          const configValue = room['room-data_font_size_round'];
          
          if (typeof configValue === 'string') {
            // 处理字符串格式 "10, 2" 或 "10,2"
            const parts = configValue.split(/[\s,]+/).filter(part => part.trim() !== '');
            if (parts.length >= 1) {
              dataFontSize = parseInt(parts[0]) || 40;
              if (parts.length >= 2) {
                decimalPlaces = parseInt(parts[1]) || 1;
              }
            }
          } else if (typeof configValue === 'number') {
            // 处理数字格式
            dataFontSize = configValue;
          } else if (Array.isArray(configValue)) {
            // 处理数组格式 [10, 2]
            if (configValue.length >= 1) {
              dataFontSize = parseInt(configValue[0]) || 40;
              if (configValue.length >= 2) {
                decimalPlaces = parseInt(configValue[1]) || 1;
              }
            }
          }
          
          // 确保小数位数在有效范围内（0-3）
          decimalPlaces = Math.max(0, Math.min(3, decimalPlaces));
        } else if (room['room-data_font_size'] !== undefined) {
          // 2. 如果没有 room-data_font_size_round，检查单独的 room-data_font_size 配置
          dataFontSize = parseInt(room['room-data_font_size']) || 40;
        }
        
        // 存储配置
        this.roomDataFontSizes[roomId] = dataFontSize;
        this.roomDecimalPlaces[roomId] = decimalPlaces;
        
        // 3. 解析 room-label_font_size 配置
        let labelFontSize = 40; // 默认字体大小
        if (room['room-label_font_size'] !== undefined) {
          labelFontSize = parseInt(room['room-label_font_size']) || 40;
        }
        this.roomLabelFontSizes[roomId] = labelFontSize;
      });
    }
  }

  // 解析颜色范围配置
  parseColorRanges(colorConfig) {
    if (!colorConfig) return null;
    
    // 如果已经是数组格式，直接返回
    if (Array.isArray(colorConfig)) {
      const result = colorConfig.map(range => ({
        min: range.min,
        max: range.max,
        color: range.color
      })).sort((a, b) => a.min - b.min);
      return result;
    }
    
    // 如果是对象格式，转换为数组
    if (typeof colorConfig === 'object') {
      const ranges = [];
      for (const [key, color] of Object.entries(colorConfig)) {
        
        if (key.includes('-')) {
          // 处理 "16-20" 格式
          const [min, max] = key.split('-').map(Number);
          ranges.push({ min, max, color });
        } else if (key.startsWith('<')) {
          // 处理 "<20" 格式
          const max = parseFloat(key.substring(1));
          ranges.push({ min: -Infinity, max, color });
        } else if (key.startsWith('>')) {
          // 处理 ">30" 格式
          const min = parseFloat(key.substring(1));
          ranges.push({ min, max: Infinity, color });
        } else {
          // 处理单个值 "20" 格式
          const value = parseFloat(key);
          // 单个值创建一个小的范围，比如 20-20.1
          ranges.push({ min: value, max: value + 0.1, color });
        }
      }
      const result = ranges.sort((a, b) => a.min - b.min);
      return result;
    }
    return null;
  }

  // 根据值获取对应的颜色
  getColorForValue(value, colorRanges) {
    if (!colorRanges || colorRanges.length === 0) {
      return null;
    }

    for (const range of colorRanges) {
      if (value >= range.min && value <= range.max) {
        return range.color;
      }
    }
    return null;
  }

  // 修改颜色映射方法，支持完全自定义
  tempToColor(temp) {
    if (temp === "--" || temp === "N/A" || isNaN(temp)) {
      return "#95a5a6";
    }
    
    temp = parseFloat(temp);
    // 如果配置了自定义温度颜色，使用自定义映射
    const customColor = this.getColorForValue(temp, this.tempColors);
    if (customColor) {
      return customColor;
    }

    // 默认颜色映射
    temp = Math.max(16, Math.min(32, temp));
    const ratio = (temp - 16) / (32 - 16);
    let h, s = 80, l = 58;
    
    if (ratio < 0.5) {
      h = 200 - ratio * 2 * 80;
    } else {
      h = 120 - (ratio - 0.5) * 2 * 80;
    }
    
    const defaultColor = `hsl(${h}, ${s}%, ${l}%)`;
    return defaultColor;
  }

  humidityToColor(humidity) {
    if (humidity === "--" || humidity === "N/A" || isNaN(humidity)) {
      return "#95a5a6";
    }
    
    humidity = parseFloat(humidity);
    
    // 如果配置了自定义湿度颜色，使用自定义映射
    const customColor = this.getColorForValue(humidity, this.humidityColors);
    if (customColor) {
      return customColor;
    }

    // 默认颜色映射
    humidity = Math.max(0, Math.min(100, humidity));
    const ratio = humidity / 100;
    let h, s = 75, l = 55;
    
    if (ratio < 0.4) {
      h = 45 - ratio * 45 / 0.4;
    } else if (ratio < 0.7) {
      h = 0 + (ratio - 0.4) * 200 / 0.3;
    } else {
      h = 200 + (ratio - 0.7) * 80 / 0.3;
    }
    
    const defaultColor = `hsl(${h}, ${s}%, ${l}%)`;
    return defaultColor;
  }


  set hass(hass) {
    this._hass = hass;
    if (!this.content) {
      this.render();
      return; // 添加return，确保首次渲染完成后再执行后续逻辑
    }
    
    // 添加安全检查，确保DOM元素存在
    if (this.shadowRoot) {
      // 每次hass更新都执行UI更新（修复Bug 1）
      this.highlightMainRoom();
      this.updateTimelineGradient();
    }
    
    // 定期更新maxTimeIndex（修复Bug 3）
    const now = Date.now();
    if (now - this.lastMaxIndexUpdate > 60000) { // 每分钟更新一次
      this.updateCurrentTimeIndex();
      this.lastMaxIndexUpdate = now;
    }
    
    // 首次加载时检查所有实体
    if (!this._entitiesChecked) {
      this._entitiesChecked = true;
      setTimeout(() => {
        this.checkAllEntities();
      }, 1000);
    }
    
    // 只有在非历史模式下才更新实时数据
    if (!this.isHistoricalMode) {
      this.updateRoomData();
    }
    
    // 修改自动刷新逻辑 - 只有在非历史模式下才刷新
    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(() => {
        if (!this.isHistoricalMode && this.shadowRoot) { // 添加shadowRoot检查
          this.updateRoomData();
        }
      }, 30000);
    }
    
    // 启动自动滑动检测
    this.startAutoSlideDetection();
  }

  // 生成5分钟间隔的时间槽
  generateTimeSlots() {
    const slots = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 5) {
        slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
      }
    }
    return slots;
  }

  // 更新当前时间索引（修复改进2）
  updateCurrentTimeIndex() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    this.currentTimeIndex = currentHour * 12 + Math.floor(currentMinute / 5);
    this.maxTimeIndex = this.currentTimeIndex;
    
    // 确保索引在有效范围内
    this.currentTimeIndex = Math.min(this.currentTimeIndex, 287);
    this.currentTimeIndex = Math.max(0, this.currentTimeIndex);
    
    // 确保UI同步更新（修复改进2），添加安全检查
    if (!this.isHistoricalMode && this.isToday() && this.shadowRoot) {
      this.updateTimeline();
    }
  }

  // 组件销毁时清除定时器
  disconnectedCallback() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    if (this.playInterval) {
      clearInterval(this.playInterval);
      this.playInterval = null;
    }
    if (this.autoSlideInterval) {
      clearInterval(this.autoSlideInterval);
      this.autoSlideInterval = null;
    }
  }
  
  // 添加新方法
  applyTitlePosition() {
    // 添加安全检查，确保DOM已渲染
    if (!this.shadowRoot) return;
    
    const tempPanel = this.shadowRoot.querySelector('.floor-plan-panel:nth-child(1)');
    const humidityPanel = this.shadowRoot.querySelector('.floor-plan-panel:nth-child(2)');
    const tempTitle = this.shadowRoot.getElementById('temperature-title');
    const humidityTitle = this.shadowRoot.getElementById('humidity-title');
    
    // 为容器添加类
    if (tempPanel) {
      tempPanel.classList.remove('title-top', 'title-bottom');
      tempPanel.classList.add(`title-${this.titlePosition}`);
    }
    
    if (humidityPanel) {
      humidityPanel.classList.remove('title-top', 'title-bottom');
      humidityPanel.classList.add(`title-${this.titlePosition}`);
    }
    
    // 为标题添加类
    if (tempTitle) {
      tempTitle.classList.remove('top', 'bottom');
      tempTitle.classList.add(this.titlePosition);
    }
    
    if (humidityTitle) {
      humidityTitle.classList.remove('top', 'bottom');
      humidityTitle.classList.add(this.titlePosition);
    }
    
    // 强制重绘以确保样式生效
    if (tempPanel) {
      tempPanel.style.display = 'none';
      setTimeout(() => {
        tempPanel.style.display = 'block';
      }, 10);
    }
  }

  render() {
    this.attachShadow({ mode: 'open' });
    
    const style = document.createElement('style');
    style.textContent = this.getStyles();
    this.shadowRoot.appendChild(style);
    
    this.content = document.createElement('div');
    this.content.className = 'wenshidu-card';
    this.content.innerHTML = this.getHTMLTemplate();
    this.shadowRoot.appendChild(this.content);
    
    this.bindEvents();
    this.initializeECharts();
    this.initializeTimeSlots();
    this.updateTimeline();
    
    // 根据配置显示/隐藏各个部分
    this.toggleSections();
    
    // 应用背景色
    this.applyBackgroundColors();
    
    // 新增：应用标题位置 - 在DOM完全加载后执行
    setTimeout(() => {
      this.applyTitlePosition(); 
    }, 50);
    
    // 添加：确保时间显示初始位置正确
    setTimeout(() => {
      this.updateTimeDisplayPosition();
    }, 100);
  }

  // 应用背景色
  applyBackgroundColors() {
    const card = this.shadowRoot.querySelector('.wenshidu-card');
    const controlCard = this.shadowRoot.querySelector('.control-card');
    const floorPlanPanels = this.shadowRoot.querySelectorAll('.floor-plan-panel');
    
    if (card) {
      card.style.backgroundColor = this.cardBg;
    }
    if (controlCard) {
      controlCard.style.background = this.controlCardBg;
      controlCard.style.boxShadow = this.controlFloorBoxShadow; // 应用阴影
    }
    floorPlanPanels.forEach(panel => {
      panel.style.background = this.floorPlanPanelBg;
      panel.style.boxShadow = this.controlFloorBoxShadow; // 应用阴影
    });
  }

  // 根据配置显示/隐藏各个部分
  toggleSections() {
    const timeSection = this.shadowRoot.querySelector('.control-card');
    const tempSection = this.shadowRoot.querySelector('.floor-plan-panel:nth-child(1)');
    const humiditySection = this.shadowRoot.querySelector('.floor-plan-panel:nth-child(2)');
    const titles = this.shadowRoot.querySelectorAll('.panel-title');
    
    if (timeSection) timeSection.style.display = this.showTimeSection ? 'block' : 'none';
    if (tempSection) tempSection.style.display = this.showTemperatureSection ? 'block' : 'none';
    if (humiditySection) humiditySection.style.display = this.showHumiditySection ? 'block' : 'none';
    
    // 控制标题显示
    titles.forEach(title => {
      title.style.display = this.showTitle ? 'flex' : 'none';
    });
    
    // 确保标题位置正确（即使标题隐藏）
    this.applyTitlePosition();
  }

  getStyles() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      .wenshidu-card {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background-color: #eef1f5;
        color: #2c3e50;
        max-width: 430px;
        margin: 0 auto;
        padding: 10px;
        position: relative;
      }

      .control-card {
        background: white;
        padding: 12px;
        border-radius: 8px;
        margin-bottom: 10px;
      }

      .control-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 10px;
      }

      .date-controls {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 1;
      }

      .date-btn {
        background: var(--primary-color);
        color: white;
        border: none;
        padding: 6px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.75em;
        white-space: nowrap;
      }

      .current-date {
        font-weight: 600;
        font-size: 0.85em;
        text-align: center;
        flex: 1;
        width: 100px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        transition: background-color 0.2s;
      }

      .current-date:hover {
        background-color: #f8f9fa;
      }

      .play-controls {
        display: flex;
        gap: 6px;
        align-items: center;
      }

      .play-btn {
        background: #2ecc71;
        color: white;
        border: none;
        padding: 6px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.75em;
        white-space: nowrap;
      }

      .play-btn.stop {
        background: #e74c3c;
      }

      .play-btn.loading {
        background: #95a5a6;
        cursor: not-allowed;
      }

      .cache-progress {
        font-size: 0.7em;
        color: #7f8c8d;
        margin-left: 5px;
      }

      .timeline-container {
        position: relative;
        height: 50px;
        margin-top: 8px;
      }

      .timeline-gradient {
        position: absolute;
        top: 21px;
        left: 0;
        width: 100%;
        height: 8px;
        border-radius: 4px;
        pointer-events: none;
        z-index: 1;
        background: linear-gradient(to right, #3498db 0%, #3498db var(--available-percentage, 100%), #ddd var(--available-percentage, 100%), #ddd 100%);
        transition: background 0.3s ease;
      }

      .timeline-slider {
        -webkit-appearance: none;
        appearance: none;
        position: absolute;
        top: 17px;
        left: 0;
        width: 100%;
        height: 8px;
        background: transparent !important;
        outline: none;
        border-radius: 4px;
        margin: 0;
        z-index: 3;
        cursor: pointer;
      }

      .timeline-slider::-webkit-slider-runnable-track {
        background: transparent !important;
        height: 8px;
        border-radius: 4px;
      }

      .timeline-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 18px;
        height: 18px;
        background: var(--primary-color);
        border: 3px solid white;
        border-radius: 50%;
        cursor: pointer;
        margin-top: -5px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      }

      .timeline-ticks {
        position: absolute;
        top: 17px;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 2;
      }

      .timeline-tick {
        position: absolute;
        top: 0;
        width: 1px;
        height: 8px;
        background-color: #bdc3c7;
        transform: translateX(-50%);
      }

      .timeline-tick.major {
        height: 12px;
        background-color: #7f8c8d;
      }

      .timeline-labels {
        display: flex;
        justify-content: space-between;
        font-size: 0.65em;
        color: #7f8c8d;
        margin-top: 20px;
        position: relative;
        z-index: 2;
      }

      .timeline-labels span {
        flex: 1;
        text-align: center;
        white-space: nowrap;
        transform: rotate(-45deg);
        transform-origin: center center;
        margin-top: -8px;
        padding: 2px;
      }

      .time-display {
        background: var(--primary-color);
        color: white;
        padding: 1px 6px;
        border-radius: 8px;
        font-size: 0.7em;
        font-weight: 600;
        white-space: nowrap;
        position: absolute;
        top: 33px;
        left: 0; /* 添加默认位置 */
        transform: translateX(-50%); /* 居中显示 */
        transition: left 0.1s ease;
        z-index: 1;
        pointer-events: none;
      }

      .floor-plans-container { 
        display: flex; 
        gap: 8px; 
        margin-bottom: 10px; 
      }
      
      .floor-plan-panel { 
        flex: 1; 
        background: white; 
        border-radius: 8px; 
        padding: 0; 
        min-height: 200px;
        /* 添加flex布局以支持order属性 */
        display: flex;
        flex-direction: column;
      }

      /* 根据标题位置调整容器方向 */
      .floor-plan-panel.title-top {
        flex-direction: column;
      }

      .floor-plan-panel.title-bottom {
        flex-direction: column-reverse;
      }
      
      .panel-title { 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        gap: 6px; 
        margin-bottom: -5px; 
        font-size: 0.9em; 
        font-weight: 600; 
        cursor: pointer; 
        padding: 8px; 
        transition: background-color 0.2s; 
        position: relative;
      }
      
      .panel-title.top { 
        order: 1; /* 标题在上面时，顺序为1 */
        margin-bottom: -5px; 
        border-radius: 8px 8px 0 0; /* 圆角在上 */
      }

      .panel-title.bottom { 
        order: 2; /* 标题在下面时，顺序为2 */
        margin-top: -5px; 
        margin-bottom: 0;
        border-radius: 0 0 8px 8px; /* 圆角在下 */
      }

      .panel-title:hover { 
        background-color: #f8f9fa; 
      }

      .panel-title.top:hover { 
        border-radius: 8px 8px 0 0; 
      }

      .panel-title.bottom:hover { 
        border-radius: 0 0 8px 8px; 
      }
      
      .floor-plan-container { 
        width: 100%; 
        overflow: auto; 
      }
      
      .floor-plan { 
        width: 100%; 
        height: auto; 
      }
      
      .room { 
        stroke: #44444400; 
        stroke-width: 1.5; 
        stroke-linejoin: round; 
        transition: all 0.3s ease; 
        cursor: pointer; 
      }
      
      .room:hover { 
        fill-opacity: 0.9 !important; 
        stroke-width: 2.5; 
      }
      
      .room-label { 
        //font-size: 40px; 
        fill: #34495e; 
        font-weight: 600; 
        pointer-events: none; 
      }
      
      .room-data { 
        //font-size: 40px; 
        fill: #2c3e50; 
        font-weight: 700; 
        text-anchor: middle; 
        pointer-events: none; 
      }

      .room.highlight {
        stroke: #00d2ff !important;
        stroke-width: 5 !important;
        stroke-opacity: 1;
        fill-opacity: inherit !important;
        animation: glow-pulse 1.8s ease-in-out infinite alternate;
        z-index: 10;
        transition: all 0.3s ease;
        cursor: pointer;
        /* 外发光效果 */
        filter: drop-shadow(0 0 8px #00d2ff) 
                drop-shadow(0 0 12px #00d2ff)
                drop-shadow(0 0 16px #00d2ff);
      }

      @keyframes glow-pulse {
        from {
          stroke-width: 4.5;
          filter: drop-shadow(0 0 6px #00d2ff) 
                  drop-shadow(0 0 10px #00d2ff)
                  drop-shadow(0 0 14px #00d2ff);
        }
        to {
          stroke-width: 6.5;
          filter: drop-shadow(0 0 10px #00d2ff) 
                  drop-shadow(0 0 15px #00d2ff)
                  drop-shadow(0 0 20px #00d2ff);
        }
      }
      .modal {
        display: none;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0);
        z-index: 1000;
        justify-content: center;
        align-items: center;
      }

      .modal-content {
        background: white;
        padding: 15px;
        border-radius: 8px;
        width: 95%;
        max-width: 400px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      }

      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 2px solid var(--primary-color);
      }

      .modal-title {
        font-size: 1em;
        font-weight: 600;
      }

      .close-btn {
        background: #e74c3c;
        color: white;
        border: none;
        width: 24px;
        height: 24px;
        border-radius: 20%;
        cursor: pointer;
        font-size: 19px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .close-btn:hover {
        background: #c0392b;
      }

      .chart-range-controls {
        display: flex;
        gap: 4px;
        align-items: center;
        margin-left: auto;
        margin-right: 10px;
      }

      .range-btn {
        background: #f8f9fa;
        color: #2c3e50;
        border: 1px solid #ddd;
        padding: 2px 6px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.75em;
        font-weight: 600;
        transition: all 0.2s;
      }

      .range-btn:hover {
        background: #e9ecef;
      }

      .range-btn.active {
        background: var(--primary-color);
        color: white;
        border-color: var(--primary-color);
      }

      .chart-container {
        width: 100%;
        height: 280px;
        margin-top: 5px;
      }

      .error-message {
        color: #e74c3c;
        text-align: center;
        padding: 10px;
        font-size: 0.9em;
      }

      .loading {
        opacity: 0.7;
        pointer-events: none;
      }

      /* 日期选择器样式 */
      .date-picker-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0);
        z-index: 1000;
        display: none;
        justify-content: center;
        align-items: flex-start;
        padding-top: 60px;
      }

      .date-picker {
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 1001;
        padding: 15px;
        width: 90%;
        max-width: 350px;
      }

      /* 修改日期选择器头部样式 - 平均分配 */
      .date-picker-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
        width: 100%;
      }

      .date-picker-header .date-btn {
        flex: 1;
        max-width: 60px;
        margin: 0 2px;
      }

      .date-picker-header #current-month {
        flex: 2;
        text-align: center;
        font-weight: 600;
        font-size: 0.9em;
        margin: 0 5px;
      }

      .date-picker-header .close-btn {
        flex: 1;
        max-width: 30px;
        margin: 0 15px;
      }

      .date-picker-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 5px;
      }

      .date-picker-day {
        padding: 8px;
        text-align: center;
        border: none;
        background: #00a3af;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8em;
        color: white;
      }

      .date-picker-day:hover {
        background: #e9ecef;
      }

      .date-picker-day.selected {
        background: var(--primary-color);
        color: white;
      }

      .date-picker-day.today {
        border: 2px solid var(--primary-color);
      }

      .date-picker-weekday {
        padding: 8px;
        text-align: center;
        font-weight: 600;
        font-size: 0.8em;
        color: #7f8c8d;
      }

      .chart-stats {
        display: flex;
        justify-content: space-around;
        margin-top: 0px;
        padding: 3px;
        background: #f8f9fa;
        border-radius: 4px;
        font-size: 0.8em;
      }

      .stat-item {
        text-align: center;
      }

      .stat-label {
        color: #7f8c8d;
        font-size: 0.9em;
      }

      .stat-value {
        font-weight: 600;
        color: #2c3e50;
      }
    `;
  }

  getHTMLTemplate() {
    return `
      <div class="control-card">
        <div class="control-row">
          <div class="date-controls">
            <button class="date-btn" id="prev-day">前一天</button>
            <div class="current-date" id="current-date">${new Date().toLocaleDateString('zh-CN')}</div>
            <button class="date-btn" id="next-day">后一天</button>
            <button class="date-btn" id="today-btn">此刻</button>
          </div>
          <div class="play-controls">
            <button class="play-btn" id="play-btn">播放</button>
            <button class="play-btn stop" id="stop-btn" style="display:none;">停止</button>
            <span class="cache-progress" id="cache-progress" style="display:none;"></span>
          </div>
        </div>

        <div class="timeline-container">
          <div class="time-display" id="current-time">00:00</div>
          <div class="timeline-gradient" id="timeline-gradient"></div>
          <input type="range" class="timeline-slider" id="timeline-slider" min="0" max="287" value="0">
          <div class="timeline-ticks" id="timeline-ticks"></div>
          <div class="timeline-labels" id="timeline-labels"></div>
        </div>
      </div>

      <div class="floor-plans-container">
        <div class="floor-plan-panel">
          <div class="panel-title" id="temperature-title">
            <span>全屋温度</span>
          </div>
          <div class="floor-plan-container">
            <svg class="floor-plan" viewBox="${this.viewBox}" id="temperature-plan">
              ${this.generateSVGContent('temperature')}
            </svg>
          </div>
        </div>

        <div class="floor-plan-panel">
          <div class="panel-title" id="humidity-title">
            <span>全屋湿度</span>
          </div>
          <div class="floor-plan-container">
            <svg class="floor-plan" viewBox="${this.viewBox}" id="humidity-plan">
              ${this.generateSVGContent('humidity')}
            </svg>
          </div>
        </div>
      </div>

      <!-- 日期选择器 -->
      <div class="date-picker-overlay" id="date-picker-overlay">
        <div class="date-picker" id="date-picker">
          <div class="date-picker-header">
            <button class="date-btn prev-month" id="prev-month">←</button>
            <span id="current-month">${new Date().getFullYear()}年${new Date().getMonth() + 1}月</span>
            <button class="date-btn next-month" id="next-month">→</button>
            <button class="close-btn" id="close-date-picker">×</button>
          </div>
          <div class="date-picker-grid" id="date-grid">
            <div class="date-picker-weekday">日</div>
            <div class="date-picker-weekday">一</div>
            <div class="date-picker-weekday">二</div>
            <div class="date-picker-weekday">三</div>
            <div class="date-picker-weekday">四</div>
            <div class="date-picker-weekday">五</div>
            <div class="date-picker-weekday">六</div>
          </div>
        </div>
      </div>

      <!-- 图表模态框 -->
      <div class="modal" id="chart-modal">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-title" id="modal-title">房间历史数据</div>
            <div class="chart-range-controls" id="chart-range-controls">
              <button class="range-btn active" data-days="1">1天</button>
              <button class="range-btn" data-days="2">2天</button>
              <button class="range-btn" data-days="3">3天</button>
              <button class="range-btn" data-days="5">5天</button>
              <button class="range-btn" data-days="7">7天</button>
            </div>
            <button class="close-btn" id="close-modal">×</button>
          </div>
          <div class="chart-stats" id="chart-stats" style="display: none;">
            <div class="stat-item">
              <div class="stat-label">温度最高</div>
              <div class="stat-value" id="temp-max">--°C</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">温度最低</div>
              <div class="stat-value" id="temp-min">--°C</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">湿度最高</div>
              <div class="stat-value" id="humidity-max">--%</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">湿度最低</div>
              <div class="stat-value" id="humidity-min">--%</div>
            </div>
          </div>
          <div class="chart-container" id="chart"></div>
          <div class="error-message" id="error-message" style="display: none;"></div>
        </div>
      </div>
    `;
  }

  generateSVGContent(type) {
    const roomsConfig = this.config.rooms || [];
    let svgContent = `
      <defs>
        <filter id="mobile-glow-${type}" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur1"/>
          <feGaussianBlur in="blur1" stdDeviation="20" result="blur2"/>
          <feGaussianBlur in="blur2" stdDeviation="30" result="blur3"/>
          <feMerge>
            <feMergeNode in="blur3"/>
            <feMergeNode in="blur2"/>
            <feMergeNode in="blur1"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
    `;

    // 计算所有房间的边界框，用于归一化坐标
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    // 首先计算原始坐标的边界
    roomsConfig.forEach(room => {
      const points = room.points.split(' ').map(pair => pair.split(',').map(Number));
      points.forEach(([x, y]) => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      });
    });
    
    // 计算缩放和偏移参数
    const originalWidth = maxX - minX;
    const originalHeight = maxY - minY;
    
    // 解析viewBox
    const viewBoxParts = this.viewBox.split(' ').map(Number);
    const targetWidth = viewBoxParts[2] || 1100;
    const targetHeight = viewBoxParts[3] || 1200;
    
    // 计算缩放比例，保持宽高比，使用90%的缩放
    const scaleX = (targetWidth * 0.9) / originalWidth;  // 使用90%的宽度
    const scaleY = (targetHeight * 0.9) / originalHeight; // 使用90%的高度
    const scale = Math.min(scaleX, scaleY); // 使用较小的比例确保不超出边界
    
    // 计算居中偏移（剩余10%的空间平均分配到两边）
    const offsetX = (targetWidth - originalWidth * scale) / 2;
    const offsetY = (targetHeight - originalHeight * scale) / 2;

    roomsConfig.forEach(room => {
      const unit = type === 'temperature' ? '°C' : '%';
      
      // 转换房间坐标点
      const originalPoints = room.points.split(' ').map(pair => pair.split(',').map(Number));
      const transformedPoints = originalPoints.map(([x, y]) => {
        // 归一化到0-1范围
        const normalizedX = (x - minX) / originalWidth;
        const normalizedY = (y - minY) / originalHeight;
        
        // 应用缩放和偏移（缩放90%）
        const transformedX = normalizedX * originalWidth * scale + offsetX;
        const transformedY = normalizedY * originalHeight * scale + offsetY;
        
        return `${transformedX},${transformedY}`;
      }).join(' ');
      
      // 房间多边形 - 使用转换后的坐标
      svgContent += `<polygon class="room" id="${room.id}-${type}" points="${transformedPoints}" />`;
      
      // 转换标签坐标
      const normalizedLabelX = (room.labelX - minX) / originalWidth;
      const normalizedLabelY = (room.labelY - minY) / originalHeight;
      const transformedLabelX = normalizedLabelX * originalWidth * scale + offsetX;
      const transformedLabelY = normalizedLabelY * originalHeight * scale + offsetY;
      
      // 根据 show_room_label 配置决定是否显示房间标签
      if (this.showRoomLabel) {
        // 从 roomLabelFontSizes 获取房间标签字体大小配置
        const labelFontSize = this.roomLabelFontSizes[room.id] || 40;
        svgContent += `<text class="room-label" x="${transformedLabelX}" y="${transformedLabelY}" text-anchor="middle" font-size="${labelFontSize}">${room.name}</text>`;
      }
      
      // 转换数据坐标
      const normalizedDataX = (room.dataX - minX) / originalWidth;
      const normalizedDataY = (room.dataY - minY) / originalHeight;
      const transformedDataX = normalizedDataX * originalWidth * scale + offsetX;
      const transformedDataY = normalizedDataY * originalHeight * scale + offsetY;
      
      // 根据 show_room_data 配置决定是否显示数据
      if (this.showRoomData) {
        // 从 roomDataFontSizes 获取房间数据字体大小配置
        const dataFontSize = this.roomDataFontSizes[room.id] || 40;
        svgContent += `<text class="room-data" id="${room.id}-${type}-data" x="${transformedDataX}" y="${transformedDataY}" text-anchor="middle" font-size="${dataFontSize}">--${unit}</text>`;
      }
    });

    return svgContent;
  }

  
  initializeECharts() {
    if (typeof echarts === 'undefined') {
      const script = document.createElement('script');
      script.src = this.echartsPath;
      script.onload = () => {
        this.echartsLoaded = true;
        if (this.useCdnEcharts) {
        } else {
        }
      };
      script.onerror = () => {
        
        // 如果用户配置了本地地址但加载失败，尝试使用CDN地址作为备选
        if (!this.useCdnEcharts) {
          this.showError(`加载ECharts失败: ${this.echartsPath}，尝试使用CDN地址`);
          
          const fallbackScript = document.createElement('script');
          fallbackScript.src = 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js';
          fallbackScript.onload = () => {
            this.echartsLoaded = true;
          };
          fallbackScript.onerror = () => {
            this.showError('加载ECharts失败，请检查网络连接或文件路径');
          };
          document.head.appendChild(fallbackScript);
        } else {
          // 如果是CDN地址加载失败，说明网络有问题
          this.showError('加载ECharts失败，请检查网络连接');
        }
      };
      document.head.appendChild(script);
    } else {
      this.echartsLoaded = true;
    }
  }

  initializeTimeSlots() {
    this.renderTimelineLabels();
  }

  renderTimelineLabels() {
    const ticksContainer = this.shadowRoot.getElementById('timeline-ticks');
    const labelsContainer = this.shadowRoot.getElementById('timeline-labels');
    ticksContainer.innerHTML = '';
    labelsContainer.innerHTML = '';
    
    // 每2小时显示一个标签，但保留第一个(00:00)和最后一个(24:00)
    const timePoints = [0]; // 00:00
    
    // 添加中间的时间点（每2小时）
    for (let h = 2; h < 24; h += 2) {
      timePoints.push(h);
    }
    
    // 添加24:00
    timePoints.push(24);
    
    timePoints.forEach(hour => {
      const timeStr = hour === 24 ? '24:00' : `${hour.toString().padStart(2, '0')}:00`;
      // 计算位置百分比 (24小时对应288个5分钟间隔)
      const percentage = (hour * 12) / 288 * 100;
      
      // 添加刻度
      const tick = document.createElement('div');
      tick.className = 'timeline-tick major';
      tick.style.left = `${percentage}%`;
      ticksContainer.appendChild(tick);
      
      // 添加标签
      const span = document.createElement('span');
      span.textContent = timeStr;
      labelsContainer.appendChild(span);
    });
  }

  bindEvents() {
    // 为卡片内所有可交互元素添加点击事件监听
    this.addCardInteractionListeners();
    
    // 修复房间点击事件
    this.shadowRoot.querySelectorAll('.room').forEach(room => {
      room.addEventListener('click', (e) => {
        this.recordUserInteraction();
        const originalId = e.target.id;
        let roomId = originalId.split('-')[0];
        
        if (!this.config.rooms.find(r => r.id === roomId)) {
          this.showError(`房间配置错误: ${roomId}`);
          return;
        }
        
        this.setMainRoom(roomId);
        this.showRoomChart(roomId);
      });
    });

    // 标题点击事件
    this.shadowRoot.getElementById('temperature-title').addEventListener('click', () => {
      this.recordUserInteraction();
      this.showAllRoomsChart('temperature');
    });

    this.shadowRoot.getElementById('humidity-title').addEventListener('click', () => {
      this.recordUserInteraction();
      this.showAllRoomsChart('humidity');
    });

    // 时间轴事件 - 修复部分
    const timelineSlider = this.shadowRoot.getElementById('timeline-slider');
    timelineSlider.addEventListener('input', (e) => {
      this.recordUserInteraction();
      let newIndex = parseInt(e.target.value);
      
      // 修复时间轴问题：今日使用正确的最大索引
      if (this.isToday()) {
        newIndex = Math.min(newIndex, this.maxTimeIndex);
      }
      
      this.currentTimeIndex = newIndex;
      this.stopTimeline();
      this.updateTimeline();
      
      // 明确进入历史模式
      this.isHistoricalMode = true;
      
      // 立即显示缓存数据
      this.updateDataFromCache();
      // 异步获取最新数据
      setTimeout(() => this.updateHistoricalData(), 100);
    });

    // 日期控制事件
    this.shadowRoot.getElementById('prev-day').addEventListener('click', () => {
      this.recordUserInteraction();
      this.currentDate.setDate(this.currentDate.getDate() - 1);
      this.updateDateDisplay();
      this.updateTimeline();
      this.dataCache.clear();
      this.isHistoricalMode = true; // 明确进入历史模式
      this.updateHistoricalData();
    });

    this.shadowRoot.getElementById('next-day').addEventListener('click', () => {
      this.recordUserInteraction();
      this.currentDate.setDate(this.currentDate.getDate() + 1);
      this.updateDateDisplay();
      this.updateTimeline();
      this.dataCache.clear();
      this.isHistoricalMode = true; // 明确进入历史模式
      this.updateHistoricalData();
    });

    this.shadowRoot.getElementById('today-btn').addEventListener('click', () => {
      this.recordUserInteraction();
      this.currentDate = new Date();
      this.updateCurrentTimeIndex(); // 确保时间索引更新
      this.updateDateDisplay();
      this.updateTimeline();
      this.dataCache.clear();
      // 如果是今日，退出历史模式；如果不是今日，保持历史模式
      if (this.isToday()) {
        this.isHistoricalMode = false;
        this.updateRoomData();
      } else {
        this.isHistoricalMode = true;
        this.updateHistoricalData();
      }
    });

    // 日期点击事件 - 弹出日期选择器
    this.shadowRoot.getElementById('current-date').addEventListener('click', () => {
      this.recordUserInteraction();
      this.showDatePicker();
    });

    // 播放控制事件
    this.shadowRoot.getElementById('play-btn').addEventListener('click', () => {
      this.recordUserInteraction();
      this.playTimeline();
    });

    this.shadowRoot.getElementById('stop-btn').addEventListener('click', () => {
      this.recordUserInteraction();
      this.stopTimeline();
    });

    // 模态框事件
    this.shadowRoot.getElementById('close-modal').addEventListener('click', () => {
      this.recordUserInteraction();
      this.hideModal();
    });

    this.shadowRoot.getElementById('chart-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.recordUserInteraction();
        this.hideModal();
      }
    });

    // 时间范围按钮事件
    this.shadowRoot.querySelectorAll('.range-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.recordUserInteraction();
        const days = parseInt(e.target.dataset.days);
        this.setHistoryDays(days);
      });
    });

    // 日期选择器事件
    this.shadowRoot.getElementById('prev-month').addEventListener('click', () => {
      this.recordUserInteraction();
      this.changeMonth(-1);
    });

    this.shadowRoot.getElementById('next-month').addEventListener('click', () => {
      this.recordUserInteraction();
      this.changeMonth(1);
    });

    // 日期选择器关闭按钮事件
    this.shadowRoot.getElementById('close-date-picker').addEventListener('click', () => {
      this.recordUserInteraction();
      this.hideDatePicker();
    });

    this.shadowRoot.getElementById('date-picker-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.recordUserInteraction();
        this.hideDatePicker();
      }
    });
  }

  // 添加卡片内交互监听器
  addCardInteractionListeners() {
    // 为卡片内所有按钮和可交互元素添加点击监听
    const interactiveElements = this.shadowRoot.querySelectorAll(
      'button, .room, .panel-title, .current-date, input[type="range"]'
    );
    
    interactiveElements.forEach(element => {
      element.addEventListener('click', () => {
        this.recordUserInteraction();
      });
      
      element.addEventListener('touchstart', () => {
        this.recordUserInteraction();
      });
    });
  }

  // 记录用户交互时间
  recordUserInteraction() {
    this.lastUserInteraction = Date.now();
  }

  // 修改 startAutoSlideDetection 方法中的自动前进调用
  startAutoSlideDetection() {
    if (this.autoSlideInterval) {
      clearInterval(this.autoSlideInterval);
    }
    
    this.autoSlideInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastInteraction = now - this.lastUserInteraction;
      
      // 检查是否需要切换到实时模式（1分钟无操作）
      if (this.isHistoricalMode && timeSinceLastInteraction > 60000) {
        this.switchToRealtimeMode();
        return;
      }
      
      // 实时模式下，检查是否需要自动前进到当前5分钟时间点
      if (!this.isHistoricalMode && this.isToday()) {
        this.checkAutoAdvance();
      }
    }, 1000); // 每秒检查一次
  }

  // 切换到实时模式
  switchToRealtimeMode() {
    this.isHistoricalMode = false;
    this.currentDate = new Date(); // 回到今日
    this.updateCurrentTimeIndex(); // 更新到当前时间
    this.updateDateDisplay();
    this.updateTimeline();
    this.updateRoomData(); // 立即更新到最新数据
    console.log('已切换到实时模式');
  }

  // 检查是否需要自动前进到下一个5分钟时间点
  checkAutoAdvance() {
    // 只有在实时模式下且是今日才执行自动前进
    if (!this.isHistoricalMode && this.isToday()) {
      const now = new Date();
      const currentMinutes = now.getMinutes();
      const currentSeconds = now.getSeconds();
      
      // 检查是否是5分钟的整点时刻（00, 05, 10, 15, ... 55）且秒数为0
      if (currentMinutes % 5 === 0 && currentSeconds === 0) {
        // 避免重复触发，检查距离上次自动前进的时间
        const timeSinceLastAdvance = Date.now() - this.lastAutoAdvanceTime;
        if (timeSinceLastAdvance > 5000) { // 至少5秒间隔
          this.lastAutoAdvanceTime = Date.now();
          this.autoAdvanceToCurrentTimeSlot();
        }
      }
    }
  }

  // 修改自动前进方法，前进到当前对应的5分钟时间点（修复Bug 4）
  autoAdvanceToCurrentTimeSlot() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    // 计算当前时间对应的5分钟时间点索引
    const currentIndex = currentHour * 12 + Math.floor(currentMinute / 5);
    
    // 如果当前索引与显示的不一致，更新到当前时间
    if (this.currentTimeIndex !== currentIndex) {
      console.log(`自动前进到 ${this.timeSlots[currentIndex]}, 当前时间: ${now.toLocaleTimeString()}`);
      this.currentTimeIndex = currentIndex;
      this.maxTimeIndex = currentIndex; // 更新最大索引
      
      // 修复Bug 4：添加UI和数据更新，添加安全检查
      if (this.shadowRoot) {
        this.updateTimeline();
        this.updateRoomData(); // 更新实时数据
      }
    }
  }

  // 显示日期选择器
  showDatePicker() {
    const overlay = this.shadowRoot.getElementById('date-picker-overlay');
    overlay.style.display = 'flex';
    
    const today = new Date();
    this.currentPickerYear = today.getFullYear();
    this.currentPickerMonth = today.getMonth();
    
    this.updateDatePicker();
  }

  hideDatePicker() {
    const overlay = this.shadowRoot.getElementById('date-picker-overlay');
    overlay.style.display = 'none';
  }

  changeMonth(delta) {
    this.currentPickerMonth += delta;
    
    if (this.currentPickerMonth > 11) {
      this.currentPickerMonth = 0;
      this.currentPickerYear++;
    } else if (this.currentPickerMonth < 0) {
      this.currentPickerMonth = 11;
      this.currentPickerYear--;
    }
    
    this.updateDatePicker();
  }

  updateDatePicker() {
    const monthElement = this.shadowRoot.getElementById('current-month');
    const grid = this.shadowRoot.getElementById('date-grid');
    
    monthElement.textContent = `${this.currentPickerYear}年${this.currentPickerMonth + 1}月`;
    
    // 清空现有日期（保留星期标题）
    while (grid.children.length > 7) {
      grid.removeChild(grid.lastChild);
    }
    
    const firstDay = new Date(this.currentPickerYear, this.currentPickerMonth, 1).getDay();
    const daysInMonth = new Date(this.currentPickerYear, this.currentPickerMonth + 1, 0).getDate();
    const today = new Date();
    
    // 添加空白
    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'date-picker-day';
      grid.appendChild(empty);
    }
    
    // 添加日期
    for (let day = 1; day <= daysInMonth; day++) {
      const dayBtn = document.createElement('button');
      dayBtn.className = 'date-picker-day';
      
      // 标记今天
      if (this.currentPickerYear === today.getFullYear() && 
          this.currentPickerMonth === today.getMonth() && 
          day === today.getDate()) {
        dayBtn.classList.add('today');
      }
      
      dayBtn.textContent = day;
      dayBtn.addEventListener('click', () => {
        this.recordUserInteraction();
        this.currentDate = new Date(this.currentPickerYear, this.currentPickerMonth, day);
        
        // 修复Bug 2：选择今天时重置时间索引
        if (this.isToday()) {
          this.isHistoricalMode = false;
          this.updateCurrentTimeIndex(); // 重置时间索引到当前时间
          this.updateRoomData();
        } else {
          this.isHistoricalMode = true;
          this.updateHistoricalData();
        }
        
        this.updateDateDisplay();
        this.updateTimeline();
        this.dataCache.clear();
        this.hideDatePicker();
      });
      grid.appendChild(dayBtn);
    }
  }

  // 检查是否是今日
  isToday() {
    const today = new Date();
    return this.currentDate.toDateString() === today.toDateString();
  }

  // 优化数据缓存 - 预填充默认值避免空白
  async cacheHistoricalData() {
    if (this.isCaching && this.cachePromise) {
      return this.cachePromise;
    }
    
    this.isCaching = true;
    this.dataCache.clear();
    
    const playBtn = this.shadowRoot.getElementById('play-btn');
    const cacheProgress = this.shadowRoot.getElementById('cache-progress');
    
    playBtn.classList.add('loading');
    playBtn.disabled = true;
    playBtn.textContent = '缓存中...';
    cacheProgress.style.display = 'inline';
    
    const totalTimeSlots = this.timeSlots.length;
    const roomsConfig = this.config.rooms || [];
    
    this.cachePromise = new Promise(async (resolve) => {
      try {
        // 先预填充所有时间点的默认数据
        for (let i = 0; i < totalTimeSlots; i++) {
          const timeKey = this.timeSlots[i];
          const timeData = {};
          
          for (const room of roomsConfig) {
            const roomData = {
              temperature: null,
              humidity: null
            };
            timeData[room.id] = roomData;
          }
          
          this.dataCache.set(timeKey, timeData);
        }
        
        // 然后获取实际数据
        const hourlyData = await this.fetchHourlyData();
        
        for (let i = 0; i < totalTimeSlots; i++) {
          const timeKey = this.timeSlots[i];
          const timeData = this.dataCache.get(timeKey);
          
          for (const room of roomsConfig) {
            if (this.entities[room.id]?.temperature) {
              timeData[room.id].temperature = this.getDataFromHourlyData(hourlyData, room.id, 'temperature', i);
            }
            if (this.entities[room.id]?.humidity) {
              timeData[room.id].humidity = this.getDataFromHourlyData(hourlyData, room.id, 'humidity', i);
            }
          }
          
          // 更新进度
          this.cacheProgress = Math.round((i + 1) / totalTimeSlots * 100);
          cacheProgress.textContent = `${this.cacheProgress}%`;
          
          // 短暂延迟避免阻塞UI
          if (i % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
        
        console.log('数据缓存完成', this.dataCache);
        resolve();
        
      } catch (error) {
        console.error('数据缓存失败:', error);
        resolve();
      } finally {
        this.isCaching = false;
        playBtn.classList.remove('loading');
        playBtn.disabled = false;
        playBtn.textContent = '播放';
        cacheProgress.style.display = 'none';
        this.cachePromise = null;
      }
    });
    
    return this.cachePromise;
  }

  // 获取小时数据
  async fetchHourlyData() {
    const hourlyData = {};
    const roomsConfig = this.config.rooms || [];
    
    for (const room of roomsConfig) {
      if (this.entities[room.id]?.temperature) {
        hourlyData[`${room.id}-temperature`] = await this.getHistoricalValueForDay(
          this.entities[room.id].temperature
        );
      }
      if (this.entities[room.id]?.humidity) {
        hourlyData[`${room.id}-humidity`] = await this.getHistoricalValueForDay(
          this.entities[room.id].humidity
        );
      }
    }
    
    return hourlyData;
  }

  // 获取一天的历史数据
  async getHistoricalValueForDay(entityId) {
    try {
      const startTime = new Date(this.currentDate);
      const endTime = new Date(this.currentDate);
      startTime.setHours(0, 0, 0, 0);
      endTime.setHours(23, 59, 59, 999);
      
      const history = await this._hass.callWS({
        type: 'history/history_during_period',
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        entity_ids: [entityId],
        minimal_response: true,
        no_attributes: true
      });
      
      return history[entityId] || [];
    } catch (error) {
      console.error(`获取历史数据失败: ${entityId}`, error);
      return [];
    }
  }

  // 从小时数据中获取特定时间点的数据
  getDataFromHourlyData(hourlyData, roomId, type, timeIndex) {
    const key = `${roomId}-${type}`;
    const data = hourlyData[key];
    
    if (!data || data.length === 0) {
      return null;
    }
    
    const targetTime = this.getDateTimeForIndex(timeIndex).getTime();
    
    let closestData = null;
    let minDiff = Infinity;
    
    for (const entry of data) {
      if (entry.s !== 'unknown' && entry.s !== 'unavailable' && entry.s !== null) {
        const entryTime = entry.lu * 1000;
        const diff = Math.abs(entryTime - targetTime);
        if (diff < minDiff) {
          minDiff = diff;
          closestData = entry;
        }
      }
    }
    
    if (closestData && minDiff <= 10 * 60 * 1000) {
      return parseFloat(closestData.s);
    }
    
    return null;
  }

  // 从缓存获取数据
  getCachedData(timeIndex) {
    const timeKey = this.timeSlots[timeIndex];
    return this.dataCache.get(timeKey);
  }

  // 根据索引获取日期时间
  getDateTimeForIndex(index) {
    const selectedDate = new Date(this.currentDate);
    const hours = Math.floor(index / 12);
    const minutes = (index % 12) * 5;
    selectedDate.setHours(hours, minutes, 0, 0);
    return selectedDate;
  }

  // 修改播放功能，使用与实时数据相同的数据处理方式
  async playTimeline() {
    if (this.isPlaying) return;
    
    // 不再依赖缓存数据，而是实时获取
    this.isPlaying = true;
    this.isHistoricalMode = true; // 播放时进入历史模式
    this.shadowRoot.getElementById('play-btn').style.display = 'none';
    this.shadowRoot.getElementById('stop-btn').style.display = 'block';
    
    this.playInterval = setInterval(async () => {
      this.currentTimeIndex++;
      
      if (this.isToday() && this.currentTimeIndex > this.maxTimeIndex) {
        this.currentTimeIndex = this.maxTimeIndex;
        this.stopTimeline();
        return;
      }
      
      if (this.currentTimeIndex > 287) {
        this.currentTimeIndex = 0;
        this.currentDate.setDate(this.currentDate.getDate() + 1);
        this.updateDateDisplay();
        this.stopTimeline();
        return;
      }
      
      this.updateTimeline();
      
      // 使用与手动滑动相同的数据获取方式
      const selectedTime = this.getSelectedDateTime();
      await this.updateRoomDataForTime(selectedTime);
    }, 500); // 稍微放慢播放速度，给数据获取留出时间
  }

  // 从缓存更新数据 - 确保始终有数据显示
  updateDataFromCache() {
    const cachedData = this.getCachedData(this.currentTimeIndex);
    
    if (cachedData) {
      const roomsConfig = this.config.rooms || [];
      
      roomsConfig.forEach(room => {
        const roomData = cachedData[room.id];
        if (roomData) {
          // 即使数据为null也要更新显示（显示--）
          this.updateRoomDisplay(room.id, 'temperature', roomData.temperature);
          this.updateRoomDisplay(room.id, 'humidity', roomData.humidity);
        }
      });
      
      this.updateTimelineGradient();
    } else {
      // 如果没有缓存数据，显示默认值
      this.showDefaultData();
    }
  }

  // 显示默认数据
  showDefaultData() {
    const roomsConfig = this.config.rooms || [];
    
    roomsConfig.forEach(room => {
      this.updateRoomDisplay(room.id, 'temperature', null);
      this.updateRoomDisplay(room.id, 'humidity', null);
    });
  }

  // 更新历史数据
  async updateHistoricalData() {
    if (!this.currentMainRoom || !this.mainEntities[this.currentMainRoom]) {
      return;
    }

    const cachedData = this.getCachedData(this.currentTimeIndex);
    if (cachedData) {
      this.updateDataFromCache();
      return;
    }

    const selectedTime = this.getSelectedDateTime();
    await this.updateRoomDataForTime(selectedTime);
  }

  // 获取选中的日期时间
  getSelectedDateTime() {
    const selectedDate = new Date(this.currentDate);
    const hours = Math.floor(this.currentTimeIndex / 12);
    const minutes = (this.currentTimeIndex % 12) * 5;
    selectedDate.setHours(hours, minutes, 0, 0);
    return selectedDate;
  }

  // 获取最近的历史数据（修复改进1：重命名函数）
  async getNearestHistoricalValue(roomId, type, targetTime) {
    try {
      const entityId = this.entities[roomId]?.[type];
      if (!entityId) {
        return null;
      }

      // 确保目标时间是5分钟的整倍数
      const adjustedTime = new Date(targetTime);
      const minutes = adjustedTime.getMinutes();
      const remainder = minutes % 5;
      if (remainder !== 0) {
        adjustedTime.setMinutes(minutes - remainder);
      }

      // 获取目标时间前后30分钟的数据
      const startTime = new Date(adjustedTime);
      const endTime = new Date(adjustedTime);
      startTime.setMinutes(startTime.getMinutes() - 30);
      endTime.setMinutes(endTime.getMinutes() + 30);

      const history = await this._hass.callWS({
        type: 'history/history_during_period',
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        entity_ids: [entityId],
        minimal_response: true,
        no_attributes: true
      });

      if (!history[entityId] || history[entityId].length === 0) {
        return null; // 完全没有数据
      }

      // 过滤有效数据并按时间排序
      const validData = history[entityId]
        .filter(entry => 
          entry.s !== 'unknown' && 
          entry.s !== 'unavailable' && 
          entry.s !== null && 
          !isNaN(parseFloat(entry.s))
        )
        .map(entry => ({
          time: entry.lu * 1000,
          value: parseFloat(entry.s)
        }))
        .sort((a, b) => a.time - b.time);

      if (validData.length === 0) {
        return null; // 没有有效数据
      }

      const targetTimestamp = adjustedTime.getTime();

      // 首先尝试找到精确匹配的5分钟整点数据
      const exactMatch = validData.find(point => {
        const pointTime = new Date(point.time);
        return pointTime.getMinutes() % 5 === 0 && 
               Math.abs(point.time - targetTimestamp) <= 2.5 * 60 * 1000; // 2.5分钟内认为是精确匹配
      });

      if (exactMatch) {
        return exactMatch.value;
      }

      // 如果没有精确匹配，进行线性插值
      let beforePoint = null;
      let afterPoint = null;

      for (const point of validData) {
        if (point.time <= targetTimestamp) {
          beforePoint = point;
        } else {
          afterPoint = point;
          break;
        }
      }

      // 情况1：有前后两个数据点 - 线性插值
      if (beforePoint && afterPoint) {
        const timeDiff = afterPoint.time - beforePoint.time;
        const valueDiff = afterPoint.value - beforePoint.value;
        const targetTimeFromBefore = targetTimestamp - beforePoint.time;
        
        const ratio = targetTimeFromBefore / timeDiff;
        const interpolatedValue = beforePoint.value + (valueDiff * ratio);
        return interpolatedValue;
      }
      
      // 情况2：只有前一个数据点，且时间差在30分钟内
      if (beforePoint && (targetTimestamp - beforePoint.time) <= 30 * 60 * 1000) {
        return beforePoint.value;
      }
      
      // 情况3：只有后一个数据点，且时间差在30分钟内
      if (afterPoint && (afterPoint.time - targetTimestamp) <= 30 * 60 * 1000) {
        return afterPoint.value;
      }
      return null;

    } catch (error) {
      console.error(`获取插值数据失败: ${roomId}-${type}`, error);
      return null;
    }
  }

  // 修改 getHistoricalValueAtTime 方法，优先获取5分钟整点数据
  async getHistoricalValueAtTime(entityId, targetTime) {
    try {
      // 确保目标时间是5分钟的整倍数
      const adjustedTime = new Date(targetTime);
      const minutes = adjustedTime.getMinutes();
      const remainder = minutes % 5;
      if (remainder !== 0) {
        adjustedTime.setMinutes(minutes - remainder);
      }
      
      // 扩大时间窗口到前后30分钟，提高找到数据的几率
      const startTime = new Date(adjustedTime);
      const endTime = new Date(adjustedTime);
      startTime.setMinutes(startTime.getMinutes() - 30);
      endTime.setMinutes(endTime.getMinutes() + 30);
      
      const history = await this._hass.callWS({
        type: 'history/history_during_period',
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        entity_ids: [entityId],
        minimal_response: true,
        no_attributes: true
      });
      
      if (history[entityId]) {
        const data = history[entityId];
        const targetTimestamp = adjustedTime.getTime();
        
        // 首先尝试找到精确的5分钟整点数据
        const exactMatch = data.find(entry => {
          if (entry.s !== 'unknown' && entry.s !== 'unavailable' && entry.s !== null) {
            const entryTime = new Date(entry.lu * 1000);
            return entryTime.getMinutes() % 5 === 0 && 
                   Math.abs(entry.lu * 1000 - targetTimestamp) <= 2.5 * 60 * 1000;
          }
          return false;
        });
        
        if (exactMatch) {
          return parseFloat(exactMatch.s);
        }
        
        // 如果没有精确匹配，寻找最近的数据点
        let closestData = null;
        let minDiff = Infinity;
        
        for (const entry of data) {
          if (entry.s !== 'unknown' && entry.s !== 'unavailable' && entry.s !== null) {
            const entryTime = entry.lu * 1000;
            const diff = Math.abs(entryTime - targetTimestamp);
            if (diff < minDiff) {
              minDiff = diff;
              closestData = entry;
            }
          }
        }
        
        // 放宽时间限制到30分钟
        if (closestData && minDiff <= 30 * 60 * 1000) {
          return parseFloat(closestData.s);
        }
      }
    } catch (error) {
      console.error(`获取历史数据失败: ${entityId}`, error);
    }
    
    return null;
  }

  // 修改 updateRoomDataForTime 方法，使用优化后的数据获取算法
  async updateRoomDataForTime(targetTime) {
    const roomsConfig = this.config.rooms || [];
    
    for (const room of roomsConfig) {
      // 温度数据 - 使用优化后的数据获取逻辑
      if (this.entities[room.id]?.temperature) {
        let tempData = await this.getHistoricalValueAtTime(
          this.entities[room.id].temperature, 
          targetTime
        );
        
        // 如果直接获取失败，尝试获取最近数据
        if (tempData === null) {
          tempData = await this.getNearestHistoricalValue(room.id, 'temperature', targetTime);
        }
        
        this.updateRoomDisplay(room.id, 'temperature', tempData);
      }
      
      // 湿度数据 - 使用优化后的数据获取逻辑
      if (this.entities[room.id]?.humidity) {
        let humidityData = await this.getHistoricalValueAtTime(
          this.entities[room.id].humidity, 
          targetTime
        );
        
        // 如果直接获取失败，尝试获取最近数据
        if (humidityData === null) {
          humidityData = await this.getNearestHistoricalValue(room.id, 'humidity', targetTime);
        }
        
        this.updateRoomDisplay(room.id, 'humidity', humidityData);
      }
    }
    
    this.updateTimelineGradient();
  }

  // 修改 updateRoomDisplay 方法，处理null值
  updateRoomDisplay(roomId, type, value) {
    const element = this.shadowRoot.getElementById(`${roomId}-${type}`);
    const dataElement = this.shadowRoot.getElementById(`${roomId}-${type}-data`);
    
    if (element) {
      if (value !== null && !isNaN(value)) {
        const color = type === 'temperature' ? this.tempToColor(value) : this.humidityToColor(value);
        element.style.fill = color;
        element.style.fillOpacity = "0.8";
      } else {
        element.style.fill = "#95a5a6";
        element.style.fillOpacity = "0.3";
      }
    }
    
    // 只有在 show_room_data 为 true 时才更新数据文本
    if (dataElement && this.showRoomData) {
      if (value !== null && !isNaN(value)) {
        // 从 roomDecimalPlaces 获取小数位数配置，支持0位小数
        const decimalPlaces = (this.roomDecimalPlaces && this.roomDecimalPlaces[roomId]) ?? 1;
        
        // 特殊处理0位小数：使用 toFixed(0) 显示整数
        const formattedValue = decimalPlaces === 0 ? 
          Math.round(value).toString() : 
          value.toFixed(decimalPlaces);
        
        dataElement.textContent = type === 'temperature' ? `${formattedValue}°C` : `${formattedValue}%`;
      } else {
        dataElement.textContent = type === 'temperature' ? '--°C' : '--%';
      }
    }
  }

  // 修复 updateTimeline 方法
  updateTimeline() {
    if (!this.shadowRoot) return;
    
    const slider = this.shadowRoot.getElementById('timeline-slider');
    const timeDisplay = this.shadowRoot.getElementById('current-time');
    
    if (!slider || !timeDisplay) return;
    
    // 时间轴始终完整（0-287）
    slider.max = 287;
    
    // 确保当前索引在有效范围内
    if (this.isToday()) {
      // 今日：不能超过当前时间
      this.currentTimeIndex = Math.min(this.currentTimeIndex, this.maxTimeIndex);
    } else {
      // 非今日：可以使用完整范围
      this.currentTimeIndex = Math.min(this.currentTimeIndex, 287);
    }
    
    this.currentTimeIndex = Math.max(0, this.currentTimeIndex);
    
    slider.value = this.currentTimeIndex;
    
    const timeStr = this.timeSlots[this.currentTimeIndex];
    const mainRoomTemp = this.getMainRoomTemperature();
    
    timeDisplay.innerHTML = `<strong>${timeStr}</strong>`;
    
    // 确保位置更新
    this.updateTimeDisplayPosition();
    this.updateTimelineGradient();
  }

  updateTimeDisplayPosition() {
    const slider = this.shadowRoot.getElementById('timeline-slider');
    const timeDisplay = this.shadowRoot.getElementById('current-time');
    const timelineContainer = this.shadowRoot.querySelector('.timeline-container');
    
    if (!slider || !timeDisplay || !timelineContainer) return;
    
    const sliderRect = slider.getBoundingClientRect();
    const containerRect = timelineContainer.getBoundingClientRect();
    const maxValue = parseInt(slider.max);
    
    // 计算百分比位置
    const percentage = (this.currentTimeIndex / maxValue) * 100;
    
    // 计算绝对位置（相对于timeline-container）
    const thumbPosition = (percentage / 100) * sliderRect.width;
    
    // 确保位置在容器范围内
    const minLeft = 10; // 左边距
    const maxLeft = sliderRect.width - 10; // 右边距
    
    let finalLeft = Math.max(minLeft, Math.min(maxLeft, thumbPosition));
    
    // 设置位置
    timeDisplay.style.left = `${finalLeft}px`;
  }

  // 添加connectedCallback方法
  connectedCallback() {
    // 组件连接到DOM后，确保时间显示位置正确
    setTimeout(() => {
      this.updateTimeDisplayPosition();
    }, 200);
  }

  // 修复 updateTimelineGradient 方法
  updateTimelineGradient() {
    if (!this.shadowRoot) return;
    
    const mainRoomTemp = this.getMainRoomTemperature();
    const gradientEl = this.shadowRoot.getElementById('timeline-gradient');
    if (!gradientEl) return;
    
    // 计算今日可用时间的百分比
    if (this.isToday()) {
      const availablePercentage = (this.maxTimeIndex / 287) * 100;
      gradientEl.style.setProperty('--available-percentage', `${availablePercentage}%`);
    } else {
      gradientEl.style.setProperty('--available-percentage', '100%');
    }
    
    if (mainRoomTemp !== '--' && !isNaN(parseFloat(mainRoomTemp))) {
      const color = this.tempToColor(mainRoomTemp);
      gradientEl.style.background = `linear-gradient(to right, ${color} 0%, ${color} var(--available-percentage, 100%), #ddd var(--available-percentage, 100%), #ddd 100%)`;
    } else {
      gradientEl.style.background = `linear-gradient(to right, #3498db 0%, #3498db var(--available-percentage, 100%), #ddd var(--available-percentage, 100%), #ddd 100%)`;
    }
  }

  stopTimeline() {
    this.isPlaying = false;
    if (this.shadowRoot) {
      const playBtn = this.shadowRoot.getElementById('play-btn');
      const stopBtn = this.shadowRoot.getElementById('stop-btn');
      if (playBtn) playBtn.style.display = 'block';
      if (stopBtn) stopBtn.style.display = 'none';
    }
    if (this.playInterval) {
      clearInterval(this.playInterval);
      this.playInterval = null;
    }
  }

  setMainRoom(roomId) {
    if (this.mainEntities[roomId]) {
      this.currentMainRoom = roomId;
      this.highlightMainRoom();
      this.updateTimelineGradient();
    }
  }

  getRoomName(roomId) {
    const room = this.config.rooms.find(r => r.id === roomId);
    return room ? room.name : roomId;
  }

  checkEntityExists(roomId) {
    const entities = this.entities[roomId];
    if (!entities) {
      return false;
    }
    
    const tempExists = entities.temperature && this._hass.states[entities.temperature];
    const humidityExists = entities.humidity && this._hass.states[entities.humidity];
    
    return tempExists || humidityExists;
  }

  // 简化updateData方法（修复改进3）
  updateData() {
    this.updateDateDisplay();
    if (!this.isHistoricalMode) {
      this.updateRoomData();
    }
    // highlightMainRoom和updateTimelineGradient现在在set hass中统一调用
  }

  updateDateDisplay() {
    // 修改为 xxxx-xx-xx 格式
    const year = this.currentDate.getFullYear();
    const month = (this.currentDate.getMonth() + 1).toString().padStart(2, '0');
    const day = this.currentDate.getDate().toString().padStart(2, '0');
    this.shadowRoot.getElementById('current-date').textContent = 
      `${year}-${month}-${day}`;
  }
  
  // 关键修复：在历史模式下阻止实时数据更新
  updateRoomData() {
    if (this.isHistoricalMode || !this.shadowRoot) {
      return;
    }
    
    const roomsConfig = this.config.rooms || [];
    
    roomsConfig.forEach(room => {
      const tempEntity = this.entities[room.id]?.temperature;
      const humidityEntity = this.entities[room.id]?.humidity;
      
      let tempValue = '--';
      let humidityValue = '--';
      
      if (tempEntity && this._hass.states[tempEntity]) {
        const tempState = this._hass.states[tempEntity];
        const stateValue = tempState.state;
        
        if (stateValue !== 'unknown' && stateValue !== 'unavailable' && stateValue !== null && stateValue !== undefined && stateValue !== '') {
          const parsedValue = parseFloat(stateValue);
          if (!isNaN(parsedValue)) {
            tempValue = parsedValue.toFixed(1);
          }
        }
      }
      
      if (humidityEntity && this._hass.states[humidityEntity]) {
        const state = this._hass.states[humidityEntity];
        const stateValue = state.state;
        
        if (stateValue !== 'unknown' && stateValue !== 'unavailable' && stateValue !== null && stateValue !== undefined && stateValue !== '') {
          const parsedValue = parseFloat(stateValue);
          if (!isNaN(parsedValue)) {
            humidityValue = parsedValue.toFixed(1);
          }
        }
      }
      
      // 更新房间颜色（始终更新）
      const tempElement = this.shadowRoot.getElementById(`${room.id}-temperature`);
      const humidityElement = this.shadowRoot.getElementById(`${room.id}-humidity`);
      
      if (tempElement) {
        const color = this.tempToColor(tempValue);
        tempElement.style.fill = color;
        tempElement.style.fillOpacity = "0.8";
      }
      
      if (humidityElement) {
        const color = this.humidityToColor(humidityValue);
        humidityElement.style.fill = color;
        humidityElement.style.fillOpacity = "0.8";
      }
      
      // 只有在 show_room_data 为 true 时才更新数据文本
      if (this.showRoomData) {
        const tempDataElement = this.shadowRoot.getElementById(`${room.id}-temperature-data`);
        const humidityDataElement = this.shadowRoot.getElementById(`${room.id}-humidity-data`);
        
        // 从 roomDecimalPlaces 获取小数位数配置，支持0位小数
        const decimalPlaces = (this.roomDecimalPlaces && this.roomDecimalPlaces[room.id]) ?? 1;
        
        if (tempDataElement) {
          if (tempValue !== '--') {
            const parsedValue = parseFloat(tempValue);
            // 特殊处理0位小数
            const formattedValue = decimalPlaces === 0 ? 
              Math.round(parsedValue).toString() : 
              parsedValue.toFixed(decimalPlaces);
            tempDataElement.textContent = `${formattedValue}°C`;
          } else {
            tempDataElement.textContent = '--°C';
          }
        }
        
        if (humidityDataElement) {
          if (humidityValue !== '--') {
            const parsedValue = parseFloat(humidityValue);
            // 特殊处理0位小数
            const formattedValue = decimalPlaces === 0 ? 
              Math.round(parsedValue).toString() : 
              parsedValue.toFixed(decimalPlaces);
            humidityDataElement.textContent = `${formattedValue}%`;
          } else {
            humidityDataElement.textContent = '--%';
          }
        }
      }
    });
    
    // 更新主房间高亮和时间轴渐变
    this.highlightMainRoom();
    this.updateTimelineGradient();
  }

  // 添加实体状态检查方法
  checkAllEntities() {
    const roomsConfig = this.config.rooms || [];
    
    roomsConfig.forEach(room => {
      const tempEntity = this.entities[room.id]?.temperature;
      const humidityEntity = this.entities[room.id]?.humidity;
      
      if (tempEntity) {
        const state = this._hass.states[tempEntity];
        if (!state) {
          console.log(`温度实体不存在: ${tempEntity}`);
        }
      }
      
      if (humidityEntity) {
        const state = this._hass.states[humidityEntity];
        if (!state) {
          console.log(`湿度实体不存在: ${humidityEntity}`);
        }
      }
    });
  }

  getMainRoomTemperature() {
    if (!this.currentMainRoom || !this.mainEntities[this.currentMainRoom]) {
      return '--';
    }
    
    const tempEntity = this.mainEntities[this.currentMainRoom].temperature;
    if (tempEntity && this._hass.states[tempEntity]) {
      const state = this._hass.states[tempEntity];
      const stateValue = state.state;
      
      if (stateValue !== 'unknown' && stateValue !== 'unavailable' && stateValue !== null && stateValue !== undefined) {
        const parsedValue = parseFloat(stateValue);
        if (!isNaN(parsedValue)) {
          return parsedValue.toFixed(1);
        }
      }
    }
    
    return '--';
  }

  // 修复 highlightMainRoom 方法
  highlightMainRoom() {
    if (!this.shadowRoot) return;
    
    this.shadowRoot.querySelectorAll('.room.highlight').forEach(el => {
      el.classList.remove('highlight');
    });
    
    if (this.currentMainRoom) {
      ['temperature', 'humidity'].forEach(type => {
        const element = this.shadowRoot.getElementById(`${this.currentMainRoom}-${type}`);
        if (element) {
          element.classList.add('highlight');
        }
      });
    }
  }

  async showRoomChart(roomId) {
    if (!this.echartsLoaded) {
      this.showError('ECharts 正在加载，请稍后重试');
      return;
    }

    // 检查实体是否存在
    if (!this.checkEntityExists(roomId)) {
      this.showError('该房间没有配置有效的传感器实体');
      return;
    }
    
    this.currentChartRoom = roomId;
    this.historyDays = 1;
    // 设置图表开始日期为当前选择的日期
    this.chartStartDate = new Date(this.currentDate);
    
    const modal = this.shadowRoot.getElementById('chart-modal');
    const title = this.shadowRoot.getElementById('modal-title');
    const roomName = this.getRoomName(roomId);
    
    title.textContent = `${roomName} - 温湿度历史`;
    modal.style.display = 'flex';
    this.hideError();
    
    this.shadowRoot.querySelectorAll('.range-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.days) === 1);
    });
    
    // 添加加载状态
    this.showError('加载中...');
    
    try {
      await this.renderRoomChart(roomId, 1);
    } catch (error) {
      console.error('显示房间图表失败:', error);
      this.showError('加载图表失败: ' + error.message);
    }
  }

  async showAllRoomsChart(type) {
    if (!this.echartsLoaded) {
      this.showError('ECharts 正在加载，请稍后重试');
      return;
    }

    this.currentChartType = type;
    this.historyDays = 1;
    // 设置图表开始日期为当前选择的日期
    this.chartStartDate = new Date(this.currentDate);
    
    const modal = this.shadowRoot.getElementById('chart-modal');
    const title = this.shadowRoot.getElementById('modal-title');
    
    title.textContent = `全屋${type === 'temperature' ? '温度' : '湿度'}历史`;
    modal.style.display = 'flex';
    this.hideError();
    
    this.shadowRoot.querySelectorAll('.range-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.days) === 1);
    });
    
    await this.renderAllRoomsChart(type, 1);
  }

  setHistoryDays(days) {
    if (days === this.historyDays) return;
    
    this.historyDays = days;
    this.shadowRoot.querySelectorAll('.range-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.days) === days);
    });
    
    if (this.currentChartRoom) {
      this.renderRoomChart(this.currentChartRoom, days);
    } else if (this.currentChartType) {
      this.renderAllRoomsChart(this.currentChartType, days);
    }
  }

  // 计算最大值和最小值
  calculateStats(data) {
    const stats = {
      tempMax: { value: -Infinity, time: null },
      tempMin: { value: Infinity, time: null },
      humidityMax: { value: -Infinity, time: null },
      humidityMin: { value: Infinity, time: null }
    };

    if (data.temperature && data.temperature.length > 0) {
      data.temperature.forEach(point => {
        if (point[1] > stats.tempMax.value) {
          stats.tempMax.value = point[1];
          stats.tempMax.time = point[0];
        }
        if (point[1] < stats.tempMin.value) {
          stats.tempMin.value = point[1];
          stats.tempMin.time = point[0];
        }
      });
    }

    if (data.humidity && data.humidity.length > 0) {
      data.humidity.forEach(point => {
        if (point[1] > stats.humidityMax.value) {
          stats.humidityMax.value = point[1];
          stats.humidityMax.time = point[0];
        }
        if (point[1] < stats.humidityMin.value) {
          stats.humidityMin.value = point[1];
          stats.humidityMin.time = point[0];
        }
      });
    }

    return stats;
  }

  // 更新统计信息显示
  updateStatsDisplay(stats) {
    const statsContainer = this.shadowRoot.getElementById('chart-stats');
    const tempMaxEl = this.shadowRoot.getElementById('temp-max');
    const tempMinEl = this.shadowRoot.getElementById('temp-min');
    const humidityMaxEl = this.shadowRoot.getElementById('humidity-max');
    const humidityMinEl = this.shadowRoot.getElementById('humidity-min');

    if (stats.tempMax.value !== -Infinity) {
      tempMaxEl.textContent = `${stats.tempMax.value.toFixed(1)}°C`;
      statsContainer.style.display = 'flex';
    } else {
      tempMaxEl.textContent = '--°C';
    }

    if (stats.tempMin.value !== Infinity) {
      tempMinEl.textContent = `${stats.tempMin.value.toFixed(1)}°C`;
      statsContainer.style.display = 'flex';
    } else {
      tempMinEl.textContent = '--°C';
    }

    if (stats.humidityMax.value !== -Infinity) {
      humidityMaxEl.textContent = `${stats.humidityMax.value.toFixed(1)}%`;
      statsContainer.style.display = 'flex';
    } else {
      humidityMaxEl.textContent = '--%';
    }

    if (stats.humidityMin.value !== Infinity) {
      humidityMinEl.textContent = `${stats.humidityMin.value.toFixed(1)}%`;
      statsContainer.style.display = 'flex';
    } else {
      humidityMinEl.textContent = '--%';
    }
  }

  // 在类中添加方法
  findNearestValue(data, targetTime, maxTimeDiff = 10 * 60 * 1000) {
    if (!data || data.length === 0) return null;
    
    let nearestValue = null;
    let minDiff = Infinity;
    
    for (const point of data) {
      if (point && point.length === 2 && typeof point[1] === 'number') {
        const timeDiff = Math.abs(point[0] - targetTime);
        if (timeDiff < minDiff) {
          minDiff = timeDiff;
          nearestValue = point[1];
        }
      }
    }
    
    // 如果找到的数据点时间差在允许范围内，则返回该值
    return (nearestValue !== null && minDiff <= maxTimeDiff) ? nearestValue : null;
  }

  async renderRoomChart(roomId, days) {
    const chartContainer = this.shadowRoot.getElementById('chart');
    
    if (this.chart) {
      this.chart.dispose();
    }
    
    this.chart = echarts.init(chartContainer);
    
    try {
      const historyData = await this.fetchHistoryDataForChart(roomId, days);

      // 检查时间范围重叠
      if (historyData.temperature.length > 0 && historyData.humidity.length > 0) {
        const tempStart = historyData.temperature[0][0];
        const tempEnd = historyData.temperature[historyData.temperature.length - 1][0];
        const humidityStart = historyData.humidity[0][0];
        const humidityEnd = historyData.humidity[historyData.humidity.length - 1][0];
        
        const overlapStart = Math.max(tempStart, humidityStart);
        const overlapEnd = Math.min(tempEnd, humidityEnd);
      }     

      // 检查是否有数据
      const hasTemperatureData = historyData.temperature && historyData.temperature.length > 0;
      const hasHumidityData = historyData.humidity && historyData.humidity.length > 0;
      
      if (!hasTemperatureData && !hasHumidityData) {
        this.showError('该房间没有历史数据');
        this.shadowRoot.getElementById('chart-stats').style.display = 'none';
        return;
      }
      
      // 获取房间配置的精度
      const decimalPlaces = (this.roomDecimalPlaces && this.roomDecimalPlaces[roomId]) || 1;
      
      // 计算统计数据
      const stats = this.calculateStats(historyData);
      this.updateStatsDisplay(stats);
      
      // 在系列配置中添加
      const series = [];
      const legendData = [];

      if (hasTemperatureData) {
        series.push({
          name: '温度',
          type: 'line',
          yAxisIndex: 0,
          data: historyData.temperature,
          smooth: true,
          itemStyle: { color: '#e74c3c' },
          lineStyle: { color: '#e74c3c', width: 2 },
          showSymbol: false,
          xAxisIndex: 0,
          emphasis: {
            focus: 'series',
            lineStyle: {
              width: 3
            }
          },
          markPoint: {
            symbol: 'circle',
            symbolSize: 8,
            data: [
              { 
                type: 'max', 
                name: '最大值',
                itemStyle: { color: '#e74c3c' },
                label: {
                  show: true,
                  formatter: '{c}°C',
                  color: '#ffffff',
                  backgroundColor: '#e74c3c',
                  padding: [4, 6],
                  borderRadius: 4,
                  position: 'top'
                }
              },
              { 
                type: 'min', 
                name: '最小值',
                itemStyle: { color: '#e74c3c' },
                label: {
                  show: true,
                  formatter: '{c}°C',
                  color: '#ffffff',
                  backgroundColor: '#e74c3c',
                  padding: [4, 6],
                  borderRadius: 4,
                  position: 'bottom'
                }
              }
            ]
          }
        });
        legendData.push('温度');
      }

      if (hasHumidityData) {
        series.push({
          name: '湿度',
          type: 'line',
          yAxisIndex: 1,
          data: historyData.humidity,
          smooth: true,
          itemStyle: { color: '#3498db' },
          lineStyle: { color: '#3498db', width: 2 },
          showSymbol: false,
          xAxisIndex: 0,
          emphasis: {
            focus: 'series',
            lineStyle: {
              width: 3
            }
          },
          markPoint: {
            symbol: 'circle',
            symbolSize: 8,
            data: [
              { 
                type: 'max', 
                name: '最大值',
                itemStyle: { color: '#3498db' },
                label: {
                  show: true,
                  formatter: '{c}%',
                  color: '#ffffff',
                  backgroundColor: '#3498db',
                  padding: [4, 6],
                  borderRadius: 4,
                  position: 'top'
                }
              },
              { 
                type: 'min', 
                name: '最小值',
                itemStyle: { color: '#3498db' },
                label: {
                  show: true,
                  formatter: '{c}%',
                  color: '#ffffff',
                  backgroundColor: '#3498db',
                  padding: [4, 6],
                  borderRadius: 4,
                  position: 'bottom'
                }
              }
            ]
          }
        });
        legendData.push('湿度');
      }
      
      const option = {
        tooltip: {
          trigger: 'axis',
          textStyle: {
            fontSize: 10
          },            
          axisPointer: {
            type: 'cross',
            crossStyle: {
              color: '#999'
            },
            label: {
              backgroundColor: '#6a7985'
            }
          },
          // 关键配置：强制显示所有系列
          showContent: true,
          alwaysShowContent: false,
          triggerOn: 'mousemove|click',
          confine: true,
          formatter: function(params) {            
            if (!params || params.length === 0) return '无数据';
            
            const currentTime = params[0].axisValue;
            let result = `<div style="font-weight:bold;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:4px;">
              ${new Date(currentTime).toLocaleString('zh-CN')}
            </div>`;
            
            // 强制显示温度和湿度，即使只有一个系列有数据
            let tempValue = '--';
            let humidityValue = '--';
            
            // 查找温度数据
            const tempSeries = params.find(p => p.seriesName === '温度');
            if (tempSeries && tempSeries.data) {
              tempValue = typeof tempSeries.data[1] === 'number' ? tempSeries.data[1].toFixed(decimalPlaces) : '--';
            }
            
            // 查找湿度数据
            const humiditySeries = params.find(p => p.seriesName === '湿度');
            if (humiditySeries && humiditySeries.data) {
              humidityValue = typeof humiditySeries.data[1] === 'number' ? humiditySeries.data[1].toFixed(decimalPlaces) : '--';
            }
            
            // 如果都没找到，尝试从原始数据中查找最近的值
            if (tempValue === '--' || humidityValue === '--') {
              const nearestTemp = this.findNearestValue(historyData.temperature, currentTime, 10 * 60 * 1000); // 10分钟窗口
              const nearestHumidity = this.findNearestValue(historyData.humidity, currentTime, 10 * 60 * 1000);
              
              if (tempValue === '--' && nearestTemp !== null) tempValue = nearestTemp.toFixed(decimalPlaces);
              if (humidityValue === '--' && nearestHumidity !== null) humidityValue = nearestHumidity.toFixed(decimalPlaces);
            }
            
            result += `
              <div style="display:flex;align-items:center;margin:4px 0;">
                <span style="display:inline-block;width:12px;height:12px;background:#e74c3c;margin-right:8px;border-radius:2px;"></span>
                <span>温度: <strong style="color:#e74c3c">${tempValue}°C</strong></span>
              </div>
              <div style="display:flex;align-items:center;margin:4px 0;">
                <span style="display:inline-block;width:12px;height:12px;background:#3498db;margin-right:8px;border-radius:2px;"></span>
                <span>湿度: <strong style="color:#3498db">${humidityValue}%</strong></span>
              </div>
            `;
            
            return result;
          }.bind(this)
        },
        legend: {
          data: legendData
        },
        dataZoom: [
          {
            type: 'inside',
            xAxisIndex: [0],
            start: 0,
            end: 100,
            zoomOnMouseWheel: true, // 允许鼠标滚轮缩放
            moveOnMouseMove: true,   // 允许鼠标拖拽移动
            moveOnMouseWheel: false  // 鼠标滚轮只缩放不移动            
          },
        ],
        grid: {
          left: '3%',
          right: '4%',
          bottom: '15%',
          containLabel: true
        },
        xAxis: {
          type: 'time',
          axisPointer: {
            snap: true,
            lineStyle: {
              color: '#7581BD',
              width: 2
            }
          }
        },
        yAxis: [
          {
            type: 'value',
            name: '温度 (°C)',
            position: 'left',
            scale: true,
            axisLine: {
              show: true,
              lineStyle: {
                color: '#e74c3c'
              }
            }
          },
          {
            type: 'value',
            name: '湿度 (%)',
            position: 'right',
            scale: true,
            axisLine: {
              show: true,
              lineStyle: {
                color: '#3498db'
              }
            }
          }
        ],
        series: series
      };
      
      this.chart.setOption(option);
      this.hideError();
    } catch (error) {
      console.error('渲染图表失败:', error);
      this.showError('加载历史数据失败: ' + error.message);
    }
  }

  async renderAllRoomsChart(type, days) {
    const chartContainer = this.shadowRoot.getElementById('chart');
    
    if (this.chart) {
      this.chart.dispose();
    }
    
    this.chart = echarts.init(chartContainer);
    
    try {
      const series = [];
      const roomsWithData = [];
      let allData = [];
      
      // 存储所有房间的数据，用于tooltip查找
      this.allRoomsHistoryData = {};
      
      for (const room of this.config.rooms) {
        const entity = this.entities[room.id]?.[type];
        if (entity) {
          const historyData = await this.fetchHistoryDataForChart(room.id, days, type);
          const data = historyData[type];
          
          // 保存每个房间的历史数据
          this.allRoomsHistoryData[room.id] = {
            name: room.name,
            data: data,
            entity: entity
          };
          
          if (data && data.length > 0) {
            roomsWithData.push(room);
            series.push({
              name: room.name,
              type: 'line',
              data: data,
              smooth: true,
              showSymbol: false,
              lineStyle: { width: 2 },
              markPoint: {
                data: []
              }
            });
            allData = allData.concat(data);
          }
        }
      }
      
      if (series.length === 0) {
        this.showError('没有找到历史数据');
        this.shadowRoot.getElementById('chart-stats').style.display = 'none';
        return;
      }
      
      // 计算统计数据
      const statsData = { [type]: allData };
      const stats = this.calculateStats(statsData);
      this.updateStatsDisplay(stats);
      
      const option = {
        tooltip: {
          trigger: 'axis',
          textStyle: {
            fontSize: 10
          },   
          axisPointer: {
            type: 'cross'
          },
          formatter: (params) => {
            
            if (!params || params.length === 0) return '无数据';
            
            const currentTime = params[0].axisValue;
            let result = `<div style="font-weight:bold;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:4px;">
              ${new Date(currentTime).toLocaleString('zh-CN')}
            </div>`;
            
            // 显示所有配置的房间，即使某些房间在当前时间点没有数据
            const allRoomsDisplay = [];
            
            // 首先处理有数据的房间（从params中获取）
            const roomsWithCurrentData = new Set();
            params.forEach(param => {
              if (param.data && param.data.length === 2) {
                const value = param.data[1];
                const displayValue = typeof value === 'number' ? value.toFixed(1) : '--';
                const unit = type === 'temperature' ? '°C' : '%';
                
                allRoomsDisplay.push({
                  name: param.seriesName,
                  value: displayValue,
                  unit: unit,
                  color: param.color,
                  hasData: true
                });
                
                roomsWithCurrentData.add(param.seriesName);
              }
            });
            
            // 然后处理没有在当前时间点显示数据的房间
            Object.values(this.allRoomsHistoryData).forEach(roomData => {
              if (!roomsWithCurrentData.has(roomData.name)) {
                // 查找最近的数据点
                const nearestValue = this.findNearestValue(roomData.data, currentTime, 10 * 60 * 1000); // 10分钟窗口
                const displayValue = nearestValue !== null ? nearestValue.toFixed(1) : '--';
                const unit = type === 'temperature' ? '°C' : '%';
                
                // 为这个房间分配颜色（使用简单的哈希算法）
                const color = this.stringToColor(roomData.name);
                
                allRoomsDisplay.push({
                  name: roomData.name,
                  value: displayValue,
                  unit: unit,
                  color: color,
                  hasData: nearestValue !== null
                });
              }
            });
            
            // 按房间名称排序
            allRoomsDisplay.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
            
            // 生成显示内容
            allRoomsDisplay.forEach(room => {
              const opacity = room.hasData ? '1' : '0.6'; // 无数据的房间降低不透明度
              result += `<div style="display:flex;align-items:center;margin:4px 0;opacity:${opacity};">
                <span style="display:inline-block;width:12px;height:12px;background:${room.color};margin-right:8px;border-radius:2px;"></span>
                <span>${room.name}: <strong style="color:${room.color}">${room.value}${room.unit}</strong></span>
              </div>`;
            });
            
            return result;
          }
        },
        legend: {
          data: roomsWithData.map(room => room.name),
          type: 'scroll',
          bottom: 0
        },
        dataZoom: [
          {
            type: 'inside',
            xAxisIndex: 0,
            start: 0,
            end: 100,
            zoomOnMouseWheel: true, // 允许鼠标滚轮缩放
            moveOnMouseMove: true,   // 允许鼠标拖拽移动
            moveOnMouseWheel: false  // 鼠标滚轮只缩放不移动            
          },
        ],
        grid: {
          left: '3%',
          right: '4%',
          bottom: '15%',
          containLabel: true
        },
        xAxis: {
          type: 'time'
        },
        yAxis: {
          type: 'value',
          name: type === 'temperature' ? '温度 (°C)' : '湿度 (%)',
          scale: true
        },
        series: series
      };
      
      this.chart.setOption(option);
      this.hideError();
    } catch (error) {
      console.error('渲染全屋图表失败:', error);
      this.showError('加载历史数据失败: ' + error.message);
    }
  }

  // 在类中添加方法，根据房间名称生成固定颜色
  stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const colors = [
      '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', 
      '#1abc9c', '#d35400', '#c0392b', '#16a085', '#8e44ad',
      '#27ae60', '#2980b9', '#f1c40f', '#e67e22', '#e74c3c',
      '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'
    ];
    
    return colors[Math.abs(hash) % colors.length];
  }
  
  // 修改获取历史数据方法，修复日期范围计算
  async fetchHistoryDataForChart(roomId, days, specificType = null) {
    const entities = this.entities[roomId];
    if (!entities) {
      return { temperature: [], humidity: [] };
    }
    
    // 计算时间范围
    let endTime;
    if (this.isToday()) {
      endTime = new Date();
    } else {
      endTime = new Date(this.chartStartDate);
      endTime.setHours(23, 59, 59, 999);
    }
    
    const startTime = new Date(endTime);
    startTime.setDate(startTime.getDate() - days);
    
    const result = { temperature: [], humidity: [] };
    
    try {
      // 分别获取温度和湿度数据
      if ((!specificType || specificType === 'temperature') && entities.temperature) {
        const tempHistory = await this._hass.callWS({
          type: 'history/history_during_period',
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          entity_ids: [entities.temperature],
          minimal_response: true, // 改回minimal_response
          no_attributes: true
        });
        
        if (tempHistory[entities.temperature]) {
          result.temperature = tempHistory[entities.temperature]
            .filter(entry => {
              if (!entry || entry.s === null || entry.s === undefined) return false;
              if (entry.s === 'unknown' || entry.s === 'unavailable') return false;
              
              const value = parseFloat(entry.s);
              return !isNaN(value) && isFinite(value);
            })
            .map(entry => {
              // 修复时间戳获取 - 使用lu字段（last_updated的时间戳）
              const timestamp = entry.lu * 1000; // lu是Unix时间戳（秒），转换为毫秒
              return [
                timestamp,
                parseFloat(entry.s)
              ];
            })
            .sort((a, b) => a[0] - b[0]); // 按时间排序         
        }
      }
      
      if ((!specificType || specificType === 'humidity') && entities.humidity) {
        const humidityHistory = await this._hass.callWS({
          type: 'history/history_during_period',
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          entity_ids: [entities.humidity],
          minimal_response: true, // 改回minimal_response
          no_attributes: true
        });
        
        if (humidityHistory[entities.humidity]) {
          result.humidity = humidityHistory[entities.humidity]
            .filter(entry => {
              if (!entry || entry.s === null || entry.s === undefined) return false;
              if (entry.s === 'unknown' || entry.s === 'unavailable') return false;
              
              const value = parseFloat(entry.s);
              return !isNaN(value) && isFinite(value);
            })
            .map(entry => {
              // 修复时间戳获取 - 使用lu字段
              const timestamp = entry.lu * 1000; // lu是Unix时间戳（秒），转换为毫秒
              return [
                timestamp,
                parseFloat(entry.s)
              ];
            })
            .sort((a, b) => a[0] - b[0]); // 按时间排序
        }
      }
      
    } catch (error) {
      console.error(`获取房间 ${roomId} 历史数据失败:`, error);
    }
    
    return result;
  }
  hideModal() {
    this.shadowRoot.getElementById('chart-modal').style.display = 'none';
    if (this.chart) {
      this.chart.dispose();
      this.chart = null;
    }
    this.currentChartRoom = null;
    this.currentChartType = null;
    this.hideError();
    this.shadowRoot.getElementById('chart-stats').style.display = 'none';
  }

  showError(message) {
    const errorEl = this.shadowRoot.getElementById('error-message');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }

  hideError() {
    const errorEl = this.shadowRoot.getElementById('error-message');
    errorEl.style.display = 'none';
  }

  getCardSize() {
    return 4;
  }
}

customElements.define('wenshidu-card', WenshiduCard);