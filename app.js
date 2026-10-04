const MM_TO_PX = 96 / 25.4;

const page = document.getElementById("printPage");

const state = {
  elements: [],
  selectedId: null,
  zoom: 75,
  grid: true,
  snap: true,
  preview: false,
  history: [],
  historyIndex: -1,
  nextId: 1
};


const demoData = {
  订单编号: "JD20261004123456",
  收件人: "张三",
  手机号: "13800138000",
  收货地址: "湖北省荆州市沙市区测试地址123号",
  商品名称: "足银9999投资银条",
  数量: "2",
  价格: "¥2260"
};


/* =========================
   工具
========================= */

function mmToPx(mm) {
  return mm * MM_TO_PX;
}


function pxToMm(px) {
  return px / MM_TO_PX;
}


function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}


function round1(value) {
  return Math.round(value * 10) / 10;
}


function uid() {
  return "el_" + state.nextId++;
}


function selectedElementData() {
  return state.elements.find(
    item => item.id === state.selectedId
  );
}


function selectedElementNode() {
  if (!state.selectedId) return null;

  return document.querySelector(
    `[data-id="${state.selectedId}"]`
  );
}


function showToast(message) {

  const toast = document.getElementById("toast");
  const text = document.getElementById("toastText");

  text.textContent = message;

  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}


/* =========================
   历史记录
========================= */

function saveHistory() {

  const snapshot = JSON.stringify({
    elements: state.elements,
    pageWidth:
      Number(document.getElementById("pageWidth").value),
    pageHeight:
      Number(document.getElementById("pageHeight").value)
  });

  state.history =
    state.history.slice(0, state.historyIndex + 1);

  state.history.push(snapshot);

  if (state.history.length > 50) {
    state.history.shift();
  }

  state.historyIndex =
    state.history.length - 1;

  updateUndoRedo();
}


function restoreHistory(index) {

  if (
    index < 0 ||
    index >= state.history.length
  ) {
    return;
  }

  const data =
    JSON.parse(state.history[index]);

  state.historyIndex =
    index;

  state.elements =
    data.elements || [];

  document.getElementById("pageWidth").value =
    data.pageWidth || 215;

  document.getElementById("pageHeight").value =
    data.pageHeight || 140;

  applyPageSize(false);
  renderElements();

  selectElement(null);

  updateUndoRedo();
}


function updateUndoRedo() {

  document.getElementById("undoBtn").disabled =
    state.historyIndex <= 0;

  document.getElementById("redoBtn").disabled =
    state.historyIndex >= state.history.length - 1;
}


/* =========================
   创建组件
========================= */

function defaultElement(type) {

  const base = {
    id: uid(),
    type,
    x: 20,
    y: 20,
    w: 45,
    h: 12,
    text: "",
    fontSize: 12,
    fontWeight: "400",
    align: "left",
    field: "",
    locked: false
  };


  switch (type) {

    case "text":
      base.text = "双击或在右侧修改文字";
      base.w = 55;
      base.h = 10;
      break;


    case "field":
      base.text = "{{收件人}}";
      base.field = "收件人";
      base.w = 45;
      base.h = 10;
      break;


    case "image":
      base.text = "图片";
      base.w = 30;
      base.h = 25;
      break;


    case "table":
      base.w = 110;
      base.h = 36;
      break;


    case "barcode":
      base.text = "JD20261004123456";
      base.w = 60;
      base.h = 22;
      break;


    case "qrcode":
      base.w = 25;
      base.h = 25;
      break;


    case "line":
      base.w = 70;
      base.h = 0.5;
      break;


    case "container":
      base.w = 70;
      base.h = 35;
      break;
  }

  return base;
}


function addElement(type) {

  const data =
    defaultElement(type);

  const offset =
    state.elements.length * 3;

  data.x +=
    offset % 30;

  data.y +=
    offset % 24;

  state.elements.push(data);

  renderElements();

  selectElement(data.id);

  saveHistory();

  showToast("已添加组件");
}


