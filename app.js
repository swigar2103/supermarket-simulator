import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const sceneWrap = document.getElementById("scene-wrap");
const statusEl = document.getElementById("status");
const crosshairEl = document.getElementById("crosshair");
const statOpenEl = document.getElementById("stat-open");
const statCashEl = document.getElementById("stat-cash");
const statStockEl = document.getElementById("stat-stock");
const statCustomersEl = document.getElementById("stat-customers");
const statSalesEl = document.getElementById("stat-sales");
const statShipPendingEl = document.getElementById("stat-ship-pending");
const statShipExEl = document.getElementById("stat-ship-ex");
const selectedNameEl = document.getElementById("selected-name");
const selectedHelpEl = document.getElementById("selected-help");
const heldToolEl = document.getElementById("held-tool");
const selectionTagEl = document.getElementById("selection-tag");

const regPanelEl = document.getElementById("regulator-panel");
const regCashEl = document.getElementById("reg-cash");
const regStockEl = document.getElementById("reg-stock");
const regCustomersEl = document.getElementById("reg-customers");
const regSpawnEl = document.getElementById("reg-spawn");
const regPriceEl = document.getElementById("reg-price");

const lcdOverlayEl = document.getElementById("lcd-overlay");
const lcdWarehouseCountEl = document.getElementById("lcd-warehouse-count");
const lcdManifestCountEl = document.getElementById("lcd-manifest-count");
const lcdTruckCountEl = document.getElementById("lcd-truck-count");
const lcdStorePendingCountEl = document.getElementById("lcd-store-pending-count");
const lcdStoreScannedCountEl = document.getElementById("lcd-store-scanned-count");
const lcdExceptionCountEl = document.getElementById("lcd-exception-count");
const lcdLogEl = document.getElementById("lcd-log");

const PLACEABLE_TYPES = ["shelf", "freezer", "storage", "terminal", "cart", "goodsBox"];
const GRID_SIZE = 1;
const LAYOUT_KEY = "mini-supermarket-layout-v4";
const PLAYER_HEIGHT = 1.7;
const MAX_X = 42;
const MAX_Z = 34;

let currentPlaceType = null;
let selectedObject = null;
let isFirstPerson = true;
let nextRfidCounter = 1000;
let heldTool = "none";
let carriedBoxId = null;
let isDrivingTruck = false;
const placeButtons = Array.from(document.querySelectorAll("button[data-place]"));
const placeableRootObjects = [];
const logisticsObjects = [];
const customers = [];

const movement = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  sprint: false,
  jumpQueued: false
};

const playerPhysics = {
  velocityY: 0,
  onGround: true
};

const driveLook = {
  yaw: 0,
  pitch: 0
};

const wallColliders = [];

const state = {
  isOpen: false,
  cash: 100,
  storageStock: 28,
  soldCount: 0,
  spawnTimer: 0,
  spawnInterval: 4.5,
  salePrice: 8
};

const logistics = {
  destinationStore: "门店A",
  boxes: [],
  manifest: [],
  truckLoadIds: [],
  pendingStoreIds: [],
  exceptions: [],
  manifestRegistered: false,
  truckAt: "warehouse",
  orderRequirements: { "水果": 2, "生鲜": 2, "烘焙": 1, "冷饮": 1 },
  warehouseScannedByCategory: { "水果": 0, "生鲜": 0, "烘焙": 0, "冷饮": 0, "综合": 0 },
  storeCheckedByCategory: { "水果": 0, "生鲜": 0, "烘焙": 0, "冷饮": 0, "综合": 0 },
  storeWrongCount: 0,
  boardTextures: { dist: null, store: null },
  storeShelfCounts: { "水果": 0, "生鲜": 0, "烘焙": 0, "冷饮": 0, "综合": 0 },
  refs: {
    truck: null,
    lcd: null,
    storeLcd: null,
    tagToolDock: null,
    readerToolDock: null,
    storeReaderToolDock: null
  }
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x20283c);

const camera = new THREE.PerspectiveCamera(
  60,
  sceneWrap.clientWidth / sceneWrap.clientHeight,
  0.1,
  300
);
camera.position.set(0, PLAYER_HEIGHT, 24);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(sceneWrap.clientWidth, sceneWrap.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
sceneWrap.appendChild(renderer.domElement);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.target.set(0, 0, 0);
orbitControls.enableDamping = true;
orbitControls.maxPolarAngle = Math.PI * 0.49;
orbitControls.minDistance = 6;
orbitControls.maxDistance = 50;

const fpControls = new PointerLockControls(camera, renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.74);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(12, 20, 8);
scene.add(dirLight);

const floorGeo = new THREE.PlaneGeometry(90, 70, 1, 1);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x6d737c });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI * 0.5;
floor.name = "floor";
scene.add(floor);

const floorGrid = new THREE.GridHelper(90, 90, 0x545d6f, 0x3f4654);
floorGrid.position.y = 0.01;
scene.add(floorGrid);
const firstPersonHandRoot = new THREE.Group();
firstPersonHandRoot.position.set(0.42, -0.33, -0.75);
camera.add(firstPersonHandRoot);

createWalls();
createWarehouseZone();
seedStarterLayout();
createLogisticsObjects();
createWarehouseProps();
createInfoLcdBoards();
refillAllShelves(false);
applyCameraMode(true);
updateStats();
syncRegulatorInputs();
updateLcdDashboard();
updateHeldToolDisplay();
alignCrosshairToCanvasCenter();

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();

renderer.domElement.addEventListener("pointerdown", onPointerDown);
renderer.domElement.addEventListener("click", onSceneClick);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("resize", onResize);
document.addEventListener("mousemove", onDriveMouseMove);

placeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const type = btn.getAttribute("data-place");
    setCurrentPlaceType(type);
  });
});

document.getElementById("add-goods").addEventListener("click", addGoodsToSelectedShelf);
document.getElementById("spawn-goods").addEventListener("click", () => setCurrentPlaceType("goodsBox"));
document.getElementById("save-layout").addEventListener("click", saveLayout);
document.getElementById("load-layout").addEventListener("click", loadLayout);
document.getElementById("reset-layout").addEventListener("click", () => {
  clearAllPlaced();
  clearCustomers();
  resetBusiness();
  resetLogisticsFlow();
  seedStarterLayout();
  refillAllShelves(false);
  setStatus("已重置为初始布局和RF流程。");
});
document.getElementById("toggle-open").addEventListener("click", toggleOpen);
document.getElementById("restock-all").addEventListener("click", () => refillAllShelves(true));
document.getElementById("toggle-camera").addEventListener("click", () => applyCameraMode(!isFirstPerson));
document.getElementById("open-regulator").addEventListener("click", () => {
  regPanelEl.classList.toggle("hidden");
  syncRegulatorInputs();
});
document.getElementById("apply-regulator").addEventListener("click", applyRegulatorValues);
document.getElementById("spawn-one-customer").addEventListener("click", () => {
  createCustomer();
  updateStats();
  syncRegulatorInputs();
});
document.getElementById("clear-customers").addEventListener("click", () => {
  clearCustomers();
  syncRegulatorInputs();
  setStatus("已清空全部顾客。");
});

document.getElementById("lcd-register-manifest").addEventListener("click", registerManifestAtLcd);
document.getElementById("lcd-load-truck").addEventListener("click", loadTruckAtLcd);
document.getElementById("lcd-deliver-truck").addEventListener("click", deliverTruckAtLcd);
document.getElementById("lcd-confirm-receive").addEventListener("click", confirmReceivingAtLcd);
document.getElementById("lcd-clear-exception").addEventListener("click", clearExceptionsAtLcd);
document.getElementById("lcd-close").addEventListener("click", closeLcdOverlay);

fpControls.addEventListener("lock", () => {
  setStatus("第一人称已锁定，WASD移动，Esc释放。");
});
fpControls.addEventListener("unlock", () => {
  if (isDrivingTruck) {
    stopDrivingTruck();
  }
  if (isFirstPerson) {
    setStatus("第一人称已释放，点击场景可继续操作。");
  }
});

exposeSimulationApi();
animate();
setStatus("场景已加载。先拿工具(E)，再贴标(T)、扫货(E)、搬货(E)、开车送货(E)。Shift疾跑，Space跳跃。");

function createWalls() {
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xbec5d3 });
  const addWall = (sizeX, sizeY, sizeZ, x, y, z) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sizeX, sizeY, sizeZ), wallMat);
    wall.position.set(x, y, z);
    scene.add(wall);
    wallColliders.push({
      minX: x - sizeX / 2,
      maxX: x + sizeX / 2,
      minZ: z - sizeZ / 2,
      maxZ: z + sizeZ / 2
    });
  };

  // 门店建筑（下方）
  addWall(19.9, 4.2, 0.3, -12.05, 2.1, -2);
  addWall(19.9, 4.2, 0.3, 12.05, 2.1, -2);
  addWall(0.3, 4.2, 30, -22, 2.1, 13);
  addWall(0.3, 4.2, 30, 22, 2.1, 13);
  addWall(18, 4.2, 0.3, -13, 2.1, 28);
  addWall(18, 4.2, 0.3, 13, 2.1, 28);

  // 门店后仓分隔线（后仓在门店后侧）
  const dividerLeft = new THREE.Mesh(new THREE.BoxGeometry(17.2, 2.6, 0.18), mat(0xaab4cb));
  dividerLeft.position.set(-12.6, 1.3, 8);
  scene.add(dividerLeft);
  const dividerRight = new THREE.Mesh(new THREE.BoxGeometry(17.2, 2.6, 0.18), mat(0xaab4cb));
  dividerRight.position.set(12.6, 1.3, 8);
  scene.add(dividerRight);
  wallColliders.push({ minX: -21.2, maxX: -4.0, minZ: 7.91, maxZ: 8.09 });
  wallColliders.push({ minX: 4.0, maxX: 21.2, minZ: 7.91, maxZ: 8.09 });

  // 配货仓库建筑（上方，独立建筑）
  addWall(19.4, 5, 0.3, -12.3, 2.5, -32);
  addWall(19.4, 5, 0.3, 12.3, 2.5, -32);
  addWall(19.4, 5, 0.3, -12.3, 2.5, -16);
  addWall(19.4, 5, 0.3, 12.3, 2.5, -16);
  addWall(0.3, 5, 16, -22, 2.5, -24);
  addWall(0.3, 5, 16, 22, 2.5, -24);
}