/* =========================
   渲染
========================= */

function renderElements() {

  page
    .querySelectorAll(".design-element")
    .forEach(node => node.remove());


  state.elements.forEach(data => {

    const node =
      document.createElement("div");

    node.className =
      `design-element ${data.type}-element`;

    node.dataset.id =
      data.id;

    node.style.left =
      mmToPx(data.x) + "px";

    node.style.top =
      mmToPx(data.y) + "px";

    node.style.width =
      mmToPx(data.w) + "px";

    node.style.height =
      Math.max(
        1,
        mmToPx(data.h)
      ) + "px";

    node.style.fontSize =
      data.fontSize + "px";

    node.style.fontWeight =
      data.fontWeight;

    node.style.textAlign =
      data.align;

    if (data.locked) {
      node.classList.add("locked");
    }


    if (data.id === state.selectedId) {
      node.classList.add("selected");
    }


    renderElementContent(
      node,
      data
    );


    node.addEventListener(
      "mousedown",
      event => startDrag(event, data.id)
    );


    node.addEventListener(
      "click",
      event => {
        event.stopPropagation();
        selectElement(data.id);
      }
    );


    node.addEventListener(
      "dblclick",
      event => {
        event.stopPropagation();

        if (
          data.type === "text" ||
          data.type === "field"
        ) {
          document
            .getElementById("propText")
            .focus();
        }
      }
    );


    page.appendChild(node);
  });


  document.getElementById("elementCount")
    .textContent =
      `${state.elements.length} 个元素`;
}


function renderElementContent(
  node,
  data
) {

  switch (data.type) {

    case "text":
      node.textContent =
        data.text;
      break;


    case "field":

      if (
        state.preview &&
        data.field &&
        demoData[data.field] !== undefined
      ) {
        node.textContent =
          demoData[data.field];
      } else {
        node.textContent =
          data.text ||
          `{{${data.field || "字段"}}}`;
      }

      break;


    case "image":
      node.textContent =
        "图片";
      break;


    case "barcode":

      node.innerHTML =
        `
          <div class="fake-bars"></div>
          <small>${data.text}</small>
        `;

      break;


    case "qrcode":
      node.innerHTML =
        "";
      break;


    case "table":

      node.innerHTML =
        `
        <table>
          <thead>
            <tr>
              <th>商品</th>
              <th>规格</th>
              <th>数量</th>
              <th>价格</th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td>足银9999银条</td>
              <td>100g</td>
              <td>1</td>
              <td>¥1500</td>
            </tr>

            <tr>
              <td>足银9999银条</td>
              <td>50g</td>
              <td>1</td>
              <td>¥760</td>
            </tr>
          </tbody>
        </table>
        `;

      break;


    case "line":
      break;


    case "container":
      break;
  }
}


/* =========================
   选中
========================= */

function selectElement(id) {

  state.selectedId = id;

  renderElements();

  const data =
    selectedElementData();

  const empty =
    document.getElementById("noSelection");

  const panel =
    document.getElementById("propertyPanel");


  if (!data) {

    empty.classList.remove("hidden");
    panel.classList.add("hidden");

    return;
  }


  empty.classList.add("hidden");
  panel.classList.remove("hidden");


  document.getElementById("propX").value =
    round1(data.x);

  document.getElementById("propY").value =
    round1(data.y);

  document.getElementById("propW").value =
    round1(data.w);

  document.getElementById("propH").value =
    round1(data.h);

  document.getElementById("propText").value =
    data.text || "";

  document.getElementById("propFontSize").value =
    data.fontSize;

  document.getElementById("propFontWeight").value =
    data.fontWeight;

  document.getElementById("dataFieldSelect").value =
    data.field || "";

  document.getElementById("lockBtn").textContent =
    data.locked ? "解锁" : "锁定";


  document
    .querySelectorAll("[data-align]")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.align === data.align
      );

    });

}


/* =========================
   拖拽
========================= */