function createWarehouseZone() {
  // 配货仓库区域地面
  const distBase = new THREE.Mesh(new THREE.BoxGeometry(42, 0.12, 14), mat(0x7a86a4));
  distBase.position.set(0, 0.06, -24);
  scene.add(distBase);

  const distBorder = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(42, 0.15, 14)),
    new THREE.LineBasicMaterial({ color: 0xb7c7ea })
  );
  distBorder.position.copy(distBase.position);
  scene.add(distBorder);

  // 门店后仓区域地面（在门店内部后侧）
  const storeBackroom = new THREE.Mesh(new THREE.BoxGeometry(42, 0.12, 10), mat(0x72819f));
  storeBackroom.position.set(0, 0.06, 2.8);
  scene.add(storeBackroom);
}

function createLogisticsObjects() {
  const lcd = createLcdUnit(new THREE.Vector3(16, 0, -22), "配货仓库LCD");
  logistics.refs.lcd = lcd;
  const storeLcd = createLcdUnit(new THREE.Vector3(16, 0, -1.4), "门店后仓LCD");
  logistics.refs.storeLcd = storeLcd;

  const truck = createTruck(new THREE.Vector3(0, 0, -9));
  logistics.refs.truck = truck;

  const tagToolDock = createToolDock("RF标签器", new THREE.Vector3(14.5, 0, -21.5), "rfTagger");
  const readerToolDock = createToolDock("手持RF Reader", new THREE.Vector3(14.5, 0, -23.4), "rfReader");
  const storeReaderToolDock = createToolDock("手持RF Reader(门店)", new THREE.Vector3(14.5, 0, 4.0), "rfReader");
  logistics.refs.tagToolDock = tagToolDock;
  logistics.refs.readerToolDock = readerToolDock;
  logistics.refs.storeReaderToolDock = storeReaderToolDock;

  spawnWarehouseShipmentBoxes(6);
}

function createLcdUnit(position, displayName) {
  const group = new THREE.Group();
  group.userData.type = "lcdTerminal";
  group.userData.displayName = displayName;
  group.userData.isLogistics = true;

  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.85, 0.8), mat(0x2f4468));
  desk.position.set(0, 0.42, 0);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), mat(0x1c2336));
  stand.position.set(0, 1.1, -0.08);
  const lcd = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.06), mat(0x2f80d8));
  lcd.position.set(0, 1.35, -0.08);
  group.add(desk, stand, lcd);
  group.position.copy(position);
  scene.add(group);
  logisticsObjects.push(group);
  return group;
}

function createTruck(position) {
  const group = new THREE.Group();
  group.userData.type = "truck";
  group.userData.displayName = "配送货车";
  group.userData.isLogistics = true;

  const bed = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 1.4), mat(0x4b5f8f));
  bed.position.set(0, 0.7, 0);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1, 1.35), mat(0x6c86bf));
  cabin.position.set(-1.1, 1, 0);
  group.add(bed, cabin);

  [-1.2, 0.7].forEach((x) => {
    [-0.6, 0.6].forEach((z) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 14), mat(0x1d2331));
      wheel.rotation.z = Math.PI * 0.5;
      wheel.position.set(x, 0.25, z);
      group.add(wheel);
    });
  });

  group.position.copy(position);
  scene.add(group);
  logisticsObjects.push(group);
  return group;
}

function createToolDock(label, position, toolType) {
  const group = new THREE.Group();
  group.userData.type = "toolDock";
  group.userData.toolType = toolType;
  group.userData.displayName = label;
  group.userData.isLogistics = true;

  const desk = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.82, 0.7), mat(0x374a74));
  desk.position.set(0, 0.41, 0);
  const tool = new THREE.Mesh(
    new THREE.BoxGeometry(toolType === "rfTagger" ? 0.26 : 0.34, 0.1, 0.14),
    mat(toolType === "rfTagger" ? 0xd07d47 : 0x59b2d4)
  );
  tool.position.set(0, 0.9, 0);
  group.add(desk, tool);
  group.position.copy(position);
  scene.add(group);
  logisticsObjects.push(group);
  return group;
}

function createWarehouseProps() {
  // 配货仓库货架与货物
  const distRackCenters = [-16, -8, 0, 8, 16];
  for (let i = 0; i < distRackCenters.length; i += 1) {
    const rack = new THREE.Group();
    const legGeo = new THREE.BoxGeometry(0.1, 2.2, 0.1);
    const shelfGeo = new THREE.BoxGeometry(5.2, 0.1, 0.9);
    [
      [-2.45, 1.1, -0.35], [2.45, 1.1, -0.35], [-2.45, 1.1, 0.35], [2.45, 1.1, 0.35]
    ].forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(legGeo, mat(0x5c6882));
      leg.position.set(x, y, z);
      rack.add(leg);
    });
    [0.35, 1.1, 1.85].forEach((y) => {
      const board = new THREE.Mesh(shelfGeo, mat(0x7a89aa));
      board.position.set(0, y, 0);
      rack.add(board);
    });
    rack.position.set(distRackCenters[i], 0, -29);
    scene.add(rack);
  }

  // 门店后仓货架
  for (let i = 0; i < 3; i += 1) {
    const rack = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.2, 0.9), mat(0x5f6f8f));
    body.position.set(0, 1.1, 0);
    rack.add(body);
    rack.position.set(-12 + i * 7, 0, 4.2);
    scene.add(rack);
  }

  // 门店区域货品陈列分区标识方块（水果/生鲜/烘焙/冷饮）
  const zones = [
    ["水果区", 2, 0, 16, 0x8ecf63],
    ["生鲜区", -2, 0, 16, 0xd98181],
    ["烘焙区", 7, 0, 12, 0xd7b06d],
    ["冷饮区", -7, 0, 12, 0x7fb6dd]
  ];
  zones.forEach(([, x, y, z, color]) => {
    const mark = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 2.3), mat(color));
    mark.position.set(x, y + 0.05, z);
    scene.add(mark);
  });
}

function createInfoLcdBoards() {
  // LCD-A：配货仓库（显示门店订货内容）
  // 配货仓前墙位于 z=-16，墙厚0.3，内侧面约 z=-16.15，故看板放在 z=-16.22 避免嵌入墙体
  const dist = createInfoBoard(
    "配货仓LCD-门店订货看板",
    new THREE.Vector3(-17.8, 2.15, -16.22),
    6.6,
    3.2,
    Math.PI
  );
  // LCD-B：门店后仓（显示系统比对配送清单）
  const store = createInfoBoard(
    "门店仓LCD-配送比对看板",
    new THREE.Vector3(-17.8, 2.15, -1.82),
    6.6,
    3.2,
    0
  );
  logistics.boardTextures.dist = dist;
  logistics.boardTextures.store = store;
  updateInfoBoards();
}

function createInfoBoard(title, position, width, height, yaw = 0) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 384;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide })
  );
  board.position.copy(position);
  board.rotation.y = yaw;
  scene.add(board);
  return { canvas, ctx, texture, title };
}

function drawBoardLines(boardObj, lines) {
  if (!boardObj) {
    return;
  }
  const { ctx, canvas, texture, title } = boardObj;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0f1828";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#446093";
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

  ctx.fillStyle = "#b8d4ff";
  ctx.font = "bold 30px Microsoft YaHei";
  ctx.fillText(title, 24, 50);
  ctx.fillStyle = "#d6e3ff";
  ctx.font = "24px Microsoft YaHei";
  lines.forEach((line, idx) => {
    ctx.fillText(line, 24, 98 + idx * 40);
  });
  texture.needsUpdate = true;
}

function updateInfoBoards() {
  const req = logistics.orderRequirements;
  const ws = logistics.warehouseScannedByCategory;
  drawBoardLines(logistics.boardTextures.dist, [
    `门店: ${logistics.destinationStore} 订购需求`,
    `水果 ${ws["水果"]}/${req["水果"]} ${ws["水果"] >= req["水果"] ? "✓" : "✗"}`,
    `生鲜 ${ws["生鲜"]}/${req["生鲜"]} ${ws["生鲜"] >= req["生鲜"] ? "✓" : "✗"}`,
    `烘焙 ${ws["烘焙"]}/${req["烘焙"]} ${ws["烘焙"] >= req["烘焙"] ? "✓" : "✗"}`,
    `冷饮 ${ws["冷饮"]}/${req["冷饮"]} ${ws["冷饮"] >= req["冷饮"] ? "✓" : "✗"}`,
    `综合(非需求) ${ws["综合"]} 件`
  ]);

  const st = logistics.storeCheckedByCategory;
  drawBoardLines(logistics.boardTextures.store, [
    `配送比对进度(正确/异常)`,
    `水果 ${st["水果"]}/${req["水果"]} ${st["水果"] >= req["水果"] ? "✓" : "✗"}`,
    `生鲜 ${st["生鲜"]}/${req["生鲜"]} ${st["生鲜"] >= req["生鲜"] ? "✓" : "✗"}`,
    `烘焙 ${st["烘焙"]}/${req["烘焙"]} ${st["烘焙"] >= req["烘焙"] ? "✓" : "✗"}`,
    `冷饮 ${st["冷饮"]}/${req["冷饮"]} ${st["冷饮"] >= req["冷饮"] ? "✓" : "✗"}`,
    `异常累计: ${logistics.storeWrongCount}`
  ]);
}

function spawnWarehouseShipmentBoxes(count) {
  void count;
  // 5组类别货架（从左到右：水果、生鲜、烘焙、冷饮、综合），每组3层补满
  const rackCenters = {
    "水果": -16,
    "生鲜": -8,
    "烘焙": 0,
    "冷饮": 8,
    "综合": 16
  };
  const levels = [0.58, 1.33, 2.08];
  const xOffsets = [-1.9, -0.65, 0.65, 1.9];
  const z = -29.2;

  Object.entries(rackCenters).forEach(([category, centerX]) => {
    levels.forEach((y, levelIdx) => {
      xOffsets.forEach((offsetX, slotIdx) => {
        const pos = new THREE.Vector3(centerX + offsetX, y, z);
        const batchCode = `BATCH-${category}-${levelIdx + 1}${slotIdx + 1}`;
        createShipmentBox({
          quantity: 1,
          batch: batchCode,
          destination: logistics.destinationStore,
          category,
          position: pos
        });
      });
    });
  });
  updateLcdDashboard();
  updateInfoBoards();
}

function createShipmentBox({ quantity, batch, destination, category, position }) {
  const id = `BOX-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const box = {
    id,
    quantity,
    batch,
    destination,
    category,
    createdAt: new Date().toLocaleString(),
    tagId: null,
    tagAttached: false,
    status: "warehouse",
    scannedWarehouse: false,
    scannedStore: false,
    mesh: createShipmentMesh(category)
  };
  box.mesh.userData.type = "shipmentBox";
  box.mesh.userData.boxId = id;
  box.mesh.userData.displayName = `${category}配送货品`;
  box.mesh.userData.isLogistics = true;
  box.mesh.position.copy(position);

  scene.add(box.mesh);
  logisticsObjects.push(box.mesh);
  logistics.boxes.push(box);
  refreshShipmentBoxVisual(box);
}

function createShipmentMesh(category) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.38, 0.36), mat(0xc68b44));
  body.position.set(0, 0.19, 0);
  body.name = "body";
  const tagSlot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.16), mat(0x4d556b));
  tagSlot.position.set(0, 0.44, 0);
  tagSlot.name = "tagSlot";
  tagSlot.visible = false;
  const scanBeacon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16), mat(0xd94e4e));
  scanBeacon.position.set(0, 0.49, 0);
  scanBeacon.name = "scanBeacon";
  scanBeacon.visible = false;
  group.add(body, tagSlot, scanBeacon);

  if (category === "水果") {
    [-0.1, 0.05, 0.18].forEach((x, idx) => {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), mat(idx % 2 ? 0xff8b5e : 0x7ecf62));
      fruit.position.set(x, 0.42, -0.02 + idx * 0.02);
      fruit.name = "categoryProp";
      group.add(fruit);
    });
  } else if (category === "生鲜") {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.18), mat(0xbfc7d5));
    tray.position.set(0, 0.42, 0);
    tray.name = "categoryProp";
    const meat = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.12), mat(0xd47777));
    meat.position.set(0, 0.47, 0);
    meat.name = "categoryProp";
    group.add(tray, meat);
  } else if (category === "烘焙") {
    const loaf = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.14, 5, 8), mat(0xc79a52));
    loaf.rotation.z = Math.PI * 0.5;
    loaf.position.set(0, 0.45, 0);
    loaf.name = "categoryProp";
    group.add(loaf);
  } else if (category === "冷饮") {
    [-0.09, 0, 0.09].forEach((x) => {
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 10), mat(0x79c7ef));
      bottle.position.set(x, 0.45, 0);
      bottle.name = "categoryProp";
      group.add(bottle);
    });
  } else {
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.14), mat(0x8f96a8));
    mark.position.set(0, 0.44, 0);
    mark.name = "categoryProp";
    group.add(mark);
  }
  return group;
}

function refreshShipmentBoxVisual(box) {
  const body = box.mesh.getObjectByName("body");
  const tagSlot = box.mesh.getObjectByName("tagSlot");
  const scanBeacon = box.mesh.getObjectByName("scanBeacon");
  if (!body || !tagSlot || !scanBeacon) {
    return;
  }

  const baseByCategory = {
    "水果": 0x7fca67,
    "生鲜": 0xd37a7a,
    "烘焙": 0xc8a05f,
    "冷饮": 0x74b6db,
    "综合": 0xc68b44
  };
  let color = baseByCategory[box.category] || 0xc68b44;
  if (box.status === "staged") color = 0xe3be55;
  if (box.status === "inTruck") color = 0x8cc673;
  if (box.status === "storePending") color = 0x72b7d9;
  if (box.status === "scannedStore") color = 0x4ec878;
  if (box.status === "received") color = 0x54815f;
  if (box.status === "exception") color = 0xc54f4f;

  body.material.color.setHex(color);
  tagSlot.visible = Boolean(box.tagAttached && box.tagId);
  scanBeacon.visible = Boolean(box.tagAttached && box.tagId);
  if (box.tagId) {
    const scanned = box.scannedWarehouse || box.scannedStore;
    const tagColor = scanned ? 0x30d96d : 0xf24848;
    tagSlot.material.color.setHex(tagColor);
    scanBeacon.material.color.setHex(tagColor);
  } else {
    tagSlot.material.color.setHex(0x4d556b);
    scanBeacon.material.color.setHex(0x4d556b);
  }
}

function onResize() {
  camera.aspect = sceneWrap.clientWidth / sceneWrap.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(sceneWrap.clientWidth, sceneWrap.clientHeight);
  alignCrosshairToCanvasCenter();
}

function onSceneClick() {
  if (isFirstPerson && !fpControls.isLocked && lcdOverlayEl.classList.contains("hidden")) {
    fpControls.lock();
  }
}

function applyCameraMode(nextFirstPerson) {
  isFirstPerson = nextFirstPerson;
  const toggleBtn = document.getElementById("toggle-camera");

  if (isFirstPerson) {
    orbitControls.enabled = false;
    camera.position.set(0, PLAYER_HEIGHT, 24);
    crosshairEl.style.display = "block";
    toggleBtn.textContent = "切换到俯视相机";
    setStatus("第一人称模式：点击场景锁定鼠标，WASD移动。");
  } else {
    if (fpControls.isLocked) {
      fpControls.unlock();
    }
    orbitControls.enabled = true;
    camera.position.set(32, 28, 28);
    orbitControls.target.set(0, 0, 4);
    orbitControls.update();
    crosshairEl.style.display = "none";
    toggleBtn.textContent = "切换到第一人称";
    setStatus("俯视模式：可自由观察和布局编辑。");
  }
}

function setCurrentPlaceType(type) {
  currentPlaceType = PLACEABLE_TYPES.includes(type) ? type : null;
  placeButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.place === currentPlaceType));
  if (type === "goodsBox") {
    placeButtons.forEach((btn) => btn.classList.remove("active"));
  }
  setStatus(currentPlaceType ? `放置模式: ${currentPlaceType}` : "已退出放置模式");
}

function onPointerDown(event) {
  if (isFirstPerson && !fpControls.isLocked) {
    return;
  }

  prepareRay(event);

  if (currentPlaceType) {
    const floorHit = raycaster.intersectObject(floor, false)[0];
    if (floorHit) {
      const pos = snapToGrid(floorHit.point);
      const object = createUnit(currentPlaceType);
      object.position.copy(pos);
      scene.add(object);
      placeableRootObjects.push(object);
      selectObject(object);
      setStatus(`已放置: ${currentPlaceType} (${pos.x.toFixed(0)}, ${pos.z.toFixed(0)})`);
    }
    return;
  }

  const intersections = raycaster.intersectObjects(getSelectableRoots(), true);
  if (!intersections.length) {
    selectObject(null);
    return;
  }
  const selected = findRootSelectable(intersections[0].object);
  selectObject(selected);
}

function getSelectableRoots() {
  return [...placeableRootObjects, ...logisticsObjects];
}

function findRootSelectable(node) {
  let current = node;
  const roots = getSelectableRoots();
  while (current && current.parent) {
    if (roots.includes(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function prepareRay(event) {
  if (isFirstPerson) {
    pointer.set(0, 0);
  } else {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }
  raycaster.setFromCamera(pointer, camera);
}

function selectObject(object) {
  if (selectedObject === object) {
    return;
  }
  highlightObject(selectedObject, false);
  selectedObject = object;
  highlightObject(selectedObject, true);
  if (!selectedObject) {
    selectedNameEl.textContent = "无";
    selectedHelpEl.textContent = "无";
    selectionTagEl.classList.add("hidden");
    setStatus("未选中设施。");
    return;
  }

  const displayName = getDisplayName(selectedObject);
  selectedNameEl.textContent = displayName;
  selectedHelpEl.textContent = getUsageHelp(selectedObject);
  selectionTagEl.textContent = displayName;
  selectionTagEl.classList.remove("hidden");

  if (selectedObject.userData.type === "shipmentBox") {
    const box = getShipmentBoxById(selectedObject.userData.boxId);
    if (box) {
      const entered = box.scannedWarehouse ? "已录入系统" : "未录入系统";
      setStatus(`已选中货品 ${box.id} (${box.category})，${entered}，状态:${box.status}，标签:${box.tagId || "未绑定"}`);
      return;
    }
  }

  setStatus(`已选中: ${displayName}`);
}

function getDisplayName(object) {
  if (!object) {
    return "无";
  }
  if (object.userData.type === "shipmentBox") {
    const box = getShipmentBoxById(object.userData.boxId);
    if (box) {
      const entered = box.scannedWarehouse ? "已录入系统" : "未录入系统";
      return `${box.category}货品(${box.id})[${entered}]`;
    }
  }
  if (object.userData.displayName) {
    return object.userData.displayName;
  }
  if (object.userData.label) {
    return object.userData.label;
  }
  return object.userData.type || "未命名对象";
}

function getUsageHelp(object) {
  if (!object) {
    return "无";
  }
  const type = object.userData.type;
  if (type === "shipmentBox") {
    return "E搬运/放下；拿标签器后T贴标；拿Reader后E直接录入/收货扫描。";
  }
  if (type === "lcdTerminal") {
    return "按E打开仓配系统界面。";
  }
  if (type === "toolDock") {
    return "按E拿起对应手持道具。";
  }
  if (type === "truck") {
    return "E上车/下车驾驶；驾驶时WASD移动，速度更快。";
  }
  return "方向键移动，R旋转，Delete删除。";
}

function toolName(tool) {
  if (tool === "rfTagger") return "RF标签器";
  if (tool === "rfReader") return "手持RF Reader";
  return "无";
}

function updateHeldToolDisplay() {
  const heldDisplay = getHeldDisplayName();
  heldToolEl.textContent = heldDisplay;
  rebuildFirstPersonHandModel();
}

function getHeldDisplayName() {
  if (carriedBoxId) {
    const box = getShipmentBoxById(carriedBoxId);
    if (box) {
      return `${box.category}货品`;
    }
  }
  return toolName(heldTool);
}

function rebuildFirstPersonHandModel() {
  while (firstPersonHandRoot.children.length) {
    firstPersonHandRoot.remove(firstPersonHandRoot.children[0]);
  }

  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.14), mat(0xf0c5a4));
  hand.position.set(-0.06, -0.08, 0.02);
  firstPersonHandRoot.add(hand);

  if (carriedBoxId) {
    const box = getShipmentBoxById(carriedBoxId);
    const colorMap = { "水果": 0x7fca67, "生鲜": 0xd37a7a, "烘焙": 0xc8a05f, "冷饮": 0x74b6db, "综合": 0x9ca7bf };
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.34, 0.46), mat(colorMap[box?.category] || 0x9ca7bf));
    const tag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.12), mat(box?.scannedWarehouse ? 0x30d96d : 0xf24848));
    tag.position.set(0, 0.22, 0);
    firstPersonHandRoot.add(body, tag);
  } else if (heldTool === "rfTagger") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.24, 0.28), mat(0xd48b52));
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.32, 0.2), mat(0x7c5331));
    grip.position.set(-0.24, -0.2, 0);
    firstPersonHandRoot.add(body, grip);
  } else if (heldTool === "rfReader") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.26, 0.32), mat(0x5eb6d8));
    const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.34, 0.14), mat(0x335c6c));
    antenna.position.set(0.28, 0.25, 0);
    firstPersonHandRoot.add(body, antenna);
  }
  firstPersonHandRoot.rotation.set(0.28, -0.58, 0.06);
}

function dropHeldTool() {
  if (carriedBoxId) {
    placeCarriedBoxToGround();
    return;
  }
  if (heldTool === "none") {
    setStatus("当前没有手持道具。");
    return;
  }
  heldTool = "none";
  updateHeldToolDisplay();
  setStatus("已丢下当前手持道具。");
}

function startDrivingTruck() {
  if (carriedBoxId) {
    setStatus("请先放下正在搬运的货品，再上车。");
    return;
  }
  isDrivingTruck = true;
  selectObject(logistics.refs.truck);
  driveLook.yaw = 0;
  driveLook.pitch = 0;
  if (!fpControls.isLocked && isFirstPerson) {
    fpControls.lock();
  }
  setStatus("已上车驾驶，WASD控制卡车，按E下车。");
}

function stopDrivingTruck() {
  isDrivingTruck = false;
  setStatus("已下车。");
}

function onDriveMouseMove(event) {
  if (!isDrivingTruck || !fpControls.isLocked) {
    return;
  }
  driveLook.yaw = clamp(driveLook.yaw - event.movementX * 0.0028, -Math.PI / 2, Math.PI / 2);
  driveLook.pitch = clamp(driveLook.pitch - event.movementY * 0.0022, -0.55, 0.35);
}

function toggleCarrySelectedBox() {
  if (!selectedObject || selectedObject.userData.type !== "shipmentBox") {
    return;
  }
  const box = getShipmentBoxById(selectedObject.userData.boxId);
  if (!box) {
    return;
  }
  if (!carriedBoxId) {
    if (!canPickupBox(box)) {
      return;
    }
    carriedBoxId = box.id;
    box.status = "carrying";
    refreshShipmentBoxVisual(box);
    updateHeldToolDisplay();
    setStatus(`已搬起 ${box.category}货品，移动后按E放下。`);
    updateLcdDashboard();
    updateStats();
    return;
  }
  if (carriedBoxId === box.id) {
    placeCarriedBoxToGround();
  }
}

function canPickupBox(box) {
  if (box.status === "received") {
    setStatus("已入库货品不可再搬运。");
    return false;
  }
  const dist = box.mesh.position.distanceTo(camera.position);
  if (dist > 3.2) {
    setStatus("离货品太远，无法搬运。");
    return false;
  }
  return true;
}

function placeCarriedBoxToGround() {
  const box = getShipmentBoxById(carriedBoxId);
  if (!box) {
    carriedBoxId = null;
    return;
  }

  if (isNearTruck()) {
    if (logistics.truckAt === "warehouse") {
      if (!box.scannedWarehouse) {
        const dropPos = getDropPositionAhead();
        box.mesh.position.copy(dropPos);
        box.status = "warehouse";
        setStatus("该货品尚未录入系统，已放回地面，请先贴标并扫码。");
        carriedBoxId = null;
        refreshShipmentBoxVisual(box);
        updateHeldToolDisplay();
        updateLcdDashboard();
        updateStats();
        return;
      }
      box.status = "inTruck";
      if (!logistics.truckLoadIds.includes(box.id)) {
        logistics.truckLoadIds.push(box.id);
      }
      placeInTruck(box, logistics.truckLoadIds.indexOf(box.id));
      setStatus(`已将 ${box.id} 搬上卡车。`);
    } else {
      box.status = "storePending";
      logistics.truckLoadIds = logistics.truckLoadIds.filter((id) => id !== box.id);
      if (!logistics.pendingStoreIds.includes(box.id)) {
        logistics.pendingStoreIds.push(box.id);
      }
      placeAtStoreBackroom(box, logistics.pendingStoreIds.indexOf(box.id));
      setStatus(`已将 ${box.id} 卸到门店后仓，待扫描。`);
    }
  } else {
    const dropPos = getDropPositionAhead();
    box.mesh.position.copy(dropPos);
    box.status = logistics.truckAt === "store" ? "storePending" : "staged";
    logistics.truckLoadIds = logistics.truckLoadIds.filter((id) => id !== box.id);
    if (!logistics.pendingStoreIds.includes(box.id) && box.status === "storePending") {
      logistics.pendingStoreIds.push(box.id);
    }
    setStatus(`已放下 ${box.id}。`);
  }

  carriedBoxId = null;
  refreshShipmentBoxVisual(box);
  updateHeldToolDisplay();
  updateLcdDashboard();
  updateStats();
}

function isNearTruck() {
  const truck = logistics.refs.truck;
  return truck && camera.position.distanceTo(truck.position) < 4.5;
}

function getDropPositionAhead() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0;
  dir.normalize();
  const pos = camera.position.clone().addScaledVector(dir, 1.5);
  pos.y = 0;
  return snapToGrid(pos);
}

function updateCarriedBoxFollow() {
  if (!carriedBoxId) {
    return;
  }
  const box = getShipmentBoxById(carriedBoxId);
  if (!box) {
    carriedBoxId = null;
    updateHeldToolDisplay();
    return;
  }
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0;
  dir.normalize();
  const pos = camera.position.clone().addScaledVector(dir, 1.2);
  pos.y = 0.9;
  box.mesh.position.copy(pos);
}

function updateTruckDriving(delta) {
  if (!isDrivingTruck || !logistics.refs.truck) {
    return;
  }

  const truck = logistics.refs.truck;
  const moveSpeed = 11;
  const rotateSpeed = 1.9;

  const drivingInput = movement.forward || movement.backward;
  if (drivingInput && movement.left) {
    truck.rotation.y -= rotateSpeed * delta;
  }
  if (drivingInput && movement.right) {
    truck.rotation.y += rotateSpeed * delta;
  }

  const forward = new THREE.Vector3(Math.sin(truck.rotation.y), 0, -Math.cos(truck.rotation.y));
  if (movement.forward) {
    truck.position.addScaledVector(forward, moveSpeed * delta);
  }
  if (movement.backward) {
    truck.position.addScaledVector(forward, -moveSpeed * delta);
  }

  truck.position.x = clamp(truck.position.x, -20, 20);
  truck.position.z = clamp(truck.position.z, -32, 28);

  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  const lookDir = forward.clone().multiplyScalar(Math.cos(driveLook.yaw))
    .add(right.multiplyScalar(Math.sin(driveLook.yaw)))
    .normalize();
  lookDir.y = Math.sin(driveLook.pitch);
  camera.position.set(truck.position.x + forward.x * 0.4, 1.95, truck.position.z + forward.z * 0.4);
  camera.lookAt(
    camera.position.x + lookDir.x * 8,
    camera.position.y + lookDir.y * 8,
    camera.position.z + lookDir.z * 8
  );

  if (truck.position.z < -7) {
    logistics.truckAt = "warehouse";
  } else if (truck.position.z > -2) {
    logistics.truckAt = "store";
  }

  syncTruckLoadPositions();
}

function syncTruckLoadPositions() {
  logistics.truckLoadIds = logistics.truckLoadIds.filter((id) => {
    const box = getShipmentBoxById(id);
    return Boolean(box && box.status === "inTruck");
  });
  logistics.truckLoadIds.forEach((id, idx) => {
    const box = getShipmentBoxById(id);
    if (!box) {
      return;
    }
    placeInTruck(box, idx);
  });
}

function highlightObject(root, active) {
  if (!root) {
    return;
  }
  root.traverse((child) => {
    if (!child.isMesh || !child.material || !child.material.color) {
      return;
    }
    if (!child.userData.baseColor) {
      child.userData.baseColor = child.material.color.getHex();
    }
    child.material.color.setHex(active ? 0x8dc3ff : child.userData.baseColor);
  });
}

function onKeyDown(event) {
  if (event.code === "KeyW") movement.forward = true;
  if (event.code === "KeyS") movement.backward = true;
  if (event.code === "KeyA") movement.left = true;
  if (event.code === "KeyD") movement.right = true;
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") movement.sprint = true;
  if (event.code === "Space") movement.jumpQueued = true;

  if (event.code === "KeyG") {
    dropHeldTool();
    return;
  }
  if (event.code === "KeyE") {
    interactWithSelected();
    return;
  }
  if (event.code === "KeyT") {
    bindRfidToSelectedBox();
    return;
  }
  if (event.code === "KeyF") {
    addGoodsToSelectedShelf();
    return;
  }

  if (!selectedObject) {
    return;
  }

  if (isDrivingTruck) {
    return;
  }

  if (event.key === "Delete") {
    if (selectedObject.userData.type === "terminal" && state.isOpen) {
      setStatus("营业中不可删除前台终端。");
      return;
    }
    removeObject(selectedObject);
    selectObject(null);
    setStatus("已删除选中设施。");
    return;
  }

  if (event.key.toLowerCase() === "r") {
    selectedObject.rotation.y += Math.PI * 0.5;
    setStatus("已旋转 90°。");
    return;
  }

  let moved = false;
  switch (event.key) {
    case "ArrowUp":
      moved = tryMoveSelected(0, -GRID_SIZE);
      break;
    case "ArrowDown":
      moved = tryMoveSelected(0, GRID_SIZE);
      break;
    case "ArrowLeft":
      moved = tryMoveSelected(-GRID_SIZE, 0);
      break;
    case "ArrowRight":
      moved = tryMoveSelected(GRID_SIZE, 0);
      break;
    default:
      break;
  }
  if (moved) {
    setStatus(`已移动到 (${selectedObject.position.x.toFixed(0)}, ${selectedObject.position.z.toFixed(0)})`);
  }
}

function tryMoveSelected(dx, dz) {
  if (!selectedObject) {
    return false;
  }
  selectedObject.position.x += dx;
  selectedObject.position.z += dz;
  selectedObject.position.copy(snapToGrid(selectedObject.position));
  if (selectedObject.userData.type === "truck") {
    logistics.truckAt = selectedObject.position.z < -7 ? "warehouse" : "store";
    syncTruckLoadPositions();
  }
  return true;
}

function onKeyUp(event) {
  if (event.code === "KeyW") movement.forward = false;
  if (event.code === "KeyS") movement.backward = false;
  if (event.code === "KeyA") movement.left = false;
  if (event.code === "KeyD") movement.right = false;
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") movement.sprint = false;
}

function interactWithSelected() {
  if (isDrivingTruck) {
    stopDrivingTruck();
    return;
  }
  if (!selectedObject) {
    if (carriedBoxId) {
      placeCarriedBoxToGround();
      return;
    }
    setStatus("请先选中对象再交互(E)。");
    return;
  }
  const type = selectedObject.userData.type;
  if (carriedBoxId && type !== "shipmentBox") {
    placeCarriedBoxToGround();
    return;
  }
  if (type === "lcdTerminal") {
    openLcdOverlay();
    return;
  }
  if (type === "toolDock") {
    heldTool = heldTool === selectedObject.userData.toolType ? "none" : selectedObject.userData.toolType;
    updateHeldToolDisplay();
    setStatus(heldTool === "none" ? "已放下手持道具。" : `已拿起：${toolName(heldTool)}`);
    return;
  }
  if (type === "truck") {
    startDrivingTruck();
    return;
  }
  if (type === "shipmentBox") {
    if (heldTool === "rfReader") {
      scanSelectedBoxWithHandheldReader();
    } else {
      toggleCarrySelectedBox();
    }
    return;
  }
  setStatus("该对象当前没有可用交互。");
}

function bindRfidToSelectedBox() {
  if (heldTool !== "rfTagger") {
    setStatus("请先拿起RF标签器（对准工具台按E）。");
    return;
  }
  if (!selectedObject || selectedObject.userData.type !== "shipmentBox") {
    setStatus("请先选中仓库货品，再按 T 绑定 RFID。");
    return;
  }
  const box = getShipmentBoxById(selectedObject.userData.boxId);
  if (!box) {
    return;
  }
  if (box.status !== "warehouse" && box.status !== "staged") {
    setStatus("该货品已进入运输/收货流程，不可重新贴标。");
    return;
  }
  if (box.tagId) {
    setStatus(`该货品已绑定标签：${box.tagId}`);
    return;
  }
  box.tagId = `RF-${nextRfidCounter++}`;
  box.tagAttached = true;
  refreshShipmentBoxVisual(box);
  lcdLog(`已绑定 RFID：${box.id} -> ${box.tagId}`);
  setStatus(`贴标成功：${box.tagId}`);
  updateLcdDashboard();
}

function scanSelectedBoxWithHandheldReader() {
  if (!selectedObject || selectedObject.userData.type !== "shipmentBox") {
    setStatus("请先选中货品再扫码。");
    return;
  }
  const box = getShipmentBoxById(selectedObject.userData.boxId);
  if (!box) {
    return;
  }
  if (box.mesh.position.z < -16 && ["warehouse", "staged"].includes(box.status)) {
    scanAtWarehouseByHandheld(box);
    return;
  }
  if (box.mesh.position.z > -2 && ["storePending", "exception", "inTruck"].includes(box.status)) {
    scanAtStoreByHandheld(box);
    return;
  }
  setStatus("请把货品带到对应仓区后再扫码。");
}

function scanAtWarehouseByHandheld(target) {
  if (!target.tagId) {
    logistics.exceptions.push(`${target.id} 未绑定RFID即尝试录入`);
    setStatus("录入失败：货品未绑定 RFID。");
    lcdLog(`异常：${target.id} 未绑定RFID`);
    updateLcdDashboard();
    return;
  }

  if (!target.scannedWarehouse) {
    target.scannedWarehouse = true;
    target.status = "inTruck";
    logistics.warehouseScannedByCategory[target.category] =
      (logistics.warehouseScannedByCategory[target.category] || 0) + 1;
    upsertManifestRecord(target);
    if (!logistics.truckLoadIds.includes(target.id)) {
      logistics.truckLoadIds.push(target.id);
    }
    placeInTruck(target, logistics.truckLoadIds.indexOf(target.id));
    refreshShipmentBoxVisual(target);
    setStatus(`仓库录入成功：${target.id} (${target.tagId})`);
    lcdLog(`仓库录入并自动装车：${target.id}(${target.category}) -> ${target.destination}`);
  } else {
    setStatus("该货品已录入系统。");
  }
  updateLcdDashboard();
  updateInfoBoards();
  updateStats();
}

function scanAtStoreByHandheld(target) {
  const manifestItem = logistics.manifest.find((m) => m.boxId === target.id);
  if (!manifestItem) {
    target.status = "exception";
    refreshShipmentBoxVisual(target);
    logistics.exceptions.push(`${target.id} 不在配送清单`);
    logistics.storeWrongCount += 1;
    lcdLog(`异常：${target.id} 不在配送清单`);
    setStatus("收货异常：该货品不在配送清单。");
    updateLcdDashboard();
    updateInfoBoards();
    updateStats();
    return;
  }
  if (manifestItem.tagId !== target.tagId) {
    target.status = "exception";
    refreshShipmentBoxVisual(target);
    logistics.exceptions.push(`${target.id} 标签不一致`);
    logistics.storeWrongCount += 1;
    lcdLog(`异常：${target.id} 标签不一致 (清单:${manifestItem.tagId}, 实际:${target.tagId || "无"})`);
    setStatus("收货异常：RFID 与配送清单不一致。");
    updateLcdDashboard();
    updateInfoBoards();
    updateStats();
    return;
  }

  target.scannedStore = true;
  target.status = "received";
  logistics.pendingStoreIds = logistics.pendingStoreIds.filter((id) => id !== target.id);
  logistics.truckLoadIds = logistics.truckLoadIds.filter((id) => id !== target.id);
  logistics.storeCheckedByCategory[target.category] =
    (logistics.storeCheckedByCategory[target.category] || 0) + 1;
  placeAutoToStoreShelf(target);
  refreshShipmentBoxVisual(target);
  setStatus(`门店收货确认成功：${target.id}`);
  lcdLog(`门店收货扫描通过并已归位：${target.id}`);
  updateLcdDashboard();
  updateInfoBoards();
  updateStats();
}

function placeAutoToStoreShelf(box) {
  const slots = {
    "水果": { x: 8, z: 13.5 },
    "生鲜": { x: 3.5, z: 13.5 },
    "烘焙": { x: 12.5, z: 10.8 },
    "冷饮": { x: -0.5, z: 10.8 },
    "综合": { x: -5, z: 10.5 }
  };
  const base = slots[box.category] || slots["综合"];
  const idx = logistics.storeShelfCounts[box.category] || 0;
  const row = Math.floor(idx / 3);
  const col = idx % 3;
  box.mesh.position.set(base.x + col * 0.34, 0.78 + row * 0.26, base.z);
  logistics.storeShelfCounts[box.category] = idx + 1;
  state.storageStock += box.quantity;
}

function upsertManifestRecord(box) {
  const existing = logistics.manifest.find((m) => m.boxId === box.id);
  const entry = {
    boxId: box.id,
    tagId: box.tagId,
    quantity: box.quantity,
    category: box.category,
    batch: box.batch,
    createdAt: box.createdAt,
    scannedAt: new Date().toLocaleString(),
    destination: box.destination
  };
  if (existing) {
    Object.assign(existing, entry);
  } else {
    logistics.manifest.push(entry);
  }
}

function placeStagedBox(box) {
  const staged = logistics.boxes.filter((b) => b.status === "staged");
  const idx = staged.findIndex((b) => b.id === box.id);
  const col = idx % 4;
  const row = Math.floor(idx / 4);
  box.mesh.position.set(-18 + col * 0.62, 0, -20.2 + row * 0.58);
}

function placeInTruck(box, index) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  box.mesh.position.set(
    logistics.refs.truck.position.x - 0.2 + col * 0.48,
    1.02,
    logistics.refs.truck.position.z - 0.42 + row * 0.48
  );
}

function placeAtStoreBackroom(box, index) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  box.mesh.position.set(-18 + col * 0.7, 0, 3.4 + row * 0.55);
}

function placeReceivedBox(box, index) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  box.mesh.position.set(-6 + col * 0.58, 0, 6 + row * 0.55);
}

function getShipmentBoxById(id) {
  return logistics.boxes.find((b) => b.id === id) || null;
}

function openLcdOverlay() {
  if (fpControls.isLocked) {
    fpControls.unlock();
  }
  lcdOverlayEl.classList.remove("hidden");
  updateLcdDashboard();
  setStatus("已进入 LCD 系统界面。");
}

function closeLcdOverlay() {
  lcdOverlayEl.classList.add("hidden");
  setStatus("已退出 LCD 系统界面。");
}

function lcdLog(message) {
  const time = new Date().toLocaleTimeString();
  const line = `[${time}] ${message}`;
  lcdLogEl.innerHTML = `${line}<br />${lcdLogEl.innerHTML}`;
}

function registerManifestAtLcd() {
  if (!logistics.manifest.length) {
    lcdLog("无可登记条目，请先完成仓库手持Reader录入。");
    setStatus("配送登记失败：清单为空。");
    return;
  }
  logistics.manifestRegistered = true;
  lcdLog(`已登记 ${logistics.manifest.length} 条配送记录，目的门店:${logistics.destinationStore}`);
  setStatus(`配送单登记完成，共 ${logistics.manifest.length} 件。`);
  updateLcdDashboard();
}

function loadTruckAtLcd() {
  if (!logistics.manifestRegistered) {
    lcdLog("请先在LCD登记门店配送信息。");
    setStatus("装车失败：请先登记配送单。");
    return;
  }
  if (logistics.truckAt !== "warehouse") {
    lcdLog("卡车不在仓库，无法装车。");
    setStatus("装车失败：卡车当前位置不在仓库。");
    return;
  }

  const staged = logistics.boxes.filter((b) => b.status === "staged" && !logistics.truckLoadIds.includes(b.id));
  if (!staged.length) {
    lcdLog("没有可装车货品，请手动搬运到货车旁并按E装车。");
    setStatus("没有待装车货品。");
    return;
  }

  lcdLog("提示：现在改为手动搬运。请选中货品按E搬起，走到车边再按E放下装车。");
  setStatus("请手动搬货上车。");
  updateLcdDashboard();
  updateStats();
}

function deliverTruckAtLcd() {
  if (!logistics.truckLoadIds.length) {
    lcdLog("卡车无在途货品。");
    setStatus("发运失败：卡车为空。");
    return;
  }
  logistics.manifestRegistered = true;
  lcdLog("请驾驶货车前往门店后仓（E上车，WASD驾驶，E下车）。");
  setStatus("请手动驾驶货车送货。");
  updateLcdDashboard();
  updateStats();
}

function confirmReceivingAtLcd() {
  const received = logistics.boxes.filter((b) => b.status === "received");
  const pending = logistics.boxes.filter((b) => b.status === "storePending");
  if (!received.length) {
    lcdLog("当前无已收货归位货品，请先手持Reader扫码。");
    setStatus("暂无可确认入库货品。");
    return;
  }
  if (pending.length) {
    pending.forEach((box) => logistics.exceptions.push(`${box.id} 尚未门店扫码`));
    logistics.storeWrongCount += pending.length;
    lcdLog(`仍有 ${pending.length} 件未收货扫码，已记录异常。`);
  }
  lcdLog(`门店收货确认完成：已归位 ${received.length} 件。`);
  setStatus(`门店库存已更新，当前库存:${state.storageStock}`);
  updateStats();
  updateLcdDashboard();
  updateInfoBoards();
  syncRegulatorInputs();
}

function clearExceptionsAtLcd() {
  logistics.exceptions.length = 0;
  lcdLog("异常通知已处理（逻辑上已回执后仓补货/改库存）。");
  setStatus("异常记录已清空。");
  updateLcdDashboard();
  updateStats();
}

function createUnit(type) {
  const group = new THREE.Group();
  group.userData.type = type;
  group.userData.id = `${type}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  if (type === "shelf") {
    group.userData.displayName = "货架";
    const frameColor = 0x8b6b48;
    const legGeo = new THREE.BoxGeometry(0.12, 2.2, 0.12);
    const shelfGeo = new THREE.BoxGeometry(2.4, 0.1, 0.9);
    addLegs(group, legGeo, frameColor, 2.15, 0.75, 0.35);
    [0.35, 1.05, 1.75].forEach((y) => {
      const board = new THREE.Mesh(shelfGeo, mat(frameColor));
      board.position.set(0, y, 0);
      group.add(board);
    });
    group.userData.goodsSlots = [
      [-0.7, 0.48, -0.15], [0, 0.48, -0.15], [0.7, 0.48, -0.15],
      [-0.7, 1.18, -0.15], [0, 1.18, -0.15], [0.7, 1.18, -0.15],
      [-0.7, 1.88, -0.15], [0, 1.88, -0.15], [0.7, 1.88, -0.15]
    ];
    group.userData.goodsCount = 0;
  } else if (type === "freezer") {
    group.userData.displayName = "冰柜";
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 1.1), mat(0xdfe5ef));
    body.position.set(0, 0.65, 0);
    const topGlass = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.07, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x9ac8ff, transparent: true, opacity: 0.45 })
    );
    topGlass.position.set(0, 1.24, 0);
    group.add(body, topGlass);
  } else if (type === "storage") {
    group.userData.displayName = "储物架";
    const frameColor = 0x546079;
    const legGeo = new THREE.BoxGeometry(0.12, 2.3, 0.12);
    const shelfGeo = new THREE.BoxGeometry(2.8, 0.1, 1.0);
    addLegs(group, legGeo, frameColor, 2.25, 0.9, 0.45);
    [0.45, 1.2, 1.95].forEach((y) => {
      const board = new THREE.Mesh(shelfGeo, mat(0x73829f));
      board.position.set(0, y, 0);
      group.add(board);
    });
  } else if (type === "terminal") {
    group.userData.displayName = "前台终端";
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 0.9), mat(0x39607a));
    desk.position.set(0, 0.5, 0);
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.08), mat(0x111522));
    monitor.position.set(0.4, 1.25, -0.05);
    const scanner = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.25), mat(0x202a3f));
    scanner.position.set(-0.3, 1.02, 0.05);
    group.add(desk, monitor, scanner);
  } else if (type === "cart") {
    group.userData.displayName = "取货车";
    const basket = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.8), mat(0x4f647f));
    basket.position.set(0, 0.7, 0);
    const pushBar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 0.07), mat(0x2e3749));
    pushBar.position.set(0, 1.12, -0.33);
    group.add(basket, pushBar);
    [-0.45, 0.45].forEach((x) => {
      [-0.3, 0.3].forEach((z) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12), mat(0x1f2431));
        wheel.rotation.z = Math.PI * 0.5;
        wheel.position.set(x, 0.18, z);
        group.add(wheel);
      });
    });
  } else if (type === "goodsBox") {
    group.userData.displayName = "货品箱";
    const goods = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.3), mat(0xf2a34b));
    goods.position.set(0, 0.18, 0);
    group.add(goods);
  }

  return group;
}