function startDrag(
  event,
  id
) {

  if (state.preview) return;

  const data =
    state.elements.find(item => item.id === id);

  if (
    !data ||
    data.locked
  ) {
    return;
  }

  selectElement(id);

  event.preventDefault();

  const startMouseX =
    event.clientX;

  const startMouseY =
    event.clientY;

  const startX =
    data.x;

  const startY =
    data.y;

  const zoomFactor =
    state.zoom / 100;


  function move(moveEvent) {

    let dx =
      (moveEvent.clientX - startMouseX) /
      zoomFactor /
      MM_TO_PX;

    let dy =
      (moveEvent.clientY - startMouseY) /
      zoomFactor /
      MM_TO_PX;


    let newX =
      startX + dx;

    let newY =
      startY + dy;


    if (state.snap) {

      const snapSize = 2;

      newX =
        Math.round(newX / snapSize) * snapSize;

      newY =
        Math.round(newY / snapSize) * snapSize;
    }


    const pageW =
      Number(
        document.getElementById("pageWidth").value
      );

    const pageH =
      Number(
        document.getElementById("pageHeight").value
      );


    data.x =
      clamp(
        newX,
        0,
        Math.max(0, pageW - data.w)
      );

    data.y =
      clamp(
        newY,
        0,
        Math.max(0, pageH - data.h)
      );


    const node =
      document.querySelector(
        `[data-id="${id}"]`
      );


    if (node) {

      node.style.left =
        mmToPx(data.x) + "px";

      node.style.top =
        mmToPx(data.y) + "px";
    }


    updatePropertyPosition();
  }


  function stop() {

    document.removeEventListener(
      "mousemove",
      move
    );

    document.removeEventListener(
      "mouseup",
      stop
    );

    saveHistory();
  }


  document.addEventListener(
    "mousemove",
    move
  );

  document.addEventListener(
    "mouseup",
    stop
  );
}


function updatePropertyPosition() {

  const data =
    selectedElementData();

  if (!data) return;

  document.getElementById("propX").value =
    round1(data.x);

  document.getElementById("propY").value =
    round1(data.y);
}


/* =========================
   属性更新
========================= */

function updateSelectedFromPanel() {

  const data =
    selectedElementData();

  if (!data) return;


  data.x =
    Number(
      document.getElementById("propX").value
    ) || 0;

  data.y =
    Number(
      document.getElementById("propY").value
    ) || 0;

  data.w =
    Math.max(
      .5,
      Number(
        document.getElementById("propW").value
      ) || 1
    );

  data.h =
    Math.max(
      .5,
      Number(
        document.getElementById("propH").value
      ) || 1
    );

  data.text =
    document.getElementById("propText").value;

  data.fontSize =
    clamp(
      Number(
        document.getElementById("propFontSize").value
      ) || 12,
      6,
      100
    );

  data.fontWeight =
    document.getElementById("propFontWeight").value;

  data.field =
    document.getElementById("dataFieldSelect").value;


  if (
    data.type === "field" &&
    data.field
  ) {
    data.text =
      `{{${data.field}}}`;

    document.getElementById("propText").value =
      data.text;
  }


  renderElements();
}


[
  "propX",
  "propY",
  "propW",
  "propH",
  "propText",
  "propFontSize",
  "propFontWeight",
  "dataFieldSelect"
]
.forEach(id => {

  document
    .getElementById(id)
    .addEventListener(
      "input",
      updateSelectedFromPanel
    );

  document
    .getElementById(id)
    .addEventListener(
      "change",
      () => {
        updateSelectedFromPanel();
        saveHistory();
      }
    );

});


document
  .querySelectorAll("[data-align]")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        const data =
          selectedElementData();

        if (!data) return;

        data.align =
          button.dataset.align;

        renderElements();
        selectElement(data.id);
        saveHistory();
      }
    );

  });


/* =========================
   删除 / 复制 / 锁定
========================= */