function createCustomer() {
  const group = new THREE.Group();
  group.userData.kind = "customer";
  group.userData.speed = 2.2 + Math.random() * 0.8;
  group.userData.phase = "toShelf";
  group.userData.target = null;

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.2, 12), mat(0x6fa8dc));
  body.position.y = 0.6;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), mat(0xf5d6bd));
  head.position.y = 1.35;
  group.add(body, head);
  group.position.set(0, 0, 26);
  scene.add(group);
  customers.push(group);
}

function addLegs(group, legGeo, color, h, x, z) {
  [
    [-x, h / 2, -z],
    [x, h / 2, -z],
    [-x, h / 2, z],
    [x, h / 2, z]
  ].forEach(([lx, ly, lz]) => {
    const leg = new THREE.Mesh(legGeo, mat(color));
    leg.position.set(lx, ly, lz);
    group.add(leg);
  });
}

function mat(color) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.15, roughness: 0.75 });
}

function addGoodsToSelectedShelf() {
  if (!selectedObject || selectedObject.userData.type !== "shelf") {
    setStatus("请先选中一个货架，再补货。");
    return;
  }
  if (state.storageStock <= 0) {
    setStatus("仓库存货不足，无法补货。");
    return;
  }
  fillShelf(selectedObject, true);
}

function fillShelf(shelf, consumeStorage) {
  if (!shelf || shelf.userData.type !== "shelf") {
    return;
  }

  const oldGoods = shelf.children.filter((c) => c.userData.isGoodsOnShelf);
  oldGoods.forEach((g) => shelf.remove(g));

  const maxSlots = shelf.userData.goodsSlots.length;
  let canFill = maxSlots;
  if (consumeStorage) {
    canFill = Math.min(maxSlots, state.storageStock);
    state.storageStock -= canFill;
  }
  shelf.userData.goodsCount = canFill;

  for (let i = 0; i < canFill; i += 1) {
    const [x, y, z] = shelf.userData.goodsSlots[i];
    const goods = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.25, 0.22),
      mat(i % 2 === 0 ? 0x58c36f : 0xffc857)
    );
    goods.position.set(x, y, z);
    goods.userData.isGoodsOnShelf = true;
    shelf.add(goods);
  }
  updateStats();
  setStatus(`已补货到 ${canFill}/${maxSlots}。`);
}

function consumeOneGoodsFromShelf(shelf) {
  if (!shelf || shelf.userData.type !== "shelf") {
    return false;
  }
  const goods = shelf.children.find((c) => c.userData.isGoodsOnShelf);
  if (!goods) {
    return false;
  }
  shelf.remove(goods);
  shelf.userData.goodsCount = Math.max(0, (shelf.userData.goodsCount || 0) - 1);
  return true;
}