function deleteSelected() {

  if (!state.selectedId) return;

  state.elements =
    state.elements.filter(
      item => item.id !== state.selectedId
    );

  state.selectedId =
    null;

  renderElements();

  selectElement(null);

  saveHistory();

  showToast("元素已删除");
}


function duplicateSelected() {

  const data =
    selectedElementData();

  if (!data) return;

  const clone =
    JSON.parse(
      JSON.stringify(data)
    );

  clone.id =
    uid();

  clone.x +=
    4;

  clone.y +=
    4;

  clone.locked =
    false;

  state.elements.push(clone);

  renderElements();

  selectElement(clone.id);

  saveHistory();

  showToast("已复制元素");
}


function toggleLock() {

  const data =
    selectedElementData();

  if (!data) return;

  data.locked =
    !data.locked;

  selectElement(data.id);

  saveHistory();

  showToast(
    data.locked
      ? "元素已锁定"
      : "元素已解锁"
  );
}


document
  .getElementById("deleteBtn")
  .addEventListener(
    "click",
    deleteSelected
  );


document
  .getElementById("duplicateBtn")
  .addEventListener(
    "click",
    duplicateSelected
  );


document
  .getElementById("lockBtn")
  .addEventListener(
    "click",
    toggleLock
  );


/* =========================
   页面尺寸
========================= */

function applyPageSize(
  shouldHistory = true
) {

  const width =
    clamp(
      Number(
        document.getElementById("pageWidth").value
      ) || 215,
      20,
      1000
    );

  const height =
    clamp(
      Number(
        document.getElementById("pageHeight").value
      ) || 140,
      20,
      1000
    );


  page.style.width =
    mmToPx(width) + "px";

  page.style.height =
    mmToPx(height) + "px";


  document.getElementById("pageSizeText")
    .textContent =
      `${width} × ${height} mm`;


  drawRulers(
    width,
    height
  );


  if (shouldHistory) {
    saveHistory();
    showToast("纸张尺寸已更新");
  }
}


document
  .getElementById("applyPageBtn")
  .addEventListener(
    "click",
    () => applyPageSize(true)
  );


/* =========================
   标尺
========================= */

function drawRulers(
  width,
  height
) {

  const top =
    document.getElementById("topRuler");

  const left =
    document.getElementById("leftRuler");


  top.innerHTML =
    "";

  left.innerHTML =
    "";


  top.style.width =
    mmToPx(width) + "px";

  left.style.height =
    mmToPx(height) + "px";


  for (
    let mm = 0;
    mm <= width;
    mm += 10
  ) {

    const mark =
      document.createElement("span");

    mark.textContent =
      mm;

    mark.style.position =
      "absolute";

    mark.style.left =
      mmToPx(mm) + "px";

    mark.style.paddingLeft =
      "2px";

    top.appendChild(mark);
  }


  top.style.position =
    "relative";


  for (
    let mm = 0;
    mm <= height;
    mm += 10
  ) {

    const mark =
      document.createElement("span");

    mark.textContent =
      mm;

    mark.style.position =
      "absolute";

    mark.style.top =
      mmToPx(mm) + "px";

    mark.style.left =
      "3px";

    mark.style.transform =
      "rotate(-90deg)";

    mark.style.transformOrigin =
      "left top";

    left.appendChild(mark);
  }


  left.style.position =
    "relative";
}


/* =========================
   网格 / 吸附
========================= */

document
  .getElementById("gridToggle")
  .addEventListener(
    "change",
    event => {

      state.grid =
        event.target.checked;

      page.classList.toggle(
        "grid-on",
        state.grid
      );

    }
  );


document
  .getElementById("snapToggle")
  .addEventListener(
    "change",
    event => {

      state.snap =
        event.target.checked;

      showToast(
        state.snap
          ? "吸附已开启"
          : "吸附已关闭"
      );

    }
  );


/* =========================
   缩放
========================= */

function setZoom(value) {

  state.zoom =
    clamp(
      Number(value),
      50,
      150
    );

  const layer =
    document.getElementById("zoomLayer");

  layer.style.transform =
    `scale(${state.zoom / 100})`;

  document.getElementById("zoomRange").value =
    state.zoom;

  document.getElementById("zoomValue")
    .textContent =
      state.zoom + "%";
}