function removeObject(object) {
  if (!object) {
    return;
  }

  const pIdx = placeableRootObjects.indexOf(object);
  if (pIdx >= 0) {
    placeableRootObjects.splice(pIdx, 1);
  }

  const lIdx = logisticsObjects.indexOf(object);
  if (lIdx >= 0) {
    logisticsObjects.splice(lIdx, 1);
  }

  if (object.userData.type === "shipmentBox") {
    const boxId = object.userData.boxId;
    logistics.boxes = logistics.boxes.filter((b) => b.id !== boxId);
    logistics.manifest = logistics.manifest.filter((m) => m.boxId !== boxId);
    logistics.pendingStoreIds = logistics.pendingStoreIds.filter((id) => id !== boxId);
    logistics.truckLoadIds = logistics.truckLoadIds.filter((id) => id !== boxId);
    updateLcdDashboard();
  }
  scene.remove(object);
}

function clearAllPlaced() {
  [...placeableRootObjects].forEach((obj) => scene.remove(obj));
  placeableRootObjects.length = 0;
  selectObject(null);
}

function clearCustomers() {
  [...customers].forEach((c) => scene.remove(c));
  customers.length = 0;
  updateStats();
}

function seedStarterLayout() {
  [
    ["terminal", 17, 0, 18, Math.PI * 0.5],
    ["shelf", -14, 0, 14, 0],
    ["shelf", -8, 0, 14, 0],
    ["freezer", -12, 0, 21, 0],
    ["storage", -2, 0, 20, 0],
    ["shelf", 6, 0, 18, Math.PI * 0.5],
    ["shelf", 12, 0, 18, Math.PI * 0.5],
    ["cart", 2, 0, 24, 0]
  ].forEach(([type, x, y, z, ry]) => {
    const obj = createUnit(type);
    obj.position.set(x, y, z);
    obj.rotation.y = ry;
    scene.add(obj);
    placeableRootObjects.push(obj);
  });
}

function saveLayout() {
  const data = placeableRootObjects.map((obj) => ({
    type: obj.userData.type,
    x: obj.position.x,
    y: obj.position.y,
    z: obj.position.z,
    ry: obj.rotation.y,
    goodsCount: obj.userData.type === "shelf" ? obj.userData.goodsCount || 0 : 0
  }));
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(data));
  setStatus(`布局已保存，共 ${data.length} 个设施。`);
}

function loadLayout() {
  const raw = localStorage.getItem(LAYOUT_KEY);
  if (!raw) {
    setStatus("没有可读取的布局数据。");
    return;
  }
  const data = JSON.parse(raw);
  clearAllPlaced();
  clearCustomers();
  resetBusiness();
  resetLogisticsFlow();

  data.forEach((item) => {
    const obj = createUnit(item.type);
    obj.position.set(item.x, item.y, item.z);
    obj.rotation.y = item.ry || 0;
    scene.add(obj);
    placeableRootObjects.push(obj);
    if (item.type === "shelf") {
      const toFill = Math.max(0, Math.min(item.goodsCount || 0, obj.userData.goodsSlots.length));
      if (toFill > 0) {
        fillShelfWithExactCount(obj, toFill);
      }
    }
  });
  updateStats();
  syncRegulatorInputs();
  setStatus(`布局已读取，共 ${data.length} 个设施。RF流程已重置。`);
}

function fillShelfWithExactCount(shelf, count) {
  const oldGoods = shelf.children.filter((c) => c.userData.isGoodsOnShelf);
  oldGoods.forEach((g) => shelf.remove(g));
  shelf.userData.goodsCount = count;
  for (let i = 0; i < count; i += 1) {
    const [x, y, z] = shelf.userData.goodsSlots[i];
    const goods = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.25, 0.22),
      mat(i % 2 === 0 ? 0x58c36f : 0xffc857)
    );
    goods.position.set(x, y, z);
    goods.userData.isGoodsOnShelf = true;
    shelf.add(goods);
  }
}

function resetLogisticsFlow() {
  logistics.boxes.forEach((box) => {
    scene.remove(box.mesh);
    const idx = logisticsObjects.indexOf(box.mesh);
    if (idx >= 0) {
      logisticsObjects.splice(idx, 1);
    }
  });
  logistics.boxes = [];
  logistics.manifest = [];
  logistics.truckLoadIds = [];
  logistics.pendingStoreIds = [];
  logistics.exceptions = [];
  logistics.warehouseScannedByCategory = { "水果": 0, "生鲜": 0, "烘焙": 0, "冷饮": 0, "综合": 0 };
  logistics.storeCheckedByCategory = { "水果": 0, "生鲜": 0, "烘焙": 0, "冷饮": 0, "综合": 0 };
  logistics.storeWrongCount = 0;
  logistics.storeShelfCounts = { "水果": 0, "生鲜": 0, "烘焙": 0, "冷饮": 0, "综合": 0 };
  logistics.manifestRegistered = false;
  logistics.truckAt = "warehouse";
  logistics.refs.truck.position.set(0, 0, -9);
  heldTool = "none";
  carriedBoxId = null;
  isDrivingTruck = false;
  updateHeldToolDisplay();
  nextRfidCounter = 1000;
  lcdLogEl.textContent = "流程重置，等待新的仓储操作...";
  spawnWarehouseShipmentBoxes(6);
  updateLcdDashboard();
  updateInfoBoards();
  updateStats();
}

function refillAllShelves(needCost) {
  const shelves = placeableRootObjects.filter((obj) => obj.userData.type === "shelf");
  if (!shelves.length) {
    setStatus("当前没有货架可补货。");
    return;
  }

  const cost = 20;
  if (needCost) {
    if (state.cash < cost) {
      setStatus("资金不足，无法全货架补货。");
      return;
    }
    state.cash -= cost;
    state.storageStock += 18;
  }

  let fillCount = 0;
  shelves.forEach((shelf) => {
    if (state.storageStock > 0) {
      fillShelf(shelf, true);
      fillCount += 1;
    }
  });
  updateStats();
  syncRegulatorInputs();
  setStatus(`已补货 ${fillCount} 个货架。`);
}

function toggleOpen() {
  if (!hasTerminal()) {
    setStatus("没有前台终端，无法开店。");
    return;
  }
  state.isOpen = !state.isOpen;
  document.getElementById("toggle-open").textContent = state.isOpen ? "关店" : "开店";
  setStatus(state.isOpen ? "开始营业，顾客将持续进店。" : "已关店，不再生成新顾客。");
  updateStats();
}

function hasTerminal() {
  return placeableRootObjects.some((obj) => obj.userData.type === "terminal");
}

function getCheckoutPoint() {
  const terminal = placeableRootObjects.find((obj) => obj.userData.type === "terminal");
  if (!terminal) {
    return new THREE.Vector3(14, 0, 19);
  }
  return new THREE.Vector3(terminal.position.x, 0, terminal.position.z + 1.3);
}

function getShelvesWithGoods() {
  return placeableRootObjects.filter(
    (obj) => obj.userData.type === "shelf" && (obj.userData.goodsCount || 0) > 0
  );
}