document
  .getElementById("zoomRange")
  .addEventListener(
    "input",
    event => setZoom(event.target.value)
  );


document
  .getElementById("zoomOut")
  .addEventListener(
    "click",
    () => setZoom(state.zoom - 5)
  );


document
  .getElementById("zoomIn")
  .addEventListener(
    "click",
    () => setZoom(state.zoom + 5)
  );


/* =========================
   左侧组件按钮
========================= */

document
  .querySelectorAll(".component-btn")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => addElement(button.dataset.type)
    );

  });


/* =========================
   撤销重做
========================= */

document
  .getElementById("undoBtn")
  .addEventListener(
    "click",
    () => {

      if (state.historyIndex > 0) {
        restoreHistory(
          state.historyIndex - 1
        );
      }

    }
  );


document
  .getElementById("redoBtn")
  .addEventListener(
    "click",
    () => {

      if (
        state.historyIndex <
        state.history.length - 1
      ) {
        restoreHistory(
          state.historyIndex + 1
        );
      }

    }
  );


/* =========================
   保存
========================= */

function saveTemplate() {

  const payload = {
    schemaVersion: 1,

    name:
      document
        .getElementById("templateName")
        .value
        .trim() ||
      "未命名模板",

    page: {
      width:
        Number(
          document.getElementById("pageWidth").value
        ),

      height:
        Number(
          document.getElementById("pageHeight").value
        )
    },

    elements:
      state.elements
  };


  localStorage.setItem(
    "super-print-template",
    JSON.stringify(payload)
  );


  document.getElementById("saveStatus")
    .textContent =
      "模板已保存";

  showToast("模板已保存");
}


document
  .getElementById("saveBtn")
  .addEventListener(
    "click",
    saveTemplate
  );


function loadTemplate() {

  const raw =
    localStorage.getItem(
      "super-print-template"
    );

  if (!raw) return false;


  try {

    const payload =
      JSON.parse(raw);


    document.getElementById("templateName").value =
      payload.name ||
      "发货单 215×140";


    document.getElementById("pageWidth").value =
      payload.page?.width ||
      215;


    document.getElementById("pageHeight").value =
      payload.page?.height ||
      140;


    state.elements =
      Array.isArray(payload.elements)
        ? payload.elements
        : [];


    const ids =
      state.elements
        .map(item => {
          const match =
            String(item.id)
              .match(/(\d+)$/);

          return match
            ? Number(match[1])
            : 0;
        });


    state.nextId =
      Math.max(
        1,
        ...ids
      ) + 1;


    applyPageSize(false);
    renderElements();

    return true;

  } catch (error) {

    console.error(error);

    return false;
  }
}


/* =========================
   新建
========================= */

document
  .getElementById("newBtn")
  .addEventListener(
    "click",
    () => {

      if (
        !confirm(
          "确定新建模板吗？当前未保存内容将被清空。"
        )
      ) {
        return;
      }

      state.elements =
        [];

      state.selectedId =
        null;

      document.getElementById("templateName").value =
        "未命名模板";

      renderElements();
      selectElement(null);

      saveHistory();

      showToast("已新建空白模板");
    }
  );


/* =========================
   实际数据预览
========================= */

document
  .getElementById("previewBtn")
  .addEventListener(
    "click",
    () => {

      state.preview =
        !state.preview;

      document.body.classList.toggle(
        "preview-mode",
        state.preview
      );

      document.getElementById("previewBtn")
        .textContent =
          state.preview
            ? "退出预览"
            : "实际预览";

      renderElements();

      showToast(
        state.preview
          ? "已进入实际数据预览"
          : "已返回设计模式"
      );

    }
  );


/* =========================
   打印
========================= */