function updateCustomers(delta) {
  if (state.isOpen) {
    state.spawnTimer += delta;
    if (state.spawnTimer >= state.spawnInterval) {
      state.spawnTimer = 0;
      createCustomer();
    }
  }

  for (let i = customers.length - 1; i >= 0; i -= 1) {
    const customer = customers[i];
    const speed = customer.userData.speed;

    if (customer.userData.phase === "toShelf") {
      if (!customer.userData.target) {
        const shelves = getShelvesWithGoods();
        if (!shelves.length) {
          customer.userData.phase = "leave";
          customer.userData.target = new THREE.Vector3(0, 0, 30);
        } else {
          const shelf = shelves[Math.floor(Math.random() * shelves.length)];
          customer.userData.target = shelf;
        }
      }
      const shelf = customer.userData.target;
      if (shelf && shelf.position) {
        const targetPoint = new THREE.Vector3(shelf.position.x, 0, shelf.position.z + 1.4);
        moveToward(customer, targetPoint, delta, speed);
        if (customer.position.distanceTo(targetPoint) < 0.25) {
          const ok = consumeOneGoodsFromShelf(shelf);
          if (ok) {
            customer.userData.phase = "toCheckout";
            customer.userData.target = getCheckoutPoint();
          } else {
            customer.userData.phase = "leave";
            customer.userData.target = new THREE.Vector3(0, 0, 30);
          }
          updateStats();
        }
      }
    } else if (customer.userData.phase === "toCheckout") {
      moveToward(customer, customer.userData.target, delta, speed);
      if (customer.position.distanceTo(customer.userData.target) < 0.3) {
        state.cash += state.salePrice;
        state.soldCount += 1;
        customer.userData.phase = "leave";
        customer.userData.target = new THREE.Vector3(0, 0, 30);
        setStatus("完成一笔结算。");
        updateStats();
      }
    } else if (customer.userData.phase === "leave") {
      moveToward(customer, customer.userData.target, delta, speed + 0.3);
      if (customer.position.distanceTo(customer.userData.target) < 0.25) {
        scene.remove(customer);
        customers.splice(i, 1);
      }
    }
  }
}

function moveToward(object, target, delta, speed) {
  const dir = new THREE.Vector3().subVectors(target, object.position);
  dir.y = 0;
  const distance = dir.length();
  if (distance < 0.0001) {
    return;
  }
  dir.normalize();
  const step = Math.min(distance, speed * delta);
  object.position.addScaledVector(dir, step);
}

function updateFirstPersonMovement(delta) {
  if (!isFirstPerson || !fpControls.isLocked || !lcdOverlayEl.classList.contains("hidden") || isDrivingTruck) {
    return;
  }

  const baseSpeed = movement.sprint ? 8.8 : 5.2;
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) {
    forward.set(0, 0, -1);
  }
  forward.normalize();
  const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();

  const move = new THREE.Vector3();
  if (movement.forward) move.add(forward);
  if (movement.backward) move.sub(forward);
  if (movement.left) move.sub(right);
  if (movement.right) move.add(right);
  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(baseSpeed * delta);
  }

  const prevX = camera.position.x;
  const prevZ = camera.position.z;
  camera.position.x += move.x;
  if (isBlockedAt(camera.position.x, camera.position.z)) {
    camera.position.x = prevX;
  }
  camera.position.z += move.z;
  if (isBlockedAt(camera.position.x, camera.position.z)) {
    camera.position.z = prevZ;
  }

  if (movement.jumpQueued && playerPhysics.onGround) {
    playerPhysics.velocityY = 6.2;
    playerPhysics.onGround = false;
  }
  movement.jumpQueued = false;

  playerPhysics.velocityY += -18 * delta;
  camera.position.y += playerPhysics.velocityY * delta;
  if (camera.position.y <= PLAYER_HEIGHT) {
    camera.position.y = PLAYER_HEIGHT;
    playerPhysics.velocityY = 0;
    playerPhysics.onGround = true;
  }

  camera.position.x = clamp(camera.position.x, -MAX_X, MAX_X);
  camera.position.z = clamp(camera.position.z, -MAX_Z, MAX_Z);
}

function isBlockedAt(x, z) {
  const pad = 0.3;
  for (const c of wallColliders) {
    if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) {
      return true;
    }
  }
  return false;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resetBusiness() {
  state.isOpen = false;
  state.cash = 100;
  state.storageStock = 28;
  state.soldCount = 0;
  state.spawnTimer = 0;
  state.spawnInterval = 4.5;
  state.salePrice = 8;
  document.getElementById("toggle-open").textContent = "开店";
  updateStats();
  syncRegulatorInputs();
}

function applyRegulatorValues() {
  const nextCash = Number(regCashEl.value);
  const nextStock = Number(regStockEl.value);
  const nextCustomers = Number(regCustomersEl.value);
  const nextSpawn = Number(regSpawnEl.value);
  const nextPrice = Number(regPriceEl.value);

  state.cash = Number.isFinite(nextCash) ? Math.max(0, Math.floor(nextCash)) : state.cash;
  state.storageStock = Number.isFinite(nextStock) ? Math.max(0, Math.floor(nextStock)) : state.storageStock;
  state.spawnInterval = Number.isFinite(nextSpawn) ? clamp(nextSpawn, 0.8, 30) : state.spawnInterval;
  state.salePrice = Number.isFinite(nextPrice) ? Math.max(1, Math.floor(nextPrice)) : state.salePrice;

  if (Number.isFinite(nextCustomers)) {
    setCustomersCount(Math.max(0, Math.floor(nextCustomers)));
  }

  updateStats();
  syncRegulatorInputs();
  setStatus("资源调控器参数已应用。");
}

function setCustomersCount(target) {
  while (customers.length < target) {
    createCustomer();
  }
  while (customers.length > target) {
    const c = customers.pop();
    if (c) {
      scene.remove(c);
    }
  }
}

function updateStats() {
  statOpenEl.textContent = state.isOpen ? "营业中" : "关店";
  statCashEl.textContent = `$${state.cash}`;
  statStockEl.textContent = String(state.storageStock);
  statCustomersEl.textContent = String(customers.length);
  statSalesEl.textContent = String(state.soldCount);
  statShipPendingEl.textContent = String(
    logistics.boxes.filter((b) => ["staged", "inTruck", "storePending", "scannedStore", "carrying"].includes(b.status)).length
  );
  statShipExEl.textContent = String(logistics.exceptions.length);
}

function syncRegulatorInputs() {
  regCashEl.value = String(state.cash);
  regStockEl.value = String(state.storageStock);
  regCustomersEl.value = String(customers.length);
  regSpawnEl.value = String(state.spawnInterval);
  regPriceEl.value = String(state.salePrice);
}

function updateLcdDashboard() {
  lcdWarehouseCountEl.textContent = String(logistics.boxes.filter((b) => b.status === "warehouse").length);
  lcdManifestCountEl.textContent = String(logistics.manifest.length);
  lcdTruckCountEl.textContent = String(logistics.truckLoadIds.length);
  lcdStorePendingCountEl.textContent = String(
    logistics.boxes.filter((b) => b.status === "storePending" || b.status === "exception").length
  );
  lcdStoreScannedCountEl.textContent = String(logistics.boxes.filter((b) => b.status === "received").length);
  lcdExceptionCountEl.textContent = String(logistics.exceptions.length);
  updateInfoBoards();
}

function snapToGrid(position) {
  return new THREE.Vector3(
    Math.round(position.x / GRID_SIZE) * GRID_SIZE,
    0,
    Math.round(position.z / GRID_SIZE) * GRID_SIZE
  );
}

function setStatus(text) {
  statusEl.textContent = text;
}

function alignCrosshairToCanvasCenter() {
  const rect = renderer.domElement.getBoundingClientRect();
  crosshairEl.style.left = `${rect.left + rect.width / 2}px`;
  crosshairEl.style.top = `${rect.top + rect.height / 2}px`;
}

function updateSelectionTagPosition() {
  if (!selectedObject) {
    selectionTagEl.classList.add("hidden");
    return;
  }
  const pos = getObjectLabelPosition(selectedObject);
  pos.project(camera);

  const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;

  if (pos.z > 1 || x < -30 || y < -30 || x > window.innerWidth + 30 || y > window.innerHeight + 30) {
    selectionTagEl.classList.add("hidden");
    return;
  }

  selectionTagEl.classList.remove("hidden");
  selectionTagEl.style.left = `${x}px`;
  selectionTagEl.style.top = `${y}px`;
}

function getObjectLabelPosition(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);
  center.y += Math.max(0.6, size.y * 0.65);
  return center;
}

function exposeSimulationApi() {
  window.supermarketSim = {
    getState: () => ({
      isOpen: state.isOpen,
      cash: state.cash,
      storageStock: state.storageStock,
      customers: customers.length,
      soldCount: state.soldCount,
      spawnInterval: state.spawnInterval,
      salePrice: state.salePrice,
      logistics: {
        manifest: logistics.manifest.length,
        pending: logistics.pendingStoreIds.length,
        exceptions: logistics.exceptions.length
      }
    }),
    setResources: (payload = {}) => {
      if (typeof payload.cash === "number") state.cash = Math.max(0, Math.floor(payload.cash));
      if (typeof payload.storageStock === "number") state.storageStock = Math.max(0, Math.floor(payload.storageStock));
      if (typeof payload.spawnInterval === "number") state.spawnInterval = clamp(payload.spawnInterval, 0.8, 30);
      if (typeof payload.salePrice === "number") state.salePrice = Math.max(1, Math.floor(payload.salePrice));
      if (typeof payload.customers === "number") setCustomersCount(Math.max(0, Math.floor(payload.customers)));
      updateStats();
      syncRegulatorInputs();
    },
    refillAllShelves: () => refillAllShelves(false),
    setOpen: (open) => {
      state.isOpen = Boolean(open);
      document.getElementById("toggle-open").textContent = state.isOpen ? "关店" : "开店";
      updateStats();
    },
    rfid: {
      resetFlow: resetLogisticsFlow,
      registerManifest: registerManifestAtLcd,
      dispatchTruck: loadTruckAtLcd,
      deliverTruck: deliverTruckAtLcd,
      confirmReceive: confirmReceivingAtLcd
    }
  };
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  alignCrosshairToCanvasCenter();
  updateTruckDriving(delta);
  updateFirstPersonMovement(delta);
  updateCarriedBoxFollow();
  updateCustomers(delta);
  if (orbitControls.enabled) {
    orbitControls.update();
  }
  firstPersonHandRoot.visible = isFirstPerson && fpControls.isLocked && !isDrivingTruck;
  updateSelectionTagPosition();
  renderer.render(scene, camera);
}