document
  .getElementById("printBtn")
  .addEventListener(
    "click",
    () => {

      const wasPreview =
        state.preview;

      state.preview =
        true;

      renderElements();

      setTimeout(() => {

        window.print();

        state.preview =
          wasPreview;

        renderElements();

      }, 80);

    }
  );


/* =========================
   页面空白点击
========================= */

page.addEventListener(
  "click",
  () => selectElement(null)
);


/* =========================
   键盘快捷键
========================= */

document.addEventListener(
  "keydown",
  event => {

    const tag =
      document.activeElement?.tagName;

    const editing =
      ["INPUT","TEXTAREA","SELECT"]
        .includes(tag);


    if (
      event.ctrlKey &&
      event.key.toLowerCase() === "s"
    ) {
      event.preventDefault();
      saveTemplate();
      return;
    }


    if (
      event.ctrlKey &&
      event.key.toLowerCase() === "z"
    ) {
      event.preventDefault();

      if (state.historyIndex > 0) {
        restoreHistory(
          state.historyIndex - 1
        );
      }

      return;
    }


    if (
      event.ctrlKey &&
      event.key.toLowerCase() === "y"
    ) {
      event.preventDefault();

      if (
        state.historyIndex <
        state.history.length - 1
      ) {
        restoreHistory(
          state.historyIndex + 1
        );
      }

      return;
    }


    if (
      event.ctrlKey &&
      event.key.toLowerCase() === "d"
    ) {
      event.preventDefault();

      if (!editing) {
        duplicateSelected();
      }

      return;
    }


    if (editing) {
      return;
    }


    if (
      event.key === "Delete" ||
      event.key === "Backspace"
    ) {
      deleteSelected();
      return;
    }


    const data =
      selectedElementData();

    if (
      !data ||
      data.locked
    ) {
      return;
    }


    let step =
      event.shiftKey
        ? 5
        : 1;


    let changed =
      false;


    switch (event.key) {

      case "ArrowLeft":
        data.x -= step;
        changed = true;
        break;

      case "ArrowRight":
        data.x += step;
        changed = true;
        break;

      case "ArrowUp":
        data.y -= step;
        changed = true;
        break;

      case "ArrowDown":
        data.y += step;
        changed = true;
        break;
    }


    if (changed) {

      event.preventDefault();

      data.x =
        Math.max(
          0,
          data.x
        );

      data.y =
        Math.max(
          0,
          data.y
        );

      renderElements();
      selectElement(data.id);

      saveHistory();
    }

  }
);


/* =========================
   默认示例
========================= */

function createDemoTemplate() {

  const title =
    defaultElement("text");

  title.text =
    "发货单";

  title.x =
    82;

  title.y =
    8;

  title.w =
    50;

  title.h =
    12;

  title.fontSize =
    20;

  title.fontWeight =
    "800";

  title.align =
    "center";


  const receiver =
    defaultElement("field");

  receiver.field =
    "收件人";

  receiver.text =
    "{{收件人}}";

  receiver.x =
    15;

  receiver.y =
    29;


  const phone =
    defaultElement("field");

  phone.field =
    "手机号";

  phone.text =
    "{{手机号}}";

  phone.x =
    100;

  phone.y =
    29;


  const address =
    defaultElement("field");

  address.field =
    "收货地址";

  address.text =
    "{{收货地址}}";

  address.x =
    15;

  address.y =
    42;

  address.w =
    160;


  const table =
    defaultElement("table");

  table.x =
    15;

  table.y =
    62;

  table.w =
    180;

  table.h =
    46;


  const barcode =
    defaultElement("barcode");

  barcode.x =
    128;

  barcode.y =
    112;


  state.elements = [
    title,
    receiver,
    phone,
    address,
    table,
    barcode
  ];

}


/* =========================
   初始化
========================= */

function init() {

  const loaded =
    loadTemplate();

  if (!loaded) {
    createDemoTemplate();
  }


  applyPageSize(false);

  renderElements();

  setZoom(75);

  saveHistory();

  selectElement(null);

  showToast("超级打印已加载");
}


init();
